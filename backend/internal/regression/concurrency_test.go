package regression_test

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// crowd signs in n distinct people, each with a client of their own.
func crowd(env *apptest.Env, n int) []*apptest.Client {
	out := make([]*apptest.Client, n)
	for i := range out {
		out[i] = env.SignIn(fmt.Sprintf("crowd%d@example.com", i))
	}
	return out
}

func TestConcurrentVotesKeepTheCounterExact(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, id := idea(t, env, who.Outsider, map[string]any{"title": "Popular idea", "summary": "s"})
	people := append(crowd(env, 25), who.Member, who.Member2, who.Mod)

	// Everybody votes three times at once: the repeats must change nothing.
	var bad atomic.Int32
	parallel(len(people)*3, func(i int) {
		if r := people[i%len(people)].Clone().Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code >= 500 {
			bad.Add(1)
		}
	})
	if bad.Load() != 0 {
		t.Fatalf("%d server errors", bad.Load())
	}
	check := func(when string, voters int) {
		t.Helper()
		if n := count(env, `SELECT count(*) FROM votes WHERE idea_id = $1`, id); n != voters {
			t.Errorf("%s: %d vote rows, want %d", when, n, voters)
		}
		if got, want := count(env, `SELECT votes_weighted FROM ideas WHERE id = $1`, id), count(env, `SELECT COALESCE(sum(weight), 0) FROM votes WHERE idea_id = $1`, id); got != want {
			t.Errorf("%s: votes_weighted %d, sum of weights %d", when, got, want)
		}
	}
	check("after voting", len(people))

	// Everybody withdraws three times at once, while a few vote again: the counter follows the rows.
	parallel(len(people)*3, func(i int) {
		c := people[i%len(people)].Clone()
		if i%7 == 0 {
			c.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)
			return
		}
		if r := c.Do(http.MethodDelete, "/api/ideas/"+slug+"/vote", nil); r.Code >= 500 {
			bad.Add(1)
		}
	})
	if bad.Load() != 0 {
		t.Fatalf("%d server errors", bad.Load())
	}
	check("after withdrawals", count(env, `SELECT count(*) FROM votes WHERE idea_id = $1`, id))
	if n := count(env, `SELECT votes_weighted FROM ideas WHERE id = $1`, id); n < 0 {
		t.Errorf("negative counter: %d", n)
	}
}

func TestConcurrentCommentsKeepTheCounterExact(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, id := idea(t, env, who.Outsider, map[string]any{"title": "Chatty idea", "summary": "s"})
	people := crowd(env, 12)
	root := comment(t, who.Member, slug, "the first comment", "")

	var created atomic.Int32
	ids := make(chan string, 200)
	parallel(60, func(i int) {
		c := people[i%len(people)].Clone()
		req := map[string]any{"body": fmt.Sprintf("comment %d", i)}
		if i%2 == 0 {
			req["parentId"] = root
		}
		r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", req)
		if r.Code == http.StatusCreated {
			created.Add(1)
			ids <- r.Map()["id"].(string)
		} else {
			t.Errorf("comment %d: %d %s", i, r.Code, r.Body)
		}
	})
	close(ids)
	if got := count(env, `SELECT comments_count FROM ideas WHERE id = $1`, id); got != int(created.Load())+1 {
		t.Errorf("comments_count %d, created %d", got, created.Load()+1)
	}

	// Deleting every one of them twice at once must not push the counter below the rows that are left.
	var all []string
	for pid := range ids {
		all = append(all, pid)
	}
	parallel(len(all)*2, func(i int) {
		// Moderators may delete anyone's comment; the author's own deletion races with it.
		who.Mod.Clone().Do(http.MethodDelete, "/api/posts/"+all[i%len(all)], nil)
	})
	live := count(env, `SELECT count(*) FROM posts p JOIN topics tp ON tp.id = p.topic_id WHERE tp.idea_id = $1 AND p.deleted_at IS NULL`, id)
	if got := count(env, `SELECT comments_count FROM ideas WHERE id = $1`, id); got != live {
		t.Errorf("comments_count %d, live comments %d", got, live)
	}
}

func TestConcurrentReportsHideAnIdeaExactlyOnce(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, id := idea(t, env, who.Outsider, map[string]any{"title": "Contested idea", "summary": "s"})
	people := crowd(env, 12)

	parallel(len(people)*2, func(i int) {
		if r := people[i%len(people)].Clone().Do(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": "this looks like spam"}); r.Code >= 500 {
			t.Errorf("report: %d %s", r.Code, r.Body)
		}
	})
	if st := apptest.Scalar[string](env, `SELECT moderation_state FROM ideas WHERE id = $1`, id); st != "HIDDEN" {
		t.Fatalf("state %s, want HIDDEN", st)
	}
	if n := count(env, `SELECT count(*) FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN'`, id); n != 1 {
		t.Errorf("%d open cases, want exactly 1", n)
	}
	if n := count(env, `SELECT count(*) FROM notifications WHERE type = 'HIDDEN' AND payload->>'automatic' = 'true'`); n != 1 {
		t.Errorf("%d auto-hide notifications, want 1", n)
	}
	// One report per person, however hard they pushed.
	if n := count(env, `SELECT count(*) FROM reports WHERE idea_id = $1`, id); n > len(people) {
		t.Errorf("%d reports from %d people", n, len(people))
	}
}

func TestConcurrentModerationDecisionsHaveOneWinner(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	r := who.Outsider.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Awaiting a verdict", "summary": "s", "category": "PROJECT"})
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	id := apptest.Scalar[string](env, `SELECT id FROM ideas WHERE slug = $1`, r.Map()["slug"])
	env.SignIn("mod2@example.com")
	env.Exec(`UPDATE users SET role = 'MODERATOR' WHERE email = 'mod2@example.com'`)
	second := env.SignIn("mod2@example.com")

	var ok, conflict, other atomic.Int32
	parallel(8, func(i int) {
		c := [...]*apptest.Client{who.Mod, who.Admin, second}[i%3].Clone()
		decision := [...]string{"APPROVED", "REJECTED"}[i%2]
		switch r := c.Do(http.MethodPost, "/api/moderation/ideas/"+id+"/decision", map[string]any{"decision": decision, "note": "verdict"}); r.Code {
		case http.StatusNoContent, http.StatusOK:
			ok.Add(1)
		case http.StatusConflict:
			conflict.Add(1)
		default:
			other.Add(1)
			t.Errorf("decision: %d %s", r.Code, r.Body)
		}
	})
	if ok.Load() != 1 || conflict.Load() != 7 {
		t.Errorf("winners %d, conflicts %d, others %d; want 1/7/0", ok.Load(), conflict.Load(), other.Load())
	}
	if n := count(env, `SELECT count(*) FROM moderation_cases WHERE idea_id = $1 AND state = 'CLOSED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL`, id); n != 1 {
		t.Errorf("%d closed cases with an audit trail, want 1", n)
	}
	if n := count(env, `SELECT count(*) FROM moderation_cases WHERE idea_id = $1 AND state = 'OPEN'`, id); n != 0 {
		t.Errorf("%d cases still open", n)
	}
	// The decision on the idea matches the one recorded on the case, and the author is told once.
	if got, want := apptest.Scalar[string](env, `SELECT moderation_state FROM ideas WHERE id = $1`, id), apptest.Scalar[string](env, `SELECT decision FROM moderation_cases WHERE idea_id = $1`, id); got != want {
		t.Errorf("idea is %s, case says %s", got, want)
	}
	if n := count(env, `SELECT count(*) FROM notifications n JOIN ideas i ON i.author_id = n.user_id WHERE i.id = $1 AND n.type IN ('APPROVED', 'HIDDEN', 'REJECTED')`, id); n != 1 {
		t.Errorf("author got %d verdict notifications, want 1", n)
	}
	// Approval is counted once for the author even though several moderators tried.
	if n := count(env, `SELECT approved_ideas FROM users WHERE email = $1`, outsiderMail); n > 1 {
		t.Errorf("approved_ideas = %d", n)
	}
}

func TestConcurrentCreationRespectsTheDailyLimitAndSlugsStayUnique(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	var created, throttled atomic.Int32
	parallel(16, func(i int) {
		r := who.Outsider.Clone().Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Identical title", "summary": "s", "category": "PROJECT"})
		switch r.Code {
		case http.StatusCreated:
			created.Add(1)
		case http.StatusTooManyRequests:
			throttled.Add(1)
		default:
			t.Errorf("create: %d %s", r.Code, r.Body)
		}
	})
	if created.Load() == 0 {
		t.Fatal("nothing was created")
	}
	if n := count(env, `SELECT count(*) FROM ideas`); n != int(created.Load()) {
		t.Errorf("%d rows for %d successful creations", n, created.Load())
	}
	if n := count(env, `SELECT count(DISTINCT slug) FROM ideas`); n != int(created.Load()) {
		t.Errorf("%d distinct slugs for %d ideas", n, created.Load())
	}
	// The author row is locked while counting, so the quota is exact, not approximate.
	if created.Load() != 5 || throttled.Load() != 11 {
		t.Errorf("created %d, throttled %d; want 5 and 11", created.Load(), throttled.Load())
	}
}

func TestConcurrentFirstLoginsCreateOneAccount(t *testing.T) {
	env := apptest.New(t)
	const mail = "newcomer@example.com"
	var failures atomic.Int32
	parallel(8, func(int) {
		c := env.Anon()
		r := c.Do(http.MethodGet, "/api/auth/google/login", nil)
		if r.Code != http.StatusFound {
			failures.Add(1)
			return
		}
		state := stateOf(r.Header.Get("Location"))
		if r := callback(c, state, mail); r.Code != http.StatusSeeOther {
			failures.Add(1)
			t.Errorf("callback: %d %s", r.Code, r.Body)
		}
	})
	if failures.Load() != 0 {
		t.Errorf("%d logins failed", failures.Load())
	}
	if n := count(env, `SELECT count(*) FROM users WHERE email = $1`, mail); n != 1 {
		t.Errorf("%d accounts for one e-mail", n)
	}
	if n := count(env, `SELECT count(*) FROM external_identities`); n != 1 {
		t.Errorf("%d external identities, want 1", n)
	}
	if n := count(env, `SELECT count(*) FROM sessions`); n != 8 {
		t.Errorf("%d sessions for 8 devices", n)
	}
}

func TestConcurrentLogoutAllDoesNotResurrectSessions(t *testing.T) {
	env := apptest.New(t)
	devices := make([]*apptest.Client, 6)
	for i := range devices {
		devices[i] = env.SignIn(outsiderMail)
	}
	parallel(len(devices)*2, func(i int) {
		if i%2 == 0 {
			devices[i/2].Clone().Do(http.MethodPost, "/api/auth/logout-all", nil)
		} else {
			devices[i/2].Clone().Do(http.MethodGet, "/api/me", nil)
		}
	})
	for i, d := range devices {
		if signedIn(d) {
			t.Errorf("device %d is still signed in after logout-all", i)
		}
	}
	if n := count(env, `SELECT count(*) FROM sessions`); n != 0 {
		t.Errorf("%d sessions left", n)
	}
}
