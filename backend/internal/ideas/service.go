// Package ideas owns the life of an idea: writing, publishing, moderation gate,
// discovery. Votes, discussion and moderation decisions live in their own contexts.
package ideas

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	identity "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/markdown"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

// Organizations resolves the public mark of an organization.
type Organizations interface {
	Badge(id string) (identity.Badge, bool)
}

type Service struct {
	repo   ports.Repository
	tx     ports.Transactor
	badges viewer.BadgeLookup
	orgs   Organizations
	cursor cursorCodec
	now    func() time.Time
}

func NewService(repo ports.Repository, tx ports.Transactor, badges viewer.BadgeLookup, orgs Organizations, secret []byte) *Service {
	return &Service{repo: repo, tx: tx, badges: badges, orgs: orgs, cursor: cursorCodec{key: secret}, now: time.Now}
}

// Campus is an organization mark shown on an idea or next to a person.
type Campus struct {
	ID    string
	Label string
}

// Item is an idea with everything the API shows around it resolved.
type Item struct {
	domain.Idea
	Campus         *Campus
	AuthorVerified bool
	AuthorCampus   *Campus
}

// Detail is the single-idea view.
type Detail struct {
	Item
	State domain.ViewerState
	// ExposeBody is true for the author and staff: the Markdown source may be returned.
	ExposeBody bool
	// CanEdit is true when the viewer may change or delete the idea.
	CanEdit bool
}

type Page struct {
	Items      []Item
	NextCursor string
}

func notFound() error { return apperr.NotFound("idea not found") }

func requireAuth(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	return nil
}

func canManage(v viewer.Viewer, i domain.Idea) bool {
	return v.Authenticated && (v.ID() == i.Author.ID || v.IsStaff())
}

// CreateInput is a validated-by-the-service request to publish or save an idea.
type CreateInput struct {
	Content        domain.Content
	Status         domain.Status
	Visibility     domain.Visibility
	OrganizationID string
}

// Create stores a new idea. Whether it goes live at once or waits in the
// moderation queue is decided here, in the same transaction that stores it.
func (s *Service) Create(ctx context.Context, v viewer.Viewer, in CreateInput) (Detail, error) {
	if err := requireAuth(v); err != nil {
		return Detail{}, err
	}
	now := s.now().UTC()
	content := in.Content.Normalize()
	fields := content.Validate(now, true)
	if in.Status == "" {
		in.Status = domain.Open
	}
	if in.Status != domain.Draft && in.Status != domain.Open {
		fields["status"] = "a new idea is either DRAFT or OPEN"
	}
	if in.Visibility == "" {
		in.Visibility = domain.Public
	}
	switch in.Visibility {
	case domain.Public, domain.MembersOnly, domain.OrganizationOnly:
	default:
		fields["visibility"] = "must be PUBLIC, MEMBERS_ONLY or ORGANIZATION_ONLY"
	}
	rendered, err := s.render(content.Body, content.Summary, fields)
	if err != nil {
		return Detail{}, err
	}
	if len(fields) > 0 {
		return Detail{}, apperr.Validation(fields)
	}
	if !in.Visibility.CanCreate(in.OrganizationID, true, v.User) {
		if in.Visibility == domain.OrganizationOnly && in.OrganizationID != "" {
			return Detail{}, apperr.Forbidden("you cannot post ideas visible only to this organization")
		}
		return Detail{}, apperr.Validation(map[string]string{"organizationId": "does not match the visibility"})
	}

	// Benefits are frozen on the idea at creation: a later change of membership rewrites nothing.
	n := ports.NewIdea{
		AuthorID: v.ID(), SlugBase: domain.IdeaSlug(content.Title), Content: content, Rendered: rendered,
		Status: in.Status, Visibility: in.Visibility, OrganizationID: in.OrganizationID,
		RankingMultiplier: 1, KarmaMultiplier: 1, Now: now,
	}
	if m, ok := v.Benefit(); ok {
		n.BadgeOrganizationID = m.OrganizationID
		n.RankingMultiplier = m.Benefits.RankingMultiplier
		n.KarmaMultiplier = m.Benefits.KarmaMultiplier
	}

	var slug string
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		approved, err := s.repo.LockAuthor(ctx, v.ID())
		if err != nil {
			return fmt.Errorf("lock author: %w", err)
		}
		if !v.SkipPremoderation() {
			count, err := s.repo.CountCreatedSince(ctx, v.ID(), now.Add(-24*time.Hour))
			if err != nil {
				return fmt.Errorf("count recent ideas: %w", err)
			}
			if count >= domain.DailyLimit {
				return apperr.RateLimited("daily limit of new ideas reached")
			}
		}
		needCase := false
		n.Moderation, needCase = moderationFor(v, approved, in.Status)
		id, created, err := s.repo.Insert(ctx, n)
		if err != nil {
			return fmt.Errorf("insert idea: %w", err)
		}
		slug = created
		if needCase {
			if err := s.repo.OpenModerationCase(ctx, id); err != nil {
				return fmt.Errorf("open moderation case: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Get(ctx, v, slug)
}

// moderationFor decides the initial moderation state of an idea that is being
// published. A draft is not published and waits without a case.
func moderationFor(v viewer.Viewer, approvedIdeas int, status domain.Status) (state domain.Moderation, openCase bool) {
	switch {
	case status == domain.Draft:
		return domain.Pending, false
	case v.SkipPremoderation() || approvedIdeas >= domain.TrustedAfter:
		return domain.Approved, false
	default:
		return domain.Pending, true
	}
}

// render turns Markdown into stored HTML. An empty body is allowed and renders to nothing.
func (s *Service) render(body, summary string, fields map[string]string) (domain.Rendered, error) {
	if body == "" {
		return domain.Rendered{Story: markdown.Excerpt(summary, 400), TOC: []domain.TOCItem{}, ReadingMinutes: 1}, nil
	}
	res, err := markdown.Idea.Render(body)
	if err != nil {
		if f := apperr.FieldsOf(err); f != nil {
			for k, msg := range f {
				fields[k] = msg
			}
			return domain.Rendered{}, nil
		}
		return domain.Rendered{}, err
	}
	toc := make([]domain.TOCItem, len(res.TOC))
	for i, t := range res.TOC {
		toc[i] = domain.TOCItem{Depth: t.Depth, Text: t.Text, ID: t.ID}
	}
	story := markdown.Excerpt(res.Text, 400)
	if story == "" {
		story = markdown.Excerpt(summary, 400)
	}
	return domain.Rendered{HTML: res.HTML, Text: res.Text, Story: story, TOC: toc, ReadingMinutes: res.ReadingMinutes}, nil
}

// Patch is a partial edit; nil fields stay as they are.
type Patch struct {
	Title         *string
	Summary       *string
	Body          *string
	CoverURL      *string
	Category      *domain.Category
	Tags          *[]string
	EventDate     *time.Time
	EventPlace    *string
	EventCapacity *int
	NeedsRoles    *[]string
}

func (p Patch) empty() bool { return p == Patch{} }

func (p Patch) apply(c domain.Content) domain.Content {
	if p.Title != nil {
		c.Title = *p.Title
	}
	if p.Summary != nil {
		c.Summary = *p.Summary
	}
	if p.Body != nil {
		c.Body = *p.Body
	}
	if p.CoverURL != nil {
		c.CoverURL = *p.CoverURL
	}
	if p.Category != nil {
		c.Category = *p.Category
	}
	if p.Tags != nil {
		c.Tags = *p.Tags
	}
	if p.EventDate != nil {
		c.EventDate = p.EventDate
	}
	if p.EventPlace != nil {
		c.EventPlace = *p.EventPlace
	}
	if p.EventCapacity != nil {
		c.EventCapacity = p.EventCapacity
	}
	if p.NeedsRoles != nil {
		c.NeedsRoles = *p.NeedsRoles
	}
	return c
}

// Update edits an idea. Only the author and staff may; visibility and organization are fixed at creation.
func (s *Service) Update(ctx context.Context, v viewer.Viewer, slug string, p Patch) (Detail, error) {
	if err := requireAuth(v); err != nil {
		return Detail{}, err
	}
	if p.empty() {
		return Detail{}, apperr.Invalid("nothing to update")
	}
	now := s.now().UTC()
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		idea, err := s.loadForWrite(ctx, v, slug)
		if err != nil {
			return err
		}
		content := p.apply(idea.Content()).Normalize()
		// A past event date that was not touched must not block an edit of the text.
		dateChanged := p.EventDate != nil || p.Category != nil && *p.Category == domain.Event && idea.Category != domain.Event
		fields := content.Validate(now, dateChanged)
		rendered, err := s.render(content.Body, content.Summary, fields)
		if err != nil {
			return err
		}
		if len(fields) > 0 {
			return apperr.Validation(fields)
		}
		if err := s.repo.UpdateContent(ctx, idea.ID, content, rendered, now); err != nil {
			return fmt.Errorf("update idea: %w", err)
		}
		return nil
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Get(ctx, v, slug)
}

func (s *Service) loadForWrite(ctx context.Context, v viewer.Viewer, slug string) (domain.Idea, error) {
	idea, err := s.repo.BySlug(ctx, ports.AccessOf(v), slug, true)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.Idea{}, notFound()
	}
	if err != nil {
		return domain.Idea{}, fmt.Errorf("load idea: %w", err)
	}
	if !canManage(v, idea) {
		return domain.Idea{}, apperr.Forbidden("only the author or a moderator can change this idea")
	}
	return idea, nil
}

// Delete soft-deletes an idea.
func (s *Service) Delete(ctx context.Context, v viewer.Viewer, slug string) error {
	if err := requireAuth(v); err != nil {
		return err
	}
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		idea, err := s.loadForWrite(ctx, v, slug)
		if err != nil {
			return err
		}
		return s.repo.SoftDelete(ctx, idea.ID, s.now().UTC())
	})
}

// ChangeStatus moves an idea along its lifecycle. Leaving DRAFT publishes it, and
// publishing goes through the same moderation gate as creating a published idea.
func (s *Service) ChangeStatus(ctx context.Context, v viewer.Viewer, slug string, next domain.Status) error {
	if err := requireAuth(v); err != nil {
		return err
	}
	if !next.Valid() {
		return apperr.Validation(map[string]string{"status": "unknown status"})
	}
	now := s.now().UTC()
	return s.tx.WithinTx(ctx, func(ctx context.Context) error {
		idea, err := s.loadForWrite(ctx, v, slug)
		if err != nil {
			return err
		}
		if !idea.Status.CanMoveTo(next) {
			return apperr.Validation(map[string]string{"status": "a published idea cannot go back to draft"})
		}
		if next == idea.Status {
			return nil
		}
		moderation, openCase := idea.Moderation, false
		if idea.Status == domain.Draft {
			if fields := idea.Content().Normalize().Validate(now, true); len(fields) > 0 {
				return apperr.Validation(fields)
			}
			// Publishing: decide by the author's standing now, not by the viewer's (staff may publish for others).
			approved, err := s.repo.LockAuthor(ctx, idea.Author.ID)
			if err != nil {
				return fmt.Errorf("lock author: %w", err)
			}
			actor := v
			if v.ID() != idea.Author.ID {
				actor = viewer.Viewer{} // staff publishing someone's draft does not lend them staff privileges
			}
			moderation, openCase = moderationFor(actor, approved, next)
		}
		if err := s.repo.SetStatus(ctx, idea.ID, next, moderation, now); err != nil {
			return fmt.Errorf("set status: %w", err)
		}
		if openCase {
			if err := s.repo.OpenModerationCase(ctx, idea.ID); err != nil {
				return fmt.Errorf("open moderation case: %w", err)
			}
		}
		return nil
	})
}

// FeedQuery is a listing request as it arrives from the client.
type FeedQuery struct {
	Filter domain.Filter
	Cursor string
	Limit  int
}

var filterToken = regexp.MustCompile(`^[a-z0-9][a-z0-9._:-]{0,127}$`)

func (q FeedQuery) validate() (domain.Filter, error) {
	f := q.Filter
	fields := map[string]string{}
	if f.Sort == "" {
		f.Sort = domain.SortHot
	}
	if !f.Sort.Valid() {
		fields["sort"] = "must be hot, new or top"
	}
	if f.Category != "" && !f.Category.Valid() {
		fields["category"] = "unknown category"
	}
	if f.Status != "" && (!f.Status.Valid() || f.Status == domain.Draft) {
		fields["status"] = "unknown status"
	}
	if f.Tag != "" && !filterToken.MatchString(f.Tag) {
		fields["tag"] = "invalid tag"
	}
	if f.Campus != "" && !filterToken.MatchString(f.Campus) {
		fields["campus"] = "invalid campus"
	}
	if len(fields) > 0 {
		return f, apperr.Validation(fields)
	}
	return f, nil
}

// Feed lists ideas the viewer may see. Sorting by hot, new or top uses keyset
// pagination: the cursor is a signed position, never an offset.
func (s *Service) Feed(ctx context.Context, v viewer.Viewer, q FeedQuery) (Page, error) {
	f, err := q.validate()
	if err != nil {
		return Page{}, err
	}
	return s.list(ctx, v, f, q.Cursor, q.Limit)
}

// Mine lists the viewer's own ideas in every state, newest first.
func (s *Service) Mine(ctx context.Context, v viewer.Viewer, cursor string, limit int) (Page, error) {
	if err := requireAuth(v); err != nil {
		return Page{}, err
	}
	return s.list(ctx, v, domain.Filter{Sort: domain.SortNew, AuthorID: v.ID(), Mine: true}, cursor, limit)
}

// ByAuthor lists what the viewer may see of one person's ideas, newest first.
func (s *Service) ByAuthor(ctx context.Context, v viewer.Viewer, authorID string, limit int) ([]Item, error) {
	page, err := s.list(ctx, v, domain.Filter{Sort: domain.SortNew, AuthorID: authorID}, "", limit)
	return page.Items, err
}

// CountByAuthor counts what the viewer may see of one person's ideas.
func (s *Service) CountByAuthor(ctx context.Context, v viewer.Viewer, authorID string) (int, error) {
	n, err := s.repo.CountVisibleByAuthor(ctx, ports.AccessOf(v), authorID)
	if err != nil {
		return 0, fmt.Errorf("count ideas: %w", err)
	}
	return n, nil
}

func (s *Service) list(ctx context.Context, v viewer.Viewer, f domain.Filter, rawCursor string, limit int) (Page, error) {
	if limit <= 0 {
		limit = domain.DefaultLimit
	}
	limit = min(limit, domain.MaxFeedLimit)
	scope := scopeOf(f)
	after, err := s.cursor.decode(rawCursor, scope)
	if err != nil {
		return Page{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
	}
	ideas, err := s.repo.List(ctx, ports.AccessOf(v), f, after, limit+1)
	if err != nil {
		return Page{}, fmt.Errorf("list ideas: %w", err)
	}
	page := Page{}
	if len(ideas) > limit {
		ideas = ideas[:limit]
		last := ideas[len(ideas)-1]
		page.NextCursor = s.cursor.encode(scope, sortKey(f, last), last.ID)
	}
	page.Items, err = s.enrich(ctx, ideas)
	return page, err
}

// sortKey is the value the page was ordered by, in a form the repository can parse back.
func sortKey(f domain.Filter, i domain.Idea) string {
	switch f.Sort {
	case domain.SortTop:
		return strconv.Itoa(i.Votes)
	case domain.SortNew:
		if f.Mine {
			return strconv.FormatInt(i.CreatedAt.UnixMicro(), 10)
		}
		if i.PublishedAt != nil {
			return strconv.FormatInt(i.PublishedAt.UnixMicro(), 10)
		}
		return "0"
	default:
		return strconv.FormatFloat(i.HotScore, 'g', -1, 64)
	}
}

// Get returns one idea if the viewer may see it, with the viewer's own state on it.
func (s *Service) Get(ctx context.Context, v viewer.Viewer, slug string) (Detail, error) {
	idea, err := s.repo.BySlug(ctx, ports.AccessOf(v), slug, false)
	if errors.Is(err, domain.ErrNotFound) {
		return Detail{}, notFound()
	}
	if err != nil {
		return Detail{}, fmt.Errorf("load idea: %w", err)
	}
	items, err := s.enrich(ctx, []domain.Idea{idea})
	if err != nil {
		return Detail{}, err
	}
	d := Detail{Item: items[0], ExposeBody: canManage(v, idea), CanEdit: canManage(v, idea)}
	if v.Authenticated {
		if d.State, err = s.repo.ViewerState(ctx, idea.ID, v.ID()); err != nil {
			return Detail{}, fmt.Errorf("load viewer state: %w", err)
		}
	}
	return d, nil
}

// Next picks the idea to read after this one: the next older one, wrapping around.
func (s *Service) Next(ctx context.Context, v viewer.Viewer, slug string) (domain.Ref, error) {
	ref, err := s.repo.Next(ctx, ports.AccessOf(v), slug)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.Ref{}, notFound()
	}
	if err != nil {
		return domain.Ref{}, fmt.Errorf("next idea: %w", err)
	}
	return ref, nil
}

const maxEventRange = 366 * 24 * time.Hour

// Events lists events starting within [from, to).
func (s *Service) Events(ctx context.Context, v viewer.Viewer, from, to time.Time) ([]Item, error) {
	if from.IsZero() {
		from = s.now().UTC()
	}
	if to.IsZero() {
		to = from.Add(90 * 24 * time.Hour)
	}
	if !to.After(from) || to.Sub(from) > maxEventRange {
		return nil, apperr.Validation(map[string]string{"to": "must be after from, within one year"})
	}
	ideas, err := s.repo.Events(ctx, ports.AccessOf(v), from, to, 200)
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}
	return s.enrich(ctx, ideas)
}

// Sitemap lists public ideas for search engines.
func (s *Service) Sitemap(ctx context.Context) ([]ports.SitemapEntry, error) {
	entries, err := s.repo.Sitemap(ctx, 50_000)
	if err != nil {
		return nil, fmt.Errorf("sitemap: %w", err)
	}
	return entries, nil
}

// RecomputeHot is the periodic ranking job: age lowers every score even when nobody acts.
func (s *Service) RecomputeHot(ctx context.Context) (int64, error) {
	n, err := s.repo.RecomputeHot(ctx, s.now().UTC(), domain.HotWindow)
	if err != nil {
		return 0, fmt.Errorf("recompute hot: %w", err)
	}
	return n, nil
}

// enrich resolves authors' current badges and each idea's frozen organization mark.
func (s *Service) enrich(ctx context.Context, ideas []domain.Idea) ([]Item, error) {
	ids := make([]string, 0, len(ideas))
	seen := map[string]bool{}
	for _, i := range ideas {
		if !seen[i.Author.ID] {
			seen[i.Author.ID] = true
			ids = append(ids, i.Author.ID)
		}
	}
	badges := map[string]identity.Badge{}
	if len(ids) > 0 {
		var err error
		if badges, err = s.badges.BadgesFor(ctx, ids); err != nil {
			return nil, fmt.Errorf("resolve badges: %w", err)
		}
	}
	items := make([]Item, len(ideas))
	for n, i := range ideas {
		it := Item{Idea: i}
		if b, ok := badges[i.Author.ID]; ok {
			it.AuthorVerified = true
			it.AuthorCampus = &Campus{ID: b.OrganizationID, Label: b.Label}
		}
		if i.BadgeOrganizationID != "" && s.orgs != nil {
			if b, ok := s.orgs.Badge(i.BadgeOrganizationID); ok {
				it.Campus = &Campus{ID: b.OrganizationID, Label: b.Label}
			}
		}
		items[n] = it
	}
	return items, nil
}
