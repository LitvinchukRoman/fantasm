// Package postgres stores discussion threads.
package postgres

import (
	"context"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/ports"
	ideaspg "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

func visibility(a *ideaspg.Args, ac ideaports.Access, readable bool) string {
	// One predicate only: a bind parameter that is registered and then unused cannot be typed by Postgres.
	if readable {
		return ideaspg.Readable("i", a, ac)
	}
	return ideaspg.PublicVisible("i", a, ac)
}

func (r *Repository) FindIdea(ctx context.Context, ac ideaports.Access, slug string, readable bool) (ports.IdeaRef, error) {
	a := &ideaspg.Args{}
	slugArg := a.Add(slug)
	var ref ports.IdeaRef
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT i.id, i.slug, i.title, i.author_id FROM ideas i WHERE i.slug = `+slugArg+` AND `+visibility(a, ac, readable), a.Values...).
		Scan(&ref.ID, &ref.Slug, &ref.Title, &ref.AuthorID)
	if postgres.IsNoRows(err) {
		return ports.IdeaRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

func (r *Repository) MainTopic(ctx context.Context, ideaID string) (string, error) {
	var id string
	err := r.db.Querier(ctx).QueryRow(ctx, `SELECT id FROM topics WHERE idea_id = $1 AND kind = 'MAIN'`, ideaID).Scan(&id)
	return id, err
}

const postColumns = `p.id, p.topic_id, coalesce(p.parent_id::text, ''), p.author_id, u.handle, u.name, p.depth, p.body, p.html, p.text,
	p.deleted_at IS NOT NULL, p.created_at, p.updated_at`

func scanPost(row interface{ Scan(...any) error }, p *domain.Post) error {
	return row.Scan(&p.ID, &p.TopicID, &p.ParentID, &p.Author.ID, &p.Author.Handle, &p.Author.Name, &p.Depth, &p.Body, &p.HTML, &p.Text,
		&p.Deleted, &p.CreatedAt, &p.UpdatedAt)
}

func (r *Repository) Posts(ctx context.Context, topicID string, limit int) ([]domain.Post, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `SELECT `+postColumns+` FROM posts p JOIN users u ON u.id = p.author_id WHERE p.topic_id = $1 ORDER BY p.created_at, p.id LIMIT $2`, topicID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	posts := []domain.Post{}
	for rows.Next() {
		var p domain.Post
		if err := scanPost(rows, &p); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (r *Repository) FindPost(ctx context.Context, ac ideaports.Access, postID string, readable bool) (ports.PostRef, error) {
	a := &ideaspg.Args{}
	idArg := a.Add(postID)
	var ref ports.PostRef
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT `+postColumns+`, i.id, i.slug, i.title, i.author_id
		FROM posts p
		JOIN topics t ON t.id = p.topic_id
		JOIN ideas i ON i.id = t.idea_id
		JOIN users u ON u.id = p.author_id
		WHERE p.id = `+idArg+` AND `+visibility(a, ac, readable), a.Values...).
		Scan(&ref.ID, &ref.TopicID, &ref.ParentID, &ref.Author.ID, &ref.Author.Handle, &ref.Author.Name, &ref.Depth, &ref.Body, &ref.HTML, &ref.Text,
			&ref.Deleted, &ref.CreatedAt, &ref.UpdatedAt, &ref.Idea.ID, &ref.Idea.Slug, &ref.Idea.Title, &ref.Idea.AuthorID)
	if postgres.IsNoRows(err) {
		return ports.PostRef{}, ideadomain.ErrNotFound
	}
	return ref, err
}

func (r *Repository) InsertPost(ctx context.Context, n ports.NewPost) (domain.Post, error) {
	var parent *string
	if n.ParentID != "" {
		parent = &n.ParentID
	}
	p := domain.Post{TopicID: n.TopicID, ParentID: n.ParentID, Depth: n.Depth, Body: n.Body, HTML: n.HTML, Text: n.Text, CreatedAt: n.Now}
	p.Author.ID = n.AuthorID
	err := r.db.Querier(ctx).QueryRow(ctx, `
		INSERT INTO posts (id, topic_id, author_id, parent_id, depth, body, html, text, created_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		n.TopicID, n.AuthorID, parent, n.Depth, n.Body, n.HTML, n.Text, n.Now).Scan(&p.ID)
	return p, err
}

func (r *Repository) UpdateBody(ctx context.Context, postID, body, html, text string, now time.Time) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `UPDATE posts SET body = $2, html = $3, text = $4, updated_at = $5 WHERE id = $1 AND deleted_at IS NULL`, postID, body, html, text, now)
	return err
}

func (r *Repository) SoftDelete(ctx context.Context, postID string, now time.Time) (bool, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `UPDATE posts SET deleted_at = $2 WHERE id = $1 AND deleted_at IS NULL`, postID, now)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() == 1, nil
}

func (r *Repository) AdjustComments(ctx context.Context, ideaID string, delta int, now time.Time) error {
	// Right-hand sides of an UPDATE see the old row, so the new count is spelled out for the score.
	_, err := r.db.Querier(ctx).Exec(ctx, `
		UPDATE ideas SET comments_count = comments_count + $3,
			hot_score = idea_hot_score(votes_weighted, comments_count + $3, joins_count, published_at, ranking_multiplier, $2)
		WHERE id = $1`, ideaID, now, delta)
	return err
}
