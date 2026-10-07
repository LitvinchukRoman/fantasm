package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/jackc/pgx/v5"
)

type Repository struct {
	db *postgres.DB
}

func NewRepository(db *postgres.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) CreateLogin(ctx context.Context, attempt domain.LoginAttempt) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO login_attempts (state_hash, browser_hash, provider, nonce, verifier, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6)`, attempt.StateHash, attempt.BrowserHash, attempt.Provider, attempt.Nonce, attempt.Verifier, attempt.ExpiresAt)
	return err
}

func (r *Repository) ConsumeLogin(ctx context.Context, stateHash, browserHash string, provider domain.Provider, now time.Time) (domain.LoginAttempt, error) {
	var attempt domain.LoginAttempt
	err := r.db.Querier(ctx).QueryRow(ctx, `
		DELETE FROM login_attempts
		WHERE state_hash = $1 AND browser_hash = $2 AND provider = $3 AND expires_at > $4
		RETURNING state_hash, browser_hash, provider, nonce, verifier, expires_at`, stateHash, browserHash, provider, now).
		Scan(&attempt.StateHash, &attempt.BrowserHash, &attempt.Provider, &attempt.Nonce, &attempt.Verifier, &attempt.ExpiresAt)
	return attempt, notFound(err)
}

func (r *Repository) UpsertUser(ctx context.Context, external domain.Identity, candidate domain.User) (domain.User, error) {
	var user domain.User
	err := r.db.WithinTx(ctx, func(ctx context.Context) error {
		q := r.db.Querier(ctx)
		if _, err := q.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, external.Issuer+"\x1f"+external.Subject); err != nil {
			return fmt.Errorf("lock external identity: %w", err)
		}
		var userID string
		err := q.QueryRow(ctx, `SELECT user_id FROM external_identities WHERE issuer = $1 AND subject = $2`, external.Issuer, external.Subject).Scan(&userID)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			userID = candidate.ID
			_, err = q.Exec(ctx, `
				INSERT INTO users (id, handle, name, email, avatar_url, role, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, candidate.ID, candidate.Handle, candidate.Name, candidate.Email, candidate.AvatarURL, candidate.Role, candidate.CreatedAt, candidate.UpdatedAt)
			if err != nil {
				return err
			}
			_, err = q.Exec(ctx, `
				INSERT INTO external_identities (provider, issuer, subject, user_id, tenant_id, email_verified, email)
				VALUES ($1, $2, $3, $4, $5, $6, $7)`, external.Provider, external.Issuer, external.Subject, userID, external.TenantID, external.EmailVerified, external.Email)
			if err != nil {
				return err
			}
		case err != nil:
			return err
		default:
			_, err = q.Exec(ctx, `UPDATE users SET email = $2, updated_at = $3 WHERE id = $1`, userID, candidate.Email, candidate.UpdatedAt)
			if err != nil {
				return err
			}
			_, err = q.Exec(ctx, `UPDATE external_identities SET tenant_id = $3, email_verified = $4, email = $5 WHERE issuer = $1 AND subject = $2`, external.Issuer, external.Subject, external.TenantID, external.EmailVerified, external.Email)
			if err != nil {
				return err
			}
		}
		user, err = scanUser(q.QueryRow(ctx, `SELECT `+userColumns+` FROM users u WHERE u.id = $1`, userID))
		return err
	})
	return user, err
}

func (r *Repository) CreateSession(ctx context.Context, session domain.Session) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip_hash)
		VALUES ($1, $2, $3, left($4, 200), $5)`, session.TokenHash, session.UserID, session.ExpiresAt, session.UserAgent, session.IPHash)
	return err
}

func (r *Repository) UserBySession(ctx context.Context, tokenHash string, now, idleCutoff time.Time) (domain.User, error) {
	return scanUser(r.db.Querier(ctx).QueryRow(ctx, `SELECT `+userColumns+`
		FROM users u JOIN sessions s ON s.user_id = u.id
		WHERE s.token_hash = $1 AND s.expires_at > $2 AND s.last_seen_at > $3`, tokenHash, now, idleCutoff))
}

func (r *Repository) TouchSession(ctx context.Context, tokenHash string, now, staleBefore time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE sessions SET last_seen_at = $2 WHERE token_hash = $1 AND last_seen_at < $3`, tokenHash, now, staleBefore)
	return err
}

func (r *Repository) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, tokenHash)
	return err
}

const userColumns = `u.id, u.handle, u.name, u.email, u.avatar_url, u.bio, u.faculty, u.role, u.karma, u.approved_ideas, u.created_at, u.updated_at`

func scanUser(row pgx.Row) (domain.User, error) {
	var user domain.User
	err := row.Scan(&user.ID, &user.Handle, &user.Name, &user.Email, &user.AvatarURL, &user.Bio, &user.Faculty, &user.Role, &user.Karma, &user.ApprovedIdeas, &user.CreatedAt, &user.UpdatedAt)
	return user, notFound(err)
}

func notFound(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	return err
}

func (r *Repository) IdentitiesByUser(ctx context.Context, userID string) ([]domain.Identity, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT provider, issuer, subject, tenant_id, email, email_verified FROM external_identities WHERE user_id = $1 ORDER BY issuer, subject`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	identities := []domain.Identity{}
	for rows.Next() {
		var identity domain.Identity
		if err := rows.Scan(&identity.Provider, &identity.Issuer, &identity.Subject, &identity.TenantID, &identity.Email, &identity.EmailVerified); err != nil {
			return nil, err
		}
		identities = append(identities, identity)
	}
	return identities, rows.Err()
}
