package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

func ok(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }

func TestCSRF(t *testing.T) {
	const origin = "https://fantasm.example"
	h := CSRF(origin)(http.HandlerFunc(ok))
	tests := []struct {
		name, method, origin, site string
		want                       int
	}{
		{"get needs nothing", http.MethodGet, "", "", 204},
		{"post same origin", http.MethodPost, origin, "same-origin", 204},
		{"post origin only", http.MethodPost, origin, "", 204},
		{"post fetch metadata only", http.MethodPost, "", "same-origin", 204},
		{"post cross-site", http.MethodPost, origin, "cross-site", 403},
		{"post same-site sibling", http.MethodPost, origin, "same-site", 403},
		{"post user navigation", http.MethodPost, origin, "none", 403},
		{"post foreign origin", http.MethodPost, "https://evil.example", "", 403},
		{"post null origin", http.MethodPost, "null", "", 403},
		{"post no headers", http.MethodPost, "", "", 403},
		{"same-origin site but foreign origin", http.MethodPost, "https://evil.example", "same-origin", 403},
		{"delete foreign", http.MethodDelete, "https://evil.example", "", 403},
		{"patch no headers", http.MethodPatch, "", "", 403},
		{"put same origin", http.MethodPut, origin, "", 204},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, "/x", nil)
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}
			if tt.site != "" {
				r.Header.Set("Sec-Fetch-Site", tt.site)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tt.want {
				t.Fatalf("status = %d, want %d", w.Code, tt.want)
			}
		})
	}
}

func TestRecoverReturnsGeneric500AndKeepsServing(t *testing.T) {
	var logs bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&logs, nil))
	h := Chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom: secret internals") }),
		RequestID(nil), AccessLog(logger, nil), Recover())
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/x?code=abc", nil))
	if w.Code != 500 {
		t.Fatalf("status = %d", w.Code)
	}
	body := w.Body.String()
	if strings.Contains(body, "boom") || strings.Contains(body, "secret") {
		t.Fatalf("leaked internals: %s", body)
	}
	var parsed errorBody
	if err := json.Unmarshal([]byte(body), &parsed); err != nil || parsed.RequestID == "" || parsed.RequestID != w.Header().Get("X-Request-ID") {
		t.Fatalf("body = %s (%v)", body, err)
	}
	logged := logs.String()
	if !strings.Contains(logged, `"status":500`) || strings.Contains(logged, "code=abc") {
		t.Fatalf("access log: %s", logged)
	}
}

func TestRecoverDoesNotWriteAfterResponseStarted(t *testing.T) {
	h := Recover()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		panic("late")
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != http.StatusAccepted || w.Body.Len() != 0 {
		t.Fatalf("%d %q", w.Code, w.Body.String())
	}
}

func TestRequestIDOnlyTrustedFromProxy(t *testing.T) {
	proxies, err := ParseProxies([]string{"10.0.0.0/8"})
	if err != nil {
		t.Fatal(err)
	}
	h := RequestID(proxies)(http.HandlerFunc(ok))
	for remote, wantKept := range map[string]bool{"10.1.2.3:4000": true, "203.0.113.9:4000": false} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = remote
		r.Header.Set("X-Request-ID", "client-chosen-id")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if kept := w.Header().Get("X-Request-ID") == "client-chosen-id"; kept != wantKept {
			t.Errorf("%s kept=%v", remote, kept)
		}
	}
}

func TestClientIP(t *testing.T) {
	proxies, err := ParseProxies([]string{"10.0.0.0/8", "192.0.2.1"})
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct{ remote, xff, want string }{
		{"203.0.113.5:1", "", "203.0.113.5"},
		{"203.0.113.5:1", "1.1.1.1", "203.0.113.5"}, // spoofing from an untrusted peer
		{"10.0.0.7:1", "198.51.100.4", "198.51.100.4"},
		{"10.0.0.7:1", "6.6.6.6, 198.51.100.4", "198.51.100.4"}, // client-prepended entry ignored
		{"10.0.0.7:1", "198.51.100.4, 10.0.0.9", "198.51.100.4"},
		{"192.0.2.1:1", "198.51.100.4", "198.51.100.4"},
		{"10.0.0.7:1", "garbage", "10.0.0.7"},
		{"10.0.0.7:1", "", "10.0.0.7"},
		{"[::ffff:10.0.0.7]:1", "198.51.100.4", "198.51.100.4"},
	}
	for _, tt := range tests {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.RemoteAddr = tt.remote
		if tt.xff != "" {
			r.Header.Set("X-Forwarded-For", tt.xff)
		}
		if got := proxies.ClientIP(r); got != tt.want {
			t.Errorf("remote %s xff %q: got %s want %s", tt.remote, tt.xff, got, tt.want)
		}
	}
	if _, err := ParseProxies([]string{"nope"}); err == nil {
		t.Error("accepted invalid CIDR")
	}
}

func TestLimiter(t *testing.T) {
	now := time.Unix(1_000_000, 0)
	l := NewLimiter(1, 2)
	l.now = func() time.Time { return now }
	for i := range 2 {
		if ok, _ := l.Allow("a"); !ok {
			t.Fatalf("burst request %d refused", i)
		}
	}
	ok1, retry := l.Allow("a")
	if ok1 || retry <= 0 || retry > time.Second {
		t.Fatalf("expected refusal with retry <= 1s, got %v %v", ok1, retry)
	}
	if ok2, _ := l.Allow("b"); !ok2 {
		t.Fatal("keys must be independent")
	}
	now = now.Add(1100 * time.Millisecond)
	if ok3, _ := l.Allow("a"); !ok3 {
		t.Fatal("token should have refilled")
	}
	// A refused request must not consume a token, or the client could never recover.
	now = now.Add(5 * time.Millisecond)
	for range 50 {
		l.Allow("a")
	}
	now = now.Add(1100 * time.Millisecond)
	if ok4, _ := l.Allow("a"); !ok4 {
		t.Fatal("refusals consumed tokens")
	}
}

func TestLimiterMiddlewareAnswers429WithRetryAfter(t *testing.T) {
	l := NewLimiter(0.5, 1)
	h := l.Middleware(func(*http.Request) string { return "k" })(http.HandlerFunc(ok))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != 204 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/", nil))
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("%d %v", w.Code, w.Header())
	}
}

func TestLimiterBoundsMemory(t *testing.T) {
	l := NewLimiter(1, 1)
	l.max = 100
	for i := range 1000 {
		l.Allow(string(rune('a'+i%26)) + strings.Repeat("x", i))
	}
	if len(l.m) > 120 {
		t.Fatalf("limiter grew to %d keys", len(l.m))
	}
}

func TestDecodeJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}
	tests := []struct {
		name, contentType, body string
		kind                    apperr.Kind
		ok                      bool
	}{
		{"valid", "application/json", `{"name":"x"}`, 0, true},
		{"charset ok", "application/json; charset=utf-8", `{"name":"x"}`, 0, true},
		{"wrong type", "text/plain", `{"name":"x"}`, apperr.KindUnsupportedMedia, false},
		{"missing type", "", `{"name":"x"}`, apperr.KindUnsupportedMedia, false},
		{"unknown field", "application/json", `{"name":"x","admin":true}`, apperr.KindInvalid, false},
		{"trailing doc", "application/json", `{"name":"x"}{"name":"y"}`, apperr.KindInvalid, false},
		{"trailing garbage", "application/json", `{"name":"x"} x`, apperr.KindInvalid, false},
		{"empty", "application/json", ``, apperr.KindInvalid, false},
		{"malformed", "application/json", `{"name":`, apperr.KindInvalid, false},
		{"wrong shape", "application/json", `{"name":5}`, apperr.KindInvalid, false},
		{"too large", "application/json", `{"name":"` + strings.Repeat("a", MaxBody) + `"}`, apperr.KindTooLarge, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tt.body))
			if tt.contentType != "" {
				r.Header.Set("Content-Type", tt.contentType)
			}
			var p payload
			err := DecodeJSON(httptest.NewRecorder(), r, &p)
			if tt.ok != (err == nil) || (!tt.ok && apperr.KindOf(err) != tt.kind) {
				t.Fatalf("err = %v (kind %v)", err, apperr.KindOf(err))
			}
		})
	}
}

func TestWriteErrorMapsKindsAndHidesInternals(t *testing.T) {
	var logs bytes.Buffer
	ctx := context.Background()
	tests := []struct {
		err    error
		status int
	}{
		{apperr.Invalid("x"), 400}, {apperr.Unauthorized("x"), 401}, {apperr.Forbidden("x"), 403},
		{apperr.NotFound("x"), 404}, {apperr.Conflict("x"), 409}, {apperr.TooLarge("x"), 413},
		{apperr.Validation(map[string]string{"title": "required"}), 422}, {apperr.RateLimited("x"), 429},
		{io.ErrUnexpectedEOF, 500}, {apperr.Wrap(apperr.KindInternal, "db", io.EOF), 500},
	}
	_ = logs
	for _, tt := range tests {
		w := httptest.NewRecorder()
		WriteError(w, httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx), tt.err)
		if w.Code != tt.status {
			t.Errorf("%v: status %d want %d", tt.err, w.Code, tt.status)
		}
		if tt.status == 500 && strings.Contains(w.Body.String(), "EOF") {
			t.Errorf("internal error leaked: %s", w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	WriteError(w, httptest.NewRequest(http.MethodGet, "/", nil), apperr.Validation(map[string]string{"title": "required"}))
	if !strings.Contains(w.Body.String(), `"fields":{"title":"required"}`) {
		t.Errorf("fields missing: %s", w.Body.String())
	}
}

func TestAuthAndRoleGuards(t *testing.T) {
	resolve := func(_ context.Context, token string) (viewer.Viewer, error) {
		switch token {
		case "user":
			return viewer.Viewer{Authenticated: true, User: domain.User{ID: "u1", Role: domain.UserRole}}, nil
		case "mod":
			return viewer.Viewer{Authenticated: true, User: domain.User{ID: "u2", Role: domain.ModeratorRole}}, nil
		case "admin":
			return viewer.Viewer{Authenticated: true, User: domain.User{ID: "u3", Role: domain.AdminRole}}, nil
		case "expired":
			return viewer.Viewer{}, apperr.Unauthorized("expired")
		}
		return viewer.Viewer{}, io.ErrClosedPipe
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /authed", Authed(ok))
	mux.HandleFunc("GET /staff", Staff(ok))
	mux.HandleFunc("GET /admin", Admin(ok))
	h := Auth("sid", resolve)(mux)
	tests := []struct {
		path, cookie string
		want         int
	}{
		{"/authed", "", 401}, {"/authed", "user", 204}, {"/authed", "expired", 401},
		{"/staff", "user", 403}, {"/staff", "mod", 204}, {"/staff", "admin", 204}, {"/staff", "", 401},
		{"/admin", "mod", 403}, {"/admin", "admin", 204},
		{"/authed", "broken", 500},
	}
	for _, tt := range tests {
		r := httptest.NewRequest(http.MethodGet, tt.path, nil)
		if tt.cookie != "" {
			r.AddCookie(&http.Cookie{Name: "sid", Value: tt.cookie})
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tt.want {
			t.Errorf("%s as %q: %d want %d", tt.path, tt.cookie, w.Code, tt.want)
		}
	}
}

func TestSecurityHeadersAndLimits(t *testing.T) {
	h := Chain(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err != nil {
			WriteError(w, r, apperr.TooLarge("x"))
			return
		}
		w.WriteHeader(204)
	}), SecurityHeaders(true), Limits(10, time.Second))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader("tiny")))
	for _, header := range []string{"X-Content-Type-Options", "Content-Security-Policy", "Strict-Transport-Security", "Cache-Control", "Referrer-Policy"} {
		if w.Header().Get(header) == "" {
			t.Errorf("missing %s", header)
		}
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(strings.Repeat("x", 100))))
	if w.Code != 413 {
		t.Errorf("oversized body: %d", w.Code)
	}
}
