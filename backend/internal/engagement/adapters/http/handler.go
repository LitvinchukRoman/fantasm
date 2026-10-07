// Package http exposes votes and participation over JSON.
package http

import (
	"net/http"
	"regexp"

	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement"
	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/domain"
	ideashttp "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/http"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct{ service *engagement.Service }

func NewHandler(service *engagement.Service) *Handler { return &Handler{service: service} }

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("PUT /api/ideas/{slug}/vote", httpx.Authed(h.vote))
	mux.HandleFunc("DELETE /api/ideas/{slug}/vote", httpx.Authed(h.unvote))
	mux.HandleFunc("PUT /api/ideas/{slug}/participation", httpx.Authed(h.join))
	mux.HandleFunc("DELETE /api/ideas/{slug}/participation", httpx.Authed(h.leave))
	mux.HandleFunc("GET /api/ideas/{slug}/participants", h.participants)
	mux.HandleFunc("POST /api/ideas/{slug}/participants/{handle}/{decision}", httpx.Authed(h.decide))
}

var handlePattern = regexp.MustCompile(`^[a-z0-9_][a-z0-9_-]{2,39}$`)

func slug(w http.ResponseWriter, r *http.Request) (string, bool) {
	s, ok := ideashttp.Slug(r)
	if !ok {
		httpx.WriteError(w, r, apperr.NotFound("idea not found"))
	}
	return s, ok
}

type voteDTO struct {
	Votes       int  `json:"votes"`
	Voted       bool `json:"voted"`
	VotedWeight int  `json:"votedWeight"`
}

func (h *Handler) vote(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	res, err := h.service.Vote(r.Context(), viewer.From(r.Context()), s)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, voteDTO(res))
}

func (h *Handler) unvote(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	res, err := h.service.Unvote(r.Context(), viewer.From(r.Context()), s)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, voteDTO(res))
}

type participationDTO struct {
	Participation *struct {
		State string `json:"state"`
		Role  string `json:"role"`
	} `json:"participation"`
	Participants int `json:"participants"`
}

func toParticipation(res engagement.ParticipationResult) participationDTO {
	out := participationDTO{Participants: res.Participants}
	if p := res.Participation; p != nil {
		out.Participation = &struct {
			State string `json:"state"`
			Role  string `json:"role"`
		}{string(p.State), p.Role}
	}
	return out
}

func (h *Handler) join(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	var req struct {
		State string `json:"state"`
		Role  string `json:"role"`
	}
	if err := httpx.DecodeJSON(w, r, &req); err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	res, err := h.service.Join(r.Context(), viewer.From(r.Context()), s, domain.State(req.State), req.Role)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toParticipation(res))
}

func (h *Handler) leave(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	res, err := h.service.Leave(r.Context(), viewer.From(r.Context()), s)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toParticipation(res))
}

func (h *Handler) decide(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	handle, decision := r.PathValue("handle"), r.PathValue("decision")
	if !handlePattern.MatchString(handle) || decision != "accept" && decision != "decline" {
		httpx.WriteError(w, r, apperr.NotFound("not found"))
		return
	}
	state, err := h.service.Decide(r.Context(), viewer.From(r.Context()), s, handle, decision == "accept")
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Handle string `json:"handle"`
		State  string `json:"state"`
	}{handle, string(state)})
}

type campusDTO struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

type participantDTO struct {
	Handle   string     `json:"handle"`
	Name     string     `json:"name"`
	State    string     `json:"state"`
	Role     string     `json:"role"`
	Verified bool       `json:"verified"`
	Campus   *campusDTO `json:"campus"`
}

func (h *Handler) participants(w http.ResponseWriter, r *http.Request) {
	s, ok := slug(w, r)
	if !ok {
		return
	}
	list, err := h.service.Participants(r.Context(), viewer.From(r.Context()), s)
	if err != nil {
		httpx.WriteError(w, r, err)
		return
	}
	out := struct {
		Items []participantDTO `json:"items"`
	}{Items: make([]participantDTO, len(list))}
	for n, p := range list {
		d := participantDTO{Handle: p.Handle, Name: p.Name, State: string(p.State), Role: p.Role, Verified: p.Verified}
		if p.Campus != nil {
			d.Campus = &campusDTO{ID: p.Campus.OrganizationID, Label: p.Campus.Label}
		}
		out.Items[n] = d
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}
