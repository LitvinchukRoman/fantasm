// Package domain holds the rules of an idea that need no database and no HTTP.
package domain

import (
	"math"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type Category string

const (
	Startup      Category = "STARTUP"
	Project      Category = "PROJECT"
	Event        Category = "EVENT"
	Community    Category = "COMMUNITY"
	Volunteering Category = "VOLUNTEERING"
	Other        Category = "OTHER"
)

func (c Category) Valid() bool {
	switch c {
	case Startup, Project, Event, Community, Volunteering, Other:
		return true
	}
	return false
}

type Status string

const (
	Draft       Status = "DRAFT"
	Open        Status = "OPEN"
	TeamForming Status = "TEAM_FORMING"
	InProgress  Status = "IN_PROGRESS"
	Done        Status = "DONE"
	Archived    Status = "ARCHIVED"
)

func (s Status) Valid() bool {
	switch s {
	case Draft, Open, TeamForming, InProgress, Done, Archived:
		return true
	}
	return false
}

// CanMoveTo reports whether an idea in status s may be set to next. A published
// idea never goes back to draft: people have already voted and read it.
func (s Status) CanMoveTo(next Status) bool {
	if !next.Valid() {
		return false
	}
	return next != Draft || s == Draft
}

type Moderation string

const (
	Pending  Moderation = "PENDING"
	Approved Moderation = "APPROVED"
	Hidden   Moderation = "HIDDEN"
	Rejected Moderation = "REJECTED"
)

func (m Moderation) Valid() bool {
	switch m {
	case Pending, Approved, Hidden, Rejected:
		return true
	}
	return false
}

const (
	TitleMin       = 3
	TitleMax       = 120
	SummaryMax     = 280
	BodyMax        = 20_000
	CoverMax       = 500
	PlaceMax       = 200
	MaxTags        = 5
	TagMax         = 40
	MaxRoles       = 10
	RoleMax        = 40
	MaxCapacity    = 100_000
	DailyLimit     = 5
	TrustedAfter   = 3
	MaxFeedLimit   = 50
	DefaultLimit   = 20
	HotWindow      = 30 * 24 * time.Hour
	SystemTagBooks = "book-club"
)

type Tag struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

// Content is what an author writes. Create and Update both validate a Content,
// so the rules cannot drift apart.
type Content struct {
	Title         string
	Summary       string
	Body          string
	CoverURL      string
	Category      Category
	Tags          []string // labels as typed; Normalize derives slugs
	EventDate     *time.Time
	EventPlace    string
	EventCapacity *int
	NeedsRoles    []string
}

// Normalize trims input and drops what is certainly noise. It never rejects.
func (c Content) Normalize() Content {
	c.Title = collapseSpaces(c.Title)
	c.Summary = collapseSpaces(c.Summary)
	c.Body = strings.TrimSpace(strings.ReplaceAll(c.Body, "\r\n", "\n"))
	c.CoverURL = strings.TrimSpace(c.CoverURL)
	c.EventPlace = collapseSpaces(c.EventPlace)
	c.Tags = uniqueTrimmed(c.Tags, true)
	c.NeedsRoles = uniqueTrimmed(c.NeedsRoles, false)
	return c
}

// Validate checks a normalized Content. checkEventFuture is true when the event date is new or changed.
func (c Content) Validate(now time.Time, checkEventFuture bool) map[string]string {
	fields := map[string]string{}
	if n := utf8.RuneCountInString(c.Title); n < TitleMin || n > TitleMax {
		fields["title"] = "must be 3 to 120 characters"
	} else if hasControl(c.Title, false) {
		fields["title"] = "must not contain control characters"
	}
	if utf8.RuneCountInString(c.Summary) > SummaryMax {
		fields["summary"] = "must be at most 280 characters"
	} else if hasControl(c.Summary, false) {
		fields["summary"] = "must not contain control characters"
	}
	if !c.Category.Valid() {
		fields["category"] = "unknown category"
	}
	if utf8.RuneCountInString(c.Body) > BodyMax {
		fields["body"] = "must be at most 20000 characters"
	}
	if c.CoverURL != "" && !validHTTPSURL(c.CoverURL, CoverMax) {
		fields["coverUrl"] = "must be an https URL of at most 500 characters"
	}
	if len(c.Tags) > MaxTags {
		fields["tags"] = "at most 5 tags"
	} else {
		for _, t := range c.Tags {
			if utf8.RuneCountInString(t) > TagMax || hasControl(t, false) || Slugify(t, TagMax) == "" {
				fields["tags"] = "each tag must be 1 to 40 characters with letters or digits"
				break
			}
		}
	}
	if len(c.NeedsRoles) > MaxRoles {
		fields["needsRoles"] = "at most 10 roles"
	} else {
		for _, r := range c.NeedsRoles {
			if utf8.RuneCountInString(r) > RoleMax || hasControl(r, false) {
				fields["needsRoles"] = "each role must be 1 to 40 characters"
				break
			}
		}
	}
	if utf8.RuneCountInString(c.EventPlace) > PlaceMax || hasControl(c.EventPlace, false) {
		fields["eventLocation"] = "must be at most 200 characters"
	}
	if c.EventCapacity != nil && (*c.EventCapacity < 1 || *c.EventCapacity > MaxCapacity) {
		fields["eventCapacity"] = "must be between 1 and 100000"
	}
	if c.Category == Event {
		switch {
		case c.EventDate == nil:
			fields["eventAt"] = "an event needs a date"
		case checkEventFuture && !c.EventDate.After(now):
			fields["eventAt"] = "must be in the future"
		}
	}
	return fields
}

// TagList turns labels into stored tags, dropping duplicates that collapse to one slug.
func (c Content) TagList() []Tag {
	seen := map[string]bool{}
	tags := make([]Tag, 0, len(c.Tags))
	for _, label := range c.Tags {
		slug := Slugify(label, TagMax)
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		tags = append(tags, Tag{Slug: slug, Label: label})
	}
	return tags
}

func collapseSpaces(s string) string { return strings.Join(strings.Fields(s), " ") }

func uniqueTrimmed(in []string, foldCase bool) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, s := range in {
		s = collapseSpaces(s)
		key := s
		if foldCase {
			key = strings.ToLower(s)
		}
		if s == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, s)
	}
	return out
}

func hasControl(s string, allowNewlines bool) bool {
	for _, r := range s {
		if unicode.IsControl(r) && !(allowNewlines && (r == '\n' || r == '\t')) {
			return true
		}
		// Bidi overrides and zero-width characters make titles look like something they are not.
		if r >= 0x202A && r <= 0x202E || r >= 0x2066 && r <= 0x2069 || r == 0x200B || r == 0x200E || r == 0x200F || r == 0xFEFF {
			return true
		}
	}
	return false
}

func validHTTPSURL(raw string, max int) bool {
	if len(raw) > max || hasControl(raw, false) {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}

// HotScore is the feed ranking: votes weigh 1, comments 0.5, joins 1.5, damped by
// age so that every idea eventually sinks. since is the publication time.
func HotScore(weightedVotes, comments, joins int, since, now time.Time, multiplier float64) float64 {
	age := math.Max(now.Sub(since).Hours(), 0)
	return (float64(weightedVotes) + 0.5*float64(comments) + 1.5*float64(joins)) * multiplier / math.Pow(age+2, 1.5)
}
