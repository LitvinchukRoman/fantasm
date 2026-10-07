package regression_test

import (
	"fmt"
	"math/rand/v2"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// seed comes from REGRESSION_SEED so a failure in CI can be replayed exactly.
func seed(t *testing.T) uint64 {
	t.Helper()
	if s := os.Getenv("REGRESSION_SEED"); s != "" {
		v, err := strconv.ParseUint(s, 10, 64)
		if err != nil {
			t.Fatalf("REGRESSION_SEED: %v", err)
		}
		return v
	}
	return uint64(time.Now().UnixNano())
}

// TestRandomWorkloadKeepsTheDatabaseConsistent throws a random mix of actions
// from several people at once at a handful of ideas, then checks the rules the
// data must obey whatever order things happened in: counters equal the rows
// they summarise, nothing is double-counted, no request failed with a 5xx.
// Replay a failure with REGRESSION_SEED=<seed from the log>.
func TestRandomWorkloadKeepsTheDatabaseConsistent(t *testing.T) {
	s := seed(t)
	t.Logf("REGRESSION_SEED=%d", s)

	env := apptest.New(t)
	who := cast(env)
	people := append(crowd(env, 8), who.Member, who.Member2, who.Third)

	// Five approved ideas by different authors, one of them an event with limited seats.
	var slugs, ids []string
	authors := []*apptest.Client{who.Outsider, who.Member, who.Third, people[0], people[1]}
	for i, a := range authors {
		extra := map[string]any{"title": fmt.Sprintf("Workload idea %d", i), "summary": "s"}
		sl, id := idea(t, env, a, extra)
		slugs, ids = append(slugs, sl), append(ids, id)
	}

	var (
		mu       sync.Mutex
		postIDs  []string
		serverEr atomic.Int32
		ops      atomic.Int32
	)
	note := func(r *apptest.Response, what string) *apptest.Response {
		ops.Add(1)
		if r.Code >= 500 {
			serverEr.Add(1)
			t.Errorf("%s: %d %s", what, r.Code, r.Body)
		}
		return r
	}
	pick := func(rng *rand.Rand, n int) int { return rng.IntN(n) }

	const workers, steps = 8, 80
	var wg sync.WaitGroup
	for w := range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			rng := rand.New(rand.NewPCG(s, uint64(w)))
			me := people[w%len(people)].Clone()
			for range steps {
				slug := slugs[pick(rng, len(slugs))]
				switch rng.IntN(15) {
				case 0, 1, 2:
					note(me.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil), "vote")
				case 3:
					note(me.Do(http.MethodDelete, "/api/ideas/"+slug+"/vote", nil), "unvote")
				case 4, 5:
					body := map[string]any{"body": fmt.Sprintf("comment %d", rng.IntN(1e6))}
					mu.Lock()
					if len(postIDs) > 0 && rng.IntN(2) == 0 {
						body["parentId"] = postIDs[pick(rng, len(postIDs))]
					}
					mu.Unlock()
					if r := note(me.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", body), "comment"); r.Code == http.StatusCreated {
						mu.Lock()
						postIDs = append(postIDs, r.Map()["id"].(string))
						mu.Unlock()
					}
				case 6:
					mu.Lock()
					var pid string
					if len(postIDs) > 0 {
						pid = postIDs[pick(rng, len(postIDs))]
					}
					mu.Unlock()
					if pid != "" {
						note(me.Do(http.MethodDelete, "/api/posts/"+pid, nil), "delete comment")
					}
				case 7, 14:
					note(me.Do(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": "looks wrong to me"}), "report")
				case 8, 9:
					state := [...]string{"INTERESTED", "JOINED"}[rng.IntN(2)]
					note(me.Do(http.MethodPut, "/api/ideas/"+slug+"/participation", map[string]any{"state": state, "role": "helper"}), "participate")
				case 10:
					note(me.Do(http.MethodDelete, "/api/ideas/"+slug+"/participation", nil), "leave")
				case 11:
					// The staff clear the queue now and then.
					var q struct{ Items []struct{ IdeaID string } }
					who.Mod.Clone().Do(http.MethodGet, "/api/moderation/queue?state=HIDDEN", nil).Decode(&q)
					if len(q.Items) > 0 {
						d := [...]string{"APPROVED", "HIDDEN", "REJECTED"}[rng.IntN(3)]
						r := note(who.Mod.Clone().Do(http.MethodPost, "/api/moderation/ideas/"+q.Items[0].IdeaID+"/decision", map[string]any{"decision": d, "note": "random verdict"}), "decide")
						if r.Code != http.StatusNoContent && r.Code != http.StatusOK && r.Code != http.StatusConflict && r.Code != http.StatusNotFound {
							t.Errorf("decide: %d %s", r.Code, r.Body)
						}
					}
				case 12:
					note(me.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil), "thread")
					note(me.Do(http.MethodGet, "/api/ideas?sort=hot&limit=10", nil), "feed")
				case 13:
					note(me.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"all": true}), "read all")
				}
			}
		}()
	}
	wg.Wait()
	t.Logf("%d requests, seed %d", ops.Load(), s)
	if serverEr.Load() != 0 {
		t.Fatalf("%d server errors", serverEr.Load())
	}

	rules := []struct{ name, sql string }{
		{"votes_weighted equals the sum of vote weights",
			`SELECT count(*) FROM ideas i WHERE i.votes_weighted <> COALESCE((SELECT sum(weight) FROM votes v WHERE v.idea_id = i.id), 0)`},
		{"comments_count equals the live comments",
			`SELECT count(*) FROM ideas i WHERE i.comments_count <> (SELECT count(*) FROM posts p JOIN topics t ON t.id = p.topic_id WHERE t.idea_id = i.id AND p.deleted_at IS NULL)`},
		{"joins_count equals the seats taken",
			`SELECT count(*) FROM ideas i WHERE i.joins_count <> (SELECT count(*) FROM participations p WHERE p.idea_id = i.id AND p.state IN ('JOINED', 'ACCEPTED'))`},
		{"at most one open moderation case per idea",
			`SELECT count(*) FROM (SELECT idea_id FROM moderation_cases WHERE state = 'OPEN' GROUP BY idea_id HAVING count(*) > 1) x`},
		{"a closed case records who decided and when",
			`SELECT count(*) FROM moderation_cases WHERE state = 'CLOSED' AND (decision IS NULL OR decided_by IS NULL OR decided_at IS NULL)`},
		{"an open case never carries a decision",
			`SELECT count(*) FROM moderation_cases WHERE state = 'OPEN' AND (decision IS NOT NULL OR decided_by IS NOT NULL)`},
		{"every reply lives in the thread of its parent",
			`SELECT count(*) FROM posts c JOIN posts p ON p.id = c.parent_id WHERE c.topic_id <> p.topic_id`},
		{"one thread per idea",
			`SELECT count(*) FROM (SELECT idea_id FROM topics GROUP BY idea_id HAVING count(*) > 1) x`},
		{"counters are never negative",
			`SELECT count(*) FROM ideas WHERE votes_weighted < 0 OR comments_count < 0 OR joins_count < 0`},
		{"karma is never negative",
			`SELECT count(*) FROM users WHERE karma < 0 OR approved_ideas < 0`},
		{"ranking is a real number",
			`SELECT count(*) FROM ideas WHERE hot_score IS NULL OR hot_score = 'NaN' OR hot_score = 'Infinity' OR hot_score = '-Infinity'`},
		{"an idea with five open reports is not approved",
			`SELECT count(*) FROM ideas i WHERE i.moderation_state = 'APPROVED' AND (SELECT count(*) FROM reports r WHERE r.idea_id = i.id AND r.status = 'OPEN') >= 5`},
		{"a hidden idea has an open case or a closing decision",
			`SELECT count(*) FROM ideas i WHERE i.moderation_state IN ('HIDDEN', 'REJECTED') AND NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.idea_id = i.id)`},
		{"nobody votes for their own idea",
			`SELECT count(*) FROM votes v JOIN ideas i ON i.id = v.idea_id WHERE v.user_id = i.author_id`},
		{"nobody reports their own idea",
			`SELECT count(*) FROM reports r JOIN ideas i ON i.id = r.idea_id WHERE r.user_id = i.author_id`},
		{"every notification belongs to a person",
			`SELECT count(*) FROM notifications n LEFT JOIN users u ON u.id = n.user_id WHERE u.id IS NULL`},
		{"nobody is notified of their own action",
			`SELECT count(*) FROM notifications n WHERE n.type IN ('VOTE', 'COMMENT', 'JOIN') AND n.payload->>'actorHandle' = (SELECT handle FROM users WHERE id = n.user_id)`},
	}
	for _, rule := range rules {
		if n := count(env, rule.sql); n != 0 {
			t.Errorf("rule broken (%d rows): %s", n, rule.name)
		}
	}

	// The job that recomputes ranking agrees with what the writes maintained incrementally.
	before := map[string]float64{}
	for _, id := range ids {
		before[id] = apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE id = $1`, id)
	}
	for _, j := range env.Jobs {
		if err := j(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range ids {
		after := apptest.Scalar[float64](env, `SELECT hot_score FROM ideas WHERE id = $1`, id)
		if d := after - before[id]; d > 0.05*(1+before[id]) || d < -0.05*(1+before[id]) {
			t.Errorf("hot_score of %s drifted from %.4f to %.4f when recomputed", id, before[id], after)
		}
	}
}
