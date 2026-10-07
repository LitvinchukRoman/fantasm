// Package http exposes discussion threads over JSON, matching frontend/app/lib/forum.ts.
package http

import (
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion"
	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/domain"
	ideashttp "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/http"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct {
	service *discussion.Service
	// limitWrites throttles creating and editing posts per user.
	limitWrites func(http.HandlerFunc) http.HandlerFunc
}

func NewHandler(service *discussion.Service, limitWrites func(http.HandlerFunc) http.HandlerFunc) *Handler {
	if limitWrites == nil {
		limitWrites = func(next http.HandlerFunc) http.HandlerFunc { return next }
	}
	return &Handler{service: service, limitWrites: limitWrites}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ideas/{slug}/thread", h.thread)
	mux.HandleFunc("POST /api/ideas/{slug}/posts", httpx.Authed(h.limitWrites(h.create)))
	mux.HandleFunc("PATCH /api/posts/{id}", httpx.Authed(h.limitWrites(h.edit)))
	mux.HandleFunc("DELETE /api/posts/{id}", httpx.Authed(h.remove))
}

type authorDTO struct {
	Handle   string `json:"handle"`
	Name     string `json:"name"`
	Verified bool   `json:"verified"`
}

type postDTO struct {
	ID        string     `json:"id"`
	Author    authorDTO  `json:"author"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
	HTML      string     `json:"html"`
	Text      string     `json:"text"`
	Deleted   bool       `json:"deleted"`
	Replies   []postDTO  `json:"replies"`
}

func toPost(p domain.Post, verified bool) postDTO {
	d := postDTO{ID: p.ID, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt, Deleted: p.Deleted, Replies: []postDTO{}}
	if !p.Deleted {
		d.Author = authorDTO{Handle: p.Author.Handle, Name: p.Author.Name, Verified: verified}
		d.HTML, d.Text = p.HTML, p.Text
	}
	return d
}

func toTree(nodes []*domain.Node, verified map[string]bool) []postDTO {
	out := make([]postDTO, len(nodes))
	for i, n := range nodes {
		out[i] = toPost(n.Post, verified[n.Author.ID])
		out[i].Replies = toTree(n.Replies, verified)
	}
	return out
}

func (h *Handler) thread(w http.ResponseWriter, r *http.Request) {
	slug, ok := ideashttp.Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	t, err := h.service.Thread(r.Context(), viewer.From(r.Context()), slug)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		ID       string    `json:"id"`
		IdeaSlug string    `json:"ideaSlug"`
		Count    int       `json:"count"`
		Posts    []postDTO `json:"posts"`
	}{t.ID, t.IdeaSlug, t.Count, toTree(t.Posts, t.Verified)})
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	slug, ok := ideashttp.Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	var req struct {
		Body     string `json:"body"`
		ParentID string `json:"parentId"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v := viewer.From(r.Context())
	created, err := h.service.Create(r.Context(), v, slug, req.Body, req.ParentID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	logging.From(r.Context()).InfoContext(r.Context(), "post created", "idea_slug", slug, "post_id", created.Post.ID, "user_id", v.ID())
	httpx.WriteJSON(w, http.StatusCreated, toPost(created.Post, created.Verified))
}

func (h *Handler) edit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Body string `json:"body"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	updated, err := h.service.Edit(r.Context(), viewer.From(r.Context()), r.PathValue("id"), req.Body)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toPost(updated.Post, updated.Verified))
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	v := viewer.From(r.Context())
	id := r.PathValue("id")
	if err := h.service.Delete(r.Context(), v, id); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	logging.From(r.Context()).WarnContext(r.Context(), "post deleted", "post_id", id, "user_id", v.ID(), "staff", v.IsStaff())
	w.WriteHeader(http.StatusNoContent)
}
