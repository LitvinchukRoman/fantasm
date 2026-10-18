package domain

import (
	"testing"
	"time"
)

func TestVisitorRotatesAtMidnightAndHidesTheAddress(t *testing.T) {
	secret := "test-secret-test-secret-test-secret!"
	day := time.Date(2026, 10, 18, 15, 0, 0, 0, Kyiv)
	a := Visitor(secret, day, "203.0.113.8", "Mozilla/5.0")
	b := Visitor(secret, day.Add(3*time.Hour), "203.0.113.8", "Mozilla/5.0")
	next := Visitor(secret, day.Add(24*time.Hour), "203.0.113.8", "Mozilla/5.0")
	other := Visitor(secret, day, "203.0.113.9", "Mozilla/5.0")
	if a != b {
		t.Fatal("the same visitor changed within a Kyiv day")
	}
	if a == next || a == other {
		t.Fatal("a new day or a new address must not collide")
	}
	if len(a) != 64 || a == "203.0.113.8" {
		t.Fatalf("hash = %q", a)
	}
}

func TestPatternCollapsesSlugsAndRejectsJunk(t *testing.T) {
	pattern, slug := Pattern("/ideas/a-good-idea")
	if pattern != "/ideas/:slug" || slug != "a-good-idea" {
		t.Fatalf("idea: %q %q", pattern, slug)
	}
	if p, _ := Pattern("/u/anna"); p != "/u/:handle" {
		t.Fatalf("profile: %q", p)
	}
	if p, _ := Pattern("/ideas"); p != "/ideas" {
		t.Fatalf("feed: %q", p)
	}
	if p, _ := Pattern("/campus/map"); p != "/:hub/:slug" {
		t.Fatalf("article: %q", p)
	}
	for _, bad := range []string{"", "ideas", "/../etc/passwd", "/ideas?x=1", "/a/b/c", "https://evil.example/"} {
		if p, _ := Pattern(bad); p != "" && bad != "/a/b/c" {
			t.Fatalf("%q became %q", bad, p)
		}
	}
	if p, _ := Pattern("/a/b/c"); p != "/other" {
		t.Fatalf("deep path: %q", p)
	}
}

func TestBotAndProps(t *testing.T) {
	if !Bot("Mozilla/5.0 (compatible; Googlebot/2.1)") || Bot("Mozilla/5.0") || Bot("") {
		t.Fatal("bot classification")
	}
	props, ok := CleanProps(PageView, map[string]string{"referrer": "https://news.example/a?q=1", "utm_source": "poster"})
	if !ok || props["referrer"] != "news.example" || props["utm_source"] != "poster" {
		t.Fatalf("page props: ok=%v %#v", ok, props)
	}
	if _, ok := CleanProps(UIClick, map[string]string{"target": "steal"}); ok {
		t.Fatal("unknown click target was accepted")
	}
	if _, ok := CleanProps(FeedFilter, map[string]string{"sort": "new", "note": "hello"}); ok {
		t.Fatal("an undeclared prop was accepted")
	}
}
