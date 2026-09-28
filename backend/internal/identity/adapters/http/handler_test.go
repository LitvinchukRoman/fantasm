package http

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
)

func TestPublicURLValidation(t *testing.T) {
	for _, origin := range []string{"https://fantasm.example", "http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"} {
		if _, err := NewHandler(nil, nil, origin); err != nil {
			t.Errorf("rejected %s: %v", origin, err)
		}
	}
	for _, origin := range []string{"", "//example.com", "http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com?query=1", "https://example.com#fragment"} {
		if _, err := NewHandler(nil, nil, origin); err == nil {
			t.Errorf("accepted %s", origin)
		}
	}
}

func TestUnauthenticatedRequestsAndLogoutOrigin(t *testing.T) {
	service := identity.NewService(nil, nil, nil, "")
	h, err := NewHandler(service, slog.New(slog.NewTextHandler(io.Discard, nil)), "https://fantasm.example")
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	h.Register(mux)
	tests := []struct {
		method, path, origin string
		status               int
	}{
		{http.MethodGet, "/api/me", "", http.StatusUnauthorized},
		{http.MethodPost, "/api/auth/logout", "", http.StatusForbidden},
		{http.MethodPost, "/api/auth/logout", "https://attacker.example", http.StatusForbidden},
		{http.MethodPost, "/api/auth/logout", "null", http.StatusForbidden},
		{http.MethodPost, "/api/auth/logout", "https://fantasm.example", http.StatusNoContent},
		{http.MethodGet, "/api/auth/unknown/login", "", http.StatusNotFound},
		{http.MethodHead, "/api/auth/google/login", "", http.StatusMethodNotAllowed},
		{http.MethodHead, "/api/auth/google/callback", "", http.StatusMethodNotAllowed},
	}
	for _, tt := range tests {
		t.Run(tt.method+tt.path+tt.origin, func(t *testing.T) {
			r := httptest.NewRequest(tt.method, tt.path, nil)
			r.Header.Set("Origin", tt.origin)
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != tt.status {
				t.Fatalf("status = %d, want %d: %s", w.Code, tt.status, w.Body.String())
			}
			if w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("identity response may be cached")
			}
			if tt.status == http.StatusNoContent {
				for _, cookie := range w.Result().Cookies() {
					if !cookie.Secure || !cookie.HttpOnly || cookie.Path != "/" || cookie.Domain != "" || cookie.MaxAge != -1 {
						t.Fatalf("unsafe cookie: %+v", cookie)
					}
				}
			}
		})
	}
}
