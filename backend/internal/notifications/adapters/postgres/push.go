package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

const maxPushDevices = 8

// LoadKeys returns the VAPID pair from the environment, or the one stored in
// push_keys. The first process to start creates the stored pair. The private
// key never leaves this process except as a signature on a push request.
func LoadKeys(ctx context.Context, db *postgres.DB, publicKey, privateKey string) (string, string, error) {
	if publicKey != "" || privateKey != "" {
		if !domain.ValidVAPID(publicKey, privateKey) {
			return "", "", fmt.Errorf("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not a valid key pair")
		}
		return publicKey, privateKey, nil
	}
	pub, priv, err := readKeys(ctx, db)
	if err == nil {
		return pub, priv, nil
	}
	if !postgres.IsNoRows(err) {
		return "", "", fmt.Errorf("read push keys: %w", err)
	}
	priv, pub, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return "", "", fmt.Errorf("generate push keys: %w", err)
	}
	if _, err := db.Querier(ctx).Exec(ctx, `
		INSERT INTO push_keys (id, public_key, private_key) VALUES (true, $1, $2)
		ON CONFLICT (id) DO NOTHING`, pub, priv); err != nil {
		return "", "", fmt.Errorf("store push keys: %w", err)
	}
	pub, priv, err = readKeys(ctx, db)
	if err != nil {
		return "", "", fmt.Errorf("read push keys: %w", err)
	}
	return pub, priv, nil
}

func readKeys(ctx context.Context, db *postgres.DB) (string, string, error) {
	var publicKey, privateKey string
	err := db.Querier(ctx).QueryRow(ctx, `SELECT public_key, private_key FROM push_keys WHERE id`).Scan(&publicKey, &privateKey)
	return publicKey, privateKey, err
}

func (r *Repository) SaveSubscription(ctx context.Context, userID string, sub domain.Subscription) error {
	if _, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
		VALUES (gen_random_uuid(), $1, $2, $3, $4)
		ON CONFLICT (endpoint) DO UPDATE
		SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, created_at = now()`,
		userID, sub.Endpoint, sub.P256dh, sub.Auth); err != nil {
		return fmt.Errorf("save push subscription: %w", err)
	}
	_, err := r.db.Querier(ctx).Exec(ctx, `
		DELETE FROM push_subscriptions
		WHERE user_id = $1 AND id NOT IN (
			SELECT id FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
		)`, userID, maxPushDevices)
	if err != nil {
		return fmt.Errorf("trim push subscriptions: %w", err)
	}
	return nil
}

func (r *Repository) DeleteSubscription(ctx context.Context, userID, endpoint string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, userID, endpoint)
	if err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

func (r *Repository) ForgetSubscription(ctx context.Context, endpoint string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint)
	if err != nil {
		return fmt.Errorf("forget push subscription: %w", err)
	}
	return nil
}

func (r *Repository) Subscriptions(ctx context.Context, userID string) ([]domain.Subscription, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Subscription{}
	for rows.Next() {
		var sub domain.Subscription
		if err := rows.Scan(&sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// ClaimUnpushed marks a batch as sent and returns it. ReleaseUnpushed puts a
// batch back when the push service could not be reached; at must be the same
// timestamp ClaimUnpushed stored, truncated to a microsecond.
func (r *Repository) ClaimUnpushed(ctx context.Context, limit int, at, since time.Time) ([]domain.Delivery, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		WITH picked AS (
			SELECT id FROM notifications
			WHERE push_sent_at IS NULL AND created_at > $2
			ORDER BY created_at
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notifications AS n SET push_sent_at = $3
		FROM picked WHERE n.id = picked.id
		RETURNING n.id, n.user_id, n.type, n.payload`, limit, since, at)
	if err != nil {
		return nil, fmt.Errorf("claim notifications: %w", err)
	}
	defer rows.Close()
	out := []domain.Delivery{}
	for rows.Next() {
		var item domain.Delivery
		var raw []byte
		if err := rows.Scan(&item.ID, &item.UserID, &item.Type, &raw); err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &item.Payload); err != nil {
				return nil, fmt.Errorf("decode notification payload: %w", err)
			}
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (r *Repository) ReleaseUnpushed(ctx context.Context, ids []string, at time.Time) error {
	if len(ids) == 0 {
		return nil
	}
	_, err := r.db.Querier(ctx).Exec(ctx, `
		UPDATE notifications SET push_sent_at = NULL
		WHERE id = ANY($1::uuid[]) AND push_sent_at = $2`, ids, at)
	if err != nil {
		return fmt.Errorf("release notifications: %w", err)
	}
	return nil
}
