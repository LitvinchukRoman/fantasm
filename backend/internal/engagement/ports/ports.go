// Package ports describes what the engagement service needs from storage.
package ports

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
)

// IdeaRef is an idea reduced to what engagement needs.
type IdeaRef struct {
	ID              string
	Slug            string
	Title           string
	AuthorID        string
	AuthorHandle    string
	Capacity        *int
	KarmaMultiplier float64
}

type Counters struct {
	Votes int
	Joins int
}

type Participant struct {
	UserID    string
	Handle    string
	Name      string
	State     domain.State
	Role      string
	UpdatedAt time.Time
}

type Repository interface {
	// FindIdea returns the idea if the viewer may see it (readable: also their own unfinished
	// ideas and, for staff, everything), optionally locking its row against concurrent seat changes.
	FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable, lock bool) (IdeaRef, error)

	AddVote(ctx context.Context, ideaID, userID string, weight int) (inserted bool, err error)
	RemoveVote(ctx context.Context, ideaID, userID string) (weight int, removed bool, err error)
	VoteWeight(ctx context.Context, ideaID, userID string) (int, error)
	// AdjustVotes changes votes_weighted atomically and recomputes hot_score.
	AdjustVotes(ctx context.Context, ideaID string, delta int, now time.Time) (Counters, error)
	Counters(ctx context.Context, ideaID string) (Counters, error)
	AdjustKarma(ctx context.Context, userID string, delta int) error

	Participation(ctx context.Context, ideaID, userID string) (*domain.Participation, error)
	SaveParticipation(ctx context.Context, ideaID, userID string, p domain.Participation, now time.Time) error
	DeleteParticipation(ctx context.Context, ideaID, userID string) error
	Seats(ctx context.Context, ideaID string) (int, error)
	// RecountJoins recomputes joins_count from the rows and refreshes hot_score.
	RecountJoins(ctx context.Context, ideaID string, now time.Time) (Counters, error)
	Participants(ctx context.Context, ideaID string, activeOnly bool, limit int) ([]Participant, error)
	UserIDByHandle(ctx context.Context, handle string) (string, error)
}

type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
