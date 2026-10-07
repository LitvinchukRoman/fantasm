package regression_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

type notification struct {
	Type    string
	Read    bool
	Payload map[string]any
}

func inbox(t *testing.T, c *apptest.Client, query string) (items []notification, unread int) {
	t.Helper()
	var res struct {
		Items  []notification
		Unread int
	}
	r := c.Do(http.MethodGet, "/api/me/notifications"+query, nil)
	if r.Code != http.StatusOK {
		t.Fatalf("notifications: %d %s", r.Code, r.Body)
	}
	r.Decode(&res)
	return res.Items, res.Unread
}

func types(items []notification) map[string]int {
	out := map[string]int{}
	for _, n := range items {
		out[n.Type]++
	}
	return out
}

type reply struct {
	ID      string
	Deleted bool
	Text    string
	Replies []reply
}

func thread(t *testing.T, c *apptest.Client, slug string) (posts []reply, n int) {
	t.Helper()
	var res struct {
		Count int
		Posts []reply
	}
	r := c.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil)
	if r.Code != http.StatusOK {
		t.Fatalf("thread: %d %s", r.Code, r.Body)
	}
	r.Decode(&res)
	return res.Posts, res.Count
}

// TestJourneyOfAnIdea walks one idea through its whole life as several people
// would, across every context: identity, ideas, moderation, engagement,
// discussion and notifications. It is the test that notices when two parts
// stop agreeing with each other.
func TestJourneyOfAnIdea(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)

	// Providers are advertised, and nothing private is open before signing in.
	if r := who.Anon.Do(http.MethodGet, "/api/auth/providers", nil); r.Code != http.StatusOK {
		t.Fatalf("providers: %d", r.Code)
	}
	if r := who.Anon.Do(http.MethodGet, "/api/me", nil); r.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous /api/me: %d", r.Code)
	}

	// Boris makes himself a profile and posts an idea. He is not a member, so it waits for a moderator.
	if r := who.Outsider.Do(http.MethodPatch, "/api/me", map[string]any{"handle": "boris", "name": "Boris", "bio": "builds things"}); r.Code != http.StatusOK {
		t.Fatalf("profile: %d %s", r.Code, r.Body)
	}
	r := who.Outsider.Do(http.MethodPost, "/api/ideas", map[string]any{
		"title": "Open-source campus map", "summary": "A map of the campus built by students", "body": "# Plan\n\nWe will **map** every building.",
		"category": "PROJECT", "tags": []string{"maps", "open-source"}, "needsRoles": []string{"designer", "developer"},
	})
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	slug := r.Map()["slug"].(string)
	id := apptest.Scalar[string](env, `SELECT id FROM ideas WHERE slug = $1`, slug)

	if code := who.Anon.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusNotFound {
		t.Fatalf("a pending idea is public: %d", code)
	}
	if code := who.Outsider.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusOK {
		t.Fatalf("the author cannot see their own pending idea: %d", code)
	}
	if code := who.Third.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil).Code; code != http.StatusNotFound {
		t.Fatalf("voting on a pending idea: %d", code)
	}

	// A moderator approves it; from then on it is public and its author is told.
	var q struct {
		Items []struct{ Slug, State string }
	}
	who.Mod.Do(http.MethodGet, "/api/moderation/queue", nil).Decode(&q)
	if len(q.Items) != 1 || q.Items[0].Slug != slug {
		t.Fatalf("queue: %+v", q)
	}
	if r := decide(who.Mod, id, "APPROVED", ""); r.Code != http.StatusNoContent && r.Code != http.StatusOK {
		t.Fatalf("approve: %d %s", r.Code, r.Body)
	}
	if code := who.Anon.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusOK {
		t.Fatalf("approved idea is not public: %d", code)
	}
	var feed struct{ Items []struct{ Slug string } }
	who.Anon.Do(http.MethodGet, "/api/ideas", nil).Decode(&feed)
	if len(feed.Items) != 1 || feed.Items[0].Slug != slug {
		t.Fatalf("feed: %+v", feed)
	}
	if got, _ := inbox(t, who.Outsider, ""); types(got)["APPROVED"] != 1 {
		t.Errorf("the author was not told about the approval: %v", types(got))
	}
	if n := count(env, `SELECT approved_ideas FROM users WHERE email = $1`, outsiderMail); n != 1 {
		t.Errorf("approved_ideas = %d", n)
	}

	// Votes from a member (weighted) and an outsider.
	if r := who.Member.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusOK {
		t.Fatalf("member vote: %d %s", r.Code, r.Body)
	}
	if r := who.Third.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusOK {
		t.Fatalf("vote: %d %s", r.Code, r.Body)
	}
	if got := count(env, `SELECT votes_weighted FROM ideas WHERE id = $1`, id); got != 4 {
		t.Errorf("votes_weighted = %d, want 3 (member) + 1", got)
	}
	var detail struct {
		Votes  int
		Viewer struct{ Voted bool }
	}
	who.Third.Do(http.MethodGet, "/api/ideas/"+slug, nil).Decode(&detail)
	if !detail.Viewer.Voted || detail.Votes != 4 {
		t.Errorf("detail as the voter: %+v", detail)
	}

	// A discussion with a reply, edited and partly deleted.
	first := comment(t, who.Third, slug, "Great idea, I can help with **design**", "")
	answer := comment(t, who.Outsider, slug, "Welcome aboard!", first)
	posts, n := thread(t, who.Anon, slug)
	if n != 2 || len(posts) != 1 || posts[0].ID != first || len(posts[0].Replies) != 1 || posts[0].Replies[0].ID != answer {
		t.Fatalf("thread: %d %+v", n, posts)
	}
	if r := who.Third.Do(http.MethodPatch, "/api/posts/"+first, map[string]any{"body": "Great idea, I can help with design"}); r.Code != http.StatusOK {
		t.Fatalf("edit comment: %d %s", r.Code, r.Body)
	}
	if r := who.Member.Do(http.MethodPatch, "/api/posts/"+first, map[string]any{"body": "hijack"}); r.Code == http.StatusOK {
		t.Error("someone else edited a comment")
	}
	if r := who.Third.Do(http.MethodDelete, "/api/posts/"+first, nil); r.Code != http.StatusNoContent && r.Code != http.StatusOK {
		t.Fatalf("delete comment: %d %s", r.Code, r.Body)
	}
	posts, n = thread(t, who.Anon, slug)
	if n != 1 || len(posts) != 1 || !posts[0].Deleted || posts[0].Text != "" || len(posts[0].Replies) != 1 {
		t.Errorf("a deleted comment must stay as a gap with its replies intact and its text gone: %d %+v", n, posts)
	}

	// Joining, and the author's decision.
	if r := who.Third.Do(http.MethodPut, "/api/ideas/"+slug+"/participation", map[string]any{"state": "JOINED", "role": "designer"}); r.Code != http.StatusOK {
		t.Fatalf("join: %d %s", r.Code, r.Body)
	}
	if r := who.Third.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+apptestHandle(env, thirdMail)+"/accept", nil); r.Code == http.StatusOK {
		t.Error("a participant accepted themselves")
	}
	if r := who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+apptestHandle(env, thirdMail)+"/accept", nil); r.Code != http.StatusOK {
		t.Fatalf("accept: %d %s", r.Code, r.Body)
	}
	if got, _ := inbox(t, who.Third, ""); types(got)["ACCEPTED"] != 1 {
		t.Errorf("the participant was not told: %v", types(got))
	}
	if got := count(env, `SELECT joins_count FROM ideas WHERE id = $1`, id); got != 1 {
		t.Errorf("joins_count = %d", got)
	}

	// The author edits the idea and moves it along.
	if r := who.Outsider.Do(http.MethodPatch, "/api/ideas/"+slug, map[string]any{"summary": "Now with a **roadmap**"}); r.Code != http.StatusOK {
		t.Fatalf("edit: %d %s", r.Code, r.Body)
	}
	if r := who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/status", map[string]any{"status": "IN_PROGRESS"}); r.Code != http.StatusOK && r.Code != http.StatusNoContent {
		t.Fatalf("status: %d %s", r.Code, r.Body)
	}
	if r := who.Third.Do(http.MethodPatch, "/api/ideas/"+slug, map[string]any{"summary": "defaced"}); r.Code == http.StatusOK {
		t.Error("a stranger edited the idea")
	}

	// Notifications: the author saw votes, comments and a join, then clears them.
	items, unread := inbox(t, who.Outsider, "")
	if got := types(items); got["VOTE"] == 0 || got["COMMENT"] == 0 || got["JOIN"] == 0 || unread == 0 {
		t.Errorf("author's inbox: %v unread %d", got, unread)
	}
	if r := who.Outsider.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"all": true}); r.Code != http.StatusOK {
		t.Fatalf("mark read: %d %s", r.Code, r.Body)
	}
	if _, unread := inbox(t, who.Outsider, ""); unread != 0 {
		t.Errorf("unread after reading everything: %d", unread)
	}
	if r := who.Outsider.Do(http.MethodGet, "/api/me/notifications/unread-count", nil); r.Code != http.StatusOK || !contains(r.Body, `"unread":0`) {
		t.Errorf("unread-count: %d %s", r.Code, r.Body)
	}
	// Nobody reads anyone else's inbox: each person's list is their own.
	if got, _ := inbox(t, who.Member, ""); types(got)["JOIN"] != 0 {
		t.Errorf("a member sees someone else's notifications: %v", types(got))
	}

	// The community reports it; it disappears from public view until a moderator decides.
	for i := range 5 {
		c := env.SignIn(fmt.Sprintf("reporter%d@example.com", i))
		if r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": "misleading content"}); r.Code != http.StatusNoContent {
			t.Fatalf("report %d: %d %s", i, r.Code, r.Body)
		}
	}
	if code := who.Anon.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusNotFound {
		t.Fatalf("auto-hide did not hide: %d", code)
	}
	if code := who.Outsider.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusOK {
		t.Fatalf("the author lost sight of a hidden idea: %d", code)
	}
	if code := who.Third.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "still here?"}).Code; code != http.StatusNotFound {
		t.Errorf("commenting on a hidden idea: %d", code)
	}
	if r := decide(who.Admin, id, "APPROVED", "false alarm"); r.Code != http.StatusNoContent && r.Code != http.StatusOK {
		t.Fatalf("restore: %d %s", r.Code, r.Body)
	}
	if code := who.Anon.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusOK {
		t.Fatalf("restored idea is still hidden: %d", code)
	}
	if n := count(env, `SELECT count(*) FROM reports WHERE idea_id = $1 AND status = 'OPEN'`, id); n != 0 {
		t.Errorf("%d reports still open after the decision", n)
	}
	// Restoring does not pay the author twice.
	if n := count(env, `SELECT approved_ideas FROM users WHERE email = $1`, outsiderMail); n != 1 {
		t.Errorf("approved_ideas = %d after a second approval", n)
	}

	// The author takes it down; it vanishes everywhere, the history stays in the database.
	if r := who.Outsider.Do(http.MethodDelete, "/api/ideas/"+slug, nil); r.Code != http.StatusNoContent && r.Code != http.StatusOK {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	for _, c := range []*apptest.Client{who.Anon, who.Outsider, who.Admin} {
		if code := c.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code; code != http.StatusNotFound {
			t.Errorf("deleted idea answers %d", code)
		}
	}
	if n := count(env, `SELECT count(*) FROM ideas WHERE id = $1 AND deleted_at IS NOT NULL`, id); n != 1 {
		t.Error("deletion is not a soft delete")
	}

	// Signing out ends it.
	if r := who.Outsider.Do(http.MethodPost, "/api/auth/logout", nil); r.Code != http.StatusNoContent {
		t.Fatalf("logout: %d", r.Code)
	}
	if signedIn(who.Outsider) {
		t.Error("still signed in after logout")
	}
}

func contains(b []byte, s string) bool { return strings.Contains(string(b), s) }
