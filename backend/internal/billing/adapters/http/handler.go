// Package http exposes plans, idea sponsorships and the support bot's billing tools over JSON.
package http

import (
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/billing"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	ideashttp "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/http"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct{ service *billing.Service }

func NewHandler(service *billing.Service) *Handler { return &Handler{service: service} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/billing/plans", h.plans)
	mux.HandleFunc("GET /api/me/billing", httpx.Authed(h.overview))
	mux.HandleFunc("PUT /api/me/billing/plan", httpx.Authed(h.changePlan))
	mux.HandleFunc("DELETE /api/me/billing/plan", httpx.Authed(h.cancelPlan))
	mux.HandleFunc("DELETE /api/me/billing/sponsorships/{id}", httpx.Authed(h.cancelSponsorship))
	mux.HandleFunc("GET /api/ideas/{slug}/sponsorship", h.sponsorship)
	mux.HandleFunc("PUT /api/ideas/{slug}/sponsorship", httpx.Authed(h.sponsor))
	mux.HandleFunc("POST /api/me/support-token", httpx.Authed(h.supportToken))
}

// ---- wire types ----

type planDTO struct {
	Code       domain.Plan `json:"code"`
	Name       string      `json:"name"`
	PriceMinor int         `json:"priceMinor"`
	// ActiveIdeas is null when the plan has no limit.
	ActiveIdeas *int     `json:"activeIdeas"`
	Perks       []string `json:"perks"`
}

func toPlan(p domain.PlanInfo) planDTO {
	out := planDTO{Code: p.Code, Name: p.Name, PriceMinor: p.PriceMinor, Perks: p.Perks}
	if p.ActiveIdeas > 0 {
		out.ActiveIdeas = &p.ActiveIdeas
	}
	return out
}

type tierDTO struct {
	Code       domain.Tier `json:"code"`
	Name       string      `json:"name"`
	PriceMinor int         `json:"priceMinor"`
	Perks      []string    `json:"perks"`
}

type catalogDTO struct {
	Currency string    `json:"currency"`
	Mock     bool      `json:"mock"`
	Plans    []planDTO `json:"plans"`
	Tiers    []tierDTO `json:"tiers"`
}

type planStateDTO struct {
	planDTO
	Status            *domain.Status `json:"status"`
	CurrentPeriodEnd  *time.Time     `json:"currentPeriodEnd"`
	CancelAtPeriodEnd bool           `json:"cancelAtPeriodEnd"`
}

type usageDTO struct {
	ActiveIdeas int  `json:"activeIdeas"`
	Limit       *int `json:"limit"`
}

type ideaRefDTO struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
}

type sponsorshipDTO struct {
	ID                string        `json:"id"`
	Idea              ideaRefDTO    `json:"idea"`
	Tier              domain.Tier   `json:"tier"`
	TierName          string        `json:"tierName"`
	PriceMinor        int           `json:"priceMinor"`
	Status            domain.Status `json:"status"`
	CurrentPeriodEnd  time.Time     `json:"currentPeriodEnd"`
	CancelAtPeriodEnd bool          `json:"cancelAtPeriodEnd"`
	Since             time.Time     `json:"since"`
}

type paymentDTO struct {
	ID          string               `json:"id"`
	Kind        domain.PaymentKind   `json:"kind"`
	AmountMinor int                  `json:"amountMinor"`
	Currency    string               `json:"currency"`
	Status      domain.PaymentStatus `json:"status"`
	Description string               `json:"description"`
	CreatedAt   time.Time            `json:"createdAt"`
	RefundedAt  *time.Time           `json:"refundedAt"`
}

type overviewDTO struct {
	Mock         bool             `json:"mock"`
	Currency     string           `json:"currency"`
	Plan         planStateDTO     `json:"plan"`
	Usage        usageDTO         `json:"usage"`
	Sponsorships []sponsorshipDTO `json:"sponsorships"`
	Payments     []paymentDTO     `json:"payments"`
}

func (h *Handler) toSponsorship(s domain.Sponsorship) sponsorshipDTO {
	tier, _ := h.service.Catalog().Tier(s.Tier)
	return sponsorshipDTO{
		ID: s.ID, Idea: ideaRefDTO{Slug: s.IdeaSlug, Title: s.IdeaTitle},
		Tier: s.Tier, TierName: tier.Name, PriceMinor: tier.PriceMinor,
		Status: s.Status, CurrentPeriodEnd: s.End, CancelAtPeriodEnd: s.Status == domain.Canceled, Since: s.CreatedAt,
	}
}

func (h *Handler) toOverview(o billing.Overview) overviewDTO {
	out := overviewDTO{
		Mock: true, Currency: domain.Currency,
		Plan:         planStateDTO{planDTO: toPlan(o.Plan.Info), CurrentPeriodEnd: o.Plan.PeriodEnd, CancelAtPeriodEnd: o.Plan.CancelAtPeriodEnd},
		Usage:        usageDTO{ActiveIdeas: o.Usage.ActiveIdeas},
		Sponsorships: make([]sponsorshipDTO, 0, len(o.Sponsorships)),
		Payments:     make([]paymentDTO, 0, len(o.Payments)),
	}
	if o.Plan.Status != "" {
		out.Plan.Status = &o.Plan.Status
	}
	if o.Usage.Limit > 0 {
		out.Usage.Limit = &o.Usage.Limit
	}
	for _, s := range o.Sponsorships {
		out.Sponsorships = append(out.Sponsorships, h.toSponsorship(s))
	}
	for _, p := range o.Payments {
		out.Payments = append(out.Payments, paymentDTO{
			ID: p.ID, Kind: p.Kind, AmountMinor: p.AmountMinor, Currency: domain.Currency,
			Status: p.Status, Description: p.Description, CreatedAt: p.CreatedAt, RefundedAt: p.RefundedAt,
		})
	}
	return out
}

type supporterDTO struct {
	Handle string      `json:"handle"`
	Name   string      `json:"name"`
	Tier   domain.Tier `json:"tier"`
	Since  time.Time   `json:"since"`
}

type ideaSponsorshipDTO struct {
	Sponsors  int             `json:"sponsors"`
	Accepting bool            `json:"accepting"`
	Own       bool            `json:"own"`
	Mine      *sponsorshipDTO `json:"mine"`
	// Only the author and staff see who sponsors and how much the idea collects.
	Supporters   []supporterDTO `json:"supporters,omitempty"`
	MonthlyMinor *int           `json:"monthlyMinor,omitempty"`
}

func (h *Handler) toIdeaSponsorship(s billing.IdeaSponsorship) ideaSponsorshipDTO {
	out := ideaSponsorshipDTO{Sponsors: s.Sponsors, Accepting: s.Accepting, Own: s.Own}
	if s.Mine != nil {
		m := h.toSponsorship(*s.Mine)
		out.Mine = &m
	}
	if s.Manager {
		out.Supporters = make([]supporterDTO, 0, len(s.Supporters))
		for _, sp := range s.Supporters {
			out.Supporters = append(out.Supporters, supporterDTO(sp))
		}
		out.MonthlyMinor = &s.MonthlyMinor
	}
	return out
}

// ---- handlers ----

func (h *Handler) plans(w http.ResponseWriter, _ *http.Request) {
	c := h.service.Catalog()
	out := catalogDTO{Currency: domain.Currency, Mock: true, Plans: make([]planDTO, 0, len(c.Plans)), Tiers: make([]tierDTO, 0, len(c.Tiers))}
	for _, p := range c.Plans {
		out.Plans = append(out.Plans, toPlan(p))
	}
	for _, t := range c.Tiers {
		out.Tiers = append(out.Tiers, tierDTO(t))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	o, err := h.service.Overview(r.Context(), viewer.From(r.Context()))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toOverview(o))
}

func (h *Handler) changePlan(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Plan domain.Plan `json:"plan"`
	}
	if err := httpx.DecodeJSON(w, r, &in); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	o, err := h.service.ChangePlan(r.Context(), viewer.From(r.Context()), in.Plan)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toOverview(o))
}

func (h *Handler) cancelPlan(w http.ResponseWriter, r *http.Request) {
	o, err := h.service.CancelPlan(r.Context(), viewer.From(r.Context()))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toOverview(o))
}

func (h *Handler) cancelSponsorship(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !httpx.IsUUID(id) {
		httpx.WriteError(w, r, apperr.NotFound("sponsorship not found"))
		return
	}
	o, err := h.service.CancelSponsorship(r.Context(), viewer.From(r.Context()), id)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toOverview(o))
}

func slug(w http.ResponseWriter, r *http.Request) (string, bool) {
	s, ok := ideashttp.Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
	}
	return s, ok
}

func (h *Handler) sponsorship(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	res, err := h.service.SponsorshipOf(r.Context(), viewer.From(r.Context()), s)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toIdeaSponsorship(res))
}

func (h *Handler) sponsor(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	var in struct {
		Tier domain.Tier `json:"tier"`
	}
	if err := httpx.DecodeJSON(w, r, &in); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	res, err := h.service.Sponsor(r.Context(), viewer.From(r.Context()), s, in.Tier)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, h.toIdeaSponsorship(res))
}

func (h *Handler) supportToken(w http.ResponseWriter, r *http.Request) {
	token, expires, err := h.service.IssueSupportToken(viewer.From(r.Context()))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	// The token lets the bot act for this user: never let a cache keep it.
	w.Header().Set("Cache-Control", "no-store")
	httpx.WriteJSON(w, http.StatusOK, struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expiresAt"`
	}{token, expires})
}

// supportSnapshotDTO is everything the support bot may know about the user's billing.
type supportSnapshotDTO struct {
	User struct {
		Handle string `json:"handle"`
		Name   string `json:"name"`
	} `json:"user"`
	overviewDTO
	Replayed bool `json:"replayed"`
}

func (h *Handler) toSnapshot(s billing.SupportSnapshot) supportSnapshotDTO {
	out := supportSnapshotDTO{overviewDTO: h.toOverview(s.Overview), Replayed: s.Replayed}
	out.User.Handle, out.User.Name = s.User.Handle, s.User.Name
	return out
}
