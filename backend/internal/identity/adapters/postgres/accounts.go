package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

func (r *Repository) UpdateProfile(ctx context.Context, userID string, u domain.ProfileUpdate, now time.Time) (domain.User, error) {
	user, err := scanUser(r.db.Querier(ctx).QueryRow(ctx, `
		UPDATE users u SET
			handle = COALESCE($2, u.handle), name = COALESCE($3, u.name),
			bio = COALESCE($4, u.bio), faculty = COALESCE($5, u.faculty), updated_at = $6,
			onboarded_at = COALESCE(u.onboarded_at, $6)
		WHERE u.id = $1
		RETURNING `+userColumns, userID, u.Handle, u.Name, u.Bio, u.Faculty, now))
	if postgres.IsUniqueViolation(err, "users_handle_key") {
		return domain.User{}, domain.ErrHandleTaken
	}
	return user, err
}

// SetAvatar replaces the user's photo. The user is read back in a second
// statement: a subquery in the same statement would still see the old row.
func (r *Repository) SetAvatar(ctx context.Context, userID string, avatar domain.Avatar, now time.Time) (domain.User, error) {
	q := r.db.Querier(ctx)
	if _, err := q.Exec(ctx, `
		INSERT INTO user_avatars (user_id, content_type, data, updated_at)
		SELECT u.id, $2, $3, $4 FROM users u WHERE u.id = $1
		ON CONFLICT (user_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
		userID, avatar.ContentType, avatar.Data, now); err != nil {
		return domain.User{}, err
	}
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM users u WHERE u.id = $1`, userID))
}

func (r *Repository) DeleteAvatar(ctx context.Context, userID string) (domain.User, error) {
	q := r.db.Querier(ctx)
	if _, err := q.Exec(ctx, `DELETE FROM user_avatars WHERE user_id = $1`, userID); err != nil {
		return domain.User{}, err
	}
	return scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM users u WHERE u.id = $1`, userID))
}

func (r *Repository) AvatarByHandle(ctx context.Context, handle string) (domain.Avatar, error) {
	var a domain.Avatar
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT av.content_type, av.data, av.updated_at FROM user_avatars av JOIN users u ON u.id = av.user_id
		WHERE u.handle = $1`, handle).Scan(&a.ContentType, &a.Data, &a.UpdatedAt)
	if postgres.IsNoRows(err) {
		return domain.Avatar{}, domain.ErrNoAvatar
	}
	return a, err
}

func (r *Repository) UserByHandle(ctx context.Context, handle string) (domain.User, error) {
	return scanUser(r.db.Querier(ctx).QueryRow(ctx, `SELECT `+userColumns+` FROM users u WHERE u.handle = $1`, handle))
}

func (r *Repository) SetRole(ctx context.Context, userID string, role domain.Role, now time.Time) (domain.User, error) {
	return scanUser(r.db.Querier(ctx).QueryRow(ctx, `
		UPDATE users u SET role = $2, updated_at = $3 WHERE u.id = $1 RETURNING `+userColumns, userID, role, now))
}

func (r *Repository) ListSessions(ctx context.Context, userID string, now, idleCutoff time.Time) ([]domain.SessionInfo, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT id, created_at, last_seen_at, expires_at, user_agent, token_hash
		FROM sessions WHERE user_id = $1 AND expires_at > $2 AND last_seen_at > $3
		ORDER BY last_seen_at DESC, id`, userID, now, idleCutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []domain.SessionInfo{}
	for rows.Next() {
		var s domain.SessionInfo
		if err := rows.Scan(&s.ID, &s.CreatedAt, &s.LastSeenAt, &s.ExpiresAt, &s.UserAgent, &s.TokenHash); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

func (r *Repository) DeleteSessionByID(ctx context.Context, userID, sessionID string) (bool, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM sessions WHERE id = $2 AND user_id = $1`, userID, sessionID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *Repository) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (r *Repository) IdentitiesByUsers(ctx context.Context, userIDs []string) (map[string][]domain.Identity, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT user_id, provider, issuer, subject, tenant_id, email, email_verified
		FROM external_identities WHERE user_id = ANY($1::uuid[]) ORDER BY user_id, issuer, subject`, userIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string][]domain.Identity{}
	for rows.Next() {
		var (
			userID string
			id     domain.Identity
		)
		if err := rows.Scan(&userID, &id.Provider, &id.Issuer, &id.Subject, &id.TenantID, &id.Email, &id.EmailVerified); err != nil {
			return nil, err
		}
		out[userID] = append(out[userID], id)
	}
	return out, rows.Err()
}

func (r *Repository) PurgeExpired(ctx context.Context, now, idleCutoff time.Time) (int64, error) {
	var total int64
	for _, stmt := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM sessions WHERE expires_at <= $1 OR last_seen_at <= $2`, []any{now, idleCutoff}},
		{`DELETE FROM login_attempts WHERE expires_at <= $1`, []any{now}},
	} {
		tag, err := r.db.Querier(ctx).Exec(ctx, stmt.sql, stmt.args...)
		if err != nil {
			return total, fmt.Errorf("purge: %w", err)
		}
		total += tag.RowsAffected()
	}
	return total, nil
}
