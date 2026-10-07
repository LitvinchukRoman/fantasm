// Package ports describes what the discussion service needs from storage.
package ports

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
)

type IdeaRef struct {
	ID       string
	Slug     string
	Title    string
	AuthorID string
}

// PostRef is a post together with the idea it lives under.
type PostRef struct {
	domain.Post
	Idea           IdeaRef
	ParentAuthor   string
	ParentOfParent string
}

type NewPost struct {
	TopicID  string
	ParentID string
	AuthorID string
	Depth    int
	Body     string
	HTML     string
	Text     string
	Now      time.Time
}

type Repository interface {
	FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable bool) (IdeaRef, error)
	MainTopic(ctx context.Context, ideaID string) (string, error)
	Posts(ctx context.Context, topicID string, limit int) ([]domain.Post, error)
	// FindPost returns a post if the idea it belongs to is readable by the viewer.
	FindPost(ctx context.Context, ac ideaports.Access, postID string, readable bool) (PostRef, error)
	InsertPost(ctx context.Context, p NewPost) (domain.Post, error)
	UpdateBody(ctx context.Context, postID, body, html, text string, now time.Time) error
	// SoftDelete marks the post deleted and reports whether it was alive before.
	SoftDelete(ctx context.Context, postID string, now time.Time) (bool, error)
	// AdjustComments changes comments_count and refreshes hot_score.
	AdjustComments(ctx context.Context, ideaID string, delta int, now time.Time) error
}

type Transactor interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}
