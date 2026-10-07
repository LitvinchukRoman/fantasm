package regression_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"gopkg.in/yaml.v3"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// spec is api/swagger.yaml, loaded as plain data. The tests hold the real API to
// it in both directions: nothing undocumented exists, nothing documented lies.
type spec map[string]any

func loadSpec(t *testing.T) spec {
	t.Helper()
	raw, err := os.ReadFile("../../api/swagger.yaml")
	if err != nil {
		t.Fatal(err)
	}
	// A plain map type: decoding into a named type would make every nested map that type too.
	var m map[string]any
	if err := yaml.Unmarshal(raw, &m); err != nil {
		t.Fatalf("swagger.yaml is not valid YAML: %v", err)
	}
	return spec(m)
}

func obj(v any) map[string]any { m, _ := v.(map[string]any); return m }

// resolve follows $ref chains.
func (s spec) resolve(n any) map[string]any {
	m := obj(n)
	for range 10 {
		ref, ok := m["$ref"].(string)
		if !ok {
			return m
		}
		cur := any(map[string]any(s))
		for _, part := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
			cur = obj(cur)[part]
		}
		m = obj(cur)
	}
	return m
}

// flat resolves a schema and folds allOf members into one object schema, so
// "undeclared property" means undeclared anywhere in the composition.
func (s spec) flat(n any) map[string]any {
	m := s.resolve(n)
	parts, ok := m["allOf"].([]any)
	if !ok {
		return m
	}
	out := map[string]any{}
	for k, v := range m {
		if k != "allOf" {
			out[k] = v
		}
	}
	props, required := map[string]any{}, []any{}
	for _, part := range parts {
		f := s.flat(part)
		for k, v := range f {
			switch k {
			case "properties":
				for pk, pv := range obj(v) {
					props[pk] = pv
				}
			case "required":
				required = append(required, v.([]any)...)
			default:
				out[k] = v
			}
		}
	}
	out["properties"], out["required"] = props, required
	return out
}

// operation returns the documented operation for a method and path template.
func (s spec) operation(method, path string) map[string]any {
	return obj(obj(obj(s["paths"])[path])[strings.ToLower(method)])
}

// statuses lists the documented status codes of an operation.
func (s spec) statuses(op map[string]any) []int {
	var out []int
	for k := range obj(op["responses"]) {
		if n, err := strconv.Atoi(k); err == nil {
			out = append(out, n)
		}
	}
	sort.Ints(out)
	return out
}

// responseSchema returns the JSON schema documented for a status, or nil.
func (s spec) responseSchema(op map[string]any, status int) map[string]any {
	resp := s.resolve(obj(op["responses"])[strconv.Itoa(status)])
	return obj(obj(obj(resp["content"])["application/json"])["schema"])
}

var uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// check validates a decoded JSON value against a schema and appends every mismatch.
func (s spec) check(schema map[string]any, v any, at string, errs *[]string) {
	schema = s.flat(schema)
	if len(schema) == 0 {
		return
	}
	fail := func(format string, a ...any) { *errs = append(*errs, at+": "+fmt.Sprintf(format, a...)) }
	if v == nil {
		if n, _ := schema["nullable"].(bool); !n {
			fail("null, but the schema is not nullable")
		}
		return
	}
	if enum, ok := schema["enum"].([]any); ok && !slices.Contains(enum, v) {
		fail("%v is not one of %v", v, enum)
	}
	switch typ, _ := schema["type"].(string); typ {
	case "string":
		str, ok := v.(string)
		if !ok {
			fail("want string, got %T", v)
			return
		}
		switch schema["format"] {
		case "date-time":
			if _, err := time.Parse(time.RFC3339Nano, str); err != nil {
				fail("%q is not a date-time", str)
			}
		case "uuid":
			if !uuidRE.MatchString(str) {
				fail("%q is not a uuid", str)
			}
		}
		if max, ok := schema["maxLength"].(int); ok && len([]rune(str)) > max {
			fail("longer than maxLength %d", max)
		}
	case "integer":
		if f, ok := v.(float64); !ok || f != float64(int64(f)) {
			fail("want integer, got %v", v)
		}
	case "number":
		if _, ok := v.(float64); !ok {
			fail("want number, got %T", v)
		}
	case "boolean":
		if _, ok := v.(bool); !ok {
			fail("want boolean, got %T", v)
		}
	case "array":
		arr, ok := v.([]any)
		if !ok {
			fail("want array, got %T", v)
			return
		}
		for i, e := range arr {
			s.check(obj(schema["items"]), e, fmt.Sprintf("%s[%d]", at, i), errs)
		}
	case "object":
		m, ok := v.(map[string]any)
		if !ok {
			fail("want object, got %T", v)
			return
		}
		props := obj(schema["properties"])
		if req, ok := schema["required"].([]any); ok {
			for _, k := range req {
				if _, present := m[k.(string)]; !present {
					fail("required property %q is missing", k)
				}
			}
		}
		for k, val := range m {
			switch p, declared := props[k]; {
			case declared:
				s.check(obj(p), val, at+"."+k, errs)
			case obj(schema["additionalProperties"]) != nil:
				s.check(obj(schema["additionalProperties"]), val, at+"."+k, errs)
			case len(props) > 0 && schema["additionalProperties"] != true:
				fail("property %q is not documented", k)
			}
		}
	}
}

// universal are answered by the platform in front of every route and are documented once, in the API description.
var universal = []int{http.StatusBadRequest, http.StatusForbidden, http.StatusRequestEntityTooLarge, http.StatusUnsupportedMediaType, http.StatusTooManyRequests}

// verify checks one answer against the operation's documentation.
func verify(t *testing.T, sp spec, rt route, r *apptest.Response, label string) {
	t.Helper()
	op := sp.operation(rt.Method, rt.Path)
	if op == nil {
		t.Errorf("%s: %s %s is not documented", label, rt.Method, rt.Path)
		return
	}
	if !slices.Contains(sp.statuses(op), r.Code) && !slices.Contains(universal, r.Code) {
		t.Errorf("%s: %s %s answered %d, documented %v", label, rt.Method, rt.Path, r.Code, sp.statuses(op))
		return
	}
	schema := sp.responseSchema(op, r.Code)
	if schema == nil {
		if r.Code >= 400 {
			schema = obj(obj(obj(obj(sp["components"])["schemas"])["Error"]))
		} else {
			return
		}
	}
	if len(r.Body) == 0 {
		return
	}
	var v any
	if err := json.Unmarshal(r.Body, &v); err != nil {
		t.Errorf("%s: %s %s answered %d with a body that is not JSON: %.80q", label, rt.Method, rt.Path, r.Code, r.Body)
		return
	}
	var errs []string
	sp.check(schema, v, "$", &errs)
	for _, e := range errs {
		t.Errorf("%s: %s %s %d: %s", label, rt.Method, rt.Path, r.Code, e)
	}
}

func TestEveryRouteIsDocumentedAndEveryDocumentedRouteExists(t *testing.T) {
	sp := loadSpec(t)
	documented := map[string]bool{}
	for path, item := range obj(sp["paths"]) {
		for method := range obj(item) {
			switch method {
			case "get", "put", "post", "patch", "delete":
				documented[strings.ToUpper(method)+" "+path] = true
			}
		}
	}
	have := map[string]bool{}
	for _, rt := range routes {
		key := rt.Method + " " + rt.Path
		have[key] = true
		if !documented[key] {
			t.Errorf("%s exists but swagger.yaml does not document it", key)
		}
		// Documentation and enforcement agree on who may call it.
		op := sp.operation(rt.Method, rt.Path)
		_, secured := op["security"]
		if secured != (rt.Access >= authed) {
			t.Errorf("%s: swagger says secured=%v, the route requires %s", key, secured, rt.Access)
		}
		if rt.Access >= authed && !slices.Contains(sp.statuses(op), http.StatusUnauthorized) {
			t.Errorf("%s: protected but 401 is not documented", key)
		}
		if rt.Access >= staff && !slices.Contains(sp.statuses(op), http.StatusForbidden) {
			t.Errorf("%s: staff only but 403 is not documented", key)
		}
	}
	for key := range documented {
		if !have[key] {
			t.Errorf("%s is documented but the route table (and so, by the routing test, the API) has no such route", key)
		}
	}
	// Every $ref points somewhere.
	raw, _ := os.ReadFile("../../api/swagger.yaml")
	for _, m := range regexp.MustCompile(`\$ref: '(#/[^']+)'`).FindAllStringSubmatch(string(raw), -1) {
		if sp.resolve(map[string]any{"$ref": m[1]}) == nil {
			t.Errorf("dangling reference %s", m[1])
		}
	}
}

// Probing as every kind of viewer must only ever produce documented answers in documented shapes.
func TestProbedAnswersMatchTheDocumentation(t *testing.T) {
	sp := loadSpec(t)
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, map[string]any{"title": "Documented idea", "summary": "s"})

	for _, rt := range routes {
		if rt.Path == "/api/auth/logout-all" || strings.HasPrefix(rt.Path, "/api/auth/{provider}") {
			continue // session-ending or covered by the sessions tests
		}
		for name, c := range map[string]*apptest.Client{"anonymous": who.Anon, "user": who.Third, "moderator": who.Mod, "admin": who.Admin} {
			verify(t, sp, rt, send(c, rt, plain(slug), nil, nil), name)
		}
	}
}

// TestHappyPathsMatchTheDocumentation exercises the success answers, whose
// shapes are the part the frontend depends on, and validates each against its schema.
func TestHappyPathsMatchTheDocumentation(t *testing.T) {
	sp := loadSpec(t)
	env := apptest.New(t)
	who := cast(env)

	byKey := map[string]route{}
	for _, rt := range routes {
		byKey[rt.Method+" "+rt.Path] = rt
	}
	call := func(label string, c *apptest.Client, method, tmpl string, p params, body any, want int) *apptest.Response {
		t.Helper()
		route, _, _ := strings.Cut(tmpl, "?") // the query string rides along but is not part of the route
		rt, ok := byKey[method+" "+route]
		if !ok {
			t.Fatalf("no route %s %s", method, route)
		}
		sent := rt
		sent.Path = tmpl
		r := send(c, sent, p, body, nil)
		if r.Code != want {
			t.Errorf("%s: %s %s = %d, want %d: %.200s", label, method, p.fill(tmpl), r.Code, want, r.Body)
			return r
		}
		verify(t, sp, rt, r, label)
		return r
	}

	slug, id := idea(t, env, who.Member, map[string]any{"title": "Contract idea", "summary": "A summary", "body": "Some **body**", "tags": []string{"go", "api"}, "needsRoles": []string{"dev"}})
	idea(t, env, who.Member2, map[string]any{"title": "Another idea", "summary": "so that there is a next one"})
	p := params{"slug": slug}
	author := apptestHandle(env, memberMail)

	call("providers", who.Anon, "GET", "/api/auth/providers", nil, nil, 200)
	call("me", who.Outsider, "GET", "/api/me", nil, nil, 200)
	call("edit me", who.Outsider, "PATCH", "/api/me", nil, map[string]any{"name": "Boris", "bio": "hello"}, 200)
	call("sessions", who.Outsider, "GET", "/api/me/sessions", nil, nil, 200)
	call("feed", who.Anon, "GET", "/api/ideas", nil, nil, 200)
	call("feed as member", who.Member, "GET", "/api/ideas?limit=1&sort=top", nil, nil, 200)
	call("detail", who.Anon, "GET", "/api/ideas/{slug}", p, nil, 200)
	call("detail as author", who.Member, "GET", "/api/ideas/{slug}", p, nil, 200)
	call("next", who.Anon, "GET", "/api/ideas/{slug}/next", p, nil, 200)
	call("events", who.Anon, "GET", "/api/events", nil, nil, 200)
	call("sitemap", who.Anon, "GET", "/api/sitemap/ideas", nil, nil, 200)
	call("mine", who.Member, "GET", "/api/me/ideas", nil, nil, 200)
	call("profile", who.Anon, "GET", "/api/users/{handle}", params{"handle": author}, nil, 200)
	call("edit idea", who.Member, "PATCH", "/api/ideas/{slug}", p, map[string]any{"summary": "A better summary"}, 200)
	call("status", who.Member, "POST", "/api/ideas/{slug}/status", p, map[string]any{"status": "TEAM_FORMING"}, 200)

	call("vote", who.Outsider, "PUT", "/api/ideas/{slug}/vote", p, nil, 200)
	call("unvote", who.Outsider, "DELETE", "/api/ideas/{slug}/vote", p, nil, 200)
	call("join", who.Third, "PUT", "/api/ideas/{slug}/participation", p, map[string]any{"state": "JOINED", "role": "dev"}, 200)
	call("participants", who.Anon, "GET", "/api/ideas/{slug}/participants", p, nil, 200)
	call("accept", who.Member, "POST", "/api/ideas/{slug}/participants/{handle}/{decision}", params{"slug": slug, "handle": apptestHandle(env, thirdMail), "decision": "accept"}, nil, 200)
	call("leave", who.Third, "DELETE", "/api/ideas/{slug}/participation", p, nil, 200)

	post := call("comment", who.Third, "POST", "/api/ideas/{slug}/posts", p, map[string]any{"body": "Nice"}, 201).Map()["id"].(string)
	call("thread", who.Anon, "GET", "/api/ideas/{slug}/thread", p, nil, 200)
	call("edit comment", who.Third, "PATCH", "/api/posts/{id}", params{"id": post}, map[string]any{"body": "Nice!"}, 200)
	call("delete comment", who.Third, "DELETE", "/api/posts/{id}", params{"id": post}, nil, 204)

	call("report", who.Third, "POST", "/api/ideas/{slug}/report", p, map[string]any{"reason": "a real reason"}, 204)
	call("queue", who.Mod, "GET", "/api/moderation/queue", nil, nil, 200)
	call("reports", who.Mod, "GET", "/api/moderation/reports?ideaId="+id, nil, nil, 200)
	call("notifications", who.Member, "GET", "/api/me/notifications", nil, nil, 200)
	call("unread count", who.Member, "GET", "/api/me/notifications/unread-count", nil, nil, 200)
	call("mark read", who.Member, "POST", "/api/me/notifications/read", nil, map[string]any{"all": true}, 200)

	call("promote", who.Admin, "PATCH", "/api/admin/users/{handle}/role", params{"handle": apptestHandle(env, thirdMail)}, map[string]any{"role": "MODERATOR"}, 200)
	env.SignIn(outsiderMail) // a second device
	var list struct {
		Sessions []struct {
			ID      string
			Current bool
		}
	}
	who.Outsider.Do(http.MethodGet, "/api/me/sessions", nil).Decode(&list)
	for _, sess := range list.Sessions {
		if !sess.Current {
			call("revoke session", who.Outsider, "DELETE", "/api/me/sessions/{id}", params{"id": sess.ID}, nil, 204)
		}
	}
	call("logout", who.Mod, "POST", "/api/auth/logout", nil, nil, 204)
}
