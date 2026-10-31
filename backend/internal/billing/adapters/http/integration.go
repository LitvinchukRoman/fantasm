package http

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/LitvinchukRoman/fantasm/backend/internal/billing"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
)

// SupportUserHeader carries the identity token the user's browser obtained from
// POST /api/me/support-token and handed to the support bot.
const SupportUserHeader = "X-Fantasm-Support-User"

// Integration serves the support bot. It is mounted outside the cookie and CSRF chain:
// the bot is a server, it proves itself with a bearer credential and names the user
// only through the user's own short-lived token.
type Integration struct {
	service *billing.Service
	secret  [sha256.Size]byte
	limiter *httpx.Limiter
}

func NewIntegration(service *billing.Service, apiToken string, limiter *httpx.Limiter) *Integration {
	return &Integration{service: service, secret: sha256.Sum256([]byte(apiToken)), limiter: limiter}
}

func (i *Integration) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/integrations/support/billing", i.authed(i.snapshot))
	mux.HandleFunc("POST /api/integrations/support/billing/actions", i.authed(i.act))
}

type userKey struct{}

func (i *Integration) authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		// Compare digests: constant time regardless of the presented length.
		presented := sha256.Sum256([]byte(raw))
		if !ok || subtle.ConstantTimeCompare(presented[:], i.secret[:]) != 1 {
			httpx.WriteError(w, r, apperr.Unauthorized("support credentials required"))
			return
		}
		token := r.Header.Get(SupportUserHeader)
		if allowed, retry := i.limiter.Allow("support:" + token); !allowed {
			w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
			httpx.WriteError(w, r, apperr.RateLimited("too many requests"))
			return
		}
		user, err := i.service.SupportUser(r.Context(), token)
		if err != nil {
			httpx.WriteError(w, r, err)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		next(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	}
}

func supportUser(r *http.Request) ports.UserCard {
	u, _ := r.Context().Value(userKey{}).(ports.UserCard)
	return u
}

func (i *Integration) snapshot(w http.ResponseWriter, r *http.Request) {
	s, err := i.service.SupportOverview(r.Context(), supportUser(r))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, (&Handler{service: i.service}).toSnapshot(s))
}

var supportActions = map[domain.SupportAction]bool{
	domain.CancelPlan: false, domain.ResumePlan: false, domain.ExtendPlan: false,
	domain.CancelSponsorship: true, domain.RefundPayment: true,
}

func (i *Integration) act(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ActionID string               `json:"actionId"`
		Action   domain.SupportAction `json:"action"`
		Subject  string               `json:"subject"`
		Days     int                  `json:"days"`
	}
	if err := httpx.DecodeJSON(w, r, &in); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	needsSubject, known := supportActions[in.Action]
	switch {
	case !known:
		httpx.WriteError(w, r, apperr.Validation(map[string]string{"action": "must be one of CANCEL_PLAN, RESUME_PLAN, EXTEND_PLAN, CANCEL_SPONSORSHIP, REFUND_PAYMENT"}))
		return
	case needsSubject && !httpx.IsUUID(in.Subject):
		httpx.WriteError(w, r, apperr.Validation(map[string]string{"subject": "must be the id of the sponsorship or payment"}))
		return
	case !needsSubject && in.Subject != "":
		httpx.WriteError(w, r, apperr.Validation(map[string]string{"subject": "this action takes no subject"}))
		return
	case in.Action != domain.ExtendPlan && in.Days != 0:
		httpx.WriteError(w, r, apperr.Validation(map[string]string{"days": "only EXTEND_PLAN takes days"}))
		return
	}
	s, err := i.service.SupportAct(r.Context(), supportUser(r), billing.SupportRequest{
		ActionID: in.ActionID, Action: in.Action, Subject: in.Subject, Days: in.Days,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, (&Handler{service: i.service}).toSnapshot(s))
}
