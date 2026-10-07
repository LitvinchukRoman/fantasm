package regression_test

import (
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// walk follows nextCursor from path until it runs out and returns the keys of
// every item in order. key picks the identifying field of an item.
func walk(t *testing.T, c *apptest.Client, path, key string, limit int) []string {
	t.Helper()
	sep := "?"
	if strings.Contains(path, "?") {
		sep = "&"
	}
	var out []string
	cursor := ""
	for page := 0; page < 200; page++ {
		q := path + sep + "limit=" + fmt.Sprint(limit)
		if cursor != "" {
			q += "&cursor=" + url.QueryEscape(cursor)
		}
		r := c.Do(http.MethodGet, q, nil)
		if r.Code != http.StatusOK {
			t.Fatalf("GET %s: %d %s", q, r.Code, r.Body)
		}
		var res struct {
			Items      []map[string]any
			NextCursor *string
		}
		r.Decode(&res)
		if len(res.Items) > limit {
			t.Fatalf("GET %s returned %d items for limit %d", q, len(res.Items), limit)
		}
		if len(res.Items) == 0 && res.NextCursor != nil {
			t.Fatalf("GET %s: an empty page that promises another", q)
		}
		for _, it := range res.Items {
			out = append(out, fmt.Sprint(it[key]))
		}
		if res.NextCursor == nil {
			return out
		}
		cursor = *res.NextCursor
	}
	t.Fatalf("%s never ended", path)
	return nil
}

func TestEveryListPagesWithoutGapsOrRepeats(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	authors := crowd(env, 6)

	// 24 ideas with ties in every sort key, so the tie-breaker is what keeps the order total.
	var slugs []string
	for i := range 24 {
		sl, id := idea(t, env, authors[i%len(authors)], map[string]any{"title": fmt.Sprintf("Paging idea %02d", i), "summary": "s"})
		env.Exec(`UPDATE ideas SET votes_weighted = $2::int, hot_score = $2::int::float8 / 2 WHERE id = $1`, id, i%4)
		slugs = append(slugs, sl)
	}
	env.Exec(`UPDATE ideas SET published_at = date_trunc('hour', published_at), created_at = date_trunc('hour', created_at)`) // many equal timestamps
	sort.Strings(slugs)

	for _, sortBy := range []string{"new", "hot", "top"} {
		whole := walk(t, who.Anon, "/api/ideas?sort="+sortBy, "slug", 50)
		if len(whole) != len(slugs) {
			t.Fatalf("%s: one page holds %d of %d", sortBy, len(whole), len(slugs))
		}
		for _, limit := range []int{1, 2, 5, 7, 23, 24, 25} {
			got := walk(t, who.Anon, "/api/ideas?sort="+sortBy, "slug", limit)
			if strings.Join(got, ",") != strings.Join(whole, ",") {
				t.Errorf("sort=%s limit=%d: paging gives another order than one big page\n got  %v\n want %v", sortBy, limit, got, whole)
			}
			seen := map[string]bool{}
			for _, s := range got {
				if seen[s] {
					t.Errorf("sort=%s limit=%d: %s appears twice", sortBy, limit, s)
				}
				seen[s] = true
			}
		}
	}

	// Personal lists page the same way.
	mine := walk(t, who.Anon, "/api/ideas?sort=new", "slug", 50)
	if got := walk(t, authors[0], "/api/me/ideas", "slug", 3); len(got) != 4 {
		t.Errorf("/api/me/ideas paged %d ideas, want 4: %v (of %d public)", len(got), got, len(mine))
	}

	// Notifications: one per vote on an idea of the author's.
	slug, _ := idea(t, env, who.Member, map[string]any{"title": "Notified idea", "summary": "s"})
	for _, v := range append(authors, who.Third, who.Outsider, who.Mod, who.Admin) {
		v.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)
	}
	all := walk(t, who.Member, "/api/me/notifications", "id", 50)
	if len(all) != 10 {
		t.Fatalf("%d notifications, want 10", len(all))
	}
	for _, limit := range []int{1, 3, 4, 9, 10} {
		if got := walk(t, who.Member, "/api/me/notifications", "id", limit); strings.Join(got, ",") != strings.Join(all, ",") {
			t.Errorf("notifications limit=%d: %v, want %v", limit, got, all)
		}
	}

	// Staff queue.
	for i := range 6 {
		who.Third.Do(http.MethodPost, "/api/ideas", map[string]any{"title": fmt.Sprintf("Waiting idea %d", i), "summary": "s", "category": "PROJECT"})
		env.Exec(`UPDATE ideas SET created_at = created_at - interval '3 days' WHERE author_id = (SELECT id FROM users WHERE email = $1)`, thirdMail)
	}
	queue := walk(t, who.Mod, "/api/moderation/queue", "slug", 50)
	if len(queue) != 6 {
		t.Fatalf("queue holds %d, want 6", len(queue))
	}
	for _, limit := range []int{1, 2, 4} {
		if got := walk(t, who.Mod, "/api/moderation/queue", "slug", limit); strings.Join(got, ",") != strings.Join(queue, ",") {
			t.Errorf("queue limit=%d: %v, want %v", limit, got, queue)
		}
	}
}

func TestPagingWhileTheListChanges(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	authors := crowd(env, 6)
	var first []string
	for i := range 18 {
		sl, _ := idea(t, env, authors[i%len(authors)], map[string]any{"title": fmt.Sprintf("Moving idea %02d", i), "summary": "s"})
		first = append(first, sl)
	}
	// Read the first page, then new ideas arrive and an old one is deleted before the next page is read.
	r := who.Anon.Do(http.MethodGet, "/api/ideas?sort=new&limit=6", nil)
	var page struct {
		Items      []struct{ Slug string }
		NextCursor *string
	}
	r.Decode(&page)
	if page.NextCursor == nil || len(page.Items) != 6 {
		t.Fatalf("first page: %s", r.Body)
	}
	seen := map[string]bool{}
	for _, it := range page.Items {
		seen[it.Slug] = true
	}
	for i := range 4 {
		idea(t, env, who.Third, map[string]any{"title": fmt.Sprintf("Latecomer %d", i), "summary": "s"})
	}
	var victim string
	for _, s := range first {
		if !seen[s] {
			victim = s
			break
		}
	}
	env.Exec(`UPDATE ideas SET deleted_at = now() WHERE slug = $1`, victim)

	cursor := *page.NextCursor
	for range 20 {
		var p struct {
			Items      []struct{ Slug string }
			NextCursor *string
		}
		who.Anon.Do(http.MethodGet, "/api/ideas?sort=new&limit=6&cursor="+url.QueryEscape(cursor), nil).Decode(&p)
		for _, it := range p.Items {
			if seen[it.Slug] {
				t.Errorf("%s was served twice after the list changed", it.Slug)
			}
			if it.Slug == victim {
				t.Errorf("a deleted idea was served from a later page")
			}
			seen[it.Slug] = true
		}
		if p.NextCursor == nil {
			break
		}
		cursor = *p.NextCursor
	}
	// Everything that existed when paging began and still exists was seen exactly once.
	for _, s := range first {
		if s != victim && !seen[s] {
			t.Errorf("%s was skipped", s)
		}
	}
}

func TestCursorsAreSignedBoundAndMalleabilityProof(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	for i := range 6 {
		idea(t, env, who.Member, map[string]any{"title": fmt.Sprintf("Cursor idea %d", i), "summary": "s"})
		env.Exec(`UPDATE ideas SET created_at = created_at - interval '3 days'`)
	}
	var page struct{ NextCursor *string }
	who.Anon.Do(http.MethodGet, "/api/ideas?sort=new&limit=2", nil).Decode(&page)
	if page.NextCursor == nil {
		t.Fatal("no cursor")
	}
	good := *page.NextCursor
	if r := who.Anon.Do(http.MethodGet, "/api/ideas?sort=new&limit=2&cursor="+url.QueryEscape(good), nil); r.Code != http.StatusOK {
		t.Fatalf("the genuine cursor: %d", r.Code)
	}
	// Anyone may use a public cursor, so it carries no identity; but it belongs to one listing only.
	staffPaths := map[string]*apptest.Client{
		"another list":    who.Member,
		"the staff queue": who.Mod,
	}
	for name, c := range staffPaths {
		path := "/api/me/notifications"
		if name == "the staff queue" {
			path = "/api/moderation/queue"
		}
		if r := c.Do(http.MethodGet, path+"?limit=2&cursor="+url.QueryEscape(good), nil); r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest {
			t.Errorf("a feed cursor on %s: %d, want a client error", name, r.Code)
		}
	}
	bad := map[string]string{
		"another sort":       "/api/ideas?sort=top&limit=2&cursor=" + url.QueryEscape(good),
		"one char changed":   "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(flip(good)),
		"truncated":          "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(good[:len(good)-4]),
		"extended":           "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(good+"AAAA"),
		"line break inside":  "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(good[:10]+"\n"+good[10:]),
		"padding added":      "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(good+"="),
		"standard alphabet":  "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(strings.NewReplacer("-", "+", "_", "/").Replace(good)+"+/"),
		"plain text":         "/api/ideas?sort=new&limit=2&cursor=hello",
		"a number":           "/api/ideas?sort=new&limit=2&cursor=12345",
		"sql":                "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape("' OR 1=1 --"),
		"huge":               "/api/ideas?sort=new&limit=2&cursor=" + strings.Repeat("A", 100000),
		"empty parts":        "/api/ideas?sort=new&limit=2&cursor=Lg.Lg.Lg",
		"two cursors, first": "/api/ideas?sort=new&limit=2&cursor=" + url.QueryEscape(flip(good)) + "&cursor=" + url.QueryEscape(good),
	}
	for name, path := range bad {
		r := who.Anon.Do(http.MethodGet, path, nil)
		switch {
		case r.Code >= 500:
			t.Errorf("%s: %d", name, r.Code)
		case r.Code == http.StatusOK && name != "huge" && name != "two cursors, first":
			t.Errorf("%s was accepted", name)
		case r.Code != http.StatusOK && r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest && r.Code != 431 && r.Code != http.StatusRequestURITooLong:
			t.Errorf("%s: %d", name, r.Code)
		}
	}
}

func flip(s string) string {
	b := []byte(s)
	i := len(b) / 2
	if b[i] == 'A' {
		b[i] = 'B'
	} else {
		b[i] = 'A'
	}
	return string(b)
}

func TestLimitsOnLists(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	authors := crowd(env, 12)
	for i := range 60 {
		idea(t, env, authors[i%len(authors)], map[string]any{"title": fmt.Sprintf("Bulk idea %02d", i), "summary": "s"})
	}
	size := func(q string) (int, int) {
		r := who.Anon.Do(http.MethodGet, "/api/ideas"+q, nil)
		var p struct{ Items []any }
		r.Decode(&p)
		return r.Code, len(p.Items)
	}
	if code, n := size(""); code != 200 || n != 20 {
		t.Errorf("default page: %d with %d items, want 20", code, n)
	}
	if code, n := size("?limit=50"); code != 200 || n != 50 {
		t.Errorf("max page: %d with %d items", code, n)
	}
	// Numbers outside the range are clamped, as documented; things that are not numbers are refused.
	for q, want := range map[string]int{"?limit=0": 1, "?limit=-1": 1, "?limit=51": 50, "?limit=1000000": 50, "?limit=%2B5": 5, "?limit=007": 7} {
		if code, n := size(q); code != 200 || n != want {
			t.Errorf("%s: %d with %d items, want %d", q, code, n, want)
		}
	}
	for _, q := range []string{"?limit=abc", "?limit=1.5", "?limit=1e2", "?limit=0x10", "?limit=%00", "?limit=99999999999999999999", "?limit=%20", "?limit=1%0a"} {
		if code, _ := size(q); code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", q, code)
		}
	}
	for _, q := range []string{"?sort=", "?sort=random", "?sort=hot;drop", "?category=NOPE", "?status=NOPE", "?sort=new&sort=top"} {
		if code, _ := size(q); code >= 500 {
			t.Errorf("%s: %d", q, code)
		}
	}
}
