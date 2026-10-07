// Package ports is the narrow surface other contexts use to notify people.
package ports

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
)

// Publisher records a notification. It runs inside the caller's transaction (the
// transaction is carried by ctx), so a notification exists if and only if the
// action it describes was committed. There is no outbox and no e-mail here.
type Publisher interface {
	Publish(ctx context.Context, n domain.Notification) error
}

// Discard is a Publisher that drops everything, for tests of other contexts.
type Discard struct{}

func (Discard) Publish(context.Context, domain.Notification) error { return nil }

// Inbox is what the owner of notifications can do with them.
type Inbox interface {
	List(ctx context.Context, userID string, unreadOnly bool, beforeTime *time.Time, beforeID string, limit int) ([]domain.Item, error)
	UnreadCount(ctx context.Context, userID string) (int, error)
	// MarkRead marks the user's own notifications as read; nil ids means all of them.
	MarkRead(ctx context.Context, userID string, ids []string, now time.Time) (int64, error)
	// PurgeRead deletes notifications that were read before the cutoff, and any created before the cutoff and never read.
	PurgeRead(ctx context.Context, readBefore, createdBefore time.Time) (int64, error)
}
