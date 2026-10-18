// Package http serves the admin dashboard.
package http

import (
	"net/http"

	"github.com/LitvinchukRoman/fantasm/backend/internal/admin"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct{ service *admin.Service }

func NewHandler(service *admin.Service) *Handler { return &Handler{service: service} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/admin/overview", httpx.Admin(h.overview))
	mux.HandleFunc("GET /api/admin/users", httpx.Admin(h.users))
	mux.HandleFunc("GET /api/admin/settings", httpx.Admin(h.settings))
	mux.HandleFunc("PUT /api/admin/settings", httpx.Admin(h.updateSettings))
	mux.HandleFunc("GET /api/admin/health", httpx.Admin(h.health))
}

func (h *Handler) overview(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.Overview(r.Context(), r.URL.Query().Get("range"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) users(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	out, err := h.service.Users(r.Context(), q.Get("q"), q.Get("role"), q.Get("cursor"))
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) settings(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.Settings(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Premoderation string `json:"premoderation"`
	}
	if err := httpx.DecodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out, err := h.service.UpdateSettings(r.Context(), viewer.From(r.Context()), body.Premoderation)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.Status(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
