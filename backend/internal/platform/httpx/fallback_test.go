package httpx

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fallbackMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/things/{id}", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("thing " + r.PathValue("id")))
	})
	mux.HandleFunc("POST /api/things/{id}", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("GET /api/dir/", func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("dir")) })
	return JSONFallbacks(mux)
}

func TestJSONFallbacksKeepPathValues(t *testing.T) {
	rec := httptest.NewRecorder()
	fallbackMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/things/42", nil))
	if rec.Code != http.StatusOK || rec.Body.String() != "thing 42" {
		t.Fatalf("matched route lost its path value: %d %q", rec.Code, rec.Body)
	}
}

func TestJSONFallbacksAnswerInTheStandardShape(t *testing.T) {
	cases := []struct {
		name, method, path string
		status             int
		code, allow        string
	}{
		{"unknown path", http.MethodGet, "/nope", http.StatusNotFound, "not_found", ""},
		{"unknown api path", http.MethodGet, "/api/nope/deeper", http.StatusNotFound, "not_found", ""},
		{"wrong method", http.MethodDelete, "/api/things/1", http.StatusMethodNotAllowed, "method_not_allowed", "GET, HEAD, POST"},
		{"put on a read route", http.MethodPut, "/api/things/1", http.StatusMethodNotAllowed, "method_not_allowed", "GET, HEAD, POST"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			fallbackMux().ServeHTTP(rec, httptest.NewRequest(c.method, c.path, nil))
			if rec.Code != c.status {
				t.Fatalf("status %d, want %d", rec.Code, c.status)
			}
			var body struct{ Error, Code string }
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Code != c.code || body.Error == "" {
				t.Fatalf("body %q: %v", rec.Body, err)
			}
			if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, "application/json") {
				t.Errorf("Content-Type %q", got)
			}
			if got := rec.Header().Get("Allow"); got != c.allow {
				t.Errorf("Allow %q, want %q", got, c.allow)
			}
			if strings.Contains(rec.Body.String(), c.path) {
				t.Errorf("the body echoes the path: %s", rec.Body)
			}
		})
	}
}

func TestJSONFallbacksLeaveRouterRedirectsAlone(t *testing.T) {
	for path, location := range map[string]string{"/api/dir": "/api/dir/", "/api//things/1": "/api/things/1"} {
		rec := httptest.NewRecorder()
		fallbackMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusMovedPermanently && rec.Code != http.StatusTemporaryRedirect || rec.Header().Get("Location") != location {
			t.Errorf("%s: %d %q, want a redirect to %s", path, rec.Code, rec.Header().Get("Location"), location)
		}
	}
}
