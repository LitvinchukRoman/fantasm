// Package regression holds cross-cutting tests that run the whole application
// in-process against Postgres: security, access control, sessions, limits,
// consistency under concurrency, API contract and migrations. Per-context
// behaviour is tested next to each context; what lives here is what must keep
// holding no matter which context changes.
package regression_test

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

const (
	memberMail   = "anna@ukma.edu.ua"   // organization member: vote weight 3, skips premoderation
	member2Mail  = "dmytro@ukma.edu.ua" // another member
	outsiderMail = "boris@example.com"
	thirdMail    = "carol@example.com"
	modMail      = "mod@example.com"
	adminMail    = "root@example.com"

	zeroID = "00000000-0000-0000-0000-000000000000"
)

// people signs in the standard cast. Moderator and admin roles are granted in
// the database, as an operator would, and the sessions are opened afterwards.
type people struct {
	Anon, Member, Member2, Outsider, Third, Mod, Admin *apptest.Client
}

func cast(env *apptest.Env) people {
	env.T.Helper()
	for _, mail := range []string{modMail, adminMail} {
		env.SignIn(mail)
	}
	env.Exec(`UPDATE users SET role = 'MODERATOR' WHERE email = $1`, modMail)
	env.Exec(`UPDATE users SET role = 'ADMIN' WHERE email = $1`, adminMail)
	return people{
		Anon: env.Anon(), Member: env.SignIn(memberMail), Member2: env.SignIn(member2Mail), Outsider: env.SignIn(outsiderMail),
		Third: env.SignIn(thirdMail), Mod: env.SignIn(modMail), Admin: env.SignIn(adminMail),
	}
}

// idea creates an idea through the API as c and returns its slug and id. Extra
// fields override the defaults. The idea is forced to APPROVED so tests start
// from a published idea whoever the author is.
func idea(t *testing.T, env *apptest.Env, c *apptest.Client, extra map[string]any) (slug, id string) {
	t.Helper()
	body := map[string]any{"title": "A perfectly ordinary idea", "summary": "summary", "category": "PROJECT"}
	for k, v := range extra {
		body[k] = v
	}
	r := c.Do(http.MethodPost, "/api/ideas", body)
	if r.Code != http.StatusCreated {
		t.Fatalf("create idea: %d %s", r.Code, r.Body)
	}
	slug = r.Map()["slug"].(string)
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1 AND status <> 'DRAFT'`, slug)
	return slug, apptest.Scalar[string](env, `SELECT id FROM ideas WHERE slug = $1`, slug)
}

func comment(t *testing.T, c *apptest.Client, slug, body, parent string) string {
	t.Helper()
	req := map[string]any{"body": body}
	if parent != "" {
		req["parentId"] = parent
	}
	r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", req)
	if r.Code != http.StatusCreated {
		t.Fatalf("comment: %d %s", r.Code, r.Body)
	}
	return r.Map()["id"].(string)
}

var requestID = regexp.MustCompile(`,?"requestId":"[0-9a-f]+"`)

// shape is an error response with the per-request id removed, so two answers can be compared.
func shape(r *apptest.Response) string {
	return fmt.Sprintf("%d %s", r.Code, requestID.ReplaceAllString(string(r.Body), ""))
}

// headerShape lists the response headers that must not differ between "hidden" and "absent".
func headerShape(r *apptest.Response) string {
	var parts []string
	for k, v := range r.Header {
		switch http.CanonicalHeaderKey(k) {
		case "X-Request-Id", "Date":
			continue
		}
		parts = append(parts, k+"="+strings.Join(v, ","))
	}
	sort.Strings(parts)
	return strings.Join(parts, "; ")
}

// parallel runs fn n times at once and waits.
func parallel(n int, fn func(i int)) {
	done := make(chan struct{}, n)
	start := make(chan struct{})
	for i := range n {
		go func() {
			<-start
			fn(i)
			done <- struct{}{}
		}()
	}
	close(start)
	for range n {
		<-done
	}
}

func count(env *apptest.Env, sql string, args ...any) int {
	return apptest.Scalar[int](env, sql, args...)
}

func decide(c *apptest.Client, ideaID, decision, note string) *apptest.Response {
	return c.Do(http.MethodPost, "/api/moderation/ideas/"+ideaID+"/decision", map[string]any{"decision": decision, "note": note})
}
