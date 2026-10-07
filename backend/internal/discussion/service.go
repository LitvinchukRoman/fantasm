// Package discussion owns the thread under an idea: posts, replies, edits and
// soft deletes. Text is rendered and sanitized once, on write.
package discussion

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/ports"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	notify "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	notifyports "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/markdown"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Service struct {
	repo   ports.Repository
	tx     ports.Transactor
	badges viewer.BadgeLookup
	notify notifyports.Publisher
	now    func() time.Time
}

func NewService(repo ports.Repository, tx ports.Transactor, badges viewer.BadgeLookup, publisher notifyports.Publisher) *Service {
	return &Service{repo: repo, tx: tx, badges: badges, notify: publisher, now: time.Now}
}

func ideaNotFound() error { return apperr.NotFound("idea not found") }
func postNotFound() error { return apperr.NotFound("post not found") }

func requireAuth(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	return nil
}

// Thread is the whole discussion of one idea.
type Thread struct {
	ID       string
	IdeaSlug string
	Count    int
	Posts    []*domain.Node
	// Verified lists authors who currently carry an organization badge.
	Verified map[string]bool
}

// Thread returns the discussion as a tree. Deleted posts stay in place so that
// their replies keep a parent, but their text is gone.
func (s *Service) Thread(ctx context.Context, v viewer.Viewer, slug string) (Thread, error) {
	idea, err := s.repo.FindIdea(ctx, ideaports.AccessOf(v), slug, true)
	if errors.Is(err, ideadomain.ErrNotFound) {
		return Thread{}, ideaNotFound()
	}
	if err != nil {
		return Thread{}, fmt.Errorf("find idea: %w", err)
	}
	topicID, err := s.repo.MainTopic(ctx, idea.ID)
	if err != nil {
		return Thread{}, fmt.Errorf("find topic: %w", err)
	}
	posts, err := s.repo.Posts(ctx, topicID, domain.MaxPosts)
	if err != nil {
		return Thread{}, fmt.Errorf("list posts: %w", err)
	}
	for i := range posts {
		if posts[i].Deleted {
			posts[i].HTML, posts[i].Text, posts[i].Body = "", "", ""
			posts[i].Author = domain.Author{}
		}
	}
	t := Thread{ID: topicID, IdeaSlug: idea.Slug, Posts: domain.BuildTree(posts)}
	t.Count = domain.CountLive(t.Posts)
	t.Verified, err = s.verified(ctx, posts)
	return t, err
}

func (s *Service) verified(ctx context.Context, posts []domain.Post) (map[string]bool, error) {
	seen := map[string]bool{}
	ids := []string{}
	for _, p := range posts {
		if p.Author.ID != "" && !seen[p.Author.ID] {
			seen[p.Author.ID] = true
			ids = append(ids, p.Author.ID)
		}
	}
	out := map[string]bool{}
	if len(ids) == 0 {
		return out, nil
	}
	badges, err := s.badges.BadgesFor(ctx, ids)
	if err != nil {
		return nil, fmt.Errorf("resolve badges: %w", err)
	}
	for id := range badges {
		out[id] = true
	}
	return out, nil
}

// Created is a post just written, with whether its author is verified.
type Created struct {
	Post     domain.Post
	Verified bool
}

// source normalizes what is stored as the post's Markdown.
func source(body string) string { return strings.TrimSpace(strings.ReplaceAll(body, "\r\n", "\n")) }

func render(body string) (markdown.Result, error) {
	res, err := markdown.Post.Render(body)
	if err != nil {
		return markdown.Result{}, err // already a validation error naming the "body" field
	}
	return res, nil
}

// Create adds a post to the idea's discussion, optionally as a reply.
func (s *Service) Create(ctx context.Context, v viewer.Viewer, slug, body, parentID string) (Created, error) {
	if err := requireAuth(v); err != nil {
		return Created{}, err
	}
	rendered, err := render(body)
	if err != nil {
		return Created{}, err
	}
	if parentID != "" && !httpx.IsUUID(parentID) {
		return Created{}, apperr.Validation(map[string]string{"parentId": "invalid id"})
	}
	var post domain.Post
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		access := ideaports.AccessOf(v)
		idea, err := s.repo.FindIdea(ctx, access, slug, false)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return ideaNotFound()
		}
		if err != nil {
			return fmt.Errorf("find idea: %w", err)
		}
		topicID, err := s.repo.MainTopic(ctx, idea.ID)
		if err != nil {
			return fmt.Errorf("find topic: %w", err)
		}
		np := ports.NewPost{TopicID: topicID, AuthorID: v.ID(), Body: source(body), HTML: rendered.HTML, Text: rendered.Text, Now: s.now().UTC()}
		var parent *ports.PostRef
		if parentID != "" {
			ref, err := s.repo.FindPost(ctx, access, parentID, false)
			if errors.Is(err, ideadomain.ErrNotFound) || err == nil && (ref.TopicID != topicID || ref.Deleted) {
				return apperr.Validation(map[string]string{"parentId": "no such post to reply to"})
			}
			if err != nil {
				return fmt.Errorf("find parent: %w", err)
			}
			parent = &ref
			np.ParentID, np.Depth = domain.EffectiveParent(ref.ID, ref.ParentID, ref.Depth)
		}
		if post, err = s.repo.InsertPost(ctx, np); err != nil {
			return fmt.Errorf("insert post: %w", err)
		}
		if err := s.repo.AdjustComments(ctx, idea.ID, 1, np.Now); err != nil {
			return fmt.Errorf("adjust comments: %w", err)
		}
		payload := map[string]any{"ideaSlug": idea.Slug, "ideaTitle": idea.Title, "actorHandle": v.User.Handle, "actorName": v.User.Name, "postId": post.ID}
		notified := map[string]bool{v.ID(): true} // nobody is notified about their own post
		for _, recipient := range []string{idea.AuthorID, parentAuthor(parent)} {
			if recipient == "" || notified[recipient] {
				continue
			}
			notified[recipient] = true
			if err := s.notify.Publish(ctx, notify.Notification{UserID: recipient, Type: notify.Comment, Payload: payload}); err != nil {
				return fmt.Errorf("notify: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return Created{}, err
	}
	post.Author = domain.Author{ID: v.ID(), Handle: v.User.Handle, Name: v.User.Name}
	verified, err := s.verified(ctx, []domain.Post{post})
	if err != nil {
		return Created{}, err
	}
	return Created{Post: post, Verified: verified[v.ID()]}, nil
}

func parentAuthor(p *ports.PostRef) string {
	if p == nil {
		return ""
	}
	return p.Author.ID
}

// Edit changes the text of one's own post within the edit window.
func (s *Service) Edit(ctx context.Context, v viewer.Viewer, postID, body string) (Created, error) {
	if err := requireAuth(v); err != nil {
		return Created{}, err
	}
	if !httpx.IsUUID(postID) {
		return Created{}, postNotFound()
	}
	rendered, err := render(body)
	if err != nil {
		return Created{}, err
	}
	var post domain.Post
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.repo.FindPost(ctx, ideaports.AccessOf(v), postID, true)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return postNotFound()
		}
		if err != nil {
			return fmt.Errorf("find post: %w", err)
		}
		if ref.Deleted {
			return postNotFound()
		}
		if ref.Author.ID != v.ID() {
			return apperr.Forbidden("only the author can edit a post")
		}
		now := s.now().UTC()
		if !domain.CanEdit(ref.Post, v.ID(), now) {
			return apperr.Forbidden("the editing window has closed")
		}
		if err := s.repo.UpdateBody(ctx, ref.ID, source(body), rendered.HTML, rendered.Text, now); err != nil {
			return fmt.Errorf("update post: %w", err)
		}
		post = ref.Post
		post.Body, post.HTML, post.Text, post.UpdatedAt = source(body), rendered.HTML, rendered.Text, &now
		return nil
	})
	if err != nil {
		return Created{}, err
	}
	verified, err := s.verified(ctx, []domain.Post{post})
	if err != nil {
		return Created{}, err
	}
	return Created{Post: post, Verified: verified[post.Author.ID]}, nil
}

// Delete removes a post from view. Authors may delete their own, staff any.
func (s *Service) Delete(ctx context.Context, v viewer.Viewer, postID string) error {
	if err := requireAuth(v); err != nil {
		return err
	}
	if !httpx.IsUUID(postID) {
		return postNotFound()
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		ref, err := s.repo.FindPost(ctx, ideaports.AccessOf(v), postID, true)
		if errors.Is(err, ideadomain.ErrNotFound) {
			return postNotFound()
		}
		if err != nil {
			return fmt.Errorf("find post: %w", err)
		}
		if ref.Author.ID != v.ID() && !v.IsStaff() {
			return apperr.Forbidden("only the author or a moderator can delete a post")
		}
		now := s.now().UTC()
		wasAlive, err := s.repo.SoftDelete(ctx, ref.ID, now)
		if err != nil {
			return fmt.Errorf("delete post: %w", err)
		}
		if wasAlive {
			if err := s.repo.AdjustComments(ctx, ref.Idea.ID, -1, now); err != nil {
				return fmt.Errorf("adjust comments: %w", err)
			}
		}
		return nil
	})
}
