// Package postgres stores votes and participations.
package postgres

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/ports"
	ideaspg "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

func (r *Repository) FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable, lock bool) (ports.IdeaRef, error) {
	a := &ideaspg.Args{}
	slugArg := a.Add(slug)
	// Build exactly one predicate: a registered but unused bind parameter makes Postgres fail to type it.
	var visible string
	if readable {
		visible = ideaspg.Readable("i", a, ac)
	} else {
		visible = ideaspg.PublicVisible("i", a, ac)
	}
	sql := `SELECT i.id, i.slug, i.title, i.author_id, u.handle, i.event_capacity, i.karma_multiplier
		FROM ideas i JOIN users u ON u.id = i.author_id WHERE i.slug = ` + slugArg + ` AND ` + visible
	if lock {
		sql += ` FOR UPDATE OF i`
	}
	var ref ports.IdeaRef
	err := r.db.Querier(ctx).QueryRow(ctx, sql, a.Values...).Scan(&ref.ID, &ref.Slug, &ref.Title, &ref.AuthorID, &ref.AuthorHandle, &ref.Capacity, &ref.KarmaMultiplier)
	if postgres.IsNoRows(err) {
		return ports.IdeaRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

func (r *Repository) AddVote(ctx context.Context, ideaID, userID string, weight int) (bool, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `INSERT INTO votes (idea_id, user_id, weight) VALUES ($1, $2, $3) ON CONFLICT (idea_id, user_id) DO NOTHING`, ideaID, userID, weight)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Repository) RemoveVote(ctx context.Context, ideaID, userID string) (int, bool, error) {
	var weight int
	err := r.db.Querier(ctx).QueryRow(ctx, `DELETE FROM votes WHERE idea_id = $1 AND user_id = $2 RETURNING weight`, ideaID, userID).Scan(&weight)
	if postgres.IsNoRows(err) {
		return 0, false, nil
	}
	return weight, err == nil, err
}

func (r *Repository) VoteWeight(ctx context.Context, ideaID, userID string) (int, error) {
	var weight int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT weight FROM votes WHERE idea_id = $1 AND user_id = $2`, ideaID, userID).Scan(&weight)
	if postgres.IsNoRows(err) {
		return 0, nil
	}
	return weight, err
}

const counterReturn = ` RETURNING votes_weighted, joins_count`

func (r *Repository) AdjustVotes(ctx context.Context, ideaID string, delta int, now time.Time) (ports.Counters, error) {
	var c ports.Counters
	// votes_weighted + delta is evaluated under the row lock UPDATE takes, so concurrent voters never lose an update.
	// The CHECK (votes_weighted >= 0) is the last line of defense against a double reversal. In an UPDATE the
	// right-hand sides see the OLD row, hence the new value is spelled out for the hot score.
	// idea_hot_score is the single SQL definition of the formula; domain.HotScore is its tested twin.
	err := r.db.Querier(ctx).QueryRow(ctx, `
		UPDATE ideas SET votes_weighted = votes_weighted + $3,
			hot_score = idea_hot_score(votes_weighted + $3, comments_count, joins_count, published_at, ranking_multiplier, $2)
		WHERE id = $1`+counterReturn, ideaID, now, delta).Scan(&c.Votes, &c.Joins)
	return c, err
}

func (r *Repository) Counters(ctx context.Context, ideaID string) (ports.Counters, error) {
	var c ports.Counters
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT votes_weighted, joins_count FROM ideas WHERE id = $1`, ideaID).Scan(&c.Votes, &c.Joins)
	return c, err
}

func (r *Repository) AdjustKarma(ctx context.Context, userID string, delta int) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE users SET karma = greatest(karma + $2, 0) WHERE id = $1`, userID, delta)
	return err
}

func (r *Repository) Participation(ctx context.Context, ideaID, userID string) (*domain.Participation, error) {
	var p domain.Participation
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT state, role FROM participations WHERE idea_id = $1 AND user_id = $2`, ideaID, userID).Scan(&p.State, &p.Role)
	if postgres.IsNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *Repository) SaveParticipation(ctx context.Context, ideaID, userID string, p domain.Participation, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO participations (idea_id, user_id, state, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $5)
		ON CONFLICT (idea_id, user_id) DO UPDATE SET state = EXCLUDED.state, role = EXCLUDED.role, updated_at = EXCLUDED.updated_at`,
		ideaID, userID, p.State, p.Role, now)
	return err
}

func (r *Repository) DeleteParticipation(ctx context.Context, ideaID, userID string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM participations WHERE idea_id = $1 AND user_id = $2`, ideaID, userID)
	return err
}

func (r *Repository) Seats(ctx context.Context, ideaID string) (int, error) {
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM participations WHERE idea_id = $1 AND state IN ('JOINED', 'ACCEPTED')`, ideaID).Scan(&n)
	return n, err
}

func (r *Repository) RecountJoins(ctx context.Context, ideaID string, now time.Time) (ports.Counters, error) {
	var c ports.Counters
	err := r.db.Querier(ctx).QueryRow(ctx, `
		UPDATE ideas i SET joins_count = j.n,
			hot_score = idea_hot_score(i.votes_weighted, i.comments_count, j.n, i.published_at, i.ranking_multiplier, $2)
		FROM (SELECT count(*)::int AS n FROM participations WHERE idea_id = $1 AND state IN ('JOINED', 'ACCEPTED')) j
		WHERE i.id = $1 RETURNING i.votes_weighted, i.joins_count`, ideaID, now).Scan(&c.Votes, &c.Joins)
	return c, err
}

func (r *Repository) Participants(ctx context.Context, ideaID string, activeOnly bool, limit int) ([]ports.Participant, error) {
	sql := `SELECT p.user_id, u.handle, u.name, p.state, p.role, p.updated_at FROM participations p JOIN users u ON u.id = p.user_id WHERE p.idea_id = $1`
	if activeOnly {
		sql += ` AND p.state IN ('JOINED', 'ACCEPTED')`
	}
	rows, err := r.db.Querier(ctx).Query(ctx, sql+` ORDER BY p.created_at, p.user_id LIMIT $2`, ideaID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ports.Participant{}
	for rows.Next() {
		var p ports.Participant
		if err := rows.Scan(&p.UserID, &p.Handle, &p.Name, &p.State, &p.Role, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *Repository) UserIDByHandle(ctx context.Context, handle string) (string, error) {
	var id string
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT id FROM users WHERE handle = $1`, handle).Scan(&id)
	if postgres.IsNoRows(err) {
		return "", ideadomain.ErrNotFound
	}
	return id, err
}
