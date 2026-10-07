// Package http exposes ideas over JSON. The wire format follows the frontend
// types in frontend/app/lib/ideas.ts.
package http

import (
	"context"
	"net/http"
	"regexp"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

// Profiles looks up public profiles of people.
type Profiles interface {
	PublicProfile(ctx context.Context, handle string) (identity.PublicProfile, error)
}

type Handler struct {
	service  *ideas.Service
	profiles Profiles
}

func NewHandler(service *ideas.Service, profiles Profiles) *Handler {
	return &Handler{service: service, profiles: profiles}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ideas", h.feed)
	mux.HandleFunc("POST /api/ideas", httpx.Authed(h.create))
	mux.HandleFunc("GET /api/ideas/{slug}", h.get)
	mux.HandleFunc("PATCH /api/ideas/{slug}", httpx.Authed(h.update))
	mux.HandleFunc("DELETE /api/ideas/{slug}", httpx.Authed(h.remove))
	mux.HandleFunc("POST /api/ideas/{slug}/status", httpx.Authed(h.changeStatus))
	mux.HandleFunc("GET /api/ideas/{slug}/next", h.next)
	mux.HandleFunc("GET /api/events", h.events)
	mux.HandleFunc("GET /api/sitemap/ideas", h.sitemap)
	mux.HandleFunc("GET /api/me/ideas", httpx.Authed(h.mine))
	mux.HandleFunc("GET /api/users/{handle}", h.user)
}

var (
	slugPattern   = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	handlePattern = regexp.MustCompile(`^[a-z0-9_][a-z0-9_-]{2,39}$`)
)

// Slug extracts and checks the {slug} path value. A malformed slug is a 404, the same as a missing idea.
func Slug(r *http.Request) (string, bool) {
	s := r.PathValue("slug")
	return s, len(s) <= 90 && slugPattern.MatchString(s)
}

// ---- wire types ----

type campusDTO struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

func campus(c *ideas.Campus) *campusDTO {
	if c == nil {
		return nil
	}
	return &campusDTO{ID: c.ID, Label: c.Label}
}

type authorDTO struct {
	Handle   string     `json:"handle"`
	Name     string     `json:"name"`
	Verified bool       `json:"verified"`
	Campus   *campusDTO `json:"campus"`
}

type cardDTO struct {
	Slug           string       `json:"slug"`
	Title          string       `json:"title"`
	Summary        string       `json:"summary"`
	Story          string       `json:"story"`
	CoverURL       string       `json:"coverUrl,omitempty"`
	Category       string       `json:"category"`
	Status         string       `json:"status"`
	Moderation     string       `json:"moderation,omitempty"`
	Visibility     string       `json:"visibility"`
	OrganizationID *string      `json:"organizationId"`
	Campus         *campusDTO   `json:"campus"`
	Tags           []domain.Tag `json:"tags"`
	Author         authorDTO    `json:"author"`
	Votes          int          `json:"votes"`
	Comments       int          `json:"comments"`
	Participants   int          `json:"participants"`
	CreatedAt      time.Time    `json:"createdAt"`
	UpdatedAt      time.Time    `json:"updatedAt"`
	PublishedAt    *time.Time   `json:"publishedAt"`
	EventAt        *time.Time   `json:"eventAt,omitempty"`
	EventLocation  string       `json:"eventLocation,omitempty"`
	EventCapacity  *int         `json:"eventCapacity,omitempty"`
	NeedsRoles     []string     `json:"needsRoles"`
}

func toCard(it ideas.Item, showModeration bool) cardDTO {
	var org *string
	if it.OrganizationID != "" {
		org = &it.OrganizationID
	}
	c := cardDTO{
		Slug: it.Slug, Title: it.Title, Summary: it.Summary, Story: it.Rendered.Story, CoverURL: it.CoverURL,
		Category: string(it.Category), Status: string(it.Status), Visibility: string(it.Visibility),
		OrganizationID: org, Campus: campus(it.Campus), Tags: it.Tags,
		Author: authorDTO{Handle: it.Author.Handle, Name: it.Author.Name, Verified: it.AuthorVerified, Campus: campus(it.AuthorCampus)},
		Votes:  it.Votes, Comments: it.Comments, Participants: it.Joins,
		CreatedAt: it.CreatedAt, UpdatedAt: it.UpdatedAt, PublishedAt: it.PublishedAt,
		EventAt: it.EventDate, EventLocation: it.EventPlace, EventCapacity: it.EventCapacity, NeedsRoles: it.NeedsRoles,
	}
	if showModeration {
		c.Moderation = string(it.Moderation)
	}
	return c
}

type participationDTO struct {
	State string `json:"state"`
	Role  string `json:"role"`
}

type viewerDTO struct {
	Voted         bool              `json:"voted"`
	VotedWeight   int               `json:"votedWeight"`
	Participation *participationDTO `json:"participation"`
}

type viewDTO struct {
	cardDTO
	HTML           string           `json:"html"`
	Text           string           `json:"text"`
	TOC            []domain.TOCItem `json:"toc"`
	ReadingMinutes int              `json:"readingMinutes"`
	Body           *string          `json:"body,omitempty"`
	CanEdit        bool             `json:"canEdit"`
	Viewer         viewerDTO        `json:"viewer"`
}

func toView(d ideas.Detail) viewDTO {
	v := viewDTO{
		cardDTO: toCard(d.Item, d.CanEdit), HTML: d.Rendered.HTML, Text: d.Rendered.Text, TOC: d.Rendered.TOC,
		ReadingMinutes: d.Rendered.ReadingMinutes, CanEdit: d.CanEdit,
		Viewer: viewerDTO{Voted: d.State.VotedWeight > 0, VotedWeight: d.State.VotedWeight},
	}
	if d.ExposeBody {
		body := d.Body
		v.Body = &body
	}
	if p := d.State.Participation; p != nil {
		v.Viewer.Participation = &participationDTO{State: p.State, Role: p.Role}
	}
	return v
}

type pageDTO struct {
	Items      []cardDTO `json:"items"`
	NextCursor *string   `json:"nextCursor"`
}

func toPage(p ideas.Page, showModeration bool) pageDTO {
	out := pageDTO{Items: make([]cardDTO, len(p.Items))}
	for n, it := range p.Items {
		out.Items[n] = toCard(it, showModeration)
	}
	if p.NextCursor != "" {
		out.NextCursor = &p.NextCursor
	}
	return out
}

// ---- handlers ----

func (h *Handler) feed(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, err := httpx.QueryInt(r, "limit", domain.DefaultLimit, 1, domain.MaxFeedLimit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	page, err := h.service.Feed(r.Context(), viewer.From(r.Context()), ideas.FeedQuery{
		Filter: domain.Filter{
			Sort: domain.Sort(q.Get("sort")), Category: domain.Category(q.Get("category")), Tag: q.Get("tag"),
			Campus: q.Get("campus"), Status: domain.Status(q.Get("status")),
		},
		Cursor: q.Get("cursor"), Limit: limit,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toPage(page, false))
}

func (h *Handler) mine(w http.ResponseWriter, r *http.Request) {
	limit, err := httpx.QueryInt(r, "limit", domain.DefaultLimit, 1, domain.MaxFeedLimit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	page, err := h.service.Mine(r.Context(), viewer.From(r.Context()), r.URL.Query().Get("cursor"), limit)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toPage(page, true))
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	slug, ok := Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	d, err := h.service.Get(r.Context(), viewer.From(r.Context()), slug)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toView(d))
}

func (h *Handler) next(w http.ResponseWriter, r *http.Request) {
	slug, ok := Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	ref, err := h.service.Next(r.Context(), viewer.From(r.Context()), slug)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Slug     string `json:"slug"`
		Title    string `json:"title"`
		Summary  string `json:"summary"`
		Category string `json:"category"`
	}{ref.Slug, ref.Title, ref.Summary, string(ref.Category)})
}

type createRequest struct {
	Title          string     `json:"title"`
	Summary        string     `json:"summary"`
	Body           string     `json:"body"`
	CoverURL       string     `json:"coverUrl"`
	Category       string     `json:"category"`
	Tags           []string   `json:"tags"`
	Visibility     string     `json:"visibility"`
	OrganizationID string     `json:"organizationId"`
	Status         string     `json:"status"`
	EventAt        *time.Time `json:"eventAt"`
	EventLocation  string     `json:"eventLocation"`
	EventCapacity  *int       `json:"eventCapacity"`
	NeedsRoles     []string   `json:"needsRoles"`
}

func (h *Handler) create(w http.ResponseWriter, r *http.Request) {
	var req createRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v := viewer.From(r.Context())
	d, err := h.service.Create(r.Context(), v, ideas.CreateInput{
		Content: domain.Content{
			Title: req.Title, Summary: req.Summary, Body: req.Body, CoverURL: req.CoverURL, Category: domain.Category(req.Category),
			Tags: req.Tags, EventDate: req.EventAt, EventPlace: req.EventLocation, EventCapacity: req.EventCapacity, NeedsRoles: req.NeedsRoles,
		},
		Status: domain.Status(req.Status), Visibility: domain.Visibility(req.Visibility), OrganizationID: req.OrganizationID,
	})
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	logging.From(r.Context()).InfoContext(r.Context(), "idea created", "idea_slug", d.Slug, "user_id", v.ID(), "moderation", d.Moderation, "status", d.Status)
	w.Header().Set("Location", "/api/ideas/"+d.Slug)
	httpx.WriteJSON(w, http.StatusCreated, toView(d))
}

type patchRequest struct {
	Title         *string    `json:"title"`
	Summary       *string    `json:"summary"`
	Body          *string    `json:"body"`
	CoverURL      *string    `json:"coverUrl"`
	Category      *string    `json:"category"`
	Tags          *[]string  `json:"tags"`
	EventAt       *time.Time `json:"eventAt"`
	EventLocation *string    `json:"eventLocation"`
	EventCapacity *int       `json:"eventCapacity"`
	NeedsRoles    *[]string  `json:"needsRoles"`
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request) {
	slug, ok := Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	var req patchRequest
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	patch := ideas.Patch{
		Title: req.Title, Summary: req.Summary, Body: req.Body, CoverURL: req.CoverURL, Tags: req.Tags,
		EventDate: req.EventAt, EventPlace: req.EventLocation, EventCapacity: req.EventCapacity, NeedsRoles: req.NeedsRoles,
	}
	if req.Category != nil {
		c := domain.Category(*req.Category)
		patch.Category = &c
	}
	v := viewer.From(r.Context())
	d, err := h.service.Update(r.Context(), v, slug, patch)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	logging.From(r.Context()).InfoContext(r.Context(), "idea updated", "idea_slug", slug, "user_id", v.ID())
	httpx.WriteJSON(w, http.StatusOK, toView(d))
}

func (h *Handler) remove(w http.ResponseWriter, r *http.Request) {
	slug, ok := Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	v := viewer.From(r.Context())
	if err := h.service.Delete(r.Context(), v, slug); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	logging.From(r.Context()).WarnContext(r.Context(), "idea deleted", "idea_slug", slug, "user_id", v.ID())
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) changeStatus(w http.ResponseWriter, r *http.Request) {
	slug, ok := Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
		return
	}
	var req struct {
		Status string `json:"status"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	v := viewer.From(r.Context())
	if err := h.service.ChangeStatus(r.Context(), v, slug, domain.Status(req.Status)); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	d, err := h.service.Get(r.Context(), v, slug)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toView(d))
}

func (h *Handler) events(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var from, to time.Time
	for name, dst := range map[string]*time.Time{"from": &from, "to": &to} {
		if raw := q.Get(name); raw != "" {
			t, err := time.Parse(time.RFC3339, raw)
			if err != nil {
				httpx.WriteError(w, r, apperr.Validation(map[string]string{name: "must be an RFC 3339 timestamp"}))
				return
			}
			*dst = t
		}
	}
	items, err := h.service.Events(r.Context(), viewer.From(r.Context()), from, to)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out := struct {
		Items []cardDTO `json:"items"`
	}{Items: make([]cardDTO, len(items))}
	for n, it := range items {
		out.Items[n] = toCard(it, false)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (h *Handler) sitemap(w http.ResponseWriter, r *http.Request) {
	entries, err := h.service.Sitemap(r.Context())
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	type entry struct {
		Slug      string    `json:"slug"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	out := struct {
		Items []entry `json:"items"`
	}{Items: make([]entry, len(entries))}
	for n, e := range entries {
		out.Items[n] = entry{e.Slug, e.UpdatedAt}
	}
	// Anonymous-only data, identical for everybody: safe for a shared cache.
	w.Header().Set("Cache-Control", "public, max-age=300")
	httpx.WriteJSON(w, http.StatusOK, out)
}

type profileDTO struct {
	Handle     string     `json:"handle"`
	Name       string     `json:"name"`
	Bio        string     `json:"bio"`
	Faculty    string     `json:"faculty,omitempty"`
	Verified   bool       `json:"verified"`
	Campus     *campusDTO `json:"campus"`
	Role       string     `json:"role"`
	Karma      int        `json:"karma"`
	JoinedAt   time.Time  `json:"joinedAt"`
	IdeasCount int        `json:"ideasCount"`
	Ideas      []cardDTO  `json:"ideas"`
}

func (h *Handler) user(w http.ResponseWriter, r *http.Request) {
	handle := r.PathValue("handle")
	if !handlePattern.MatchString(handle) {
		httpx.WriteError(w, r, apperr.NotFound("user not found"))
		return
	}
	ctx := r.Context()
	v := viewer.From(ctx)
	profile, err := h.profiles.PublicProfile(ctx, handle)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	items, err := h.service.ByAuthor(ctx, v, profile.User.ID, 20)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	count, err := h.service.CountByAuthor(ctx, v, profile.User.ID)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out := profileDTO{
		Handle: profile.User.Handle, Name: profile.User.Name, Bio: profile.User.Bio, Faculty: profile.User.Faculty,
		Verified: profile.Badge != nil, Role: string(profile.User.Role), Karma: profile.User.Karma, JoinedAt: profile.User.CreatedAt,
		IdeasCount: count, Ideas: make([]cardDTO, len(items)),
	}
	if b := profile.Badge; b != nil {
		out.Campus = &campusDTO{ID: b.OrganizationID, Label: b.Label}
	}
	for n, it := range items {
		out.Ideas[n] = toCard(it, false)
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
