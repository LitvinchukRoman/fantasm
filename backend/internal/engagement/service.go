// Package engagement owns votes, participation and the karma they earn.
// Every change updates the stored counters and the hot score in the same
// transaction as the row it describes, so counters can never drift.
package engagement

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/ports"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	identity "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	notify "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	notifyports "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Service struct {
	repo   ports.Repository
	tx     ports.Transactor
	badges viewer.BadgeLookup
	notify notifyports.Publisher
	now    func() time.Time
}

func NewService(repo ports.Repository, tx ports.Transactor, badges viewer.BadgeLookup, publisher notifyports.Publisher) *Service {
	return &Service{repo: repo, tx: tx, badges: badges, notify: publisher, now: time.Now}
}

func notFound() error { return apperr.NotFound("idea not found") }

func requireAuth(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	return nil
}

func (s *Service) find(ctx context.Context, v viewer.Viewer, slug string, readable, lock bool) (ports.IdeaRef, error) {
	ref, err := s.repo.FindIdea(ctx, ideaports.AccessOf(v), slug, readable, lock)
	if errors.Is(err, ideadomain.ErrNotFound) {
		return ports.IdeaRef{}, notFound()
	}
	if err != nil {
		return ports.IdeaRef{}, fmt.Errorf("find idea: %w", err)
	}
	return ref, nil
}

func actorPayload(v viewer.Viewer, ref ports.IdeaRef) map[string]any {
	return map[string]any{"ideaSlug": ref.Slug, "ideaTitle": ref.Title, "actorHandle": v.User.Handle, "actorName": v.User.Name}
}

// VoteResult is the state of an idea's votes after a change, from the voter's side.
type VoteResult struct {
	Votes       int
	Voted       bool
	VotedWeight int
}

// Vote records the viewer's vote. Voting twice is a no-op, not an error: the
// client may retry. The weight is frozen at this moment.
func (s *Service) Vote(ctx context.Context, v viewer.Viewer, slug string) (VoteResult, error) {
	if err := requireAuth(v); err != nil {
		return VoteResult{}, err
	}
	var res VoteResult
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.find(ctx, v, slug, false, false)
		if err != nil {
			return err
		}
		if ref.AuthorID == v.ID() {
			return apperr.Validation(map[string]string{"vote": "you cannot vote for your own idea"})
		}
		weight := max(v.VoteWeight(), 1)
		inserted, err := s.repo.AddVote(ctx, ref.ID, v.ID(), weight)
		if err != nil {
			return fmt.Errorf("add vote: %w", err)
		}
		var counters ports.Counters
		if inserted {
			if counters, err = s.repo.AdjustVotes(ctx, ref.ID, weight, s.now().UTC()); err != nil {
				return fmt.Errorf("adjust votes: %w", err)
			}
			if err := s.repo.AdjustKarma(ctx, ref.AuthorID, domain.VoteKarma(weight, ref.KarmaMultiplier)); err != nil {
				return fmt.Errorf("adjust karma: %w", err)
			}
			if err := s.notify.Publish(ctx, notify.Notification{
				UserID: ref.AuthorID, Type: notify.Vote, Payload: actorPayload(v, ref),
				DedupeKey: map[string]any{"ideaSlug": ref.Slug, "actorHandle": v.User.Handle},
			}); err != nil {
				return fmt.Errorf("notify: %w", err)
			}
		} else if counters, err = s.repo.Counters(ctx, ref.ID); err != nil {
			return fmt.Errorf("counters: %w", err)
		}
		stored, err := s.repo.VoteWeight(ctx, ref.ID, v.ID())
		if err != nil {
			return fmt.Errorf("vote weight: %w", err)
		}
		res = VoteResult{Votes: counters.Votes, Voted: stored > 0, VotedWeight: stored}
		return nil
	})
	return res, err
}

// Unvote withdraws the viewer's vote, returning exactly the weight and karma it added.
func (s *Service) Unvote(ctx context.Context, v viewer.Viewer, slug string) (VoteResult, error) {
	if err := requireAuth(v); err != nil {
		return VoteResult{}, err
	}
	var res VoteResult
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.find(ctx, v, slug, false, false)
		if err != nil {
			return err
		}
		weight, removed, err := s.repo.RemoveVote(ctx, ref.ID, v.ID())
		if err != nil {
			return fmt.Errorf("remove vote: %w", err)
		}
		var counters ports.Counters
		if removed {
			if counters, err = s.repo.AdjustVotes(ctx, ref.ID, -weight, s.now().UTC()); err != nil {
				return fmt.Errorf("adjust votes: %w", err)
			}
			if err := s.repo.AdjustKarma(ctx, ref.AuthorID, -domain.VoteKarma(weight, ref.KarmaMultiplier)); err != nil {
				return fmt.Errorf("adjust karma: %w", err)
			}
		} else if counters, err = s.repo.Counters(ctx, ref.ID); err != nil {
			return fmt.Errorf("counters: %w", err)
		}
		res = VoteResult{Votes: counters.Votes}
		return nil
	})
	return res, err
}

// ParticipationResult is the viewer's participation after a change and the idea's seat counter.
type ParticipationResult struct {
	Participation *domain.Participation
	Participants  int
}

func (s *Service) full(ctx context.Context, ref ports.IdeaRef, extra int) error {
	if ref.Capacity == nil || extra == 0 {
		return nil
	}
	seats, err := s.repo.Seats(ctx, ref.ID)
	if err != nil {
		return fmt.Errorf("count seats: %w", err)
	}
	if seats+extra > *ref.Capacity {
		return apperr.Conflict("the event is full")
	}
	return nil
}

// Join sets the viewer's participation to INTERESTED or JOINED.
func (s *Service) Join(ctx context.Context, v viewer.Viewer, slug string, state domain.State, role string) (ParticipationResult, error) {
	if err := requireAuth(v); err != nil {
		return ParticipationResult{}, err
	}
	if !state.Requestable() {
		return ParticipationResult{}, apperr.Validation(map[string]string{"state": "must be INTERESTED or JOINED"})
	}
	role, err := domain.CleanRole(role)
	if err != nil {
		return ParticipationResult{}, err
	}
	var res ParticipationResult
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.find(ctx, v, slug, false, true) // row lock: seats are a shared, limited resource
		if err != nil {
			return err
		}
		if ref.AuthorID == v.ID() {
			return apperr.Validation(map[string]string{"participation": "you cannot join your own idea"})
		}
		existing, err := s.repo.Participation(ctx, ref.ID, v.ID())
		if err != nil {
			return fmt.Errorf("load participation: %w", err)
		}
		if existing != nil && !existing.State.Requestable() {
			return apperr.Conflict("the author has already decided on your request")
		}
		wasSeated := existing != nil && existing.State.Counts()
		if state.Counts() && !wasSeated {
			if err := s.full(ctx, ref, 1); err != nil {
				return err
			}
		}
		next := domain.Participation{State: state, Role: role}
		if err := s.repo.SaveParticipation(ctx, ref.ID, v.ID(), next, s.now().UTC()); err != nil {
			return fmt.Errorf("save participation: %w", err)
		}
		counters, err := s.repo.RecountJoins(ctx, ref.ID, s.now().UTC())
		if err != nil {
			return fmt.Errorf("recount joins: %w", err)
		}
		if state == domain.Joined && !wasSeated {
			if err := s.notify.Publish(ctx, notify.Notification{
				UserID: ref.AuthorID, Type: notify.Join, Payload: actorPayload(v, ref),
				DedupeKey: map[string]any{"ideaSlug": ref.Slug, "actorHandle": v.User.Handle},
			}); err != nil {
				return fmt.Errorf("notify: %w", err)
			}
		}
		res = ParticipationResult{Participation: &next, Participants: counters.Joins}
		return nil
	})
	return res, err
}

// Leave withdraws the viewer's participation. A declined request stays on record,
// otherwise declining could be undone by leaving and asking again.
func (s *Service) Leave(ctx context.Context, v viewer.Viewer, slug string) (ParticipationResult, error) {
	if err := requireAuth(v); err != nil {
		return ParticipationResult{}, err
	}
	var res ParticipationResult
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.find(ctx, v, slug, false, true)
		if err != nil {
			return err
		}
		existing, err := s.repo.Participation(ctx, ref.ID, v.ID())
		if err != nil {
			return fmt.Errorf("load participation: %w", err)
		}
		if existing != nil && existing.State != domain.Declined {
			if err := s.repo.DeleteParticipation(ctx, ref.ID, v.ID()); err != nil {
				return fmt.Errorf("delete participation: %w", err)
			}
			existing = nil
		}
		counters, err := s.repo.RecountJoins(ctx, ref.ID, s.now().UTC())
		if err != nil {
			return fmt.Errorf("recount joins: %w", err)
		}
		res = ParticipationResult{Participation: existing, Participants: counters.Joins}
		return nil
	})
	return res, err
}

// Decide lets the idea's author accept or decline a participant.
func (s *Service) Decide(ctx context.Context, v viewer.Viewer, slug, handle string, accept bool) (domain.State, error) {
	if err := requireAuth(v); err != nil {
		return "", err
	}
	var result domain.State
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.find(ctx, v, slug, true, true)
		if err != nil {
			return err
		}
		if ref.AuthorID != v.ID() {
			return apperr.Forbidden("only the author can decide on participants")
		}
		userID, err := s.repo.UserIDByHandle(ctx, handle)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return apperr.NotFound("participant not found")
		}
		if err != nil {
			return fmt.Errorf("find participant: %w", err)
		}
		existing, err := s.repo.Participation(ctx, ref.ID, userID)
		if err != nil {
			return fmt.Errorf("load participation: %w", err)
		}
		if existing == nil {
			return apperr.NotFound("participant not found")
		}
		next := domain.Declined
		if accept {
			next = domain.Accepted
		}
		if next.Counts() && !existing.State.Counts() {
			if err := s.full(ctx, ref, 1); err != nil {
				return err
			}
		}
		if existing.State == next {
			result = next
			return nil
		}
		if err := s.repo.SaveParticipation(ctx, ref.ID, userID, domain.Participation{State: next, Role: existing.Role}, s.now().UTC()); err != nil {
			return fmt.Errorf("save participation: %w", err)
		}
		if _, err := s.repo.RecountJoins(ctx, ref.ID, s.now().UTC()); err != nil {
			return fmt.Errorf("recount joins: %w", err)
		}
		if accept {
			if err := s.notify.Publish(ctx, notify.Notification{
				UserID: userID, Type: notify.Accepted,
				Payload: map[string]any{"ideaSlug": ref.Slug, "ideaTitle": ref.Title, "actorHandle": v.User.Handle, "actorName": v.User.Name},
			}); err != nil {
				return fmt.Errorf("notify: %w", err)
			}
		}
		result = next
		return nil
	})
	return result, err
}

// Participant is one person on an idea as the API shows them.
type Participant struct {
	Handle   string
	Name     string
	State    domain.State
	Role     string
	Verified bool
	Campus   *identity.Badge
}

const maxParticipants = 200

// Participants lists people on an idea. Everybody sees who joined or was accepted;
// the author and staff also see interested and declined people.
func (s *Service) Participants(ctx context.Context, v viewer.Viewer, slug string) ([]Participant, error) {
	ref, err := s.find(ctx, v, slug, true, false)
	if err != nil {
		return nil, err
	}
	manager := v.Authenticated && (v.ID() == ref.AuthorID || v.IsStaff())
	rows, err := s.repo.Participants(ctx, ref.ID, !manager, maxParticipants)
	if err != nil {
		return nil, fmt.Errorf("list participants: %w", err)
	}
	ids := make([]string, len(rows))
	for n, p := range rows {
		ids[n] = p.UserID
	}
	badges := map[string]identity.Badge{}
	if len(ids) > 0 {
		if badges, err = s.badges.BadgesFor(ctx, ids); err != nil {
			return nil, fmt.Errorf("resolve badges: %w", err)
		}
	}
	out := make([]Participant, len(rows))
	for n, p := range rows {
		out[n] = Participant{Handle: p.Handle, Name: p.Name, State: p.State, Role: p.Role}
		if b, ok := badges[p.UserID]; ok {
			out[n].Verified, out[n].Campus = true, &b
		}
	}
	return out, nil
}
