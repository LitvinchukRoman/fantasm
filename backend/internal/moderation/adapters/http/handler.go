// Package http exposes reporting and the moderators' queue.
package http

import (
	"net/http"
	"time"

	ideashttp "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/http"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct {
	service     *moderation.Service
	limitReport func(http.HandlerFunc) http.HandlerFunc
}

func NewHandler(service *moderation.Service, limitReport func(http.HandlerFunc) http.HandlerFunc) *Handler {
	if limitReport == nil {
		limitReport = func(next http.HandlerFunc) http.HandlerFunc { return next }
	}
	return &Handler{service: service, limitReport: limitReport}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/ideas/{slug}/report", httpx.Authed(h.limitReport(h.report)))
	mux.HandleFunc("GET /api/moderation/queue", httpx.Staff(h.queue))
	mux.HandleFunc("POST /api/moderation/ideas/{id}/decision", httpx.Staff(h.decide))
	mux.HandleFunc("GET /api/moderation/reports", httpx.Staff(h.reports))
}

func (h *Handler) report(w http.ResponseWriter, r *http.Request) {
	slug, ok := ideashttp.Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	var req struct {
		Reason string `json:"reason"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.service.Report(r.Context(), viewer.From(r.Context()), slug, req.Reason); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type personDTO struct {
	Handle string `json:"handle"`
	Name   string `json:"name"`
}

type queueItemDTO struct {
	CaseID         string    `json:"caseId"`
	IdeaID         string    `json:"ideaId"`
	Slug           string    `json:"slug"`
	Title          string    `json:"title"`
	Summary        string    `json:"summary"`
	Category       string    `json:"category"`
	HTML           string    `json:"html"`
	Author         personDTO `json:"author"`
	AuthorKarma    int       `json:"authorKarma"`
	AuthorApproved int       `json:"authorApprovedIdeas"`
	State          string    `json:"state"`
	Source         string    `json:"source"`
	OpenedAt       time.Time `json:"openedAt"`
	OpenReports    int       `json:"openReports"`
}

func (h *Handler) queue(w http.ResponseWriter, r *http.Request) {
	state := domain.State(r.URL.Query().Get("state"))
	if state == "" {
		state = domain.Pending
	}
	limit, err := httpx.QueryInt(r, "limit", domain.DefaultQueueLimit, 1, domain.MaxQueueLimit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	page, err := h.service.Queue(r.Context(), viewer.From(r.Context()), state, r.URL.Query().Get("cursor"), limit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	items := make([]queueItemDTO, len(page.Items))
	for i, it := range page.Items {
		items[i] = queueItemDTO{
			CaseID: it.CaseID, IdeaID: it.IdeaID, Slug: it.Slug, Title: it.Title, Summary: it.Summary, Category: it.Category, HTML: it.HTML,
			Author: personDTO{it.Author.Handle, it.Author.Name}, AuthorKarma: it.AuthorKarma, AuthorApproved: it.AuthorApproved,
			State: string(it.State), Source: string(it.Source), OpenedAt: it.OpenedAt, OpenReports: it.OpenReports,
		}
	}
	var next *string
	if page.NextCursor != "" {
		next = &page.NextCursor
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Items      []queueItemDTO `json:"items"`
		NextCursor *string        `json:"nextCursor"`
	}{items, next})
}

func (h *Handler) decide(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Decision string `json:"decision"`
		Note     string `json:"note"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	if err := h.service.Decide(r.Context(), viewer.From(r.Context()), r.PathValue("id"), domain.Decision(req.Decision), req.Note); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) reports(w http.ResponseWriter, r *http.Request) {
	reports, err := h.service.Reports(r.Context(), viewer.From(r.Context()), r.URL.Query().Get("ideaId"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	type reportDTO struct {
		Reporter  personDTO `json:"reporter"`
		Reason    string    `json:"reason"`
		Status    string    `json:"status"`
		CreatedAt time.Time `json:"createdAt"`
	}
	items := make([]reportDTO, len(reports))
	for i, rp := range reports {
		items[i] = reportDTO{personDTO{rp.Reporter.Handle, rp.Reporter.Name}, rp.Reason, rp.Status, rp.CreatedAt}
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Items []reportDTO `json:"items"`
	}{items})
}
