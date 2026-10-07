// Package ports defines what moderation needs from storage.
package ports

import (
	"context"
	"time"

	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
)

// IdeaRef is an idea row, locked FOR UPDATE when fetched inside a transaction.
type IdeaRef struct {
	ID, Slug, Title, AuthorID string
	State                     string // moderation_state
}

type Repository interface {
	// LockPublicIdea finds a listed idea the viewer can see and locks it.
	LockPublicIdea(ctx context.Context, ac ideaports.Access, slug string) (IdeaRef, error)
	// LockIdea finds any non-deleted idea by id and locks it, for moderators.
	LockIdea(ctx context.Context, ideaID string) (IdeaRef, error)

	InsertReport(ctx context.Context, ideaID, userID, reason string, now time.Time) (inserted bool, err error)
	OpenReports(ctx context.Context, ideaID string) (int, error)
	ResolveReports(ctx context.Context, ideaID string, now time.Time) error
	Reports(ctx context.Context, ideaID string, limit int) ([]domain.Report, error)

	// Hide takes an approved idea off the site and reports whether it changed.
	Hide(ctx context.Context, ideaID string, now time.Time) (bool, error)
	SetModeration(ctx context.Context, ideaID string, state domain.Decision, now time.Time) error
	RefreshHot(ctx context.Context, ideaID string, now time.Time) error

	OpenCase(ctx context.Context, ideaID string, source domain.Source, now time.Time) error
	// OpenCaseOf returns the open case of an idea, if any.
	OpenCaseOf(ctx context.Context, ideaID string) (caseID string, found bool, err error)
	CloseCase(ctx context.Context, caseID string, decision domain.Decision, by, note string, now time.Time) error
	IncrementApproved(ctx context.Context, userID string) error

	Queue(ctx context.Context, state domain.State, after *cursor.Position, limit int) ([]domain.QueueItem, error)
}

type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
