package config

import (
	"strings"
	"testing"
	"time"
)

var keys = []string{
	"ORGANIZATION_RULES_FILE", "ADDR", "DATABASE_URL", "MIGRATIONS_DIR", "MIGRATE_ON_START", "PUBLIC_URL",
	"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "LOG_LEVEL", "APP_SECRET", "TRUSTED_PROXY_CIDRS",
	"RATE_LIMIT_ANON_RPS", "RATE_LIMIT_ANON_BURST", "RATE_LIMIT_USER_RPS", "RATE_LIMIT_USER_BURST", "RATE_LIMIT_LOGIN_PER_MIN", "RATE_LIMIT_POSTS_PER_MIN",
	"SESSION_ABSOLUTE_TTL", "SESSION_IDLE_TTL", "DB_MAX_CONNS", "DB_STATEMENT_TIMEOUT", "SHUTDOWN_TIMEOUT", "REQUEST_TIMEOUT", "METRICS_ADDR",
}

// env starts from an empty environment and applies overrides.
func env(t *testing.T, overrides map[string]string) {
	t.Helper()
	for _, k := range keys {
		t.Setenv(k, "")
	}
	for k, v := range overrides {
		t.Setenv(k, v)
	}
}

func TestDefaultsAreSafeAndValid(t *testing.T) {
	env(t, nil)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.AppSecret == "" || len(cfg.AppSecret) < 32 {
		t.Errorf("no generated secret on loopback: %q", cfg.AppSecret)
	}
	if cfg.SessionIdleTTL > cfg.SessionAbsoluteTTL || cfg.SessionIdleTTL <= 0 {
		t.Errorf("session TTLs: idle %v, absolute %v", cfg.SessionIdleTTL, cfg.SessionAbsoluteTTL)
	}
	if cfg.MigrateOnStart {
		t.Error("migrations must not run on start by default")
	}
	if cfg.MetricsAddr != "" {
		t.Fatal("metrics must be disabled by default")
	}
	if cfg.RequestTimeout <= 0 || cfg.ShutdownTimeout <= 0 || cfg.DBStatementTimeout <= 0 || cfg.DBMaxConns <= 0 {
		t.Errorf("unbounded defaults: %+v", cfg)
	}
}

func TestEveryOverrideIsRead(t *testing.T) {
	env(t, map[string]string{
		"ADDR": ":9", "PUBLIC_URL": "https://fantasm.example", "APP_SECRET": strings.Repeat("s", 40), "LOG_LEVEL": "debug",
		"RATE_LIMIT_ANON_RPS": "2.5", "RATE_LIMIT_ANON_BURST": "7", "RATE_LIMIT_USER_RPS": "3", "RATE_LIMIT_USER_BURST": "9",
		"RATE_LIMIT_LOGIN_PER_MIN": "4", "RATE_LIMIT_POSTS_PER_MIN": "5",
		"SESSION_IDLE_TTL": "2h", "SESSION_ABSOLUTE_TTL": "48h", "DB_MAX_CONNS": "8", "DB_STATEMENT_TIMEOUT": "3s",
		"REQUEST_TIMEOUT": "4s", "SHUTDOWN_TIMEOUT": "5s", "MIGRATE_ON_START": "true",
		"TRUSTED_PROXY_CIDRS": " 10.0.0.0/8 , 172.16.0.0/12 ,, ",
		"GOOGLE_CLIENT_ID":    "id", "GOOGLE_CLIENT_SECRET": "secret",
	})
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Addr != ":9" || cfg.LogLevel != "debug" || cfg.RateLimitAnonRPS != 2.5 || cfg.RateLimitAnonBurst != 7 || cfg.RateLimitUserRPS != 3 ||
		cfg.RateLimitUserBurst != 9 || cfg.RateLimitLoginPerMin != 4 || cfg.RateLimitPostsPerMin != 5 || cfg.DBMaxConns != 8 || !cfg.MigrateOnStart {
		t.Errorf("not applied: %+v", cfg)
	}
	if cfg.SessionIdleTTL != 2*time.Hour || cfg.SessionAbsoluteTTL != 48*time.Hour || cfg.DBStatementTimeout != 3*time.Second ||
		cfg.RequestTimeout != 4*time.Second || cfg.ShutdownTimeout != 5*time.Second {
		t.Errorf("durations not applied: %+v", cfg)
	}
	if got := strings.Join(cfg.TrustedProxyCIDRs, "|"); got != "10.0.0.0/8|172.16.0.0/12" {
		t.Errorf("cidrs = %q", got)
	}
}

func TestMisconfigurationStopsStartup(t *testing.T) {
	cases := map[string]map[string]string{
		"https without secret":      {"PUBLIC_URL": "https://fantasm.example"},
		"https with a short secret": {"PUBLIC_URL": "https://fantasm.example", "APP_SECRET": "short"},
		"relative public url":       {"PUBLIC_URL": "/just/a/path"},
		"idle longer than absolute": {"SESSION_IDLE_TTL": "100h", "SESSION_ABSOLUTE_TTL": "10h"},
		"half a google pair":        {"GOOGLE_CLIENT_ID": "id"},
		"half an entra pair":        {"ENTRA_CLIENT_SECRET": "secret"},
		"not a number":              {"DB_MAX_CONNS": "many"},
		"zero connections":          {"DB_MAX_CONNS": "0"},
		"absurd connections":        {"DB_MAX_CONNS": "100000"},
		"negative rate":             {"RATE_LIMIT_USER_RPS": "-1"},
		"not a duration":            {"REQUEST_TIMEOUT": "soon"},
		"zero timeout":              {"REQUEST_TIMEOUT": "0s"},
		"year-long timeout":         {"REQUEST_TIMEOUT": "8760h"},
		"sub-hour absolute session": {"SESSION_ABSOLUTE_TTL": "1m"},
		"metrics missing port":      {"METRICS_ADDR": "localhost"},
		"metrics invalid port":      {"METRICS_ADDR": "localhost:70000"},
	}
	for name, overrides := range cases {
		env(t, overrides)
		if _, err := Load(); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestMetricsAddress(t *testing.T) {
	for _, addr := range []string{"127.0.0.1:9091", ":9091", "[::1]:9091"} {
		env(t, map[string]string{"METRICS_ADDR": addr})
		cfg, err := Load()
		if err != nil || cfg.MetricsAddr != addr {
			t.Fatalf("%s: %v", addr, err)
		}
	}
}

func TestAllProblemsAreReportedTogether(t *testing.T) {
	env(t, map[string]string{"DB_MAX_CONNS": "x", "REQUEST_TIMEOUT": "y", "GOOGLE_CLIENT_ID": "id"})
	_, err := Load()
	if err == nil {
		t.Fatal("accepted")
	}
	for _, want := range []string{"DB_MAX_CONNS", "REQUEST_TIMEOUT", "GOOGLE_CLIENT_ID"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error does not mention %s: %v", want, err)
		}
	}
}

func TestErrorsNeverEchoSecrets(t *testing.T) {
	env(t, map[string]string{"PUBLIC_URL": "https://fantasm.example", "APP_SECRET": "shortsecretvalue"})
	_, err := Load()
	if err == nil || strings.Contains(err.Error(), "shortsecretvalue") {
		t.Fatalf("error %v", err)
	}
}
