package regression_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// The benchmarks run the whole request path (middleware, handler, SQL) in
// process, so a change that makes a hot path slower or hungrier shows up as a
// number. Compare runs with benchstat; they are not CI gates, as shared
// runners are too noisy for that.

// benchWorld has 120 published ideas by a member (members skip premoderation and the daily quota),
// one of them with a 60-comment thread, and a handful of signed-in people.
func benchWorld(b *testing.B) (who people, slug string) {
	b.Helper()
	env := apptest.New(b)
	who = cast(env)
	for i := range 120 {
		r := who.Member.Do(http.MethodPost, "/api/ideas", map[string]any{
			"title": fmt.Sprintf("Benchmark idea %03d", i), "summary": "A summary of reasonable length for a card",
			"body": "## Heading\n\nSome **markdown** with a [link](https://example.com).", "category": "PROJECT", "tags": []string{"bench", "go"},
		})
		if r.Code != http.StatusCreated {
			b.Fatalf("seed: %d %s", r.Code, r.Body)
		}
		if i == 0 {
			slug = r.Map()["slug"].(string)
		}
	}
	for i := range 60 {
		c := who.Third
		if i%2 == 0 {
			c = who.Outsider
		}
		if r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": fmt.Sprintf("comment %d with *emphasis*", i)}); r.Code != http.StatusCreated {
			b.Fatalf("seed comment: %d %s", r.Code, r.Body)
		}
	}
	b.ResetTimer()
	return who, slug
}

func serve(b *testing.B, c *apptest.Client, method, path string, body any, want int) {
	b.Helper()
	if r := c.Do(method, path, body); r.Code != want {
		b.Fatalf("%s %s: %d %s", method, path, r.Code, r.Body)
	}
}

func BenchmarkFeedAnonymous(b *testing.B) {
	who, _ := benchWorld(b)
	for _, sort := range []string{"hot", "new", "top"} {
		b.Run(sort, func(b *testing.B) {
			for range b.N {
				serve(b, who.Anon, http.MethodGet, "/api/ideas?limit=20&sort="+sort, nil, http.StatusOK)
			}
		})
	}
}

func BenchmarkFeedSignedIn(b *testing.B) {
	who, _ := benchWorld(b)
	for range b.N {
		serve(b, who.Outsider, http.MethodGet, "/api/ideas?limit=20", nil, http.StatusOK)
	}
}

func BenchmarkIdeaDetail(b *testing.B) {
	who, slug := benchWorld(b)
	for range b.N {
		serve(b, who.Outsider, http.MethodGet, "/api/ideas/"+slug, nil, http.StatusOK)
	}
}

func BenchmarkThread60Comments(b *testing.B) {
	who, slug := benchWorld(b)
	for range b.N {
		serve(b, who.Anon, http.MethodGet, "/api/ideas/"+slug+"/thread", nil, http.StatusOK)
	}
}

func BenchmarkVoteAndWithdraw(b *testing.B) {
	who, slug := benchWorld(b)
	for range b.N {
		serve(b, who.Outsider, http.MethodPut, "/api/ideas/"+slug+"/vote", nil, http.StatusOK)
		serve(b, who.Outsider, http.MethodDelete, "/api/ideas/"+slug+"/vote", nil, http.StatusOK)
	}
}

func BenchmarkPostComment(b *testing.B) {
	who, slug := benchWorld(b)
	for range b.N {
		serve(b, who.Third, http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "a benchmark comment"}, http.StatusCreated)
	}
}

// The same feed read from many goroutines at once: what the connection pool and the middleware cost under load.
func BenchmarkFeedParallel(b *testing.B) {
	who, _ := benchWorld(b)
	b.RunParallel(func(pb *testing.PB) {
		c := who.Outsider.Clone()
		for pb.Next() {
			if r := c.Do(http.MethodGet, "/api/ideas?limit=20", nil); r.Code != http.StatusOK {
				b.Errorf("feed: %d", r.Code)
				return
			}
		}
	})
}

// Access to every route as the cheapest possible request: the cost of the middleware chain itself.
func BenchmarkMiddlewareOnly(b *testing.B) {
	who, _ := benchWorld(b)
	for range b.N {
		serve(b, who.Anon, http.MethodGet, "/api/auth/providers", nil, http.StatusOK)
	}
}
