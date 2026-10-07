package regression_test

import (
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
)

// tight returns options with every limiter set so low that a few requests trip it.
func tight(mutate func(*config.Config)) apptest.Option {
	return apptest.WithConfig(func(c *config.Config) {
		c.RateLimitAnonRPS, c.RateLimitAnonBurst = 0.1, 5
		c.RateLimitUserRPS, c.RateLimitUserBurst = 0.1, 8
		c.RateLimitLoginPerMin = 3
		c.RateLimitPostsPerMin = 3
		if mutate != nil {
			mutate(c)
		}
	})
}

// drain sends requests until the first 429 and returns how many were let through.
func drain(do func() *apptest.Response, max int) (allowed int, refused *apptest.Response) {
	for range max {
		r := do()
		if r.Code == http.StatusTooManyRequests {
			return allowed, r
		}
		allowed++
	}
	return allowed, nil
}

func TestAnonymousTrafficIsThrottledPerAddress(t *testing.T) {
	env := apptest.New(t, tight(nil))
	anon := env.Anon()
	allowed, r := drain(func() *apptest.Response { return anon.Do(http.MethodGet, "/api/ideas", nil) }, 50)
	if r == nil {
		t.Fatal("50 anonymous requests in a burst were never throttled")
	}
	if allowed != 5 {
		t.Errorf("burst of %d allowed, want 5", allowed)
	}
	// The refusal is well-formed and tells the client when to come back.
	if secs, err := strconv.Atoi(r.Header.Get("Retry-After")); err != nil || secs < 1 {
		t.Errorf("Retry-After = %q", r.Header.Get("Retry-After"))
	}
	var body struct{ Error, Code, RequestID string }
	r.Decode(&body)
	if body.Code != "rate_limited" || body.RequestID == "" {
		t.Errorf("body: %s", r.Body)
	}
	if r.Header.Get("X-Content-Type-Options") != "nosniff" || r.Header.Get("Cache-Control") != "no-store" {
		t.Error("a 429 lacks the security headers")
	}
	// Every route sits behind the limiter, including the ones that do no work.
	for _, p := range []string{"/api/auth/providers", "/api/events", "/no/such/route"} {
		if r := anon.Do(http.MethodGet, p, nil); r.Code != http.StatusTooManyRequests {
			t.Errorf("%s answered %d while the address is throttled", p, r.Code)
		}
	}
}

func TestThrottlingIsPerPersonAndSignedInTrafficHasItsOwnBudget(t *testing.T) {
	// Signing in is generously budgeted here so the test can set the cast up; the user budget stays tight.
	env := apptest.New(t, tight(func(c *config.Config) {
		c.RateLimitLoginPerMin = 1000
		c.RateLimitAnonBurst = 1000
		c.RateLimitAnonRPS = 1000
	}))
	a, b := env.SignIn(outsiderMail), env.SignIn(thirdMail)

	allowed, r := drain(func() *apptest.Response { return a.Do(http.MethodGet, "/api/me", nil) }, 50)
	if r == nil || allowed != 8 {
		t.Fatalf("user burst: allowed %d, refused=%v", allowed, r != nil)
	}
	// Someone else on the same address is unaffected...
	if r := b.Do(http.MethodGet, "/api/me", nil); r.Code != http.StatusOK {
		t.Errorf("a second user was throttled by the first: %d", r.Code)
	}
	// ...and the first user stays throttled.
	if r := a.Do(http.MethodGet, "/api/me", nil); r.Code != http.StatusTooManyRequests {
		t.Errorf("still throttled expected, got %d", r.Code)
	}
}

func TestForgedForwardingHeadersCannotEvadeTheLimiter(t *testing.T) {
	env := apptest.New(t, tight(nil)) // no trusted proxies configured
	anon := env.Anon()
	n := 0
	allowed, r := drain(func() *apptest.Response {
		n++
		return anon.DoWith(http.MethodGet, "/api/ideas", nil, map[string]string{
			"X-Forwarded-For": "203.0.113." + strconv.Itoa(n%250), "X-Real-IP": "198.51.100." + strconv.Itoa(n%250), "Forwarded": "for=192.0.2." + strconv.Itoa(n%250),
		})
	}, 50)
	if r == nil || allowed != 5 {
		t.Fatalf("spoofed headers changed the budget: allowed %d", allowed)
	}
}

func TestTrustedProxyForwardingSeparatesClients(t *testing.T) {
	env := apptest.New(t, tight(func(c *config.Config) { c.TrustedProxyCIDRs = []string{"192.0.2.0/24"} }))
	anon := env.Anon()
	from := func(xff string) *apptest.Response {
		return anon.DoWith(http.MethodGet, "/api/ideas", nil, map[string]string{"X-Forwarded-For": xff})
	}
	if _, r := drain(func() *apptest.Response { return from("203.0.113.7") }, 50); r == nil {
		t.Fatal("client one was never throttled")
	}
	// A different client behind the same proxy has its own budget.
	if r := from("203.0.113.8"); r.Code != http.StatusOK {
		t.Errorf("client two was throttled by client one: %d", r.Code)
	}
	// Prepending a fake address does not help: the right-most untrusted hop is the client.
	if r := from("198.51.100.99, 203.0.113.7"); r.Code != http.StatusTooManyRequests {
		t.Errorf("a prepended address evaded the limiter: %d", r.Code)
	}
	// Garbage in the header falls back to the proxy address instead of failing open.
	if r := from("not-an-ip"); r.Code >= 500 {
		t.Errorf("garbage header: %d", r.Code)
	}
}

func TestLoginAttemptsAreThrottled(t *testing.T) {
	env := apptest.New(t, tight(func(c *config.Config) { c.RateLimitAnonBurst = 1000; c.RateLimitAnonRPS = 1000 }))
	allowed, r := drain(func() *apptest.Response { return env.Anon().Do(http.MethodGet, "/api/auth/google/login", nil) }, 20)
	if r == nil || allowed != 3 {
		t.Fatalf("login burst: allowed %d, refused=%v", allowed, r != nil)
	}
	// Callbacks count against the same budget, so guessing codes is as limited as starting flows.
	if r := env.Anon().Do(http.MethodGet, "/api/auth/google/callback?state=a&code=b", nil); r.Code != http.StatusTooManyRequests {
		t.Errorf("callback: %d", r.Code)
	}
	// Reading public data is unaffected.
	if r := env.Anon().Do(http.MethodGet, "/api/ideas", nil); r.Code != http.StatusOK {
		t.Errorf("feed while login is throttled: %d", r.Code)
	}
}

func TestWriteBudgetsAreSeparateFromReads(t *testing.T) {
	env := apptest.New(t, tight(func(c *config.Config) {
		c.RateLimitUserBurst, c.RateLimitUserRPS, c.RateLimitAnonBurst, c.RateLimitAnonRPS, c.RateLimitLoginPerMin = 1000, 1000, 1000, 1000, 1000
	}))
	who := cast(env)
	slug, _ := idea(t, env, who.Member, map[string]any{"title": "Busy thread", "summary": "s"})

	allowed, r := drain(func() *apptest.Response {
		return who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "chatter"})
	}, 20)
	if r == nil || allowed != 3 {
		t.Fatalf("comment burst: allowed %d, refused=%v", allowed, r != nil)
	}
	if n := count(env, `SELECT count(*) FROM posts`); n != 3 {
		t.Errorf("%d comments stored, want exactly the 3 let through", n)
	}
	if n := count(env, `SELECT comments_count FROM ideas WHERE slug = $1`, slug); n != 3 {
		t.Errorf("comments_count = %d, want 3", n)
	}
	// The same person can still read, vote and edit; someone else can still comment.
	if r := who.Outsider.Do(http.MethodGet, "/api/ideas/"+slug+"/thread", nil); r.Code != http.StatusOK {
		t.Errorf("read while throttled for writing: %d", r.Code)
	}
	if r := who.Outsider.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil); r.Code == http.StatusTooManyRequests {
		t.Error("voting shares the comment budget")
	}
	if r := who.Third.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "my turn"}); r.Code != http.StatusCreated {
		t.Errorf("a different user was throttled: %d", r.Code)
	}

	// Reports have a budget of their own.
	var rejected int
	for i := range 6 {
		sl, _ := idea(t, env, who.Member, map[string]any{"title": "Reportable " + strconv.Itoa(i), "summary": "s"})
		if r := who.Third.Do(http.MethodPost, "/api/ideas/"+sl+"/report", map[string]any{"reason": "this is spam, really"}); r.Code == http.StatusTooManyRequests {
			rejected++
		}
	}
	if rejected == 0 {
		t.Error("report flooding was never throttled")
	}
}

func TestThrottledRequestsNeverReachTheirHandler(t *testing.T) {
	env := apptest.New(t, tight(func(c *config.Config) {
		c.RateLimitUserBurst, c.RateLimitAnonBurst, c.RateLimitLoginPerMin = 2, 100, 1000
	}))
	c := env.SignIn(outsiderMail)
	for range 2 {
		c.Do(http.MethodGet, "/api/me", nil)
	}
	r := c.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Should not exist", "summary": "s", "category": "PROJECT"})
	if r.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", r.Code)
	}
	if n := count(env, `SELECT count(*) FROM ideas`); n != 0 {
		t.Errorf("a throttled write created %d ideas", n)
	}
	if !strings.Contains(string(r.Body), "rate_limited") {
		t.Errorf("body: %s", r.Body)
	}
}
