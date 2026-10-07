package moderation_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

const (
	author  = "boris@example.com"
	modMail = "anna@ukma.edu.ua"
)

type queueItem struct {
	CaseID, IdeaID, Slug, State, Source string
	OpenReports                         int
	Author                              struct{ Handle string }
}

type queue struct {
	Items      []queueItem
	NextCursor *string
}

// moderator returns a signed-in client whose account holds the moderator role.
func moderator(env *apptest.Env) *apptest.Client {
	env.SignIn(modMail)
	env.Exec(`UPDATE users SET role = 'MODERATOR' WHERE email = $1`, modMail)
	return env.SignIn(modMail)
}

func pending(t *testing.T, env *apptest.Env, c *apptest.Client, title string) (slug, id string) {
	t.Helper()
	r := c.Do(http.MethodPost, "/api/ideas", map[string]any{"title": title, "summary": "s", "category": "PROJECT"})
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	slug = r.Map()["slug"].(string)
	return slug, apptest.Scalar[string](env, `SELECT id FROM ideas WHERE slug = $1`, slug)
}

func listQueue(t *testing.T, c *apptest.Client, query string) (queue, int) {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/moderation/queue"+query, nil)
	var q queue
	r.Decode(&q)
	return q, r.Code
}

func status(c *apptest.Client, slug string) int {
	return c.Do(http.MethodGet, "/api/ideas/"+slug, nil).Code
}

func decide(c *apptest.Client, id, decision, note string) *apptest.Response {
	return c.Do(http.MethodPost, "/api/moderation/ideas/"+id+"/decision", map[string]any{"decision": decision, "note": note})
}

func TestStaffRoutesRequireStaff(t *testing.T) {
	env := apptest.New(t)
	user, anon := env.SignIn(author), env.Anon()
	for _, c := range []struct {
		who  *apptest.Client
		want int
	}{{anon, http.StatusUnauthorized}, {user, http.StatusForbidden}} {
		for _, req := range [][2]string{
			{http.MethodGet, "/api/moderation/queue"},
			{http.MethodGet, "/api/moderation/reports?ideaId=00000000-0000-0000-0000-000000000000"},
			{http.MethodPost, "/api/moderation/ideas/00000000-0000-0000-0000-000000000000/decision"},
		} {
			if r := c.who.Do(req[0], req[1], map[string]any{"decision": "APPROVED"}); r.Code != c.want {
				t.Errorf("%s %s: %d, want %d", req[0], req[1], r.Code, c.want)
			}
		}
	}
}

func TestPremoderationDecision(t *testing.T) {
	env := apptest.New(t)
	boris, mod := env.SignIn(author), moderator(env)
	slug, id := pending(t, env, boris, "Needs a look")

	if status(env.Anon(), slug) != http.StatusNotFound {
		t.Fatal("pending idea is public")
	}
	q, code := listQueue(t, mod, "")
	if code != http.StatusOK || len(q.Items) != 1 || q.Items[0].Slug != slug || q.Items[0].State != "PENDING" || q.Items[0].Source != "PREMODERATION" {
		t.Fatalf("queue: %d %+v", code, q)
	}

	if r := decide(mod, id, "REJECTED", ""); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("reject without a note: %d", r.Code)
	}
	if r := decide(mod, id, "SHRUG", "x"); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("unknown decision: %d", r.Code)
	}
	if r := decide(mod, id, "REJECTED", "bad\x00note"); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("control characters in note: %d", r.Code)
	}
	if r := decide(boris, id, "APPROVED", ""); r.Code != http.StatusForbidden {
		t.Errorf("author deciding: %d", r.Code)
	}
	// A moderator may not approve their own idea either.
	_, own := pending(t, env, mod, "Mine")
	env.Exec(`UPDATE ideas SET moderation_state = 'PENDING' WHERE id = $1`, own)
	env.Exec(`INSERT INTO moderation_cases (id, idea_id) SELECT gen_random_uuid(), $1 WHERE NOT EXISTS (SELECT 1 FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN')`, own)
	if r := decide(mod, own, "APPROVED", ""); r.Code != http.StatusForbidden {
		t.Errorf("self moderation: %d", r.Code)
	}

	if r := decide(mod, id, "APPROVED", "looks fine"); r.Code != http.StatusNoContent {
		t.Fatalf("approve: %d %s", r.Code, r.Body)
	}
	if status(env.Anon(), slug) != http.StatusOK {
		t.Error("approved idea is not public")
	}
	if got := apptest.Scalar[int](env, `SELECT approved_ideas FROM users WHERE email = $1`, author); got != 1 {
		t.Errorf("approved_ideas = %d", got)
	}
	if apptest.Scalar[bool](env, `SELECT published_at IS NULL FROM ideas WHERE id = $1`, id) {
		t.Error("published_at not set")
	}
	caseRow := apptest.Scalar[string](env, `SELECT c.decision || '/' || c.note || '/' || (c.decided_by = u.id)::text FROM moderation_cases c JOIN users u ON u.email = $2 WHERE c.idea_id = $1`, id, modMail)
	if caseRow != "APPROVED/looks fine/true" {
		t.Errorf("audit row = %q", caseRow)
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = $1 AND n.type = 'APPROVED'`, author); n != 1 {
		t.Errorf("approval notifications = %d", n)
	}
	if r := decide(mod, id, "HIDDEN", "again"); r.Code != http.StatusConflict {
		t.Errorf("decide twice: %d", r.Code)
	}
	if q, _ := listQueue(t, mod, ""); len(q.Items) != 1 || q.Items[0].Slug == slug {
		t.Errorf("decided case still queued: %+v", q)
	}

	// Rejected ideas stay private and tell the author.
	slug2, id2 := pending(t, env, boris, "Not this one")
	if r := decide(mod, id2, "REJECTED", "off topic"); r.Code != http.StatusNoContent {
		t.Fatalf("reject: %d %s", r.Code, r.Body)
	}
	if status(env.Anon(), slug2) != http.StatusNotFound {
		t.Error("rejected idea is public")
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications WHERE type = 'HIDDEN' AND payload->>'decision' = 'REJECTED'`); n != 1 {
		t.Errorf("rejection notifications = %d", n)
	}
	if got := apptest.Scalar[int](env, `SELECT approved_ideas FROM users WHERE email = $1`, author); got != 1 {
		t.Errorf("rejection changed approved_ideas to %d", got)
	}
}

func TestQueuePagination(t *testing.T) {
	env := apptest.New(t)
	boris, mod := env.SignIn(author), moderator(env)
	for i := 0; i < 3; i++ {
		pending(t, env, boris, fmt.Sprintf("Idea number %d", i))
		env.Exec(`UPDATE moderation_cases SET created_at = created_at + $1 * interval '1 second' WHERE idea_id = (SELECT id FROM ideas ORDER BY created_at DESC LIMIT 1)`, i)
	}
	first, _ := listQueue(t, mod, "?limit=2")
	if len(first.Items) != 2 || first.NextCursor == nil {
		t.Fatalf("first page: %+v", first)
	}
	second, _ := listQueue(t, mod, "?limit=2&cursor="+*first.NextCursor)
	if len(second.Items) != 1 || second.NextCursor != nil || second.Items[0].CaseID == first.Items[0].CaseID || second.Items[0].CaseID == first.Items[1].CaseID {
		t.Fatalf("second page: %+v", second)
	}
	forged := *first.NextCursor + "x"
	for name, query := range map[string]string{
		"forged cursor":           "?cursor=" + forged,
		"cursor of another state": "?state=HIDDEN&cursor=" + *first.NextCursor,
		"bad state":               "?state=APPROVED",
		"bad limit":               "?limit=abc",
	} {
		if _, code := listQueue(t, mod, query); code != http.StatusUnprocessableEntity && code != http.StatusBadRequest {
			t.Errorf("%s: %d", name, code)
		}
	}
	if q, _ := listQueue(t, mod, "?limit=1000"); len(q.Items) != 3 {
		t.Errorf("clamped limit: %+v", q)
	}
}

func approved(t *testing.T, env *apptest.Env, c *apptest.Client, title string) (slug, id string) {
	t.Helper()
	slug, id = pending(t, env, c, title)
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE id = $1`, id)
	env.Exec(`UPDATE moderation_cases SET state = 'CLOSED', decision = 'APPROVED', decided_by = (SELECT id FROM users LIMIT 1), decided_at = now() WHERE idea_id = $1`, id)
	return slug, id
}

func report(c *apptest.Client, slug, reason string) *apptest.Response {
	return c.Do(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": reason})
}

func TestReportsHideAtThresholdAndModeratorRestores(t *testing.T) {
	env := apptest.New(t)
	boris, mod, anon := env.SignIn(author), moderator(env), env.Anon()
	slug, id := approved(t, env, boris, "Controversial")

	if r := report(anon, slug, "spam"); r.Code != http.StatusUnauthorized {
		t.Errorf("anonymous report: %d", r.Code)
	}
	if r := report(boris, slug, "spam"); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("own idea: %d", r.Code)
	}
	if r := report(mod, slug, "   "); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("empty reason: %d", r.Code)
	}
	if r := report(mod, "no-such-idea", "spam"); r.Code != http.StatusNotFound {
		t.Errorf("missing idea: %d", r.Code)
	}

	reporters := []*apptest.Client{}
	for i := 0; i < 5; i++ {
		reporters = append(reporters, env.SignIn(fmt.Sprintf("reporter%d@example.com", i)))
	}
	for i, c := range reporters[:4] {
		if r := report(c, slug, "<b>scam</b>"); r.Code != http.StatusNoContent {
			t.Fatalf("report %d: %d %s", i, r.Code, r.Body)
		}
	}
	if r := report(reporters[0], slug, "again"); r.Code != http.StatusConflict {
		t.Errorf("duplicate report: %d", r.Code)
	}
	if status(anon, slug) != http.StatusOK {
		t.Fatal("hidden before the threshold")
	}
	if r := report(reporters[4], slug, "scam"); r.Code != http.StatusNoContent {
		t.Fatalf("fifth report: %d", r.Code)
	}

	// Gone for everybody, indistinguishable from absent.
	if status(anon, slug) != http.StatusNotFound || report(reporters[0], slug, "x").Code != http.StatusNotFound {
		t.Fatal("idea still reachable after auto-hide")
	}
	if status(boris, slug) != http.StatusOK {
		t.Error("author lost sight of own hidden idea")
	}
	q, _ := listQueue(t, mod, "?state=HIDDEN")
	if len(q.Items) != 1 || q.Items[0].Source != "REPORTS" || q.Items[0].OpenReports != 5 || q.Items[0].IdeaID != id {
		t.Fatalf("hidden queue: %+v", q)
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications WHERE type = 'HIDDEN' AND payload->>'automatic' = 'true'`); n != 1 {
		t.Errorf("auto-hide notifications = %d", n)
	}

	var list struct {
		Items []struct{ Reason, Status string }
	}
	r := mod.Do(http.MethodGet, "/api/moderation/reports?ideaId="+id, nil)
	r.Decode(&list)
	if r.Code != http.StatusOK || len(list.Items) != 5 || list.Items[0].Status != "OPEN" || list.Items[1].Reason != "<b>scam</b>" {
		t.Fatalf("reports: %d %s", r.Code, r.Body)
	}
	if r := mod.Do(http.MethodGet, "/api/moderation/reports?ideaId=nope", nil); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("bad idea id: %d", r.Code)
	}

	// Restoring clears the slate: reports are resolved, and the approval is not counted twice.
	if r := decide(mod, id, "APPROVED", "false alarm"); r.Code != http.StatusNoContent {
		t.Fatalf("restore: %d %s", r.Code, r.Body)
	}
	if status(anon, slug) != http.StatusOK {
		t.Error("restored idea not visible")
	}
	if open := apptest.Scalar[int](env, `SELECT count(*) FROM reports WHERE idea_id = $1 AND status = 'OPEN'`, id); open != 0 {
		t.Errorf("open reports after decision = %d", open)
	}
	if got := apptest.Scalar[int](env, `SELECT approved_ideas FROM users WHERE email = $1`, author); got != 0 {
		t.Errorf("restoring counted as approval: %d", got)
	}
	// Answered reports do not block a new one, and one report alone does not hide again.
	if r := report(reporters[0], slug, "still bad"); r.Code != http.StatusNoContent {
		t.Errorf("report after decision: %d", r.Code)
	}
	if status(anon, slug) != http.StatusOK {
		t.Error("one report hid a restored idea")
	}
}

func TestConcurrentReportsHideExactlyOnce(t *testing.T) {
	env := apptest.New(t)
	boris := env.SignIn(author)
	slug, id := approved(t, env, boris, "Raced")
	clients := make([]*apptest.Client, 8)
	for i := range clients {
		clients[i] = env.SignIn(fmt.Sprintf("racer%d@example.com", i))
	}
	done := make(chan int, len(clients))
	for _, c := range clients {
		go func() { done <- report(c, slug, "spam").Code }()
	}
	ok, notFound := 0, 0
	for range clients {
		switch code := <-done; code {
		case http.StatusNoContent:
			ok++
		case http.StatusNotFound:
			notFound++
		default:
			t.Errorf("unexpected status %d", code)
		}
	}
	if ok < 5 || ok+notFound != len(clients) {
		t.Errorf("accepted %d, rejected after hide %d", ok, notFound)
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN'`, id); n != 1 {
		t.Errorf("open cases = %d", n)
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications WHERE type = 'HIDDEN'`); n != 1 {
		t.Errorf("hide notifications = %d", n)
	}
}
