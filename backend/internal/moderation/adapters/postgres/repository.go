// Package postgres stores reports and moderation cases.
package postgres

import (
	"context"
	"time"

	ideaspg "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

func (r *Repository) LockPublicIdea(ctx context.Context, ac ideaports.Access, slug string) (ports.IdeaRef, error) {
	a := &ideaspg.Args{}
	slugArg := a.Add(slug)
	var ref ports.IdeaRef
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT i.id, i.slug, i.title, i.author_id, i.moderation_state FROM ideas i WHERE i.slug = `+slugArg+` AND `+ideaspg.PublicVisible("i", a, ac)+` FOR UPDATE OF i`, a.Values...).
		Scan(&ref.ID, &ref.Slug, &ref.Title, &ref.AuthorID, &ref.State)
	if postgres.IsNoRows(err) {
		return ports.IdeaRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

func (r *Repository) LockIdea(ctx context.Context, ideaID string) (ports.IdeaRef, error) {
	var ref ports.IdeaRef
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT id, slug, title, author_id, moderation_state FROM ideas WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, ideaID).
		Scan(&ref.ID, &ref.Slug, &ref.Title, &ref.AuthorID, &ref.State)
	if postgres.IsNoRows(err) {
		return ports.IdeaRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

// InsertReport files a report. A person whose earlier report was already answered
// by a decision may report again; a second report while one is open is not inserted.
// InsertReport files a report. A person whose earlier report was already answered
// by a decision may report again; a second report while one is open is not inserted.
func (r *Repository) InsertReport(ctx context.Context, ideaID, userID, reason string, now time.Time) (bool, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `INSERT INTO reports (idea_id, user_id, reason, created_at) VALUES ($1, $2, $3, $4)
		ON CONFLICT (idea_id, user_id) DO UPDATE SET reason = EXCLUDED.reason, status = 'OPEN', created_at = EXCLUDED.created_at, resolved_at = NULL
		WHERE reports.status = 'RESOLVED'`, ideaID, userID, reason, now)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Repository) OpenReports(ctx context.Context, ideaID string) (int, error) {
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM reports WHERE idea_id = $1 AND status = 'OPEN'`, ideaID).Scan(&n)
	return n, err
}

func (r *Repository) ResolveReports(ctx context.Context, ideaID string, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE reports SET status = 'RESOLVED', resolved_at = $2 WHERE idea_id = $1 AND status = 'OPEN'`, ideaID, now)
	return err
}

func (r *Repository) Reports(ctx context.Context, ideaID string, limit int) ([]domain.Report, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT u.id, u.handle, u.name, rp.reason, rp.status, rp.created_at
		FROM reports rp JOIN users u ON u.id = rp.user_id
		WHERE rp.idea_id = $1 ORDER BY rp.created_at DESC, rp.user_id LIMIT $2`, ideaID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Report{}
	for rows.Next() {
		var rep domain.Report
		if err := rows.Scan(&rep.Reporter.ID, &rep.Reporter.Handle, &rep.Reporter.Name, &rep.Reason, &rep.Status, &rep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, rep)
	}
	return out, rows.Err()
}

func (r *Repository) Hide(ctx context.Context, ideaID string, now time.Time) (bool, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `UPDATE ideas SET moderation_state = 'HIDDEN', updated_at = $2 WHERE id = $1 AND moderation_state = 'APPROVED'`, ideaID, now)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Repository) SetModeration(ctx context.Context, ideaID string, state domain.Decision, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE ideas SET moderation_state = $2, updated_at = $3 WHERE id = $1`, ideaID, string(state), now)
	return err
}

// RefreshHot scores an idea that has just been approved. The publication time is
// set by a trigger during the UPDATE, so the score is computed in a second
// statement that can see it.
func (r *Repository) RefreshHot(ctx context.Context, ideaID string, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		UPDATE ideas SET hot_score = idea_hot_score(votes_weighted, comments_count, joins_count, published_at, ranking_multiplier, $2)
		WHERE id = $1 AND published_at IS NOT NULL`, ideaID, now)
	return err
}

func (r *Repository) OpenCase(ctx context.Context, ideaID string, source domain.Source, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `INSERT INTO moderation_cases (id, idea_id, source, created_at) VALUES (gen_random_uuid(), $1, $2, $3) ON CONFLICT DO NOTHING`, ideaID, string(source), now)
	return err
}

func (r *Repository) OpenCaseOf(ctx context.Context, ideaID string) (string, bool, error) {
	var id string
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT id FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN'`, ideaID).Scan(&id)
	if postgres.IsNoRows(err) {
		return "", false, nil
	}
	return id, err == nil, err
}

func (r *Repository) CloseCase(ctx context.Context, caseID string, decision domain.Decision, by, note string, now time.Time) error {
	var n any
	if note != "" {
		n = note
	}
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE moderation_cases SET state = 'CLOSED', decision = $2, decided_by = $3, decided_at = $4, note = $5 WHERE id = $1 AND state = 'OPEN'`,
		caseID, string(decision), by, now, n)
	return err
}

func (r *Repository) IncrementApproved(ctx context.Context, userID string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE users SET approved_ideas = approved_ideas + 1 WHERE id = $1`, userID)
	return err
}

func (r *Repository) Queue(ctx context.Context, state domain.State, after *cursor.Position, limit int) ([]domain.QueueItem, error) {
	args := []any{string(state), limit}
	where := ""
	if after != nil {
		at, err := cursor.Time(after.Key)
		if err != nil {
			return nil, cursor.ErrInvalid
		}
		args = append(args, at, after.ID)
		where = ` AND (c.created_at, c.id) > ($3, $4::uuid)`
	}
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT c.id, i.id, i.slug, i.title, i.summary, i.category, i.body_html, u.id, u.handle, u.name, i.moderation_state, c.source, c.created_at,
			(SELECT count(*) FROM reports rp WHERE rp.idea_id = i.id AND rp.status = 'OPEN'), u.karma, u.approved_ideas
		FROM moderation_cases c
		JOIN ideas i ON i.id = c.idea_id
		JOIN users u ON u.id = i.author_id
		WHERE c.state = 'OPEN' AND i.moderation_state = $1 AND i.deleted_at IS NULL`+where+`
		ORDER BY c.created_at, c.id LIMIT $2`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.QueueItem{}
	for rows.Next() {
		var it domain.QueueItem
		if err := rows.Scan(&it.CaseID, &it.IdeaID, &it.Slug, &it.Title, &it.Summary, &it.Category, &it.HTML, &it.Author.ID, &it.Author.Handle, &it.Author.Name,
			&it.State, &it.Source, &it.OpenedAt, &it.OpenReports, &it.AuthorKarma, &it.AuthorApproved); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}
