// Package moderation owns reports, premoderation review and the audit trail of decisions.
package moderation

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/ports"
	notify "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	notifyports "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Service struct {
	repo   ports.Repository
	tx     ports.Transactor
	notify notifyports.Publisher
	cursor cursor.Codec
	log    *slog.Logger
	now    func() time.Time
}

func NewService(repo ports.Repository, tx ports.Transactor, publisher notifyports.Publisher, secret []byte, log *slog.Logger) *Service {
	return &Service{repo: repo, tx: tx, notify: publisher, cursor: cursor.New(secret), log: log, now: time.Now}
}

func ideaNotFound() error { return apperr.NotFound("idea not found") }

func requireStaff(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	if !v.IsStaff() {
		return apperr.Forbidden("moderators only")
	}
	return nil
}

// Report records that the viewer flagged a listed idea. The fifth open report
// hides the idea and queues it for a moderator. Reports are one per person and
// idea; repeating one is a conflict, not a second vote against the idea.
func (s *Service) Report(ctx context.Context, v viewer.Viewer, slug, reason string) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	reason, ok := domain.CleanText(reason, 1, domain.MaxReasonRunes)
	if !ok {
		return apperr.Validation(map[string]string{"reason": fmt.Sprintf("must be 1 to %d characters of plain text", domain.MaxReasonRunes)})
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		idea, err := s.repo.LockPublicIdea(ctx, ideaports.AccessOf(v), slug)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return ideaNotFound()
		}
		if err != nil {
			return fmt.Errorf("find idea: %w", err)
		}
		if idea.AuthorID == v.ID() {
			return apperr.Validation(map[string]string{"idea": "you cannot report your own idea"})
		}
		now := s.now().UTC()
		inserted, err := s.repo.InsertReport(ctx, idea.ID, v.ID(), reason, now)
		if err != nil {
			return fmt.Errorf("insert report: %w", err)
		}
		if !inserted {
			return apperr.Conflict("you have already reported this idea")
		}
		open, err := s.repo.OpenReports(ctx, idea.ID)
		if err != nil {
			return fmt.Errorf("count reports: %w", err)
		}
		if !domain.ShouldAutoHide(open) {
			return nil
		}
		hidden, err := s.repo.Hide(ctx, idea.ID, now)
		if err != nil {
			return fmt.Errorf("hide idea: %w", err)
		}
		if !hidden {
			return nil
		}
		if err := s.repo.OpenCase(ctx, idea.ID, domain.Reports, now); err != nil {
			return fmt.Errorf("open case: %w", err)
		}
		s.log.WarnContext(ctx, "idea hidden by reports", "event", "moderation.auto_hidden", "request_id", httpx.RequestIDFrom(ctx), "idea_id", idea.ID, "reports", open)
		return s.notify.Publish(ctx, notify.Notification{UserID: idea.AuthorID, Type: notify.Hidden, Payload: map[string]any{
			"ideaSlug": idea.Slug, "ideaTitle": idea.Title, "decision": "HIDDEN", "automatic": true,
		}})
	})
}

type QueuePage struct {
	Items      []domain.QueueItem
	NextCursor string
}

// Queue lists open cases, oldest first, in one of the two review states.
func (s *Service) Queue(ctx context.Context, v viewer.Viewer, state domain.State, rawCursor string, limit int) (QueuePage, error) {
	if err := requireStaff(v); err != nil {
		return QueuePage{}, err
	}
	if !state.Valid() {
		return QueuePage{}, apperr.Validation(map[string]string{"state": "must be PENDING or HIDDEN"})
	}
	scope := "queue/" + string(state)
	after, err := s.cursor.Decode(rawCursor, scope)
	if err != nil {
		return QueuePage{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
	}
	limit = min(max(limit, 1), domain.MaxQueueLimit)
	items, err := s.repo.Queue(ctx, state, after, limit+1)
	if err != nil {
		return QueuePage{}, fmt.Errorf("list queue: %w", err)
	}
	page := QueuePage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		page.NextCursor = s.cursor.Encode(scope, cursor.Position{Key: cursor.FormatTime(last.OpenedAt), ID: last.CaseID})
	}
	return page, nil
}

// Decide closes the open case of an idea. Moderators cannot decide on their own ideas.
func (s *Service) Decide(ctx context.Context, v viewer.Viewer, ideaID string, decision domain.Decision, note string) error {
	if err := requireStaff(v); err != nil {
		return err
	}
	if !httpx.IsUUID(ideaID) {
		return ideaNotFound()
	}
	fields := map[string]string{}
	if !decision.Valid() {
		fields["decision"] = "must be APPROVED, HIDDEN or REJECTED"
	}
	note, ok := domain.CleanText(note, 0, domain.MaxNoteRunes)
	if !ok {
		fields["note"] = fmt.Sprintf("must be at most %d characters of plain text", domain.MaxNoteRunes)
	} else if note == "" && decision != domain.Approved && decision.Valid() {
		fields["note"] = "a note is required when an idea is not approved"
	}
	if len(fields) > 0 {
		return apperr.Validation(fields)
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		idea, err := s.repo.LockIdea(ctx, ideaID)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return ideaNotFound()
		}
		if err != nil {
			return fmt.Errorf("find idea: %w", err)
		}
		if idea.AuthorID == v.ID() {
			return apperr.Forbidden("you cannot moderate your own idea")
		}
		caseID, found, err := s.repo.OpenCaseOf(ctx, idea.ID)
		if err != nil {
			return fmt.Errorf("find case: %w", err)
		}
		if !found {
			return apperr.Conflict("this idea has no open moderation case")
		}
		now := s.now().UTC()
		if err := s.repo.SetModeration(ctx, idea.ID, decision, now); err != nil {
			return fmt.Errorf("set moderation: %w", err)
		}
		if err := s.repo.CloseCase(ctx, caseID, decision, v.ID(), note, now); err != nil {
			return fmt.Errorf("close case: %w", err)
		}
		// Reports against this idea were answered by the decision; a restored idea starts clean.
		if err := s.repo.ResolveReports(ctx, idea.ID, now); err != nil {
			return fmt.Errorf("resolve reports: %w", err)
		}
		if decision == domain.Approved {
			if err := s.repo.RefreshHot(ctx, idea.ID, now); err != nil {
				return fmt.Errorf("refresh ranking: %w", err)
			}
			if domain.CountsAsApproval(domain.State(idea.State), decision) {
				if err := s.repo.IncrementApproved(ctx, idea.AuthorID); err != nil {
					return fmt.Errorf("count approval: %w", err)
				}
			}
		}
		s.log.WarnContext(ctx, "moderation decision", "event", "moderation.decision", "request_id", httpx.RequestIDFrom(ctx), "decision", decisionLabel(decision), "from", stateLabel(domain.State(idea.State)))
		n := notify.Notification{UserID: idea.AuthorID, Type: notify.Approved, Payload: map[string]any{"ideaSlug": idea.Slug, "ideaTitle": idea.Title}}
		if decision != domain.Approved {
			n.Type, n.Payload["decision"] = notify.Hidden, string(decision)
		}
		return s.notify.Publish(ctx, n)
	})
}

func decisionLabel(decision domain.Decision) string {
	switch decision {
	case domain.Approved:
		return "approved"
	case domain.Hidden:
		return "hidden"
	case domain.Rejected:
		return "rejected"
	default:
		return "unknown"
	}
}

func stateLabel(state domain.State) string {
	switch state {
	case domain.Pending:
		return "pending"
	case domain.HiddenState:
		return "hidden"
	default:
		return "unknown"
	}
}

// Reports lists what people said about one idea, newest first.
func (s *Service) Reports(ctx context.Context, v viewer.Viewer, ideaID string) ([]domain.Report, error) {
	if err := requireStaff(v); err != nil {
		return nil, err
	}
	if !httpx.IsUUID(ideaID) {
		return nil, apperr.Validation(map[string]string{"ideaId": "must be an id"})
	}
	return s.repo.Reports(ctx, ideaID, domain.MaxReports)
}
