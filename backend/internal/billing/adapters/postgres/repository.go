// Package postgres stores plans, sponsorships, mock payments and support actions.
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/ports"
	ideaspg "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

func (r *Repository) LockUser(ctx context.Context, userID string) error {
	var one int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&one)
	if postgres.IsNoRows(err) {
		return domain.ErrNotFound
	}
	return err
}

func (r *Repository) User(ctx context.Context, userID string) (ports.UserCard, error) {
	c := ports.UserCard{ID: userID}
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT handle, name FROM users WHERE id = $1`, userID).Scan(&c.Handle, &c.Name)
	if postgres.IsNoRows(err) {
		return ports.UserCard{}, domain.ErrNotFound
	}
	return c, err
}

func (r *Repository) Subscription(ctx context.Context, userID string) (*domain.Subscription, error) {
	var s domain.Subscription
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT plan, status, current_period_start, current_period_end, canceled_at
		FROM plan_subscriptions WHERE user_id = $1`, userID).Scan(&s.Plan, &s.Status, &s.Start, &s.End, &s.CanceledAt)
	if postgres.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) SaveSubscription(ctx context.Context, userID string, s domain.Subscription, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO plan_subscriptions (user_id, plan, status, current_period_start, current_period_end, canceled_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		ON CONFLICT (user_id) DO UPDATE SET plan = EXCLUDED.plan, status = EXCLUDED.status,
			current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
			canceled_at = EXCLUDED.canceled_at, updated_at = EXCLUDED.updated_at`,
		userID, s.Plan, s.Status, s.Start, s.End, s.CanceledAt, now)
	return err
}

func (r *Repository) CountActiveIdeas(ctx context.Context, userID string) (int, error) {
	var n int
	// The same rule as ideas.Repository.CountActive, which enforces the cap.
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT count(*) FROM ideas
		WHERE author_id = $1 AND deleted_at IS NULL
		  AND status IN ('OPEN', 'TEAM_FORMING', 'IN_PROGRESS') AND moderation_state IN ('PENDING', 'APPROVED')`, userID).Scan(&n)
	return n, err
}

func (r *Repository) FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable bool) (ports.IdeaRef, error) {
	a := &ideaspg.Args{}
	slugArg := a.Add(slug)
	// Exactly one predicate: an unused bind parameter makes Postgres fail to type it.
	var visible string
	if readable {
		visible = ideaspg.Readable("i", a, ac)
	} else {
		visible = ideaspg.PublicVisible("i", a, ac)
	}
	var ref ports.IdeaRef
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT i.id, i.slug, i.title, i.author_id, i.status, i.moderation_state
		FROM ideas i WHERE i.slug = `+slugArg+` AND `+visible, a.Values...).
		Scan(&ref.ID, &ref.Slug, &ref.Title, &ref.AuthorID, &ref.Status, &ref.Moderation)
	if postgres.IsNoRows(err) {
		return ports.IdeaRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

const sponsorshipColumns = `s.id, s.idea_id, i.slug, i.title, s.sponsor_id, s.tier, s.status,
	s.current_period_start, s.current_period_end, s.canceled_at, s.created_at`

func scanSponsorship(row pgx.Row) (*domain.Sponsorship, error) {
	var s domain.Sponsorship
	err := row.Scan(&s.ID, &s.IdeaID, &s.IdeaSlug, &s.IdeaTitle, &s.SponsorID, &s.Tier, &s.Status, &s.Start, &s.End, &s.CanceledAt, &s.CreatedAt)
	if postgres.IsNoRows(err) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *Repository) Sponsorship(ctx context.Context, ideaID, sponsorID string) (*domain.Sponsorship, error) {
	s, err := scanSponsorship(r.db.Querier(ctx).QueryRow(ctx, `
		SELECT `+sponsorshipColumns+` FROM idea_sponsorships s JOIN ideas i ON i.id = s.idea_id
		WHERE s.idea_id = $1 AND s.sponsor_id = $2`, ideaID, sponsorID))
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	return s, err
}

func (r *Repository) SponsorshipByID(ctx context.Context, id, sponsorID string) (*domain.Sponsorship, error) {
	return scanSponsorship(r.db.Querier(ctx).QueryRow(ctx, `
		SELECT `+sponsorshipColumns+` FROM idea_sponsorships s JOIN ideas i ON i.id = s.idea_id
		WHERE s.id = $1 AND s.sponsor_id = $2 FOR UPDATE OF s`, id, sponsorID))
}

func (r *Repository) SaveSponsorship(ctx context.Context, s domain.Sponsorship, now time.Time) (string, error) {
	var id string
	err := r.db.Querier(ctx).QueryRow(ctx, `
		INSERT INTO idea_sponsorships (id, idea_id, sponsor_id, tier, status, current_period_start, current_period_end, canceled_at, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $8)
		ON CONFLICT (idea_id, sponsor_id) DO UPDATE SET tier = EXCLUDED.tier, status = EXCLUDED.status,
			current_period_start = EXCLUDED.current_period_start, current_period_end = EXCLUDED.current_period_end,
			canceled_at = EXCLUDED.canceled_at, updated_at = EXCLUDED.updated_at
		RETURNING id`,
		s.IdeaID, s.SponsorID, s.Tier, s.Status, s.Start, s.End, s.CanceledAt, now).Scan(&id)
	return id, err
}

// inEffect mirrors domain.Period.InEffect.
const inEffect = `(s.status = 'ACTIVE' OR s.current_period_end > $2)`

func (r *Repository) Sponsors(ctx context.Context, ideaID string, now time.Time, limit int) ([]ports.Sponsor, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT u.handle, u.name, s.tier, s.created_at
		FROM idea_sponsorships s JOIN users u ON u.id = s.sponsor_id
		WHERE s.idea_id = $1 AND `+inEffect+`
		ORDER BY s.created_at, s.id LIMIT $3`, ideaID, now, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ports.Sponsor, error) {
		var s ports.Sponsor
		err := row.Scan(&s.Handle, &s.Name, &s.Tier, &s.Since)
		return s, err
	})
}

func (r *Repository) CountSponsors(ctx context.Context, ideaID string, now time.Time) (int, error) {
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM idea_sponsorships s WHERE s.idea_id = $1 AND `+inEffect, ideaID, now).Scan(&n)
	return n, err
}

func (r *Repository) SponsorshipsOf(ctx context.Context, sponsorID string, limit int) ([]domain.Sponsorship, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT `+sponsorshipColumns+` FROM idea_sponsorships s JOIN ideas i ON i.id = s.idea_id
		WHERE s.sponsor_id = $1 ORDER BY s.created_at DESC, s.id LIMIT $2`, sponsorID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Sponsorship, error) {
		s, err := scanSponsorship(row)
		if err != nil {
			return domain.Sponsorship{}, err
		}
		return *s, nil
	})
}

func (r *Repository) InsertPayment(ctx context.Context, p domain.Payment) (string, error) {
	var plan, sponsorship *string
	if p.Plan != "" {
		v := string(p.Plan)
		plan = &v
	}
	if p.SponsorshipID != "" {
		sponsorship = &p.SponsorshipID
	}
	var id string
	err := r.db.Querier(ctx).QueryRow(ctx, `
		INSERT INTO billing_payments (id, user_id, kind, plan, sponsorship_id, amount_minor, description)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6) RETURNING id`,
		p.UserID, p.Kind, plan, sponsorship, p.AmountMinor, p.Description).Scan(&id)
	return id, err
}

const paymentColumns = `id, user_id, kind, COALESCE(plan, ''), COALESCE(sponsorship_id::text, ''), amount_minor, status, description, created_at, refunded_at`

func scanPayment(row pgx.Row) (domain.Payment, error) {
	var p domain.Payment
	err := row.Scan(&p.ID, &p.UserID, &p.Kind, &p.Plan, &p.SponsorshipID, &p.AmountMinor, &p.Status, &p.Description, &p.CreatedAt, &p.RefundedAt)
	return p, err
}

func (r *Repository) Payments(ctx context.Context, userID string, limit int) ([]domain.Payment, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT `+paymentColumns+` FROM billing_payments WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (domain.Payment, error) { return scanPayment(row) })
}

func (r *Repository) Payment(ctx context.Context, id, userID string) (*domain.Payment, error) {
	p, err := scanPayment(r.db.Querier(ctx).QueryRow(ctx, `SELECT `+paymentColumns+` FROM billing_payments WHERE id = $1 AND user_id = $2 FOR UPDATE`, id, userID))
	if postgres.IsNoRows(err) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) MarkRefunded(ctx context.Context, id string, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE billing_payments SET status = 'REFUNDED', refunded_at = $2 WHERE id = $1 AND status = 'SUCCEEDED'`, id, now)
	return err
}

func (r *Repository) RenewPlans(ctx context.Context, now time.Time, limit int) ([]ports.Renewal, error) {
	// SKIP LOCKED: two API instances running the job never charge the same period twice.
	rows, err := r.db.Querier(ctx).Query(ctx, `
		UPDATE plan_subscriptions p SET current_period_start = p.current_period_end,
			current_period_end = p.current_period_end + interval '1 month', updated_at = $1
		WHERE p.user_id IN (
			SELECT user_id FROM plan_subscriptions
			WHERE status = 'ACTIVE' AND current_period_end <= $1
			ORDER BY current_period_end LIMIT $2 FOR UPDATE SKIP LOCKED)
		RETURNING p.user_id, p.plan, p.current_period_end`, now, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ports.Renewal, error) {
		var r ports.Renewal
		err := row.Scan(&r.UserID, &r.Plan, &r.PeriodEnd)
		return r, err
	})
}

func (r *Repository) RenewSponsorships(ctx context.Context, now time.Time, limit int) ([]ports.Renewal, error) {
	q := r.db.Querier(ctx)
	// A sponsorship of an idea that is deleted, hidden or finished stops instead of charging again.
	if _, err := q.Exec(ctx, `
		UPDATE idea_sponsorships s SET status = 'CANCELED', canceled_at = $1, updated_at = $1
		FROM ideas i
		WHERE i.id = s.idea_id AND s.status = 'ACTIVE' AND s.current_period_end <= $1
		  AND (i.deleted_at IS NOT NULL OR i.moderation_state <> 'APPROVED' OR i.status NOT IN ('OPEN', 'TEAM_FORMING', 'IN_PROGRESS'))`, now); err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx, `
		WITH due AS (
			SELECT id FROM idea_sponsorships
			WHERE status = 'ACTIVE' AND current_period_end <= $1
			ORDER BY current_period_end LIMIT $2 FOR UPDATE SKIP LOCKED)
		UPDATE idea_sponsorships s SET current_period_start = s.current_period_end,
			current_period_end = s.current_period_end + interval '1 month', updated_at = $1
		FROM due, ideas i
		WHERE s.id = due.id AND i.id = s.idea_id
		RETURNING s.sponsor_id, s.id, s.tier, i.title, s.current_period_end`, now, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (ports.Renewal, error) {
		var r ports.Renewal
		err := row.Scan(&r.UserID, &r.SponsorshipID, &r.Tier, &r.IdeaTitle, &r.PeriodEnd)
		return r, err
	})
}

func (r *Repository) SupportRecord(ctx context.Context, id string) (*ports.SupportRecord, error) {
	var rec ports.SupportRecord
	var params []byte
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT id, user_id, action, subject, params FROM billing_support_actions WHERE id = $1`, id).
		Scan(&rec.ID, &rec.UserID, &rec.Action, &rec.Subject, &params)
	if postgres.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(params, &rec.Params); err != nil {
		return nil, err
	}
	return &rec, nil
}

func (r *Repository) InsertSupportRecord(ctx context.Context, rec ports.SupportRecord) error {
	params, err := json.Marshal(rec.Params)
	if err != nil {
		return err
	}
	_, err = r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO billing_support_actions (id, user_id, action, subject, params) VALUES ($1, $2, $3, $4, $5)`,
		rec.ID, rec.UserID, rec.Action, rec.Subject, params)
	return err
}
