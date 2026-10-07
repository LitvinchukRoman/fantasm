package discussion_test

import (
	"bytes"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
)

const (
	member  = "anna@ukma.edu.ua"
	outside = "boris@example.com"
	third   = "carol@example.com"
)

type post struct {
	ID     string
	Author struct {
		Handle   string
		Verified bool
	}
	HTML      string
	Text      string
	Deleted   bool
	UpdatedAt *string
	Replies   []post
}

type thread struct {
	ID       string
	IdeaSlug string
	Count    int
	Posts    []post
}

func publish(t *testing.T, env *apptest.Env, c *apptest.Client) string {
	t.Helper()
	r := c.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Discuss me", "summary": "s", "category": "PROJECT"})
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	slug := r.Map()["slug"].(string)
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, slug)
	return slug
}

func add(t *testing.T, c *apptest.Client, slug, body, parent string) post {
	t.Helper()
	req := map[string]any{"body": body}
	if parent != "" {
		req["parentId"] = parent
	}
	r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", req)
	if r.Code != http.StatusCreated {
		t.Fatalf("post: %d %s", r.Code, r.Body)
	}
	var p post
	r.Decode(&p)
	return p
}

func get(t *testing.T, c *apptest.Client, slug string) thread {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil)
	if r.Code != http.StatusOK {
		t.Fatalf("thread: %d %s", r.Code, r.Body)
	}
	var th thread
	r.Decode(&th)
	return th
}

func TestThreadTreeCountersAndNotifications(t *testing.T) {
	env := apptest.New(t)
	anna, boris, carol, anon := env.SignIn(member), env.SignIn(outside), env.SignIn(third), env.Anon()
	slug := publish(t, env, boris)

	if th := get(t, anon, slug); th.Count != 0 || len(th.Posts) != 0 || th.IdeaSlug != slug || th.ID == "" {
		t.Fatalf("empty thread: %+v", th)
	}
	if r := anon.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "hi"}); r.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous post: %d", r.Code)
	}

	root := add(t, anna, slug, "First **bold** comment", "")
	if !strings.Contains(root.HTML, "<strong>bold</strong>") || !root.Author.Verified {
		t.Fatalf("root: %+v", root)
	}
	reply := add(t, carol, slug, "A reply", root.ID)
	add(t, boris, slug, "Reply to the reply", reply.ID)

	th := get(t, anon, slug)
	if th.Count != 3 || len(th.Posts) != 1 || len(th.Posts[0].Replies) != 1 || len(th.Posts[0].Replies[0].Replies) != 1 {
		t.Fatalf("tree: %+v", th)
	}
	if got := apptest.Scalar[int](env, `SELECT comments_count FROM ideas WHERE slug = $1`, slug); got != 3 {
		t.Fatalf("comments_count = %d", got)
	}
	if score := apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE slug = $1`, slug); score <= 0 {
		t.Fatalf("hot_score not refreshed: %v", score)
	}

	// Boris (idea author) hears about anna's and carol's posts; his own reply notifies nobody about himself.
	// Anna (parent author) hears about carol's reply and boris' deeper reply goes to carol and the idea author (self, skipped).
	count := func(email string) int {
		return apptest.Scalar[int](env, `SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = 'COMMENT'`, email)
	}
	if count(outside) != 2 || count(member) != 1 || count(third) != 1 {
		t.Fatalf("notifications boris=%d anna=%d carol=%d", count(outside), count(member), count(third))
	}

	// Unknown, foreign or malformed parents are rejected, not attached somewhere else.
	other := publish(t, env, anna)
	foreign := add(t, boris, other, "elsewhere", "")
	for _, parent := range []string{foreign.ID, "00000000-0000-0000-0000-000000000000", "nope"} {
		r := carol.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "x", "parentId": parent})
		if r.Code != http.StatusUnprocessableEntity {
			t.Errorf("parent %q: %d %s", parent, r.Code, r.Body)
		}
	}
}

func TestPostsAreSanitizedAndBounded(t *testing.T) {
	env := apptest.New(t)
	boris := env.SignIn(outside)
	slug := publish(t, env, boris)

	p := add(t, boris, slug, "<script>alert(1)</script> hello <img src=x onerror=alert(1)> [x](https://ok.example)", "")
	for _, bad := range []string{"<script", "onerror", "<img"} {
		if strings.Contains(p.HTML, bad) {
			t.Errorf("html still contains %q: %s", bad, p.HTML)
		}
	}
	for _, body := range []string{"", "   ", "[x](javascript:alert(1))", "![i](https://e.example/i.png)", strings.Repeat("a", 5001)} {
		if r := boris.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": body}); r.Code != http.StatusUnprocessableEntity {
			t.Errorf("body %.20q: %d", body, r.Code)
		}
	}
	if r := boris.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "x", "extra": 1}); r.Code != http.StatusBadRequest {
		t.Errorf("unknown field: %d", r.Code)
	}
}

func TestDepthIsCapped(t *testing.T) {
	env := apptest.New(t)
	boris := env.SignIn(outside)
	slug := publish(t, env, boris)
	parent := ""
	for i := 0; i < 12; i++ {
		parent = add(t, boris, slug, fmt.Sprintf("level %d", i), parent).ID
	}
	if max := apptest.Scalar[int](env, `SELECT max(depth) FROM posts`); max != 8 {
		t.Fatalf("max depth = %d", max)
	}
	if th := get(t, boris, slug); th.Count != 12 {
		t.Fatalf("count = %d", th.Count)
	}
}

func TestEditAndDeleteRules(t *testing.T) {
	env := apptest.New(t)
	anna, boris, carol := env.SignIn(member), env.SignIn(outside), env.SignIn(third)
	env.Exec(`UPDATE users SET role = 'MODERATOR' WHERE email = $1`, member)
	staff := env.SignIn(member)
	slug := publish(t, env, boris)
	_ = anna

	p := add(t, carol, slug, "original", "")
	child := add(t, boris, slug, "child", p.ID)

	// Only the author may edit.
	if r := boris.Do(http.MethodPatch, "/api/posts/"+p.ID, map[string]any{"body": "hijack"}); r.Code != http.StatusForbidden {
		t.Errorf("foreign edit: %d", r.Code)
	}
	r := carol.Do(http.MethodPatch, "/api/posts/"+p.ID, map[string]any{"body": "edited"})
	var edited post
	r.Decode(&edited)
	if r.Code != http.StatusOK || edited.Text != "edited" || edited.UpdatedAt == nil {
		t.Fatalf("edit: %d %s", r.Code, r.Body)
	}
	// ...and only inside the window.
	env.Exec(`UPDATE posts SET created_at = now() - interval '16 minutes' WHERE id = $1`, p.ID)
	if r := carol.Do(http.MethodPatch, "/api/posts/"+p.ID, map[string]any{"body": "late"}); r.Code != http.StatusForbidden {
		t.Errorf("late edit: %d", r.Code)
	}

	// Strangers cannot delete; the author and staff can; deleting twice is harmless.
	if r := boris.Do(http.MethodDelete, "/api/posts/"+p.ID, nil); r.Code != http.StatusForbidden {
		t.Errorf("foreign delete: %d", r.Code)
	}
	if r := carol.Do(http.MethodDelete, "/api/posts/"+p.ID, nil); r.Code != http.StatusNoContent {
		t.Errorf("own delete: %d", r.Code)
	}
	if r := carol.Do(http.MethodDelete, "/api/posts/"+p.ID, nil); r.Code != http.StatusNoContent {
		t.Errorf("repeat delete: %d", r.Code)
	}
	if got := apptest.Scalar[int](env, `SELECT comments_count FROM ideas WHERE slug = $1`, slug); got != 1 {
		t.Fatalf("comments_count after delete = %d", got)
	}
	if r := carol.Do(http.MethodPatch, "/api/posts/"+p.ID, map[string]any{"body": "zombie"}); r.Code != http.StatusNotFound {
		t.Errorf("edit deleted: %d", r.Code)
	}

	// The tombstone keeps the reply attached but leaks nothing.
	th := get(t, boris, slug)
	if len(th.Posts) != 1 || !th.Posts[0].Deleted || th.Posts[0].HTML != "" || th.Posts[0].Text != "" || th.Posts[0].Author.Handle != "" || len(th.Posts[0].Replies) != 1 || th.Count != 1 {
		t.Fatalf("tombstone: %+v", th)
	}
	if r := carol.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "to a ghost", "parentId": p.ID}); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("reply to deleted: %d", r.Code)
	}

	if r := staff.Do(http.MethodDelete, "/api/posts/"+child.ID, nil); r.Code != http.StatusNoContent {
		t.Errorf("staff delete: %d %s", r.Code, r.Body)
	}
	if got := apptest.Scalar[int](env, `SELECT comments_count FROM ideas WHERE slug = $1`, slug); got != 0 {
		t.Fatalf("comments_count = %d", got)
	}
	if r := carol.Do(http.MethodDelete, "/api/posts/not-a-uuid", nil); r.Code != http.StatusNotFound {
		t.Errorf("bad id: %d", r.Code)
	}
}

func TestHiddenIdeaThreadIsNotFound(t *testing.T) {
	env := apptest.New(t)
	boris, carol, anon := env.SignIn(outside), env.SignIn(third), env.Anon()
	slug := publish(t, env, boris)
	p := add(t, carol, slug, "visible for now", "")
	env.Exec(`UPDATE ideas SET moderation_state = 'HIDDEN' WHERE slug = $1`, slug)

	// Hidden looks exactly like absent for everyone but the author.
	missing := anon.Do(http.MethodGet, "/api/ideas/no-such-idea/thread", nil)
	strip := func(b []byte) string { return string(b[:bytes.Index(b, []byte(`"requestId"`))]) }
	r := anon.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil)
	if r.Code != http.StatusNotFound || strip(r.Body) != strip(missing.Body) {
		t.Errorf("hidden thread for anonymous: %d %s", r.Code, r.Body)
	}
	for _, c := range []*apptest.Client{carol} {
		r := c.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil)
		if r.Code != http.StatusNotFound || strip(r.Body) != strip(missing.Body) {
			t.Errorf("hidden thread: %d %s", r.Code, r.Body)
		}
		if r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "x"}); r.Code != http.StatusNotFound {
			t.Errorf("post to hidden: %d", r.Code)
		}
		if r := c.Do(http.MethodDelete, "/api/posts/"+p.ID, nil); r.Code != http.StatusNotFound {
			t.Errorf("delete in hidden: %d", r.Code)
		}
	}
	if r := boris.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil); r.Code != http.StatusOK {
		t.Errorf("author sees own hidden thread: %d", r.Code)
	}
	if r := boris.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "x"}); r.Code != http.StatusNotFound {
		t.Errorf("author posting into hidden thread: %d", r.Code)
	}
}

func TestPostRateLimit(t *testing.T) {
	env := apptest.New(t, apptest.WithConfig(func(c *config.Config) { c.RateLimitPostsPerMin = 3 }))
	boris := env.SignIn(outside)
	slug := publish(t, env, boris)
	var codes []int
	for i := 0; i < 5; i++ {
		codes = append(codes, boris.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "spam"}).Code)
	}
	if fmt.Sprint(codes) != "[201 201 201 429 429]" {
		t.Fatalf("codes = %v", codes)
	}
}
