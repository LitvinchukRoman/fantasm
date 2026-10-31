// Package ports describes what the billing service needs from storage.
package ports

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
)

// IdeaRef is an idea reduced to what sponsorship needs.
type IdeaRef struct {
	ID         string
	Slug       string
	Title      string
	AuthorID   string
	Status     ideadomain.Status
	Moderation ideadomain.Moderation
}

// Sponsor is one supporter of an idea as its author sees them.
type Sponsor struct {
	Handle string
	Name   string
	Tier   domain.Tier
	Since  time.Time
}

// UserCard is who the support bot is talking to.
type UserCard struct {
	ID     string
	Handle string
	Name   string
}

// SupportRecord is a stored support action, keyed by the bot's action id.
type SupportRecord struct {
	ID      string
	UserID  string
	Action  domain.SupportAction
	Subject string
	Params  map[string]any
}

// Renewal is one period that was charged by the renewal job.
type Renewal struct {
	UserID        string
	SponsorshipID string
	Plan          domain.Plan
	Tier          domain.Tier
	IdeaTitle     string
	PeriodEnd     time.Time
}

type Repository interface {
	// LockUser takes a row lock on the user so that one person's billing changes run one at a time.
	LockUser(ctx context.Context, userID string) error
	User(ctx context.Context, userID string) (UserCard, error)

	Subscription(ctx context.Context, userID string) (*domain.Subscription, error)
	SaveSubscription(ctx context.Context, userID string, s domain.Subscription, now time.Time) error
	CountActiveIdeas(ctx context.Context, userID string) (int, error)

	// FindIdea returns the idea if the viewer may see it (readable: also their own unfinished ideas and, for staff, everything).
	FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable bool) (IdeaRef, error)
	Sponsorship(ctx context.Context, ideaID, sponsorID string) (*domain.Sponsorship, error)
	// SponsorshipByID returns one of the sponsor's own sponsorships, locked for update.
	SponsorshipByID(ctx context.Context, id, sponsorID string) (*domain.Sponsorship, error)
	// SaveSponsorship inserts or updates the (idea, sponsor) row and returns its id.
	SaveSponsorship(ctx context.Context, s domain.Sponsorship, now time.Time) (string, error)
	// Sponsors lists the people whose sponsorship of the idea is in effect at now.
	Sponsors(ctx context.Context, ideaID string, now time.Time, limit int) ([]Sponsor, error)
	CountSponsors(ctx context.Context, ideaID string, now time.Time) (int, error)
	SponsorshipsOf(ctx context.Context, sponsorID string, limit int) ([]domain.Sponsorship, error)

	InsertPayment(ctx context.Context, p domain.Payment) (string, error)
	Payments(ctx context.Context, userID string, limit int) ([]domain.Payment, error)
	// Payment returns one of the user's payments, locked for update.
	Payment(ctx context.Context, id, userID string) (*domain.Payment, error)
	MarkRefunded(ctx context.Context, id string, now time.Time) error

	// RenewPlans moves due active plans one period forward, charges them and returns what it charged.
	RenewPlans(ctx context.Context, now time.Time, limit int) ([]Renewal, error)
	// RenewSponsorships does the same for sponsorships; one whose idea is no longer listed stops instead.
	RenewSponsorships(ctx context.Context, now time.Time, limit int) ([]Renewal, error)

	SupportRecord(ctx context.Context, id string) (*SupportRecord, error)
	InsertSupportRecord(ctx context.Context, r SupportRecord) error
}

type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
