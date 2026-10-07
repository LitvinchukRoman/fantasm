// Package postgres stores ideas. All SQL is parameterized; fragments that vary
// by viewer or filter are built from constants and bind parameters only.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

const listColumns = `i.id, i.slug, i.author_id, u.handle, u.name, i.title, i.summary, i.cover_url, i.category, i.status,
	i.visibility, coalesce(i.organization_id, ''), i.moderation_state, coalesce(i.badge_organization_id, ''),
	i.event_date, i.event_place, i.event_capacity, i.event_roles, i.story,
	i.votes_weighted, i.comments_count, i.joins_count, i.hot_score, i.ranking_multiplier, i.karma_multiplier,
	i.created_at, i.updated_at, i.published_at`

const detailColumns = listColumns + `, i.body, i.body_html, i.body_text, i.toc, i.reading_minutes`

func scanIdea(row pgx.Row, full bool) (domain.Idea, error) {
	var i domain.Idea
	dest := []any{&i.ID, &i.Slug, &i.Author.ID, &i.Author.Handle, &i.Author.Name, &i.Title, &i.Summary, &i.CoverURL, &i.Category, &i.Status,
		&i.Visibility, &i.OrganizationID, &i.Moderation, &i.BadgeOrganizationID,
		&i.EventDate, &i.EventPlace, &i.EventCapacity, &i.NeedsRoles, &i.Rendered.Story,
		&i.Votes, &i.Comments, &i.Joins, &i.HotScore, &i.RankingMultiplier, &i.KarmaMultiplier,
		&i.CreatedAt, &i.UpdatedAt, &i.PublishedAt}
	if full {
		dest = append(dest, &i.Body, &i.Rendered.HTML, &i.Rendered.Text, &i.Rendered.TOC, &i.Rendered.ReadingMinutes)
	}
	err := row.Scan(dest...)
	if postgres.IsNoRows(err) {
		return domain.Idea{}, domain.ErrNotFound
	}
	if i.NeedsRoles == nil {
		i.NeedsRoles = []string{}
	}
	if full && i.Rendered.TOC == nil {
		i.Rendered.TOC = []domain.TOCItem{}
	}
	return i, err
}

func (r *Repository) loadTags(ctx context.Context, ideas []domain.Idea) error {
	if len(ideas) == 0 {
		return nil
	}
	ids := make([]string, len(ideas))
	index := make(map[string]int, len(ideas))
	for n := range ideas {
		ids[n] = ideas[n].ID
		index[ideas[n].ID] = n
		ideas[n].Tags = []domain.Tag{}
	}
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT idea_id, tag, label FROM idea_tags WHERE idea_id = ANY($1::uuid[]) ORDER BY idea_id, label`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var t domain.Tag
		if err := rows.Scan(&id, &t.Slug, &t.Label); err != nil {
			return err
		}
		ideas[index[id]].Tags = append(ideas[index[id]].Tags, t)
	}
	return rows.Err()
}

func (r *Repository) LockAuthor(ctx context.Context, userID string) (int, error) {
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT approved_ideas FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&n)
	return n, err
}

func (r *Repository) CountCreatedSince(ctx context.Context, userID string, since time.Time) (int, error) {
	var n int
	// Deleted ideas count too, otherwise delete-and-repost would dodge the limit.
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM ideas WHERE author_id = $1 AND created_at > $2`, userID, since).Scan(&n)
	return n, err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

const maxSlugAttempts = 6

func (r *Repository) Insert(ctx context.Context, n ports.NewIdea) (string, string, error) {
	q := r.db.Querier(ctx)
	toc := n.Rendered.TOC
	if toc == nil {
		toc = []domain.TOCItem{}
	}
	roles := n.Content.NeedsRoles
	if roles == nil {
		roles = []string{}
	}
	slug := n.SlugBase
	for attempt := 0; attempt < maxSlugAttempts; attempt++ {
		if attempt > 0 {
			slug = domain.WithSuffix(n.SlugBase)
		}
		var id string
		// ON CONFLICT instead of catching the unique violation: inside a transaction an error would abort it.
		err := q.QueryRow(ctx, `
			INSERT INTO ideas (id, author_id, slug, title, summary, body, cover_url, category, status, visibility, organization_id,
				moderation_state, badge_organization_id, event_date, event_place, event_capacity, event_roles,
				ranking_multiplier, karma_multiplier, body_html, body_text, story, toc, reading_minutes, created_at, updated_at)
			VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $24)
			ON CONFLICT (slug) DO NOTHING
			RETURNING id`,
			n.AuthorID, slug, n.Content.Title, n.Content.Summary, n.Content.Body, n.Content.CoverURL, n.Content.Category, n.Status,
			n.Visibility, nullIfEmpty(n.OrganizationID), n.Moderation, nullIfEmpty(n.BadgeOrganizationID),
			n.Content.EventDate, n.Content.EventPlace, n.Content.EventCapacity, roles,
			n.RankingMultiplier, n.KarmaMultiplier, n.Rendered.HTML, n.Rendered.Text, n.Rendered.Story, toc, max(n.Rendered.ReadingMinutes, 1), n.Now,
		).Scan(&id)
		if postgres.IsNoRows(err) {
			continue
		}
		if err != nil {
			return "", "", err
		}
		if err := r.replaceTags(ctx, id, n.Content.TagList()); err != nil {
			return "", "", err
		}
		return id, slug, nil
	}
	return "", "", errors.New("could not find a free slug")
}

func (r *Repository) replaceTags(ctx context.Context, ideaID string, tags []domain.Tag) error {
	q := r.db.Querier(ctx)
	if _, err := q.Exec(ctx, `DELETE FROM idea_tags WHERE idea_id = $1`, ideaID); err != nil {
		return err
	}
	if len(tags) == 0 {
		return nil
	}
	slugs, labels := make([]string, len(tags)), make([]string, len(tags))
	for n, t := range tags {
		slugs[n], labels[n] = t.Slug, t.Label
	}
	_, err := q.Exec(ctx, `INSERT INTO idea_tags (idea_id, tag, label) SELECT $1, t.slug, t.label FROM unnest($2::text[], $3::text[]) AS t(slug, label)`, ideaID, slugs, labels)
	return err
}

func (r *Repository) OpenModerationCase(ctx context.Context, ideaID string) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO moderation_cases (id, idea_id)
		SELECT gen_random_uuid(), $1
		WHERE NOT EXISTS (SELECT 1 FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN')`, ideaID)
	return err
}

func (r *Repository) BySlug(ctx context.Context, ac ports.Access, slug string, lock bool) (domain.Idea, error) {
	a := &Args{}
	slugArg := a.Add(slug)
	sql := `SELECT ` + detailColumns + ` FROM ideas i JOIN users u ON u.id = i.author_id WHERE i.slug = ` + slugArg + ` AND ` + Readable("i", a, ac)
	if lock {
		sql += ` FOR UPDATE OF i`
	}
	idea, err := scanIdea(r.db.Querier(ctx).QueryRow(ctx, sql, a.Values...), true)
	if err != nil {
		return domain.Idea{}, err
	}
	list := []domain.Idea{idea}
	if err := r.loadTags(ctx, list); err != nil {
		return domain.Idea{}, err
	}
	return list[0], nil
}

func (r *Repository) UpdateContent(ctx context.Context, ideaID string, c domain.Content, rd domain.Rendered, now time.Time) error {
	toc := rd.TOC
	if toc == nil {
		toc = []domain.TOCItem{}
	}
	roles := c.NeedsRoles
	if roles == nil {
		roles = []string{}
	}
	_, err := r.db.Querier(ctx).Exec(ctx, `
		UPDATE ideas SET title = $2, summary = $3, body = $4, cover_url = $5, category = $6, event_date = $7, event_place = $8,
			event_capacity = $9, event_roles = $10, body_html = $11, body_text = $12, story = $13, toc = $14,
			reading_minutes = $15, updated_at = $16
		WHERE id = $1`,
		ideaID, c.Title, c.Summary, c.Body, c.CoverURL, c.Category, c.EventDate, c.EventPlace, c.EventCapacity, roles,
		rd.HTML, rd.Text, rd.Story, toc, max(rd.ReadingMinutes, 1), now)
	if err != nil {
		return err
	}
	return r.replaceTags(ctx, ideaID, c.TagList())
}

func (r *Repository) SetStatus(ctx context.Context, ideaID string, status domain.Status, moderation domain.Moderation, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE ideas SET status = $2, moderation_state = $3, updated_at = $4 WHERE id = $1`, ideaID, status, moderation, now)
	return err
}

func (r *Repository) SoftDelete(ctx context.Context, ideaID string, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE ideas SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL`, ideaID, now)
	return err
}

// sortSpec describes how a listing is ordered and how a cursor key becomes a bind value.
type sortSpec struct {
	column string
	parse  func(string) (any, error)
}

func specFor(f domain.Filter) sortSpec {
	switch f.Sort {
	case domain.SortTop:
		return sortSpec{"i.votes_weighted", func(s string) (any, error) { return strconv.Atoi(s) }}
	case domain.SortNew:
		column := "i.published_at"
		if f.Mine {
			column = "i.created_at"
		}
		return sortSpec{column, func(s string) (any, error) {
			micros, err := strconv.ParseInt(s, 10, 64)
			return time.UnixMicro(micros).UTC(), err
		}}
	default:
		return sortSpec{"i.hot_score", func(s string) (any, error) { return strconv.ParseFloat(s, 64) }}
	}
}

func (r *Repository) List(ctx context.Context, ac ports.Access, f domain.Filter, after *ports.Cursor, limit int) ([]domain.Idea, error) {
	a := &Args{}
	var where []string
	if f.Mine {
		where = append(where, "i.deleted_at IS NULL", "i.author_id = "+a.Add(ac.UserID))
	} else {
		where = append(where, PublicVisible("i", a, ac))
		if f.AuthorID != "" {
			where = append(where, "i.author_id = "+a.Add(f.AuthorID))
		}
	}
	if f.Category != "" {
		where = append(where, "i.category = "+a.Add(string(f.Category)))
	}
	if f.Status != "" {
		where = append(where, "i.status = "+a.Add(string(f.Status)))
	}
	if f.Campus != "" {
		where = append(where, "i.badge_organization_id = "+a.Add(f.Campus))
	}
	if f.Tag != "" {
		where = append(where, "EXISTS (SELECT 1 FROM idea_tags t WHERE t.idea_id = i.id AND t.tag = "+a.Add(f.Tag)+")")
	}
	spec := specFor(f)
	if after != nil {
		key, err := spec.parse(after.Key)
		if err != nil {
			return nil, fmt.Errorf("cursor key: %w", err)
		}
		where = append(where, fmt.Sprintf("(%s, i.id) < (%s, %s::uuid)", spec.column, a.Add(key), a.Add(after.ID)))
	}
	sql := fmt.Sprintf(`SELECT %s FROM ideas i JOIN users u ON u.id = i.author_id WHERE %s ORDER BY %s DESC, i.id DESC LIMIT %s`,
		listColumns, strings.Join(where, " AND "), spec.column, a.Add(limit))
	return r.queryIdeas(ctx, sql, a.Values)
}

func (r *Repository) queryIdeas(ctx context.Context, sql string, args []any) ([]domain.Idea, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ideas := []domain.Idea{}
	for rows.Next() {
		i, err := scanIdea(rows, false)
		if err != nil {
			return nil, err
		}
		ideas = append(ideas, i)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	return ideas, r.loadTags(ctx, ideas)
}

func (r *Repository) Events(ctx context.Context, ac ports.Access, from, to time.Time, limit int) ([]domain.Idea, error) {
	a := &Args{}
	sql := fmt.Sprintf(`SELECT %s FROM ideas i JOIN users u ON u.id = i.author_id
		WHERE %s AND i.category = 'EVENT' AND i.event_date >= %s AND i.event_date < %s
		ORDER BY i.event_date, i.id LIMIT %s`, listColumns, PublicVisible("i", a, ac), a.Add(from), a.Add(to), a.Add(limit))
	return r.queryIdeas(ctx, sql, a.Values)
}

func (r *Repository) Next(ctx context.Context, ac ports.Access, slug string) (domain.Ref, error) {
	a := &Args{}
	q := r.db.Querier(ctx)
	var currentID string
	var published *time.Time
	err := q.QueryRow(ctx, `SELECT i.id, i.published_at FROM ideas i WHERE i.slug = `+a.Add(slug)+` AND `+Readable("i", a, ac), a.Values...).Scan(&currentID, &published)
	if postgres.IsNoRows(err) {
		return domain.Ref{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Ref{}, err
	}
	pick := func(older bool) (domain.Ref, error) {
		b := &Args{}
		cond := "i.id <> " + b.Add(currentID) + "::uuid"
		if older {
			cond += fmt.Sprintf(" AND (i.published_at, i.id) < (%s::timestamptz, %s::uuid)", b.Add(*published), b.Add(currentID))
		}
		var ref domain.Ref
		err := q.QueryRow(ctx, `SELECT i.slug, i.title, i.summary, i.category FROM ideas i WHERE `+PublicVisible("i", b, ac)+` AND `+cond+
			` ORDER BY i.published_at DESC, i.id DESC LIMIT 1`, b.Values...).Scan(&ref.Slug, &ref.Title, &ref.Summary, &ref.Category)
		return ref, err
	}
	if published != nil {
		ref, err := pick(true)
		if err == nil {
			return ref, nil
		}
		if !postgres.IsNoRows(err) {
			return domain.Ref{}, err
		}
	}
	ref, err := pick(false)
	if postgres.IsNoRows(err) {
		return domain.Ref{}, domain.ErrNotFound
	}
	return ref, err
}

func (r *Repository) Sitemap(ctx context.Context, limit int) ([]ports.SitemapEntry, error) {
	a := &Args{}
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT i.slug, i.updated_at FROM ideas i WHERE `+PublicVisible("i", a, ports.Access{})+
		` ORDER BY i.published_at DESC, i.id DESC LIMIT `+a.Add(limit), a.Values...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []ports.SitemapEntry{}
	for rows.Next() {
		var e ports.SitemapEntry
		if err := rows.Scan(&e.Slug, &e.UpdatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (r *Repository) ViewerState(ctx context.Context, ideaID, userID string) (domain.ViewerState, error) {
	var s domain.ViewerState
	q := r.db.Querier(ctx)
	err := q.QueryRow(ctx, `SELECT weight FROM votes WHERE idea_id = $1 AND user_id = $2`, ideaID, userID).Scan(&s.VotedWeight)
	if err != nil && !postgres.IsNoRows(err) {
		return s, err
	}
	var p domain.Participation
	err = q.QueryRow(ctx, `SELECT state, role FROM participations WHERE idea_id = $1 AND user_id = $2`, ideaID, userID).Scan(&p.State, &p.Role)
	switch {
	case err == nil:
		s.Participation = &p
	case !postgres.IsNoRows(err):
		return s, err
	}
	return s, nil
}

func (r *Repository) CountVisibleByAuthor(ctx context.Context, ac ports.Access, authorID string) (int, error) {
	a := &Args{}
	var n int
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM ideas i WHERE `+PublicVisible("i", a, ac)+` AND i.author_id = `+a.Add(authorID), a.Values...).Scan(&n)
	return n, err
}

func (r *Repository) RecomputeHot(ctx context.Context, now time.Time, window time.Duration) (int64, error) {
	q := r.db.Querier(ctx)
	cutoff := now.Add(-window)
	fresh, err := q.Exec(ctx, `
		UPDATE ideas SET hot_score = idea_hot_score(votes_weighted, comments_count, joins_count, published_at, ranking_multiplier, $1)
		WHERE moderation_state = 'APPROVED' AND deleted_at IS NULL AND published_at > $2`, now, cutoff)
	if err != nil {
		return 0, err
	}
	// Past the window an idea no longer competes; a stale non-zero score would outrank fresh ones.
	stale, err := q.Exec(ctx, `UPDATE ideas SET hot_score = 0 WHERE hot_score <> 0 AND (published_at IS NULL OR published_at <= $1)`, cutoff)
	if err != nil {
		return fresh.RowsAffected(), err
	}
	return fresh.RowsAffected() + stale.RowsAffected(), nil
}
