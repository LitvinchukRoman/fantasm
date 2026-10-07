// Package postgres stores notifications.
package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

// Publish implements ports.Publisher on the transaction carried by ctx.
func (r *Repository) Publish(ctx context.Context, n domain.Notification) error {
	payload, err := json.Marshal(n.Payload)
	if err != nil {
		return fmt.Errorf("marshal notification payload: %w", err)
	}
	if n.DedupeKey == nil {
		_, err = r.db.Querier(ctx).Exec(ctx, `INSERT INTO notifications (id, user_id, type, payload) VALUES (gen_random_uuid(), $1, $2, $3)`, n.UserID, n.Type, payload)
		return err
	}
	key, err := json.Marshal(n.DedupeKey)
	if err != nil {
		return fmt.Errorf("marshal dedupe key: %w", err)
	}
	_, err = r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO notifications (id, user_id, type, payload)
		SELECT gen_random_uuid(), $1, $2, $3
		WHERE NOT EXISTS (
			SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND read_at IS NULL AND payload @> $4::jsonb
		)`, n.UserID, n.Type, payload, key)
	return err
}

func (r *Repository) List(ctx context.Context, userID string, unreadOnly bool, beforeTime *time.Time, beforeID string, limit int) ([]domain.Item, error) {
	args := []any{userID, limit}
	where := "user_id = $1"
	if unreadOnly {
		where += " AND read_at IS NULL"
	}
	if beforeTime != nil {
		args = append(args, *beforeTime, beforeID)
		where += " AND (created_at, id) < ($3, $4::uuid)"
	}
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT id, type, payload, read_at, created_at FROM notifications WHERE `+where+` ORDER BY created_at DESC, id DESC LIMIT $2`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.Item{}
	for rows.Next() {
		var it domain.Item
		if err := rows.Scan(&it.ID, &it.Type, &it.Payload, &it.ReadAt, &it.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *Repository) UnreadCount(ctx context.Context, userID string) (int, error) {
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`, userID).Scan(&n)
	return n, err
}

// MarkRead marks the given notifications of the user as read (ids == nil means all) and returns how many changed.
func (r *Repository) MarkRead(ctx context.Context, userID string, ids []string, now time.Time) (int64, error) {
	var tag interface{ RowsAffected() int64 }
	var err error
	if ids == nil {
		tag, err = r.db.Querier(ctx).Exec(ctx, `UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL`, userID, now)
	} else {
		tag, err = r.db.Querier(ctx).Exec(ctx, `UPDATE notifications SET read_at = $3 WHERE user_id = $1 AND id = ANY($2::uuid[]) AND read_at IS NULL`, userID, ids, now)
	}
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) PurgeRead(ctx context.Context, readBefore, createdBefore time.Time) (int64, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM notifications WHERE read_at < $1 OR created_at < $2`, readBefore, createdBefore)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
