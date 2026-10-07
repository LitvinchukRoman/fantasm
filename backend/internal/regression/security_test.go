package regression_test

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// ---- access control on every route ----

func TestEveryRouteEnforcesItsAccessLevel(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	p := plain(slug)

	type level struct {
		name   string
		client *apptest.Client
		rank   access // the highest level this viewer holds
		anon   bool
	}
	levels := []level{{"anonymous", who.Anon, public, true}, {"user", who.Outsider, authed, false}, {"moderator", who.Mod, staff, false}, {"admin", who.Admin, admin, false}}

	for _, rt := range routes {
		if strings.HasPrefix(rt.Path, "/api/auth/") && rt.Access == public {
			continue // the sign-in flow has its own tests
		}
		if rt.Path == "/api/auth/logout-all" {
			continue // ends the very sessions this loop reuses; sessions_test.go covers it
		}
		for _, l := range levels {
			r := send(l.client, rt, p, nil, nil)
			allowed := l.rank >= rt.Access
			switch {
			case r.Code >= 500:
				t.Errorf("%s %s as %s: server error %d %s", rt.Method, rt.Path, l.name, r.Code, r.Body)
			case !allowed && l.anon && r.Code != http.StatusUnauthorized:
				t.Errorf("%s %s as %s: %d, want 401 (needs %s)", rt.Method, rt.Path, l.name, r.Code, rt.Access)
			case !allowed && !l.anon && r.Code != http.StatusForbidden:
				t.Errorf("%s %s as %s: %d, want 403 (needs %s)", rt.Method, rt.Path, l.name, r.Code, rt.Access)
			case allowed && (r.Code == http.StatusUnauthorized || r.Code == http.StatusForbidden && rt.Access >= staff):
				t.Errorf("%s %s as %s: %d, but this viewer is allowed", rt.Method, rt.Path, l.name, r.Code)
			}
		}
	}
}

func TestCSRFOnEveryUnsafeRoute(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	p := plain(slug)

	attacks := map[string]map[string]string{
		"foreign origin":        {"Origin": "https://evil.example"},
		"cross-site fetch":      {"Origin": apptest.Origin, "Sec-Fetch-Site": "cross-site"},
		"same-site fetch":       {"Origin": apptest.Origin, "Sec-Fetch-Site": "same-site"},
		"no origin at all":      {"Origin": ""},
		"opaque origin":         {"Origin": "null"},
		"origin with extra":     {"Origin": apptest.Origin + ".evil.example"},
		"origin with userinfo":  {"Origin": "http://localhost:8080@evil.example"},
		"other port":            {"Origin": "http://localhost:9999"},
		"other scheme":          {"Origin": "https://localhost:8080"},
		"cross-site, no origin": {"Origin": "", "Sec-Fetch-Site": "cross-site"},
	}
	for _, rt := range routes {
		if !rt.unsafe() {
			continue
		}
		for name, h := range attacks {
			// A fresh client each time: an attack that got through must not hide behind an earlier one.
			r := who.Admin.Clone().DoWith(rt.Method, p.fill(rt.Path), map[string]any{}, h)
			if r.Code != http.StatusForbidden {
				t.Errorf("%s %s with %s: %d, want 403", rt.Method, rt.Path, name, r.Code)
			}
		}
		ok := who.Admin.Clone().DoWith(rt.Method, p.fill(rt.Path), map[string]any{}, map[string]string{"Origin": apptest.Origin, "Sec-Fetch-Site": "same-origin"})
		if ok.Code == http.StatusForbidden && strings.Contains(string(ok.Body), "origin") {
			t.Errorf("%s %s: a same-origin request was refused as cross-site", rt.Method, rt.Path)
		}
	}
	// Reads are not state-changing and may come from anywhere.
	if r := who.Anon.DoWith(http.MethodGet, "/api/ideas", nil, map[string]string{"Origin": "https://evil.example"}); r.Code != http.StatusOK {
		t.Errorf("cross-origin read: %d", r.Code)
	}
}

func TestACrossSiteWriteChangesNothing(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, id := idea(t, env, who.Outsider, nil)
	evil := map[string]string{"Origin": "https://evil.example", "Sec-Fetch-Site": "cross-site"}

	who.Member.DoWith(http.MethodPut, "/api/ideas/"+slug+"/vote", nil, evil)
	who.Member.DoWith(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "forged"}, evil)
	who.Member.DoWith(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": "forged"}, evil)
	who.Outsider.DoWith(http.MethodDelete, "/api/ideas/"+slug, nil, evil)
	who.Member.DoWith(http.MethodPatch, "/api/me", map[string]any{"name": "Hacked"}, evil)
	who.Member.DoWith(http.MethodPost, "/api/auth/logout-all", nil, evil)

	if count(env, `SELECT count(*) FROM votes WHERE idea_id = $1`, id)+count(env, `SELECT count(*) FROM posts`)+count(env, `SELECT count(*) FROM reports`) != 0 {
		t.Fatal("a forged write was applied")
	}
	if count(env, `SELECT count(*) FROM ideas WHERE id = $1 AND deleted_at IS NULL`, id) != 1 {
		t.Fatal("a forged delete was applied")
	}
	if apptest.Scalar[string](env, `SELECT name FROM users WHERE email = $1`, memberMail) == "Hacked" {
		t.Fatal("a forged profile change was applied")
	}
	if r := who.Member.Do(http.MethodGet, "/api/me", nil); r.Code != http.StatusOK {
		t.Fatalf("a forged logout-all ended the session: %d", r.Code)
	}
}

// ---- hostile input never causes a server error ----

var hostile = []string{
	"' OR '1'='1", "'; DROP TABLE users; --", `" OR ""="`, "1; SELECT pg_sleep(5)--", "' UNION SELECT NULL,NULL,NULL--", "\\'", "$1", "$$",
	"%s%s%s%n", "{{7*7}}", "${jndi:ldap://evil.example/a}", "../../etc/passwd", `..\..\windows\system32`, "%00", "\x00", "a\x00b",
	"<script>alert(1)</script>", `"><img src=x onerror=alert(1)>`, "javascript:alert(1)", "\xff\xfe\xfd", "\xc0\xaf", "\r\nSet-Cookie: pwned=1", "\n", " ", "",
	"-1", "0", "9223372036854775808", "1e999", "NaN", "null", "true", "[]", "{}", "٣", "İ", "\u202e", "\ufeff", "💥", strings5000(),
}

func strings5000() string { return strings.Repeat("A", 5000) }

func TestHostileInputNeverCausesAServerError(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, map[string]any{"title": "Hostile target", "eventLocation": "Library"})
	tablesBefore := count(env, `SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()`)
	usersBefore := count(env, `SELECT count(*) FROM users`)

	check := func(rt route, what string, r *apptest.Response, took time.Duration) {
		t.Helper()
		if r.Code >= 500 {
			t.Errorf("%s %s %s: server error %d %s", rt.Method, rt.Path, what, r.Code, r.Body)
		}
		if took > 3*time.Second {
			t.Errorf("%s %s %s: took %v (injected delay?)", rt.Method, rt.Path, what, took)
		}
		for _, c := range (&http.Response{Header: r.Header}).Cookies() {
			if c.Name == "pwned" {
				t.Errorf("%s %s %s: header injection set a cookie", rt.Method, rt.Path, what)
			}
		}
	}
	timed := func(f func() *apptest.Response) (*apptest.Response, time.Duration) {
		start := time.Now()
		r := f()
		return r, time.Since(start)
	}

	for _, rt := range routes {
		if strings.HasPrefix(rt.Path, "/api/auth/") && rt.Access == public && rt.Method == "GET" && strings.Contains(rt.Path, "{provider}") {
			// Sign-in: the provider name and the callback parameters are attacker-chosen as well.
			for _, h := range hostile {
				r, took := timed(func() *apptest.Response {
					return who.Anon.Clone().Do(http.MethodGet, strings.ReplaceAll(rt.Path, "{provider}", url.PathEscape(h))+"?state="+url.QueryEscape(h)+"&code="+url.QueryEscape(h), nil)
				})
				check(rt, "provider/state/code "+h[:min(len(h), 20)], r, took)
			}
			continue
		}
		for _, h := range hostile {
			label := strings.ToValidUTF8(h[:min(len(h), 24)], "?")
			// 1. every placeholder at once
			p := params{"slug": h, "id": h, "handle": h, "decision": h, "provider": h}
			r, took := timed(func() *apptest.Response { return send(who.Admin, rt, p, nil, nil) })
			check(rt, "path="+label, r, took)

			// 2. every query parameter
			if len(rt.Query) > 0 {
				q := url.Values{}
				for _, name := range rt.Query {
					q.Set(name, h)
				}
				r, took := timed(func() *apptest.Response {
					return who.Admin.Do(rt.Method, plain(slug).fill(rt.Path)+"?"+q.Encode(), bodyFor(rt, ""))
				})
				check(rt, "query="+label, r, took)
			}

			// 3. every body field (valid UTF-8 only: JSON cannot carry anything else)
			if rt.unsafe() && (len(rt.Fields) > 0 || len(rt.Lists) > 0) && strings.ToValidUTF8(h, "") == h {
				r, took := timed(func() *apptest.Response { return send(who.Admin, rt, plain(slug), bodyFor(rt, h), nil) })
				check(rt, "body="+label, r, took)
			}
		}
	}

	if got := count(env, `SELECT count(*) FROM information_schema.tables WHERE table_schema = current_schema()`); got != tablesBefore {
		t.Errorf("tables: %d before, %d after", tablesBefore, got)
	}
	if got := count(env, `SELECT count(*) FROM users`); got < usersBefore {
		t.Errorf("users: %d before, %d after", usersBefore, got)
	}
	if r := who.Anon.Do(http.MethodGet, "/api/ideas", nil); r.Code != http.StatusOK {
		t.Errorf("the feed is broken after the barrage: %d %s", r.Code, r.Body)
	}
}

// bodyFor puts value into every field of the route's JSON body.
func bodyFor(rt route, value string) any {
	if !rt.unsafe() {
		return nil
	}
	m := map[string]any{}
	for _, f := range rt.Fields {
		m[f] = value
	}
	for _, f := range rt.Lists {
		m[f] = []string{value}
	}
	return m
}

func TestStoredTextRoundTripsVerbatim(t *testing.T) {
	// Parameterised queries mean text with SQL in it is just text: stored and returned as typed.
	env := apptest.New(t)
	who := cast(env)
	nasty := `Robert'); DROP TABLE ideas;-- "quoted" \back\slash $1 %s ‹unicode› 🙂`
	r := who.Member.Do(http.MethodPost, "/api/ideas", map[string]any{"title": nasty, "summary": nasty, "category": "PROJECT", "tags": []string{"x'; DROP TABLE users;--"}})
	if r.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", r.Code, r.Body)
	}
	slug := r.Map()["slug"].(string)
	got := who.Member.Do(http.MethodGet, "/api/ideas/"+slug, nil).Map()
	if got["title"] != nasty || got["summary"] != nasty {
		t.Fatalf("text altered: %q / %q", got["title"], got["summary"])
	}
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, slug)
	id := comment(t, who.Outsider, slug, nasty, "")
	if id == "" || count(env, `SELECT count(*) FROM posts`) != 1 {
		t.Fatal("comment not stored")
	}
	if r := who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/report", map[string]any{"reason": nasty}); r.Code != http.StatusNoContent {
		t.Fatalf("report: %d %s", r.Code, r.Body)
	}
	if apptest.Scalar[string](env, `SELECT reason FROM reports`) != nasty {
		t.Fatal("report reason altered")
	}
	if count(env, `SELECT count(*) FROM ideas`) != 1 || count(env, `SELECT count(*) FROM users`) < 3 {
		t.Fatal("tables damaged")
	}
}

func TestInjectionInFiltersDoesNotWidenResults(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	idea(t, env, who.Member, map[string]any{"title": "Alpha idea", "tags": []string{"alpha"}})
	idea(t, env, who.Outsider, map[string]any{"title": "Beta idea", "tags": []string{"beta"}, "category": "EVENT", "eventAt": time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)})
	total := func(q string) int {
		r := who.Anon.Do(http.MethodGet, "/api/ideas"+q, nil)
		if r.Code != http.StatusOK {
			return -r.Code
		}
		var p struct{ Items []any }
		r.Decode(&p)
		return len(p.Items)
	}
	if total("") != 2 || total("?tag=alpha") != 1 {
		t.Fatalf("baseline: all=%d alpha=%d", total(""), total("?tag=alpha"))
	}
	for _, q := range []string{
		"?tag=" + url.QueryEscape("nomatch' OR '1'='1"), "?tag=" + url.QueryEscape("alpha' OR '1'='1"), "?tag=" + url.QueryEscape("alpha') OR (1=1"),
		"?campus=" + url.QueryEscape("x' OR '1'='1"), "?campus=" + url.QueryEscape("') OR 1=1--"), "?tag=" + url.QueryEscape("%"), "?tag=" + url.QueryEscape("_lpha"),
	} {
		// Either nothing matches or the value is refused; what it must never do is match more.
		if n := total(q); n > 0 {
			t.Errorf("%s returned %d items, want none", q, n)
		}
	}
	for _, q := range []string{"?sort=" + url.QueryEscape("hot; DROP TABLE ideas"), "?sort=" + url.QueryEscape("hot,(select 1)"), "?category=" + url.QueryEscape("PROJECT' OR '1'='1"), "?status=" + url.QueryEscape("OPEN' OR 1=1--")} {
		if n := total(q); n >= 0 {
			t.Errorf("%s was accepted (%d items), want a client error", q, n)
		}
	}
	if r := who.Anon.Do(http.MethodGet, "/api/users/"+url.PathEscape("nobody' OR '1'='1"), nil); r.Code != http.StatusNotFound {
		t.Errorf("profile lookup with injection: %d", r.Code)
	}
}

// ---- XSS ----

var xssPayloads = []string{
	`<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `<svg/onload=alert(1)>`, `[click](javascript:alert(1))`, `[click](JaVaScRiPt:alert(1))`,
	`[click](&#106;avascript:alert(1))`, `[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)`, `![x](javascript:alert(1))`, `<iframe src="javascript:alert(1)">`,
	`<a href="javascript:alert(1)">x</a>`, `<details open ontoggle=alert(1)>`, `<style>@import 'javascript:alert(1)'</style>`, `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>`,
	"<scr<script>ipt>alert(1)</scr</script>ipt>", `"><script>alert(1)</script>`, `<<img src=x onerror=alert(1)//`, `<form action="javascript:alert(1)"><button>x</button></form>`,
	`<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`, `<object data="javascript:alert(1)">`, `<base href="javascript:alert(1)//">`,
	"[x](https://example.com \"title\" onclick=\"alert(1)\")", "<https://example.com\" onmouseover=\"alert(1)>", "[x]: <javascript:alert(1)>\n\n[x]",
}

var executable = regexp.MustCompile(`(?i)<\s*(script|iframe|object|embed|style|link|meta|base|form|svg|math|img)\b|<[^>]*\s(on[a-z]+\s*=|(href|src|action|formaction)\s*=\s*["']?\s*(javascript|data|vbscript):)`)

// htmlFields collects every value stored under an "html" key anywhere in a JSON document.
func htmlFields(t *testing.T, body []byte) []string {
	t.Helper()
	var doc any
	if err := json.Unmarshal(body, &doc); err != nil {
		t.Fatalf("not JSON: %s", body)
	}
	var out []string
	var walk func(any)
	walk = func(v any) {
		switch v := v.(type) {
		case map[string]any:
			for k, x := range v {
				if s, ok := x.(string); ok && k == "html" {
					out = append(out, s)
				}
				walk(x)
			}
		case []any:
			for _, x := range v {
				walk(x)
			}
		}
	}
	walk(doc)
	return out
}

func TestUserMarkupNeverReachesAnHTMLField(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	var slugs []string
	for i, payload := range xssPayloads {
		// Ideas: the body is rendered Markdown. Rejected payloads are fine; accepted ones must come out safe.
		r := who.Member.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "XSS probe", "summary": payload, "body": "# Heading\n\n" + payload + "\n\n" + payload, "category": "PROJECT"})
		if r.Code == http.StatusCreated {
			slug := r.Map()["slug"].(string)
			env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, slug)
			slugs = append(slugs, slug)
		} else if r.Code != http.StatusUnprocessableEntity {
			t.Errorf("payload %d: unexpected %d %s", i, r.Code, r.Body)
		}
	}
	if len(slugs) == 0 {
		t.Fatal("no probe idea was accepted, nothing was tested")
	}
	target := slugs[0]
	for _, payload := range xssPayloads {
		who.Outsider.Do(http.MethodPost, "/api/ideas/"+target+"/posts", map[string]any{"body": payload})
	}
	who.Outsider.Do(http.MethodPatch, "/api/me", map[string]any{"name": "<script>alert(1)</script>", "bio": `<img src=x onerror=alert(1)>`})

	reads := []string{"/api/ideas", "/api/ideas/" + target, "/api/ideas/" + target + "/thread", "/api/events", "/api/users/" + apptestHandle(env, outsiderMail), "/api/ideas/" + target + "/next"}
	for _, s := range slugs {
		reads = append(reads, "/api/ideas/"+s)
	}
	checked := 0
	for _, path := range reads {
		r := who.Anon.Do(http.MethodGet, path, nil)
		if r.Code >= 500 {
			t.Errorf("GET %s: %d", path, r.Code)
			continue
		}
		if ct := r.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("GET %s: content type %q lets a browser interpret the body", path, ct)
		}
		if r.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("GET %s: no nosniff", path)
		}
		for _, h := range htmlFields(t, r.Body) {
			checked++
			if m := executable.FindString(h); m != "" {
				t.Errorf("GET %s: executable markup %q in %q", path, m, h)
			}
		}
	}
	if checked < 10 {
		t.Fatalf("only %d html fields were inspected", checked)
	}
	// Moderators' views render the same user content.
	for _, path := range []string{"/api/moderation/queue", "/api/moderation/queue?state=HIDDEN"} {
		r := who.Mod.Do(http.MethodGet, path, nil)
		for _, h := range htmlFields(t, r.Body) {
			if m := executable.FindString(h); m != "" {
				t.Errorf("GET %s: executable markup %q", path, m)
			}
		}
	}
}

func apptestHandle(env *apptest.Env, email string) string {
	return apptest.Scalar[string](env, `SELECT handle FROM users WHERE email = $1`, email)
}

// ---- headers, error shape, limits ----

func TestEveryResponseCarriesSecurityHeadersAndAUniformErrorShape(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)

	probes := []struct {
		name string
		do   func() *apptest.Response
		want int
	}{
		{"ok", func() *apptest.Response { return who.Anon.Do("GET", "/api/ideas", nil) }, 200},
		{"unauthenticated", func() *apptest.Response { return who.Anon.Do("GET", "/api/me", nil) }, 401},
		{"forbidden", func() *apptest.Response { return who.Outsider.Do("GET", "/api/moderation/queue", nil) }, 403},
		{"not found", func() *apptest.Response { return who.Anon.Do("GET", "/api/ideas/nope", nil) }, 404},
		{"unknown route", func() *apptest.Response { return who.Anon.Do("GET", "/api/definitely/not/here", nil) }, 404},
		{"method not allowed", func() *apptest.Response { return who.Anon.Do("TRACE", "/api/ideas", nil) }, 405},
		{"method not allowed on item", func() *apptest.Response { return who.Member.Do("PUT", "/api/ideas/"+slug, map[string]any{}) }, 405},
		{"validation", func() *apptest.Response {
			return who.Member.Do("POST", "/api/ideas", map[string]any{"title": "x", "category": "PROJECT"})
		}, 422},
		{"malformed json", func() *apptest.Response { return who.Member.Do("POST", "/api/ideas", "{not json") }, 400},
		{"wrong media type", func() *apptest.Response {
			return who.Member.DoWith("POST", "/api/ideas", `{"title":"abc"}`, map[string]string{"Origin": apptest.Origin, "Content-Type": "text/plain"})
		}, 415},
		{"cross origin", func() *apptest.Response {
			return who.Member.DoWith("POST", "/api/ideas", map[string]any{}, map[string]string{"Origin": "https://evil.example"})
		}, 403},
		{"conflict", func() *apptest.Response {
			who.Outsider.Do("POST", "/api/ideas/"+slug+"/report", map[string]any{"reason": "x"})
			return who.Outsider.Do("POST", "/api/ideas/"+slug+"/report", map[string]any{"reason": "x"})
		}, 409},
	}
	for _, p := range probes {
		r := p.do()
		if r.Code != p.want {
			t.Errorf("%s: %d, want %d (%s)", p.name, r.Code, p.want, r.Body)
		}
		for header, want := range map[string]string{
			"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
		} {
			if got := r.Header.Get(header); got != want {
				t.Errorf("%s: %s = %q, want %q", p.name, header, got, want)
			}
		}
		if csp := r.Header.Get("Content-Security-Policy"); !strings.Contains(csp, "default-src 'none'") || !strings.Contains(csp, "frame-ancestors 'none'") {
			t.Errorf("%s: CSP %q", p.name, csp)
		}
		if r.Header.Get("X-Request-ID") == "" {
			t.Errorf("%s: no request id", p.name)
		}
		if p.want >= 400 {
			var e struct{ Error, Code, RequestID string }
			if err := json.Unmarshal(r.Body, &e); err != nil || e.Error == "" || e.Code == "" {
				t.Errorf("%s: error body is not the standard shape: %q", p.name, r.Body)
			} else if e.RequestID != r.Header.Get("X-Request-ID") {
				t.Errorf("%s: requestId %q does not match the header %q", p.name, e.RequestID, r.Header.Get("X-Request-ID"))
			}
			if body := strings.ToLower(string(r.Body)); strings.ContainsAny(body, "\t") || strings.Contains(body, "goroutine") || strings.Contains(body, ".go:") ||
				strings.Contains(body, "pgx") || strings.Contains(body, "sqlstate") || strings.Contains(body, "select ") || strings.Contains(body, "panic") {
				t.Errorf("%s: error body leaks internals: %s", p.name, r.Body)
			}
		}
	}
}

func TestPrivateResponsesAreNeverCacheable(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	for _, c := range []*apptest.Client{who.Anon, who.Member} {
		for _, path := range []string{"/api/me", "/api/me/sessions", "/api/me/notifications", "/api/ideas", "/api/ideas/" + slug, "/api/ideas/" + slug + "/thread", "/api/auth/providers"} {
			r := c.Do("GET", path, nil)
			if cc := r.Header.Get("Cache-Control"); !strings.Contains(cc, "no-store") {
				t.Errorf("GET %s: Cache-Control %q", path, cc)
			}
			if !strings.Contains(strings.Join(r.Header.Values("Vary"), ","), "Cookie") {
				t.Errorf("GET %s: no Vary: Cookie, a shared cache could serve one viewer's page to another", path)
			}
		}
	}
	// The one public cache: anonymous-only data, identical for everybody.
	r := who.Member.Do("GET", "/api/sitemap/ideas", nil)
	if cc := r.Header.Get("Cache-Control"); !strings.Contains(cc, "public") {
		t.Errorf("sitemap Cache-Control %q", cc)
	}
}

func TestRequestLimits(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	big := `{"body":"` + strings.Repeat("a", 1<<20) + `"}`
	json := func(c *apptest.Client, path, body string) int {
		return c.DoWith("POST", path, body, map[string]string{"Origin": apptest.Origin, "Content-Type": "application/json"}).Code
	}
	for name, got := range map[string]int{
		"oversized body, signed in": json(who.Member, "/api/ideas/"+slug+"/posts", big),
		"oversized body, anonymous": json(who.Anon, "/api/ideas", big),
		"oversized without length":  json(who.Member, "/api/ideas/"+slug+"/report", `{"reason":"`+strings.Repeat("b", 2<<20)+`"}`),
	} {
		if got != http.StatusRequestEntityTooLarge {
			t.Errorf("%s: %d, want 413", name, got)
		}
	}
	for name, c := range map[string]struct {
		body string
		want int
	}{
		"empty body":          {"", 400},
		"not json":            {"hello", 400},
		"truncated json":      {`{"body":"x"`, 400},
		"array not object":    {`["x"]`, 400},
		"unknown field":       {`{"body":"x","admin":true}`, 400},
		"duplicate/trailing":  {`{"body":"x"}{"body":"y"}`, 400},
		"trailing garbage":    {`{"body":"x"} nope`, 400},
		"wrong type":          {`{"body":123}`, 400},
		"null body":           {`{"body":null}`, 422},
		"deeply nested":       {strings.Repeat(`{"a":`, 20000) + "1" + strings.Repeat("}", 20000), 400},
		"huge number":         {`{"body":1e99999}`, 400},
		"invalid utf8 string": {"{\"body\":\"\xff\xfe ok\"}", 201}, // decoded with replacement characters, stored as valid text
	} {
		got := json(who.Outsider, "/api/ideas/"+slug+"/posts", c.body)
		if got != c.want {
			t.Errorf("%s: %d, want %d", name, got, c.want)
		}
	}
	// A header that tries to smuggle a different body length changes nothing the server trusts.
	r := who.Member.DoWith("POST", "/api/ideas/"+slug+"/posts", `{"body":"ok"}`, map[string]string{"Origin": apptest.Origin, "Content-Type": "application/json; charset=utf-8"})
	if r.Code != http.StatusCreated {
		t.Errorf("a JSON content type with a charset was refused: %d", r.Code)
	}
}

func TestRequestIDIsNotAttackerControlled(t *testing.T) {
	env := apptest.New(t)
	r := env.Anon().DoWith("GET", "/api/ideas", nil, map[string]string{"X-Request-ID": "forged\r\nSet-Cookie: pwned=1"})
	if strings.Contains(r.Header.Get("X-Request-ID"), "forged") {
		t.Fatal("an untrusted caller chose the request id")
	}
	if len(r.Header.Get("X-Request-ID")) < 8 {
		t.Fatal("no generated request id")
	}
}
