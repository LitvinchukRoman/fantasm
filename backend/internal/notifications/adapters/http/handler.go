// Package http exposes the inbox of the signed-in user.
package http

import (
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct{ service *notifications.Service }

func NewHandler(service *notifications.Service) *Handler { return &Handler{service: service} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/me/notifications", httpx.Authed(h.list))
	mux.HandleFunc("POST /api/me/notifications/read", httpx.Authed(h.read))
	mux.HandleFunc("GET /api/me/notifications/unread-count", httpx.Authed(h.unreadCount))
}

type itemDTO struct {
	ID        string         `json:"id"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload"`
	Read      bool           `json:"read"`
	CreatedAt time.Time      `json:"createdAt"`
}

func (h *Handler) list(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var unreadOnly bool
	switch q.Get("unread") {
	case "", "false":
	case "true":
		unreadOnly = true
	default:
		httpx.WriteError(w, r, apperr.Validation(map[string]string{"unread": "must be true or false"}))
		return
	}
	limit, err := httpx.QueryInt(r, "limit", notifications.DefaultLimit, 1, notifications.MaxLimit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	page, err := h.service.List(r.Context(), viewer.From(r.Context()), unreadOnly, q.Get("cursor"), limit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	items := make([]itemDTO, len(page.Items))
	for i, it := range page.Items {
		payload := it.Payload
		if payload == nil {
			payload = map[string]any{}
		}
		items[i] = itemDTO{ID: it.ID, Type: string(it.Type), Payload: payload, Read: it.ReadAt != nil, CreatedAt: it.CreatedAt}
	}
	var next *string
	if page.NextCursor != "" {
		next = &page.NextCursor
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Items      []itemDTO `json:"items"`
		NextCursor *string   `json:"nextCursor"`
		Unread     int       `json:"unread"`
	}{items, next, page.Unread})
}

func (h *Handler) read(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
		All bool     `json:"all"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	updated, unread, err := h.service.MarkRead(r.Context(), viewer.From(r.Context()), req.IDs, req.All)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Updated int64 `json:"updated"`
		Unread  int   `json:"unread"`
	}{updated, unread})
}

func (h *Handler) unreadCount(w http.ResponseWriter, r *http.Request) {
	n, err := h.service.UnreadCount(r.Context(), viewer.From(r.Context()))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Unread int `json:"unread"`
	}{n})
}
