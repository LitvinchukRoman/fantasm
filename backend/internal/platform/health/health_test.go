package health

import (
	"testing"
	"time"
)

func TestRingKeepsADayAndPercentile(t *testing.T) {
	tr := New()
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	tr.now = func() time.Time { return now }
	tr.started = now.Add(-time.Hour)
	for range 100 {
		tr.ObserveHTTP("GET", "/api/ideas", 200, 10, 20*time.Millisecond)
	}
	tr.ObserveHTTP("GET", "/api/ideas", 500, 10, 3*time.Second)
	hour := tr.Window(time.Hour)
	if hour.Requests != 101 || hour.ServerErrors != 1 {
		t.Fatalf("window: %+v", hour)
	}
	if hour.P95 > 50*time.Millisecond {
		t.Fatalf("p95 = %s, the single slow request must not move it", hour.P95)
	}
	day, req, _, srv := tr.TakePending()
	if day != "2026-10-18" || req != 101 || srv != 1 {
		t.Fatalf("pending %s %d %d", day, req, srv)
	}
	if _, req, _, _ = tr.TakePending(); req != 0 {
		t.Fatal("pending was not consumed")
	}
	tr.RestorePending(day, 101, 0, 1)
	if _, req, _, _ = tr.TakePending(); req != 101 {
		t.Fatalf("restored %d", req)
	}
}

func TestJudge(t *testing.T) {
	ok, reasons := Judge(Input{Ready: true})
	if ok != "ok" || len(reasons) != 0 {
		t.Fatalf("healthy: %s %v", ok, reasons)
	}
	status, _ := Judge(Input{Ready: true, DBError: true})
	if status != "down" {
		t.Fatalf("db: %s", status)
	}
	status, _ = Judge(Input{Ready: true, Hour: Window{Requests: 100, ServerErrors: 6}})
	if status != "down" {
		t.Fatalf("error rate: %s", status)
	}
	status, _ = Judge(Input{Ready: true, Hour: Window{Requests: 100, ServerErrors: 2}})
	if status != "degraded" {
		t.Fatalf("mild error rate: %s", status)
	}
	status, _ = Judge(Input{Ready: true, OldestQueue: 25 * time.Hour})
	if status != "degraded" {
		t.Fatalf("queue: %s", status)
	}
	// A handful of requests must not page anyone.
	status, _ = Judge(Input{Ready: true, Hour: Window{Requests: 5, ServerErrors: 5, P95: 3 * time.Second}})
	if status != "down" {
		t.Fatalf("slow even when quiet: %s", status)
	}
}
