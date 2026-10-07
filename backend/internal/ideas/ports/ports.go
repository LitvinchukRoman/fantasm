// Package ports declares what the ideas service needs from the outside world.
package ports

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

// Access is the viewer reduced to what a query can use. It carries no more
// than the visibility rules need.
type Access struct {
	Authenticated bool
	UserID        string
	Staff         bool
	// Orgs lists organizations whose internal ideas the viewer may read.
	Orgs []string
}

// AccessOf reduces a viewer to the facts the visibility rules need.
func AccessOf(v viewer.Viewer) Access {
	return Access{Authenticated: v.Authenticated, UserID: v.ID(), Staff: v.IsStaff(), Orgs: v.ReadableOrganizations()}
}

// Cursor is the decoded position after the last item of a page.
type Cursor struct {
	Key string
	ID  string
}

type NewIdea struct {
	AuthorID            string
	SlugBase            string
	Content             domain.Content
	Rendered            domain.Rendered
	Status              domain.Status
	Visibility          domain.Visibility
	OrganizationID      string
	BadgeOrganizationID string
	Moderation          domain.Moderation
	RankingMultiplier   float64
	KarmaMultiplier     float64
	Now                 time.Time
}

type SitemapEntry struct {
	Slug      string
	UpdatedAt time.Time
}

type Repository interface {
	// LockAuthor takes a row lock on the user and returns their approved-idea count,
	// serializing concurrent creations by one person.
	LockAuthor(ctx context.Context, userID string) (approvedIdeas int, err error)
	CountCreatedSince(ctx context.Context, userID string, since time.Time) (int, error)
	// Insert stores an idea under a free slug derived from SlugBase and returns it.
	Insert(ctx context.Context, n NewIdea) (id, slug string, err error)
	OpenModerationCase(ctx context.Context, ideaID string) error

	// BySlug returns the idea if the viewer may read it; lock takes a row lock for update.
	BySlug(ctx context.Context, ac Access, slug string, lock bool) (domain.Idea, error)
	UpdateContent(ctx context.Context, ideaID string, c domain.Content, r domain.Rendered, now time.Time) error
	SetStatus(ctx context.Context, ideaID string, status domain.Status, moderation domain.Moderation, now time.Time) error
	SoftDelete(ctx context.Context, ideaID string, now time.Time) error

	List(ctx context.Context, ac Access, f domain.Filter, after *Cursor, limit int) ([]domain.Idea, error)
	Next(ctx context.Context, ac Access, slug string) (domain.Ref, error)
	Events(ctx context.Context, ac Access, from, to time.Time, limit int) ([]domain.Idea, error)
	Sitemap(ctx context.Context, limit int) ([]SitemapEntry, error)
	// RecomputeHot refreshes hot_score of ideas published within window and zeroes the older ones.
	RecomputeHot(ctx context.Context, now time.Time, window time.Duration) (int64, error)
	CountVisibleByAuthor(ctx context.Context, ac Access, authorID string) (int, error)
	ViewerState(ctx context.Context, ideaID, userID string) (domain.ViewerState, error)
}

type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
