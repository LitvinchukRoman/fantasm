package telemetry_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/telemetry"
)

func scrape(t *testing.T, m *telemetry.Metrics) string {
	t.Helper()
	w := httptest.NewRecorder()
	m.Handler().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("scrape: %d %s", w.Code, w.Body.String())
	}
	return w.Body.String()
}

func TestRequestObservationPreservesResponsesAndBoundsLabels(t *testing.T) {
	var logs bytes.Buffer
	m := telemetry.New()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ideas/{slug}", func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("slug") == "panic" {
			panic("test failure")
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("unchanged"))
	})
	mux.HandleFunc("POST /ideas/{slug}", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	h := httpx.Chain(httpx.JSONFallbacks(mux), httpx.RequestID(nil),
		httpx.AccessLog(logging.New(&logs, "info"), nil, httpx.AccessOptions{Router: mux, Secret: "test-key", Observer: m}),
		httpx.Recover(), httpx.CSRF("https://example.test"))
	for _, tc := range []struct {
		method, path string
		status       int
	}{
		{"GET", "/ideas/private-slug?code=secret-code", 202},
		{"GET", "/ideas/another-private-slug", 202},
		{"GET", "/ideas/panic", 500},
		{"POST", "/ideas/private-slug", 403},
		{"EVIL-METHOD", "/private-unmatched-path", 403},
		{"GET", "/private-unmatched-path", 404},
	} {
		r := httptest.NewRequest(tc.method, tc.path, nil)
		r.RemoteAddr = "203.0.113.77:1234"
		r.Header.Set("Cookie", "session=secret-cookie")
		r.Header.Set("Authorization", "Bearer secret-bearer")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tc.status {
			t.Fatalf("%s: %d want %d", tc.path, w.Code, tc.status)
		}
		if tc.status == 202 && w.Body.String() != "unchanged" {
			t.Fatal("response modified")
		}
	}
	output := scrape(t, m)
	for _, secret := range []string{"private-slug", "private-unmatched-path", "secret-code", "secret-cookie", "secret-bearer", "203.0.113.77", "EVIL-METHOD"} {
		if strings.Contains(logs.String()+output, secret) {
			t.Fatalf("sensitive or unbounded value leaked: %s", secret)
		}
	}
	for _, want := range []string{
		`fantasm_http_requests_total{method="GET",route="GET /ideas/{slug}",status="202"} 2`,
		`fantasm_http_requests_total{method="POST",route="POST /ideas/{slug}",status="403"} 1`,
		`fantasm_http_requests_total{method="GET",route="GET /ideas/{slug}",status="500"} 1`,
		`fantasm_http_response_bytes_total{method="GET",route="GET /ideas/{slug}"}`,
	} {
		if !strings.Contains(output, want) {
			t.Errorf("missing metric %s", want)
		}
	}
	requests := 0
	for _, line := range strings.Split(strings.TrimSpace(logs.String()), "\n") {
		var event map[string]any
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event["event"] != "http.request" {
			continue
		}
		requests++
		if event["request_id"] == "" || event["route"] == "" || event["client_hash"] == "" {
			t.Fatalf("missing correlation: %v", event)
		}
		if event["status"] == float64(403) && event["error_kind"] != "forbidden" {
			t.Fatalf("missing error category: %v", event)
		}
	}
	if requests != 6 {
		t.Fatalf("request events: %d", requests)
	}
}

func TestRegistriesAreIsolatedAndConcurrent(t *testing.T) {
	a, b := telemetry.New(), telemetry.New()
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			for range 100 {
				a.ObserveHTTP("GET", "GET /ideas", 200, 12, time.Millisecond)
			}
		})
	}
	wg.Wait()
	a.ObserveJob("purge-expired", time.Second, errors.New("failed"))
	a.ObserveJob("purge-expired", time.Second, nil)
	a.Startup("database", time.Second)
	a.Ready(true)
	got := scrape(t, a)
	for _, want := range []string{`status="200"} 2000`, `outcome="error"} 1`, `outcome="success"} 1`, `fantasm_ready 1`, `fantasm_startup_phase_duration_seconds{phase="database"} 1`, `fantasm_job_last_failure_timestamp_seconds{name="purge-expired"}`, "go_goroutines"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %s", want)
		}
	}
	if strings.Contains(scrape(t, b), "fantasm_http_requests_total{") {
		t.Fatal("metrics leaked across registries")
	}
	a.Ready(false)
	if !strings.Contains(scrape(t, a), "fantasm_ready 0") {
		t.Fatal("shutdown readiness")
	}
}
