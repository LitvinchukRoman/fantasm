// Package notifications is each user's inbox. Other contexts write to it through ports.Publisher.
package notifications

import (
	"context"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

const (
	DefaultLimit = 20
	MaxLimit     = 50
	MaxMarkIDs   = 100
)

type Service struct {
	inbox  ports.Inbox
	cursor cursor.Codec
	now    func() time.Time
}

func NewService(inbox ports.Inbox, secret []byte) *Service {
	return &Service{inbox: inbox, cursor: cursor.New(secret), now: time.Now}
}

func requireAuth(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	return nil
}

type Page struct {
	Items      []domain.Item
	NextCursor string
	Unread     int
}

// List returns the viewer's notifications, newest first. The cursor is bound to
// the user and the filter, so it cannot be replayed for someone else's inbox.
func (s *Service) List(ctx context.Context, v viewer.Viewer, unreadOnly bool, rawCursor string, limit int) (Page, error) {
	if err := requireAuth(v); err != nil {
		return Page{}, err
	}
	scope := fmt.Sprintf("notifications/%s/%t", v.ID(), unreadOnly)
	after, err := s.cursor.Decode(rawCursor, scope)
	if err != nil {
		return Page{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
	}
	limit = min(max(limit, 1), MaxLimit)
	var before *time.Time
	var beforeID string
	if after != nil {
		at, err := cursor.Time(after.Key)
		if err != nil {
			return Page{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
		}
		before, beforeID = &at, after.ID
	}
	items, err := s.inbox.List(ctx, v.ID(), unreadOnly, before, beforeID, limit+1)
	if err != nil {
		return Page{}, fmt.Errorf("list notifications: %w", err)
	}
	page := Page{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		page.NextCursor = s.cursor.Encode(scope, cursor.Position{Key: cursor.FormatTime(last.CreatedAt), ID: last.ID})
	}
	if page.Unread, err = s.inbox.UnreadCount(ctx, v.ID()); err != nil {
		return Page{}, fmt.Errorf("count unread: %w", err)
	}
	return page, nil
}

func (s *Service) UnreadCount(ctx context.Context, v viewer.Viewer) (int, error) {
	if err := requireAuth(v); err != nil {
		return 0, err
	}
	n, err := s.inbox.UnreadCount(ctx, v.ID())
	if err != nil {
		return 0, fmt.Errorf("count unread: %w", err)
	}
	return n, nil
}

// MarkRead marks the listed notifications, or all of them, as read and returns how many changed.
// Ids that belong to somebody else simply match nothing.
func (s *Service) MarkRead(ctx context.Context, v viewer.Viewer, ids []string, all bool) (updated int64, unread int, err error) {
	if err := requireAuth(v); err != nil {
		return 0, 0, err
	}
	switch {
	case all && len(ids) > 0, !all && len(ids) == 0:
		return 0, 0, apperr.Validation(map[string]string{"ids": "send either ids or all: true"})
	case len(ids) > MaxMarkIDs:
		return 0, 0, apperr.Validation(map[string]string{"ids": fmt.Sprintf("at most %d ids", MaxMarkIDs)})
	}
	for _, id := range ids {
		if !httpx.IsUUID(id) {
			return 0, 0, apperr.Validation(map[string]string{"ids": "every id must be a valid id"})
		}
	}
	if all {
		ids = nil
	}
	if updated, err = s.inbox.MarkRead(ctx, v.ID(), ids, s.now().UTC()); err != nil {
		return 0, 0, fmt.Errorf("mark read: %w", err)
	}
	if unread, err = s.inbox.UnreadCount(ctx, v.ID()); err != nil {
		return 0, 0, fmt.Errorf("count unread: %w", err)
	}
	return updated, unread, nil
}

const (
	// ReadRetention is how long a read notification is kept.
	ReadRetention = 30 * 24 * time.Hour
	// MaxRetention is how long even an unread one is kept.
	MaxRetention = 180 * 24 * time.Hour
)

// PurgeOld deletes notifications nobody needs any more and returns how many went.
func (s *Service) PurgeOld(ctx context.Context) (int64, error) {
	now := s.now()
	n, err := s.inbox.PurgeRead(ctx, now.Add(-ReadRetention), now.Add(-MaxRetention))
	if err != nil {
		return 0, fmt.Errorf("purge notifications: %w", err)
	}
	return n, nil
}
