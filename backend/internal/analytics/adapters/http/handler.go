// Package http accepts the browser's analytics beacon.
package http

import (
	"net/http"

	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

const maxBeaconBody = 4 << 10

type Handler struct {
	service *analytics.Service
	ip      func(*http.Request) string
	limit   func(http.HandlerFunc) http.HandlerFunc
}

func NewHandler(service *analytics.Service, ip func(*http.Request) string, limit func(http.HandlerFunc) http.HandlerFunc) *Handler {
	if limit == nil {
		limit = func(next http.HandlerFunc) http.HandlerFunc { return next }
	}
	if ip == nil {
		ip = func(*http.Request) string { return "" }
	}
	return &Handler{service: service, ip: ip, limit: limit}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/analytics/events", h.limit(h.ingest))
}

func (h *Handler) ingest(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBeaconBody)
	var body struct {
		Events []struct {
			Name  string            `json:"name"`
			Path  string            `json:"path"`
			Props map[string]string `json:"props"`
		} `json:"events"`
	}
	if err := httpx.DecodeJSON(w, r, &body); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	batch := make([]analytics.Incoming, len(body.Events))
	for i, ev := range body.Events {
		batch[i] = analytics.Incoming{Name: ev.Name, Path: ev.Path, Props: ev.Props}
	}
	ua := r.UserAgent()
	if len(ua) > 300 {
		ua = ua[:300]
	}
	if err := h.service.Ingest(r.Context(), viewer.From(r.Context()), h.ip(r), ua, batch); err != nil {
		if apperr.KindOf(err) == apperr.KindTooLarge {
			httpx.WriteError(w, r, err)
			return
		}
		httpx.WriteError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
