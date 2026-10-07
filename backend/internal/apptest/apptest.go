// Package apptest runs the real application (middleware, handlers, services,
// Postgres) in-process for integration tests. Only tests import it.
package apptest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/app"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/testdb"
)

// Origin is the public origin of the test deployment.
const Origin = "http://localhost:8080"

// Organizations is the default policy: one organization whose members read and
// create internal ideas, skip premoderation and carry weight.
const Organizations = `{"version":1,"organizations":[{"id":"naukma","name":"NaUKMA","badge":"Могилянка",
"match":{"verifiedEmailDomain":"ukma.edu.ua"},
"capabilities":["ideas.read_internal","ideas.create_internal"],
"benefits":{"voteWeight":3,"rankingMultiplier":1.5,"karmaMultiplier":2,"skipPremoderation":true}}]}`

type Env struct {
	T       testing.TB
	DB      *postgres.DB
	Handler http.Handler
	Jobs    []func(context.Context) error
	Now     time.Time
}

type Option func(*settings)

type settings struct {
	orgs string
	cfg  func(*config.Config)
}

// WithOrganizations replaces the organization policy JSON.
func WithOrganizations(json string) Option { return func(s *settings) { s.orgs = json } }

// WithConfig adjusts the configuration before the app is built.
func WithConfig(fn func(*config.Config)) Option { return func(s *settings) { s.cfg = fn } }

type logWriter struct{ t testing.TB }

func (w logWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(strings.TrimSpace(string(p)))
	return len(p), nil
}

type fakeProvider struct{}

func (fakeProvider) AuthorizationURL(state, nonce, verifier string) string {
	return "https://provider.test/auth?" + url.Values{"state": {state}}.Encode()
}

// Authenticate treats the authorization code as the user's e-mail address.
func (fakeProvider) Authenticate(_ context.Context, code, nonce, verifier string) (domain.Identity, error) {
	if code == "" || nonce == "" || verifier == "" {
		return domain.Identity{}, errors.New("bad code")
	}
	name, _, _ := strings.Cut(code, "@")
	return domain.Identity{Provider: domain.Google, Issuer: "https://accounts.google.com", Subject: code, Email: code, EmailVerified: true, Name: name}, nil
}

func New(t testing.TB, opts ...Option) *Env {
	t.Helper()
	s := settings{orgs: Organizations}
	for _, o := range opts {
		o(&s)
	}
	db := testdb.New(t)
	policy, err := organizations.Parse(strings.NewReader(s.orgs))
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{
		PublicURL: Origin, AppSecret: "test-secret-test-secret-test-secret!",
		RateLimitAnonRPS: 10_000, RateLimitAnonBurst: 10_000, RateLimitUserRPS: 10_000, RateLimitUserBurst: 10_000, RateLimitLoginPerMin: 10_000, RateLimitPostsPerMin: 10_000,
		SessionAbsoluteTTL: 24 * time.Hour, SessionIdleTTL: 12 * time.Hour, RequestTimeout: 10 * time.Second,
	}
	if s.cfg != nil {
		s.cfg(&cfg)
	}
	// Server-side errors surface in the test log (shown on failure), where a bare 500 would hide the cause.
	logger := slog.New(slog.NewTextHandler(logWriter{t}, &slog.HandlerOptions{Level: slog.LevelError}))
	a, err := app.Build(cfg, logger, db, policy, map[domain.Provider]identity.Provider{domain.Google: fakeProvider{}})
	if err != nil {
		t.Fatal(err)
	}
	env := &Env{T: t, DB: db, Handler: a.API}
	for _, j := range a.Jobs {
		env.Jobs = append(env.Jobs, j.Run)
	}
	return env
}

// Exec runs SQL directly, for arranging or inspecting state.
func (e *Env) Exec(sql string, args ...any) {
	e.T.Helper()
	if _, err := e.DB.Querier(e.T.Context()).Exec(e.T.Context(), sql, args...); err != nil {
		e.T.Fatalf("exec %q: %v", sql, err)
	}
}

// Scalar runs a query that returns one value.
func Scalar[T any](e *Env, sql string, args ...any) T {
	e.T.Helper()
	var v T
	if err := e.DB.Querier(e.T.Context()).QueryRow(e.T.Context(), sql, args...).Scan(&v); err != nil {
		e.T.Fatalf("query %q: %v", sql, err)
	}
	return v
}

type Client struct {
	env     *Env
	cookies []*http.Cookie
	Email   string
}

func (e *Env) Anon() *Client { return &Client{env: e} }

// SignIn goes through the real login flow and returns a signed-in client.
func (e *Env) SignIn(email string) *Client {
	e.T.Helper()
	c := e.Anon()
	r := c.Do(http.MethodGet, "/api/auth/google/login", nil)
	if r.Code != http.StatusFound {
		e.T.Fatalf("begin login: %d %s", r.Code, r.Body)
	}
	loc, err := url.Parse(r.Header.Get("Location"))
	if err != nil {
		e.T.Fatal(err)
	}
	c.absorb(r)
	r = c.Do(http.MethodGet, "/api/auth/google/callback?"+url.Values{"code": {email}, "state": {loc.Query().Get("state")}}.Encode(), nil)
	if r.Code != http.StatusSeeOther {
		e.T.Fatalf("complete login: %d %s", r.Code, r.Body)
	}
	c.Email = email
	return c
}

type Response struct {
	Code   int
	Header http.Header
	Body   []byte
	t      testing.TB
}

// Decode unmarshals the JSON body into v.
func (r *Response) Decode(v any) {
	r.t.Helper()
	if err := json.Unmarshal(r.Body, v); err != nil {
		r.t.Fatalf("decode %q: %v", r.Body, err)
	}
}

// Map decodes the body into a generic object.
func (r *Response) Map() map[string]any {
	r.t.Helper()
	m := map[string]any{}
	r.Decode(&m)
	return m
}

func (c *Client) absorb(r *Response) {
	for _, cookie := range (&http.Response{Header: r.Header}).Cookies() {
		kept := c.cookies[:0]
		for _, old := range c.cookies {
			if old.Name != cookie.Name {
				kept = append(kept, old)
			}
		}
		c.cookies = kept
		if cookie.MaxAge >= 0 && cookie.Value != "" {
			c.cookies = append(c.cookies, cookie)
		}
	}
}

// Do sends a request with the browser's cookies and, for writes, the right Origin.
func (c *Client) Do(method, path string, body any) *Response {
	return c.DoWith(method, path, body, map[string]string{"Origin": Origin})
}

// DoWith sends a request with exactly the given extra headers.
func (c *Client) DoWith(method, path string, body any, headers map[string]string) *Response {
	c.env.T.Helper()
	var rd io.Reader
	switch b := body.(type) {
	case nil:
	case string:
		rd = strings.NewReader(b)
	case []byte:
		rd = bytes.NewReader(b)
	default:
		raw, err := json.Marshal(b)
		if err != nil {
			c.env.T.Fatal(err)
		}
		rd = bytes.NewReader(raw)
	}
	req := httptest.NewRequest(method, path, rd)
	if rd != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for _, cookie := range c.cookies {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	c.env.Handler.ServeHTTP(rec, req)
	res := &Response{Code: rec.Code, Header: rec.Header(), Body: rec.Body.Bytes(), t: c.env.T}
	c.absorb(res)
	return res
}

// Clone returns an independent client holding the same session cookies, so the
// same person can act from several goroutines at once.
func (c *Client) Clone() *Client {
	return &Client{env: c.env, cookies: append([]*http.Cookie(nil), c.cookies...), Email: c.Email}
}

// Cookie returns the value of a cookie the client holds, or "".
func (c *Client) Cookie(name string) string {
	for _, cookie := range c.cookies {
		if cookie.Name == name {
			return cookie.Value
		}
	}
	return ""
}

// SetCookie plants a cookie as a browser (or an attacker controlling it) would.
func (c *Client) SetCookie(name, value string) {
	kept := c.cookies[:0]
	for _, old := range c.cookies {
		if old.Name != name {
			kept = append(kept, old)
		}
	}
	c.cookies = append(kept, &http.Cookie{Name: name, Value: value, Path: "/"})
}

// Forget drops every cookie, like closing the browser profile.
func (c *Client) Forget() { c.cookies = nil }
