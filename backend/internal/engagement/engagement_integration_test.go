package engagement_test

import (
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

const (
	member  = "anna@ukma.edu.ua" // vote weight 3, karma multiplier 2, skips premoderation
	outside = "boris@example.com"
)

type voteResult struct {
	Votes       int  `json:"votes"`
	Voted       bool `json:"voted"`
	VotedWeight int  `json:"votedWeight"`
}

type participation struct {
	Participation *struct{ State, Role string } `json:"participation"`
	Participants  int                           `json:"participants"`
}

type participants struct {
	Items []struct {
		Handle, State, Role string
		Verified            bool
	}
}

// publish creates an approved idea owned by the member and returns its slug.
func publish(t *testing.T, env *apptest.Env, c *apptest.Client, extra map[string]any) string {
	t.Helper()
	body := map[string]any{"title": "An idea to engage with", "summary": "s", "category": "PROJECT"}
	for k, v := range extra {
		body[k] = v
	}
	r := c.Do(http.MethodPost, "/api/ideas", body)
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	slug := r.Map()["slug"].(string)
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, slug)
	return slug
}

func karma(env *apptest.Env, email string) int {
	return apptest.Scalar[int](env, `SELECT karma FROM users WHERE email = $1`, email)
}

func counters(env *apptest.Env, slug string) (votes, joins int) {
	return apptest.Scalar[int](env, `SELECT votes_weighted FROM ideas WHERE slug = $1`, slug),
		apptest.Scalar[int](env, `SELECT joins_count FROM ideas WHERE slug = $1`, slug)
}

func TestVoteWeightKarmaAndIdempotency(t *testing.T) {
	env := apptest.New(t)
	anna, boris, anon := env.SignIn(member), env.SignIn(outside), env.Anon()

	// Boris' idea: karma multiplier 1. Anna votes with weight 3.
	slug := publish(t, env, boris, nil)
	var res voteResult
	r := anna.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)
	r.Decode(&res)
	if r.Code != http.StatusOK || res != (voteResult{Votes: 3, Voted: true, VotedWeight: 3}) {
		t.Fatalf("vote: %d %s", r.Code, r.Body)
	}
	if got := karma(env, outside); got != 3 {
		t.Fatalf("author karma = %d, want 3", got)
	}
	if score := apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE slug = $1`, slug); score <= 0 {
		t.Fatalf("hot_score not refreshed: %v", score)
	}

	// Retrying is harmless: no second vote, no second karma, no second notification.
	for i := 0; i < 3; i++ {
		anna.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil).Decode(&res)
	}
	if v, _ := counters(env, slug); v != 3 || karma(env, outside) != 3 || res.Votes != 3 {
		t.Fatalf("retry changed state: votes=%d karma=%d res=%+v", v, karma(env, outside), res)
	}

	// The vote shows on the idea page for the voter only.
	var view struct{ Viewer voteResult }
	anna.Do(http.MethodGet, "/api/ideas/"+slug, nil).Decode(&view)
	if !view.Viewer.Voted || view.Viewer.VotedWeight != 3 {
		t.Fatalf("viewer state: %+v", view)
	}
	anon.Do(http.MethodGet, "/api/ideas/"+slug, nil).Decode(&view)
	if view.Viewer.Voted {
		t.Fatal("anonymous viewer shows a vote")
	}

	// Withdrawing returns exactly what the vote added, and twice is still fine.
	for i := 0; i < 2; i++ {
		r = anna.Do(http.MethodDelete, "/api/ideas/"+slug+"/vote", nil)
		r.Decode(&res)
		if r.Code != http.StatusOK || res.Votes != 0 || res.Voted {
			t.Fatalf("unvote #%d: %d %s", i, r.Code, r.Body)
		}
	}
	if karma(env, outside) != 0 {
		t.Fatalf("karma after unvote = %d", karma(env, outside))
	}

	// Notifications: voting, unvoting and voting again keeps one unread VOTE per voter.
	anna.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications WHERE type = 'VOTE'`); n != 1 {
		t.Fatalf("vote notifications = %d", n)
	}

	// Anna's idea has karma multiplier 2: Boris' weight-1 vote earns her 2.
	annas := publish(t, env, anna, map[string]any{"title": "Another idea"})
	boris.Do(http.MethodPut, "/api/ideas/"+annas+"/vote", nil)
	if karma(env, member) != 2 {
		t.Fatalf("karma with multiplier = %d, want 2", karma(env, member))
	}
}

func TestVoteRules(t *testing.T) {
	env := apptest.New(t)
	anna, boris, anon := env.SignIn(member), env.SignIn(outside), env.Anon()
	slug := publish(t, env, boris, nil)

	if r := anon.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusUnauthorized {
		t.Errorf("anonymous vote: %d", r.Code)
	}
	if r := boris.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusUnprocessableEntity {
		t.Errorf("self vote: %d", r.Code)
	}
	if r := anna.DoWith(http.MethodPut, "/api/ideas/"+slug+"/vote", nil, map[string]string{"Origin": "https://evil.example"}); r.Code != http.StatusForbidden {
		t.Errorf("cross-origin vote: %d", r.Code)
	}
	if r := anna.Do(http.MethodPut, "/api/ideas/nope/vote", nil); r.Code != http.StatusNotFound {
		t.Errorf("vote on missing idea: %d", r.Code)
	}
	// Ideas the viewer cannot see cannot be voted on, and look absent.
	env.Exec(`UPDATE ideas SET moderation_state = 'HIDDEN' WHERE slug = $1`, slug)
	if r := anna.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusNotFound {
		t.Errorf("vote on hidden idea: %d", r.Code)
	}
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED', visibility = 'ORGANIZATION_ONLY', organization_id = 'naukma' WHERE slug = $1`, slug)
	// Boris wrote it but holds no membership of the organization now: the idea is gone for him too.
	if r := boris.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusNotFound {
		t.Errorf("vote on an internal idea without membership: %d", r.Code)
	}
	outsider := env.SignIn("carl@example.com")
	if r := outsider.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code != http.StatusNotFound {
		t.Errorf("outsider vote on internal idea: %d", r.Code)
	}
}

func TestConcurrentVotesAreCountedOnce(t *testing.T) {
	env := apptest.New(t)
	boris := env.SignIn(outside)
	slug := publish(t, env, boris, nil)

	const voters = 12
	clients := make([]*apptest.Client, voters)
	for i := range clients {
		clients[i] = env.SignIn(fmt.Sprintf("voter%d@example.com", i))
	}
	var wg sync.WaitGroup
	for _, c := range clients {
		// Every voter hammers the same endpoint from three goroutines.
		for range 3 {
			wg.Go(func() {
				c := c.Clone()
				c.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)
			})
		}
	}
	wg.Wait()
	if votes, _ := counters(env, slug); votes != voters {
		t.Fatalf("votes_weighted = %d, want %d", votes, voters)
	}
	if rows := apptest.Scalar[int](env, `SELECT count(*) FROM votes`); rows != voters {
		t.Fatalf("vote rows = %d", rows)
	}
	if k := karma(env, outside); k != voters {
		t.Fatalf("karma = %d, want %d", k, voters)
	}

	// Everyone leaves at once: counters return to zero and never go below.
	for _, c := range clients {
		for range 2 {
			wg.Go(func() {
				c := c.Clone()
				c.Do(http.MethodDelete, "/api/ideas/"+slug+"/vote", nil)
			})
		}
	}
	wg.Wait()
	if votes, _ := counters(env, slug); votes != 0 || karma(env, outside) != 0 {
		t.Fatalf("after unvoting: votes=%d karma=%d", votes, karma(env, outside))
	}
}

func TestParticipationLifecycleAndCapacity(t *testing.T) {
	env := apptest.New(t)
	anna := env.SignIn(member)
	boris, carl, dina := env.SignIn(outside), env.SignIn("carl@example.com"), env.SignIn("dina@example.com")
	start := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
	slug := publish(t, env, anna, map[string]any{"title": "Small workshop", "category": "EVENT", "eventAt": start, "eventCapacity": 1})

	put := func(c *apptest.Client, state, role string) (int, participation) {
		r := c.Do(http.MethodPut, "/api/ideas/"+slug+"/participation", map[string]any{"state": state, "role": role})
		var p participation
		if r.Code == http.StatusOK {
			r.Decode(&p)
		}
		return r.Code, p
	}

	if code, p := put(boris, "JOINED", " Go   dev "); code != http.StatusOK || p.Participants != 1 || p.Participation.Role != "Go dev" {
		t.Fatalf("join: %d %+v", code, p)
	}
	if code, _ := put(carl, "JOINED", ""); code != http.StatusConflict {
		t.Fatalf("join a full event: %d", code)
	}
	if code, p := put(carl, "INTERESTED", ""); code != http.StatusOK || p.Participants != 1 {
		t.Fatalf("interested in a full event: %d %+v", code, p)
	}
	if code, _ := put(anna, "JOINED", ""); code != http.StatusUnprocessableEntity {
		t.Fatalf("author joins own idea: %d", code)
	}
	if code, _ := put(dina, "ACCEPTED", ""); code != http.StatusUnprocessableEntity {
		t.Fatalf("self-accept: %d", code)
	}
	if code, _ := put(dina, "JOINED", "x\x01"); code != http.StatusUnprocessableEntity {
		t.Fatalf("control characters in role: %d", code)
	}

	// Participant lists: strangers see seated people only, the author sees everyone.
	var list participants
	dina.Do(http.MethodGet, "/api/ideas/"+slug+"/participants", nil).Decode(&list)
	if len(list.Items) != 1 || list.Items[0].State != "JOINED" {
		t.Fatalf("public list: %+v", list)
	}
	r := anna.Do(http.MethodGet, "/api/ideas/"+slug+"/participants", nil)
	if r.Code != http.StatusOK {
		t.Fatalf("author list: %d %s", r.Code, r.Body)
	}
	list = participants{}
	r.Decode(&list)
	if len(list.Items) != 2 {
		t.Fatalf("author list: %+v", list)
	}

	// Only the author decides. Accepting past capacity is refused; leaving frees the seat.
	carlHandle := apptest.Scalar[string](env, `SELECT handle FROM users WHERE email = 'carl@example.com'`)
	borisHandle := apptest.Scalar[string](env, `SELECT handle FROM users WHERE email = $1`, outside)
	if r := boris.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+carlHandle+"/accept", nil); r.Code != http.StatusForbidden {
		t.Fatalf("participant decides: %d", r.Code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+carlHandle+"/accept", nil); r.Code != http.StatusConflict {
		t.Fatalf("accept past capacity: %d %s", r.Code, r.Body)
	}
	if r := boris.Do(http.MethodDelete, "/api/ideas/"+slug+"/participation", nil); r.Code != http.StatusOK {
		t.Fatalf("leave: %d", r.Code)
	}
	if _, joins := counters(env, slug); joins != 0 {
		t.Fatalf("joins after leave = %d", joins)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+carlHandle+"/accept", nil); r.Code != http.StatusOK {
		t.Fatalf("accept: %d %s", r.Code, r.Body)
	}
	if _, joins := counters(env, slug); joins != 1 {
		t.Fatalf("joins after accept = %d", joins)
	}
	if n := apptest.Scalar[int](env, `SELECT count(*) FROM notifications WHERE type = 'ACCEPTED' AND user_id = (SELECT id FROM users WHERE handle = $1)`, carlHandle); n != 1 {
		t.Fatalf("accepted notifications = %d", n)
	}

	// A declined request stays on record: leaving and re-applying does not undo the decision.
	if code, _ := put(boris, "INTERESTED", ""); code != http.StatusOK {
		t.Fatalf("boris interested: %d", code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+borisHandle+"/decline", nil); r.Code != http.StatusOK {
		t.Fatalf("decline: %d", r.Code)
	}
	if code, _ := put(boris, "INTERESTED", ""); code != http.StatusConflict {
		t.Fatalf("re-apply after decline: %d", code)
	}
	var res participation
	boris.Do(http.MethodDelete, "/api/ideas/"+slug+"/participation", nil).Decode(&res)
	if res.Participation == nil || res.Participation.State != "DECLINED" {
		t.Fatalf("decline was erased by leaving: %+v", res)
	}
	// An accepted participant cannot downgrade the author's decision either.
	if code, _ := put(carl, "INTERESTED", ""); code != http.StatusConflict {
		t.Fatalf("accepted participant changed own state: %d", code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/"+borisHandle+"/maybe", nil); r.Code != http.StatusNotFound {
		t.Fatalf("unknown decision: %d", r.Code)
	}
	if r := anna.Do(http.MethodPost, "/api/ideas/"+slug+"/participants/ghost_user/accept", nil); r.Code != http.StatusNotFound {
		t.Fatalf("unknown participant: %d", r.Code)
	}

	// The idea page reports the viewer's own participation.
	var view struct {
		Participants int
		Viewer       struct{ Participation *struct{ State string } }
	}
	carl.Do(http.MethodGet, "/api/ideas/"+slug, nil).Decode(&view)
	if view.Participants != 1 || view.Viewer.Participation == nil || view.Viewer.Participation.State != "ACCEPTED" {
		t.Fatalf("view: %+v", view)
	}
}

func TestConcurrentJoinsRespectCapacity(t *testing.T) {
	env := apptest.New(t)
	anna := env.SignIn(member)
	start := time.Now().Add(72 * time.Hour).UTC().Format(time.RFC3339)
	slug := publish(t, env, anna, map[string]any{"title": "Two seats only", "category": "EVENT", "eventAt": start, "eventCapacity": 2})

	const people = 10
	clients := make([]*apptest.Client, people)
	for i := range clients {
		clients[i] = env.SignIn(fmt.Sprintf("guest%d@example.com", i))
	}
	var wg sync.WaitGroup
	for _, c := range clients {
		wg.Go(func() {
			c.Do(http.MethodPut, "/api/ideas/"+slug+"/participation", map[string]any{"state": "JOINED"})
		})
	}
	wg.Wait()
	if seats := apptest.Scalar[int](env, `SELECT count(*) FROM participations WHERE state = 'JOINED'`); seats != 2 {
		t.Fatalf("seated = %d, want exactly the capacity 2", seats)
	}
	if _, joins := counters(env, slug); joins != 2 {
		t.Fatalf("joins_count = %d", joins)
	}
}
