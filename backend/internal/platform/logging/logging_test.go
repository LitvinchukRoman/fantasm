package logging

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"
)

func lines(t *testing.T, buf *bytes.Buffer) []map[string]any {
	t.Helper()
	var out []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if l == "" {
			continue
		}
		m := map[string]any{}
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("log line is not JSON: %q", l)
		}
		out = append(out, m)
	}
	return out
}

func TestSecretsNeverReachTheLog(t *testing.T) {
	var buf bytes.Buffer
	l := New(&buf, "info")
	l.Info("event",
		"session_token", "S3CR3T", "Cookie", "S3CR3T", "authorization", "S3CR3T", "client_secret", "S3CR3T", "password", "S3CR3T",
		"code", "S3CR3T", "state", "S3CR3T", "pkce_verifier", "S3CR3T", "nonce", "S3CR3T", "oauth.code", "S3CR3T",
		slog.Group("req", slog.String("api_token", "S3CR3T")))
	if strings.Contains(buf.String(), "S3CR3T") {
		t.Fatalf("secret leaked: %s", buf.String())
	}
}

func TestOrdinaryFieldsSurvive(t *testing.T) {
	var buf bytes.Buffer
	New(&buf, "info").Info("event", "status", 200, "decoded", "x", "request_id", "abc", "user_id", "u1", "statement", "q", "error", "boom")
	got := lines(t, &buf)[0]
	for k, want := range map[string]any{"status": float64(200), "decoded": "x", "request_id": "abc", "user_id": "u1", "statement": "q", "error": "boom", "msg": "event"} {
		if got[k] != want {
			t.Errorf("%s = %v, want %v", k, got[k], want)
		}
	}
}

func TestLevels(t *testing.T) {
	for level, wantInfo := range map[string]bool{"debug": true, "INFO": true, "warn": false, "error": false, "nonsense": true, "": true} {
		var buf bytes.Buffer
		New(&buf, level).Info("x")
		if got := buf.Len() > 0; got != wantInfo {
			t.Errorf("level %q logs info = %v, want %v", level, got, wantInfo)
		}
	}
	var buf bytes.Buffer
	New(&buf, "error").Error("still logged")
	if buf.Len() == 0 {
		t.Error("error level dropped an error")
	}
}

func TestRequestScopedLogger(t *testing.T) {
	var buf bytes.Buffer
	scoped := New(&buf, "info").With("request_id", "r1")
	From(With(context.Background(), scoped)).Info("hello")
	if lines(t, &buf)[0]["request_id"] != "r1" {
		t.Fatalf("scoped logger lost its attributes: %s", buf.String())
	}
	if From(context.Background()) == nil {
		t.Fatal("no fallback logger")
	}
}

func TestAddressHash(t *testing.T) {
	a := AddressHash("one", "203.0.113.7")
	if len(a) != 32 || a != AddressHash("one", "203.0.113.7") || a == AddressHash("two", "203.0.113.7") || a == AddressHash("one", "203.0.113.8") {
		t.Fatal("hash must be stable, keyed, and address-specific")
	}
	if AddressHash("", "203.0.113.7") != "" || AddressHash("one", "") != "" {
		t.Fatal("missing key or address must not produce an unkeyed identifier")
	}
}
