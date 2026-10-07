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
			bio = COALESCE($4, u.bio), faculty = COALESCE($5, u.faculty), updated_at = $6
		WHERE u.id = $1
		RETURNING `+userColumns, userID, u.Handle, u.Name, u.Bio, u.Faculty, now))
	if postgres.IsUniqueViolation(err, "users_handle_key") {
		return domain.User{}, domain.ErrHandleTaken
	}
	return user, err
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
