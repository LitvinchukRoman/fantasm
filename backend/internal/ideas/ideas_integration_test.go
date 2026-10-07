package ideas_test

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

type idea struct {
	Slug       string `json:"slug"`
	Title      string `json:"title"`
	Story      string `json:"story"`
	Status     string `json:"status"`
	Moderation string `json:"moderation"`
	Visibility string `json:"visibility"`
	Campus     *struct {
		ID    string `json:"id"`
		Label string `json:"label"`
	} `json:"campus"`
	Author struct {
		Handle   string `json:"handle"`
		Verified bool   `json:"verified"`
	} `json:"author"`
	Tags []struct {
		Slug  string `json:"slug"`
		Label string `json:"label"`
	} `json:"tags"`
	HTML    string  `json:"html"`
	Body    *string `json:"body"`
	CanEdit bool    `json:"canEdit"`
}

type page struct {
	Items      []idea  `json:"items"`
	NextCursor *string `json:"nextCursor"`
}

const (
	member  = "anna@ukma.edu.ua"  // organization member: skips premoderation
	outside = "boris@example.com" // no organization
	third   = "clara@example.com"
)

func create(t *testing.T, c *apptest.Client, body map[string]any) (*apptest.Response, idea) {
	t.Helper()
	if _, ok := body["category"]; !ok {
		body["category"] = "PROJECT"
	}
	r := c.Do(http.MethodPost, "/api/ideas", body)
	var i idea
	if r.Code == http.StatusCreated {
		r.Decode(&i)
	}
	return r, i
}

func mustCreate(t *testing.T, c *apptest.Client, body map[string]any) idea {
	t.Helper()
	r, i := create(t, c, body)
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	return i
}

func feed(t *testing.T, c *apptest.Client, query string) page {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/ideas"+query, nil)
	if r.Code != http.StatusOK {
		t.Fatalf("feed %s: %d %s", query, r.Code, r.Body)
	}
	var p page
	r.Decode(&p)
	return p
}

func slugs(p page) []string {
	out := make([]string, len(p.Items))
	for i, it := range p.Items {
		out[i] = it.Slug
	}
	return out
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func TestIdeaLifecycleAndModeration(t *testing.T) {
	env := apptest.New(t)
	anna, boris, anon := env.SignIn(member), env.SignIn(outside), env.Anon()

	// A member of an organization with skipPremoderation goes live at once.
	live := mustCreate(t, anna, map[string]any{"title": "Книжковий клуб", "summary": "Читаємо разом", "body": "# Привіт\n\nТекст.", "tags": []string{"Книжковий клуб", "book-club"}})
	if live.Moderation != "APPROVED" || live.Slug != "knyzhkovyi-klub" || !live.Author.Verified || live.Campus == nil || live.Campus.Label != "Могилянка" {
		t.Fatalf("member idea: %+v", live)
	}
	if len(live.Tags) != 2 || live.Tags[1].Slug != "knyzhkovyi-klub" && live.Tags[0].Slug != "knyzhkovyi-klub" {
		t.Fatalf("tags: %+v", live.Tags)
	}
	if live.Body == nil || !live.CanEdit {
		t.Fatal("the author must get the Markdown source back")
	}

	// Anyone else waits for a moderator and the idea is invisible until then.
	pending := mustCreate(t, boris, map[string]any{"title": "Ідея від новачка", "summary": "s"})
	if pending.Moderation != "PENDING" {
		t.Fatalf("newcomer idea moderation = %s", pending.Moderation)
	}
	if cases := apptest.Scalar[int](env, `SELECT count(*) FROM moderation_cases WHERE state = 'OPEN'`); cases != 1 {
		t.Fatalf("open moderation cases = %d", cases)
	}
	for name, c := range map[string]*apptest.Client{"anon": anon, "other user": env.SignIn(third), "member": anna} {
		if r := c.Do(http.MethodGet, "/api/ideas/"+pending.Slug, nil); r.Code != http.StatusNotFound {
			t.Errorf("%s sees a pending idea: %d", name, r.Code)
		}
		if got := slugs(feed(t, c, "")); contains(got, pending.Slug) {
			t.Errorf("%s feed leaks a pending idea", name)
		}
	}
	if r := boris.Do(http.MethodGet, "/api/ideas/"+pending.Slug, nil); r.Code != http.StatusOK {
		t.Fatalf("author cannot read own pending idea: %d", r.Code)
	}
	var mine page
	boris.Do(http.MethodGet, "/api/me/ideas", nil).Decode(&mine)
	if len(mine.Items) != 1 || mine.Items[0].Moderation != "PENDING" {
		t.Fatalf("my ideas: %+v", mine)
	}

	// The public listing and the anonymous view do not carry the Markdown source.
	var view idea
	anon.Do(http.MethodGet, "/api/ideas/"+live.Slug, nil).Decode(&view)
	if view.Body != nil || view.CanEdit || !strings.Contains(view.HTML, "<h1") {
		t.Fatalf("anonymous view: body=%v canEdit=%v html=%q", view.Body, view.CanEdit, view.HTML)
	}

	// Once approved (a moderator's decision, simulated) it appears, and the trigger stamps publication.
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, pending.Slug)
	if got := slugs(feed(t, anon, "")); !contains(got, pending.Slug) {
		t.Fatalf("approved idea missing from feed: %v", got)
	}
	if apptest.Scalar[bool](env, `SELECT published_at IS NOT NULL FROM ideas WHERE slug = $1`, pending.Slug) == false {
		t.Fatal("published_at was not set on approval")
	}
}

func TestHiddenContentLooksAbsent(t *testing.T) {
	env := apptest.New(t)
	boris, anon := env.SignIn(outside), env.Anon()
	pending := mustCreate(t, boris, map[string]any{"title": "Secret pending", "summary": "s"})

	strip := regexp.MustCompile(`,?"requestId":"[^"]*"`)
	hidden := anon.Do(http.MethodGet, "/api/ideas/"+pending.Slug, nil)
	absent := anon.Do(http.MethodGet, "/api/ideas/no-such-idea", nil)
	malformed := anon.Do(http.MethodGet, "/api/ideas/NOT%20A%20SLUG", nil)
	for _, r := range []*apptest.Response{hidden, absent, malformed} {
		if r.Code != http.StatusNotFound {
			t.Fatalf("status = %d", r.Code)
		}
	}
	if a, b := strip.ReplaceAllString(string(hidden.Body), ""), strip.ReplaceAllString(string(absent.Body), ""); a != b {
		t.Fatalf("hidden and absent differ:\n%s\n%s", a, b)
	}
	// Mutating a hidden idea must not reveal it either.
	other := env.SignIn(third)
	if r := other.Do(http.MethodPatch, "/api/ideas/"+pending.Slug, map[string]any{"title": "hijack"}); r.Code != http.StatusNotFound {
		t.Fatalf("patching a hidden idea: %d", r.Code)
	}
	if r := other.Do(http.MethodDelete, "/api/ideas/"+pending.Slug, nil); r.Code != http.StatusNotFound {
		t.Fatalf("deleting a hidden idea: %d", r.Code)
	}
}

func TestOrganizationVisibility(t *testing.T) {
	env := apptest.New(t)
	anna, boris, anon := env.SignIn(member), env.SignIn(outside), env.Anon()

	internal := mustCreate(t, anna, map[string]any{"title": "Internal only", "summary": "s", "visibility": "ORGANIZATION_ONLY", "organizationId": "naukma"})
	if internal.Visibility != "ORGANIZATION_ONLY" {
		t.Fatalf("visibility = %s", internal.Visibility)
	}
	members := mustCreate(t, anna, map[string]any{"title": "For signed in", "summary": "s", "visibility": "MEMBERS_ONLY"})

	check := func(name string, c *apptest.Client, slug string, want int) {
		t.Helper()
		if r := c.Do(http.MethodGet, "/api/ideas/"+slug, nil); r.Code != want {
			t.Errorf("%s GET %s = %d, want %d", name, slug, r.Code, want)
		}
		in := contains(slugs(feed(t, c, "")), slug)
		if in != (want == http.StatusOK) {
			t.Errorf("%s feed contains %s = %v", name, slug, in)
		}
	}
	check("anon", anon, internal.Slug, 404)
	check("outsider", boris, internal.Slug, 404)
	check("member", anna, internal.Slug, 200)
	check("anon", anon, members.Slug, 404)
	check("outsider", boris, members.Slug, 200)

	// Creating into an organization needs the capability, and the id must match the visibility.
	if r, _ := create(t, boris, map[string]any{"title": "Fake internal", "visibility": "ORGANIZATION_ONLY", "organizationId": "naukma"}); r.Code != http.StatusForbidden {
		t.Errorf("outsider posting to organization: %d %s", r.Code, r.Body)
	}
	if r, _ := create(t, anna, map[string]any{"title": "Public with org", "visibility": "PUBLIC", "organizationId": "naukma"}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("organization with public visibility: %d %s", r.Code, r.Body)
	}
	if r, _ := create(t, anna, map[string]any{"title": "Org without id", "visibility": "ORGANIZATION_ONLY"}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("organization visibility without id: %d %s", r.Code, r.Body)
	}
	// A cursor never widens what the viewer can see.
	if got := slugs(feed(t, anon, "?limit=1")); contains(got, internal.Slug) {
		t.Fatal("anonymous page 1 leaks")
	}
}

func TestFeedKeysetPagination(t *testing.T) {
	env := apptest.New(t)
	anna, anon := env.SignIn(member), env.Anon()
	const total = 7
	want := map[string]bool{}
	for i := 0; i < total; i++ {
		it := mustCreate(t, anna, map[string]any{"title": fmt.Sprintf("Idea number %d", i), "summary": "s", "tags": []string{"go"}})
		want[it.Slug] = true
		// Distinct weights so that every sort has a stable, interesting order.
		env.Exec(`UPDATE ideas SET votes_weighted = $2::int, hot_score = $2::int::float8 / 3 WHERE slug = $1`, it.Slug, i%3)
	}

	for _, sort := range []string{"hot", "new", "top"} {
		seen := map[string]bool{}
		var order []string
		cursor := ""
		for pages := 0; pages < 10; pages++ {
			q := "?limit=3&sort=" + sort
			if cursor != "" {
				q += "&cursor=" + cursor
			}
			p := feed(t, anon, q)
			for _, it := range p.Items {
				if seen[it.Slug] {
					t.Fatalf("%s: %s appeared twice", sort, it.Slug)
				}
				seen[it.Slug] = true
				order = append(order, it.Slug)
			}
			if p.NextCursor == nil {
				break
			}
			cursor = *p.NextCursor
		}
		if len(seen) != total {
			t.Fatalf("%s: saw %d of %d ideas: %v", sort, len(seen), total, order)
		}
	}

	// Filters narrow the listing; unknown values are rejected, not ignored.
	if got := feed(t, anon, "?tag=go"); len(got.Items) != total {
		t.Errorf("tag filter: %d", len(got.Items))
	}
	if got := feed(t, anon, "?tag=nope"); len(got.Items) != 0 {
		t.Errorf("unknown tag: %d", len(got.Items))
	}
	if got := feed(t, anon, "?campus=naukma"); len(got.Items) != total {
		t.Errorf("campus filter: %d", len(got.Items))
	}
	for _, q := range []string{"?sort=random", "?category=NOPE", "?limit=abc", "?tag=A%27%3B--", "?cursor=garbage"} {
		if r := anon.Do(http.MethodGet, "/api/ideas"+q, nil); r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d, want 4xx validation", q, r.Code)
		}
	}

	// Out-of-range limits are clamped, never passed to the database as they are.
	if got := feed(t, anon, "?limit=1000"); len(got.Items) != total {
		t.Errorf("clamped limit returned %d items", len(got.Items))
	}
	if got := feed(t, anon, "?limit=-5"); len(got.Items) != 1 {
		t.Errorf("negative limit returned %d items", len(got.Items))
	}

	// A cursor is signed and bound to the listing it came from.
	first := feed(t, anon, "?limit=2&sort=hot")
	if first.NextCursor == nil {
		t.Fatal("expected a next cursor")
	}
	tampered := *first.NextCursor
	tampered = tampered[:5] + "x" + tampered[6:]
	for name, q := range map[string]string{
		"tampered":    "?sort=hot&cursor=" + tampered,
		"other sort":  "?sort=new&cursor=" + *first.NextCursor,
		"other facet": "?sort=hot&category=EVENT&cursor=" + *first.NextCursor,
	} {
		if r := anon.Do(http.MethodGet, "/api/ideas"+q, nil); r.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s cursor accepted: %d", name, r.Code)
		}
	}
}

func TestMarkdownIsSanitizedAndInputIsValidated(t *testing.T) {
	env := apptest.New(t)
	anna := env.SignIn(member)

	// Schemes and images we do not allow are refused outright, not silently rewritten.
	for name, body := range map[string]string{
		"javascript link": "[x](javascript:alert(1))",
		"data link":       "[x](data:text/html;base64,PHNjcmlwdD4=)",
		"http image":      "![p](http://insecure.example/a.png)",
	} {
		if r, _ := create(t, anna, map[string]any{"title": "Attack " + name, "summary": "s", "body": body}); r.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s accepted: %d %s", name, r.Code, r.Body)
		}
	}
	// Raw HTML is dropped by the renderer and cannot come back through the sanitizer.
	evil := "# Title\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href=\"javascript:alert(1)\">x</a>\n\n[ok](https://example.com)"
	it := mustCreate(t, anna, map[string]any{"title": "<b>bold</b> title", "summary": "s", "body": evil})
	lower := strings.ToLower(it.HTML)
	for _, bad := range []string{"<script", "javascript:", "onerror", "<img"} {
		if strings.Contains(lower, bad) {
			t.Errorf("html contains %q: %s", bad, it.HTML)
		}
	}
	if !strings.Contains(it.HTML, `href="https://example.com"`) || !strings.Contains(it.HTML, "nofollow") {
		t.Errorf("legitimate link lost or not nofollow: %s", it.HTML)
	}
	// Titles are plain text: stored verbatim and always JSON-encoded, never rendered as HTML.
	if it.Title != "<b>bold</b> title" {
		t.Errorf("title altered: %q", it.Title)
	}

	bad := []struct {
		name string
		body map[string]any
	}{
		{"empty title", map[string]any{"title": ""}},
		{"huge title", map[string]any{"title": strings.Repeat("x", 121)}},
		{"bad category", map[string]any{"title": "ok title", "category": "HACK"}},
		{"bad cover", map[string]any{"title": "ok title", "coverUrl": "javascript:alert(1)"}},
		{"too many tags", map[string]any{"title": "ok title", "tags": []string{"a", "b", "c", "d", "e", "f"}}},
		{"event without date", map[string]any{"title": "ok title", "category": "EVENT"}},
		{"event in the past", map[string]any{"title": "ok title", "category": "EVENT", "eventAt": time.Now().Add(-time.Hour).Format(time.RFC3339)}},
		{"sql in category", map[string]any{"title": "ok title", "category": "PROJECT'; DROP TABLE ideas;--"}},
		{"bad status", map[string]any{"title": "ok title", "status": "DONE"}},
	}
	for _, tt := range bad {
		if r, _ := create(t, anna, tt.body); r.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s: %d %s", tt.name, r.Code, r.Body)
		}
	}
	if r := anna.Do(http.MethodPost, "/api/ideas", `{"title":"ok title","category":"PROJECT","isAdmin":true}`); r.Code != http.StatusBadRequest {
		t.Errorf("unknown field accepted: %d", r.Code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas", `{"title":"a"}{"title":"b"}`); r.Code != http.StatusBadRequest {
		t.Errorf("two documents accepted: %d", r.Code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas", `not json`); r.Code != http.StatusBadRequest {
		t.Errorf("garbage accepted: %d", r.Code)
	}
	// The table survived the injection attempt.
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM ideas`); n != 1 {
		t.Fatalf("ideas rows = %d", n)
	}
}

func TestWritesRequireSessionAndOrigin(t *testing.T) {
	env := apptest.New(t)
	anna, anon := env.SignIn(member), env.Anon()
	body := map[string]any{"title": "Needs login", "category": "PROJECT"}

	if r := anon.Do(http.MethodPost, "/api/ideas", body); r.Code != http.StatusUnauthorized {
		t.Errorf("anonymous create: %d", r.Code)
	}
	// A signed-in browser tab on another site: cookie present, Origin foreign.
	for name, h := range map[string]map[string]string{
		"foreign origin":   {"Origin": "https://evil.example"},
		"cross-site fetch": {"Sec-Fetch-Site": "cross-site", "Origin": apptest.Origin},
		"no origin":        {},
		"null origin":      {"Origin": "null"},
	} {
		if r := anna.DoWith(http.MethodPost, "/api/ideas", body, h); r.Code != http.StatusForbidden {
			t.Errorf("%s: %d %s", name, r.Code, r.Body)
		}
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM ideas`); n != 0 {
		t.Fatalf("a rejected request created %d ideas", n)
	}
	if r := anna.DoWith(http.MethodPost, "/api/ideas", body, map[string]string{"Sec-Fetch-Site": "same-origin"}); r.Code != http.StatusCreated {
		t.Errorf("same-origin fetch: %d %s", r.Code, r.Body)
	}
}

func TestUpdateDeleteAndStatus(t *testing.T) {
	env := apptest.New(t)
	anna, boris := env.SignIn(member), env.SignIn(outside)
	it := mustCreate(t, anna, map[string]any{"title": "Original title", "summary": "s", "body": "text", "tags": []string{"a"}})

	if r := boris.Do(http.MethodPatch, "/api/ideas/"+it.Slug, map[string]any{"title": "Stolen title"}); r.Code != http.StatusForbidden {
		t.Errorf("stranger edits: %d", r.Code)
	}
	if r := boris.Do(http.MethodDelete, "/api/ideas/"+it.Slug, nil); r.Code != http.StatusForbidden {
		t.Errorf("stranger deletes: %d", r.Code)
	}
	if r := boris.Do(http.MethodPost, "/api/ideas/"+it.Slug+"/status", map[string]any{"status": "DONE"}); r.Code != http.StatusForbidden {
		t.Errorf("stranger changes status: %d", r.Code)
	}

	r := anna.Do(http.MethodPatch, "/api/ideas/"+it.Slug, map[string]any{"title": "New title", "tags": []string{"b", "c"}, "body": "## Section\n\nmore"})
	var updated idea
	r.Decode(&updated)
	if r.Code != http.StatusOK || updated.Title != "New title" || updated.Slug != it.Slug || len(updated.Tags) != 2 || !strings.Contains(updated.HTML, "Section") {
		t.Fatalf("update: %d %s", r.Code, r.Body)
	}
	if r := anna.Do(http.MethodPatch, "/api/ideas/"+it.Slug, map[string]any{}); r.Code != http.StatusBadRequest {
		t.Errorf("empty patch: %d", r.Code)
	}
	if r := anna.Do(http.MethodPatch, "/api/ideas/"+it.Slug, map[string]any{"title": "x"}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("invalid patch accepted: %d", r.Code)
	}

	if r := anna.Do(http.MethodPost, "/api/ideas/"+it.Slug+"/status", map[string]any{"status": "TEAM_FORMING"}); r.Code != http.StatusOK {
		t.Errorf("status change: %d %s", r.Code, r.Body)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+it.Slug+"/status", map[string]any{"status": "DRAFT"}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("published idea went back to draft: %d", r.Code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+it.Slug+"/status", map[string]any{"status": "bogus"}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("bogus status: %d", r.Code)
	}

	if r := anna.Do(http.MethodDelete, "/api/ideas/"+it.Slug, nil); r.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	for _, c := range []*apptest.Client{anna, boris, env.Anon()} {
		if r := c.Do(http.MethodGet, "/api/ideas/"+it.Slug, nil); r.Code != http.StatusNotFound {
			t.Errorf("deleted idea still readable: %d", r.Code)
		}
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM ideas WHERE deleted_at IS NOT NULL`); n != 1 {
		t.Errorf("soft delete rows = %d", n)
	}
}

func TestDraftPublishingGoesThroughModeration(t *testing.T) {
	env := apptest.New(t)
	boris, anon := env.SignIn(outside), env.Anon()
	draft := mustCreate(t, boris, map[string]any{"title": "Work in progress", "summary": "s", "status": "DRAFT"})
	if draft.Status != "DRAFT" {
		t.Fatalf("status = %s", draft.Status)
	}
	if cases := apptest.Scalar[int](env, `SELECT count(*) FROM moderation_cases`); cases != 0 {
		t.Fatalf("a draft opened %d moderation cases", cases)
	}
	if contains(slugs(feed(t, anon, "")), draft.Slug) {
		t.Fatal("draft in feed")
	}
	if r := boris.Do(http.MethodPost, "/api/ideas/"+draft.Slug+"/status", map[string]any{"status": "OPEN"}); r.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", r.Code, r.Body)
	}
	if got := apptest.Scalar[string](env, `SELECT moderation_state FROM ideas WHERE slug = $1`, draft.Slug); got != "PENDING" {
		t.Fatalf("published draft moderation = %s", got)
	}
	if cases := apptest.Scalar[int](env, `SELECT count(*) FROM moderation_cases WHERE state = 'OPEN'`); cases != 1 {
		t.Fatalf("publishing opened %d cases", cases)
	}

	// A trusted author (three approved ideas) skips the queue.
	env.Exec(`UPDATE users SET approved_ideas = 3 WHERE email = $1`, outside)
	trusted := mustCreate(t, boris, map[string]any{"title": "Trusted author idea", "summary": "s"})
	if trusted.Moderation != "APPROVED" {
		t.Fatalf("trusted author moderation = %s", trusted.Moderation)
	}
}

func TestDailyLimitAndSlugCollisions(t *testing.T) {
	env := apptest.New(t)
	boris, anna := env.SignIn(outside), env.SignIn(member)

	seen := map[string]bool{}
	for i := 0; i < 5; i++ {
		it := mustCreate(t, boris, map[string]any{"title": "Same title", "summary": "s"})
		if seen[it.Slug] {
			t.Fatalf("slug %q reused", it.Slug)
		}
		seen[it.Slug] = true
	}
	r, _ := create(t, boris, map[string]any{"title": "One too many", "summary": "s"})
	if r.Code != http.StatusTooManyRequests {
		t.Fatalf("6th idea in a day: %d %s", r.Code, r.Body)
	}
	// Deleting does not buy more quota.
	var mine page
	boris.Do(http.MethodGet, "/api/me/ideas", nil).Decode(&mine)
	boris.Do(http.MethodDelete, "/api/ideas/"+mine.Items[0].Slug, nil)
	if r, _ := create(t, boris, map[string]any{"title": "Still too many"}); r.Code != http.StatusTooManyRequests {
		t.Fatalf("delete-and-repost bypassed the limit: %d", r.Code)
	}
	// Members who skip premoderation are not rate limited this way.
	for i := 0; i < 6; i++ {
		mustCreate(t, anna, map[string]any{"title": fmt.Sprintf("Member idea %d", i)})
	}
}

func TestEventsNextSitemapAndProfile(t *testing.T) {
	env := apptest.New(t)
	anna, boris, anon := env.SignIn(member), env.SignIn(outside), env.Anon()

	soon := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	ev := mustCreate(t, anna, map[string]any{"title": "Hackathon", "category": "EVENT", "eventAt": soon, "eventLocation": "Library", "eventCapacity": 50, "needsRoles": []string{"Designer", "Go dev"}})
	mustCreate(t, anna, map[string]any{"title": "Regular idea", "summary": "s"})
	mustCreate(t, anna, map[string]any{"title": "Members only idea", "visibility": "MEMBERS_ONLY"})
	mustCreate(t, boris, map[string]any{"title": "Still pending", "summary": "s"})

	var events struct{ Items []idea }
	anon.Do(http.MethodGet, "/api/events", nil).Decode(&events)
	if len(events.Items) != 1 || events.Items[0].Slug != ev.Slug {
		t.Fatalf("events: %+v", events)
	}
	if r := anon.Do(http.MethodGet, "/api/events?from=yesterday", nil); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("bad from: %d", r.Code)
	}
	if r := anon.Do(http.MethodGet, "/api/events?from=2026-01-01T00:00:00Z&to=2030-01-01T00:00:00Z", nil); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("huge range: %d", r.Code)
	}

	var sitemap struct{ Items []struct{ Slug string } }
	r := anon.Do(http.MethodGet, "/api/sitemap/ideas", nil)
	r.Decode(&sitemap)
	if len(sitemap.Items) != 2 || !strings.Contains(r.Header.Get("Cache-Control"), "public") {
		t.Fatalf("sitemap lists only public approved ideas: %s %v", r.Body, r.Header)
	}

	next := anon.Do(http.MethodGet, "/api/ideas/"+ev.Slug+"/next", nil)
	var ref struct{ Slug string }
	next.Decode(&ref)
	if next.Code != http.StatusOK || ref.Slug == "" || ref.Slug == ev.Slug {
		t.Fatalf("next: %d %s", next.Code, next.Body)
	}
	if r := anon.Do(http.MethodGet, "/api/ideas/missing-idea/next", nil); r.Code != http.StatusNotFound {
		t.Errorf("next of a missing idea: %d", r.Code)
	}

	// Public profile: no e-mail, only what the viewer may see of the person's ideas.
	handle := apptest.Scalar[string](env, `SELECT handle FROM users WHERE email = $1`, member)
	pr := anon.Do(http.MethodGet, "/api/users/"+handle, nil)
	var profile struct {
		Handle     string
		Verified   bool
		IdeasCount int
		Ideas      []idea
	}
	pr.Decode(&profile)
	if pr.Code != http.StatusOK || profile.Handle != handle || !profile.Verified || profile.IdeasCount != 2 || len(profile.Ideas) != 2 {
		t.Fatalf("profile: %d %s", pr.Code, pr.Body)
	}
	if strings.Contains(string(pr.Body), "ukma.edu.ua") || strings.Contains(string(pr.Body), "email") {
		t.Fatalf("profile leaks the e-mail address: %s", pr.Body)
	}
	if r := anon.Do(http.MethodGet, "/api/users/ghost_user", nil); r.Code != http.StatusNotFound {
		t.Errorf("unknown user: %d", r.Code)
	}
	if r := anon.Do(http.MethodGet, "/api/users/Bad%20Handle", nil); r.Code != http.StatusNotFound {
		t.Errorf("malformed handle: %d", r.Code)
	}
}

func TestHotScoreJobMatchesSQLFunction(t *testing.T) {
	env := apptest.New(t)
	anna := env.SignIn(member)
	it := mustCreate(t, anna, map[string]any{"title": "Ranked idea", "summary": "s"})
	env.Exec(`UPDATE ideas SET votes_weighted = 10, comments_count = 4, joins_count = 2, ranking_multiplier = 1.5, published_at = now() - interval '10 hours' WHERE slug = $1`, it.Slug)
	old := mustCreate(t, anna, map[string]any{"title": "Ancient idea", "summary": "s"})
	env.Exec(`UPDATE ideas SET votes_weighted = 100, hot_score = 5, published_at = now() - interval '40 days' WHERE slug = $1`, old.Slug)

	for _, job := range env.Jobs {
		if err := job(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	got := apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE slug = $1`, it.Slug)
	if got < 0.54 || got > 0.55 {
		t.Fatalf("hot_score = %v, want about 0.5413", got)
	}
	if stale := apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE slug = $1`, old.Slug); stale != 0 {
		t.Fatalf("idea past the ranking window keeps score %v", stale)
	}
}
