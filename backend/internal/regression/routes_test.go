package regression_test

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

type access int

const (
	public access = iota
	authed
	staff
	admin
)

func (a access) String() string { return [...]string{"public", "authed", "staff", "admin"}[a] }

// route describes one endpoint of the API for the cross-cutting tests. The table
// is checked against the real routers and against swagger.yaml by the contract
// test, so it cannot silently fall behind.
type route struct {
	Method string
	Path   string // with {param} placeholders
	Access access
	Fields []string // JSON string fields of the body
	Lists  []string // JSON string-array fields of the body
	Query  []string // query parameters
}

func (r route) unsafe() bool { return r.Method != http.MethodGet }

var routes = []route{
	{Method: "GET", Path: "/api/auth/providers"},
	{Method: "GET", Path: "/api/auth/{provider}/login"},
	{Method: "GET", Path: "/api/auth/{provider}/callback", Query: []string{"state", "code"}},
	{Method: "POST", Path: "/api/auth/logout"},
	{Method: "POST", Path: "/api/auth/logout-all", Access: authed},
	{Method: "GET", Path: "/api/me", Access: authed},
	{Method: "PATCH", Path: "/api/me", Access: authed, Fields: []string{"handle", "name", "bio", "faculty"}},
	{Method: "GET", Path: "/api/me/sessions", Access: authed},
	{Method: "DELETE", Path: "/api/me/sessions/{id}", Access: authed},
	{Method: "PUT", Path: "/api/me/avatar", Access: authed},
	{Method: "DELETE", Path: "/api/me/avatar", Access: authed},
	{Method: "GET", Path: "/api/users/{handle}/avatar"},
	{Method: "PATCH", Path: "/api/admin/users/{handle}/role", Access: admin, Fields: []string{"role"}},

	{Method: "GET", Path: "/api/ideas", Query: []string{"sort", "category", "status", "tag", "campus", "cursor", "limit"}},
	{Method: "POST", Path: "/api/ideas", Access: authed, Fields: []string{"title", "summary", "body", "coverUrl", "category", "visibility", "organizationId", "status", "eventLocation"}, Lists: []string{"tags", "needsRoles"}},
	{Method: "GET", Path: "/api/ideas/{slug}"},
	{Method: "PATCH", Path: "/api/ideas/{slug}", Access: authed, Fields: []string{"title", "summary", "body", "coverUrl", "category", "eventLocation"}, Lists: []string{"tags", "needsRoles"}},
	{Method: "DELETE", Path: "/api/ideas/{slug}", Access: authed},
	{Method: "POST", Path: "/api/ideas/{slug}/status", Access: authed, Fields: []string{"status"}},
	{Method: "GET", Path: "/api/ideas/{slug}/next"},
	{Method: "GET", Path: "/api/events", Query: []string{"from", "to"}},
	{Method: "GET", Path: "/api/sitemap/ideas"},
	{Method: "GET", Path: "/api/me/ideas", Access: authed, Query: []string{"cursor", "limit"}},
	{Method: "GET", Path: "/api/users/{handle}"},

	{Method: "PUT", Path: "/api/ideas/{slug}/vote", Access: authed},
	{Method: "DELETE", Path: "/api/ideas/{slug}/vote", Access: authed},
	{Method: "PUT", Path: "/api/ideas/{slug}/participation", Access: authed, Fields: []string{"state", "role"}},
	{Method: "DELETE", Path: "/api/ideas/{slug}/participation", Access: authed},
	{Method: "GET", Path: "/api/ideas/{slug}/participants"},
	{Method: "POST", Path: "/api/ideas/{slug}/participants/{handle}/{decision}", Access: authed},

	{Method: "GET", Path: "/api/ideas/{slug}/thread"},
	{Method: "POST", Path: "/api/ideas/{slug}/posts", Access: authed, Fields: []string{"body", "parentId"}},
	{Method: "PATCH", Path: "/api/posts/{id}", Access: authed, Fields: []string{"body"}},
	{Method: "DELETE", Path: "/api/posts/{id}", Access: authed},

	{Method: "POST", Path: "/api/ideas/{slug}/report", Access: authed, Fields: []string{"reason"}},
	{Method: "GET", Path: "/api/moderation/queue", Access: staff, Query: []string{"state", "cursor", "limit"}},
	{Method: "POST", Path: "/api/moderation/ideas/{id}/decision", Access: staff, Fields: []string{"decision", "note"}},
	{Method: "GET", Path: "/api/moderation/reports", Access: staff, Query: []string{"ideaId"}},

	{Method: "GET", Path: "/api/me/notifications", Access: authed, Query: []string{"unread", "cursor", "limit"}},
	{Method: "POST", Path: "/api/me/notifications/read", Access: authed, Lists: []string{"ids"}},
	{Method: "GET", Path: "/api/me/notifications/unread-count", Access: authed},
}

// params are the values substituted into path placeholders.
type params map[string]string

func (p params) fill(path string) string {
	for k, v := range p {
		path = strings.ReplaceAll(path, "{"+k+"}", url.PathEscape(v))
	}
	return path
}

// plain are well-formed placeholders for routes that need some resource to name.
func plain(slug string) params {
	return params{"slug": slug, "id": zeroID, "handle": "nobody", "decision": "accept", "provider": "google"}
}

// send issues the route as c with the given body (nil means an empty JSON object for writes).
func send(c *apptest.Client, rt route, p params, body any, headers map[string]string) *apptest.Response {
	path := p.fill(rt.Path)
	if len(rt.Query) > 0 && rt.Query[0] == "" {
		path += "?"
	}
	if rt.unsafe() && body == nil {
		body = map[string]any{}
	}
	h := map[string]string{}
	if rt.unsafe() {
		h["Origin"] = apptest.Origin
	}
	for k, v := range headers {
		h[k] = v
	}
	return c.DoWith(rt.Method, path, body, h)
}
