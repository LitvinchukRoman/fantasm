package domain_test

import (
	"math"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Книжковий клуб":            "knyzhkovyi-klub",
		"Подія: Хакатон 2026!":      "podiia-khakaton-2026",
		"  --Hello,   World--  ":    "hello-world",
		"Їжак і м'ята":              "izhak-i-miata",
		"日本語":                       "",
		"a/../b":                    "a-b",
		"<script>alert(1)</script>": "script-alert-1-script",
	}
	for in, want := range cases {
		if got := domain.Slugify(in, 60); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
	if got := domain.Slugify(strings.Repeat("abc ", 40), 20); len(got) > 20 || strings.HasSuffix(got, "-") {
		t.Errorf("long slug = %q", got)
	}
	if domain.IdeaSlug("日本語") != "idea" {
		t.Error("fallback slug")
	}
	if s := domain.WithSuffix("base"); !strings.HasPrefix(s, "base-") || len(s) != 10 {
		t.Errorf("suffix = %q", s)
	}
}

func valid() domain.Content {
	return domain.Content{Title: "Книжковий клуб", Summary: "Читаємо разом", Body: "# Привіт", Category: domain.Community}
}

func TestContentValidation(t *testing.T) {
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	past, future := now.Add(-time.Hour), now.Add(time.Hour)
	zero := 0
	tooMany := []string{"a", "b", "c", "d", "e", "f"}
	tests := []struct {
		name   string
		mutate func(*domain.Content)
		field  string
	}{
		{"ok", func(*domain.Content) {}, ""},
		{"short title", func(c *domain.Content) { c.Title = "ab" }, "title"},
		{"long title", func(c *domain.Content) { c.Title = strings.Repeat("я", 121) }, "title"},
		{"bidi title", func(c *domain.Content) { c.Title = "abc\u202Edef" }, "title"},
		{"long summary", func(c *domain.Content) { c.Summary = strings.Repeat("a", 281) }, "summary"},
		{"unknown category", func(c *domain.Content) { c.Category = "X" }, "category"},
		{"long body", func(c *domain.Content) { c.Body = strings.Repeat("a", 20_001) }, "body"},
		{"http cover", func(c *domain.Content) { c.CoverURL = "http://x.example/a.png" }, "coverUrl"},
		{"js cover", func(c *domain.Content) { c.CoverURL = "javascript:alert(1)" }, "coverUrl"},
		{"userinfo cover", func(c *domain.Content) { c.CoverURL = "https://a@x.example/a.png" }, "coverUrl"},
		{"https cover", func(c *domain.Content) { c.CoverURL = "https://x.example/a.png" }, ""},
		{"too many tags", func(c *domain.Content) { c.Tags = tooMany }, "tags"},
		{"empty slug tag", func(c *domain.Content) { c.Tags = []string{"!!!"} }, "tags"},
		{"too many roles", func(c *domain.Content) {
			c.NeedsRoles = []string{"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"}
		}, "needsRoles"},
		{"event without date", func(c *domain.Content) { c.Category = domain.Event }, "eventAt"},
		{"event in past", func(c *domain.Content) { c.Category = domain.Event; c.EventDate = &past }, "eventAt"},
		{"event in future", func(c *domain.Content) { c.Category = domain.Event; c.EventDate = &future }, ""},
		{"zero capacity", func(c *domain.Content) { c.EventCapacity = &zero }, "eventCapacity"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := valid()
			tt.mutate(&c)
			fields := c.Normalize().Validate(now, true)
			if tt.field == "" && len(fields) != 0 {
				t.Fatalf("unexpected errors: %v", fields)
			}
			if tt.field != "" {
				if _, ok := fields[tt.field]; !ok {
					t.Fatalf("expected error on %q, got %v", tt.field, fields)
				}
			}
		})
	}
	// An unchanged past event date stays valid on edits.
	c := valid()
	c.Category, c.EventDate = domain.Event, &past
	if f := c.Normalize().Validate(now, false); len(f) != 0 {
		t.Fatalf("edit of a past event rejected: %v", f)
	}
}

func TestNormalizeAndTags(t *testing.T) {
	c := domain.Content{Title: "  a   b  c ", Tags: []string{" Книжковий  клуб", "книжковий клуб", "", "Go"}, NeedsRoles: []string{"dev", " dev ", ""}}.Normalize()
	if c.Title != "a b c" || len(c.Tags) != 2 || len(c.NeedsRoles) != 1 {
		t.Fatalf("normalize: %+v", c)
	}
	tags := c.TagList()
	if len(tags) != 2 || tags[0].Slug != "knyzhkovyi-klub" || tags[0].Label != "Книжковий клуб" || tags[1].Slug != "go" {
		t.Fatalf("tags: %+v", tags)
	}
}

func TestHotScore(t *testing.T) {
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	got := domain.HotScore(10, 4, 2, now.Add(-10*time.Hour), now, 1.5)
	// Same inputs as SELECT idea_hot_score(10,4,2,now()-10h,1.5,now()).
	if math.Abs(got-0.5412658773652741) > 1e-9 {
		t.Fatalf("hot = %v", got)
	}
	if domain.HotScore(5, 0, 0, now.Add(time.Hour), now, 1) <= 0 {
		t.Fatal("future publication must not break the score")
	}
	if domain.HotScore(5, 0, 0, now.Add(-48*time.Hour), now, 1) >= domain.HotScore(5, 0, 0, now.Add(-time.Hour), now, 1) {
		t.Fatal("older idea must rank lower")
	}
}

func TestStatusTransitions(t *testing.T) {
	if !domain.Draft.CanMoveTo(domain.Open) || !domain.Open.CanMoveTo(domain.Done) || domain.Open.CanMoveTo(domain.Draft) || domain.Open.CanMoveTo("X") || !domain.Draft.CanMoveTo(domain.Draft) {
		t.Fatal("status transition rules")
	}
}
