package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	OrganizationRulesFile string
	Addr                  string
	DatabaseURL           string
	MigrationsDir         string
	MigrateOnStart        bool
	PublicURL             string
	GoogleClientID        string
	GoogleClientSecret    string
	EntraClientID         string
	EntraClientSecret     string

	LogLevel          string
	MetricsAddr       string
	TrustedProxyCIDRs []string
	// AppSecret keys cursor signatures and address hashes. Required over HTTPS;
	// on loopback a random per-process value is used when it is unset.
	AppSecret string

	RateLimitAnonRPS     float64
	RateLimitAnonBurst   int
	RateLimitUserRPS     float64
	RateLimitUserBurst   int
	RateLimitLoginPerMin int
	RateLimitPostsPerMin int

	SessionAbsoluteTTL time.Duration
	SessionIdleTTL     time.Duration

	DBMaxConns         int
	DBStatementTimeout time.Duration
	ShutdownTimeout    time.Duration
	RequestTimeout     time.Duration
}

// Load reads and validates the environment. Misconfiguration stops startup
// instead of surfacing later as a confusing runtime failure.
func Load() (Config, error) {
	var errs []error
	str := func(key, fallback string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return fallback
	}
	integer := func(key string, fallback, lo, hi int) int {
		raw := os.Getenv(key)
		if raw == "" {
			return fallback
		}
		n, err := strconv.Atoi(raw)
		if err != nil || n < lo || n > hi {
			errs = append(errs, fmt.Errorf("%s must be an integer in [%d, %d]", key, lo, hi))
			return fallback
		}
		return n
	}
	float := func(key string, fallback, lo, hi float64) float64 {
		raw := os.Getenv(key)
		if raw == "" {
			return fallback
		}
		n, err := strconv.ParseFloat(raw, 64)
		if err != nil || n < lo || n > hi {
			errs = append(errs, fmt.Errorf("%s must be a number in [%g, %g]", key, lo, hi))
			return fallback
		}
		return n
	}
	duration := func(key string, fallback, lo, hi time.Duration) time.Duration {
		raw := os.Getenv(key)
		if raw == "" {
			return fallback
		}
		d, err := time.ParseDuration(raw)
		if err != nil || d < lo || d > hi {
			errs = append(errs, fmt.Errorf("%s must be a duration in [%s, %s]", key, lo, hi))
			return fallback
		}
		return d
	}

	cfg := Config{
		OrganizationRulesFile: str("ORGANIZATION_RULES_FILE", "config/organizations.json"),
		Addr:                  str("ADDR", ":8080"),
		DatabaseURL:           str("DATABASE_URL", "postgres://fantasm:fantasm@localhost:5432/fantasm?sslmode=disable"),
		MigrationsDir:         str("MIGRATIONS_DIR", "migrations"),
		MigrateOnStart:        str("MIGRATE_ON_START", "false") == "true",
		PublicURL:             str("PUBLIC_URL", "http://localhost:8080"),
		GoogleClientID:        os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:    os.Getenv("GOOGLE_CLIENT_SECRET"),
		EntraClientID:         os.Getenv("ENTRA_CLIENT_ID"),
		EntraClientSecret:     os.Getenv("ENTRA_CLIENT_SECRET"),
		LogLevel:              str("LOG_LEVEL", "info"),
		MetricsAddr:           os.Getenv("METRICS_ADDR"),
		AppSecret:             os.Getenv("APP_SECRET"),

		RateLimitAnonRPS:     float("RATE_LIMIT_ANON_RPS", 10, 0.1, 10_000),
		RateLimitAnonBurst:   integer("RATE_LIMIT_ANON_BURST", 40, 1, 100_000),
		RateLimitUserRPS:     float("RATE_LIMIT_USER_RPS", 20, 0.1, 10_000),
		RateLimitUserBurst:   integer("RATE_LIMIT_USER_BURST", 60, 1, 100_000),
		RateLimitLoginPerMin: integer("RATE_LIMIT_LOGIN_PER_MIN", 20, 1, 10_000),
		RateLimitPostsPerMin: integer("RATE_LIMIT_POSTS_PER_MIN", 10, 1, 10_000),

		SessionAbsoluteTTL: duration("SESSION_ABSOLUTE_TTL", 30*24*time.Hour, time.Hour, 365*24*time.Hour),
		SessionIdleTTL:     duration("SESSION_IDLE_TTL", 7*24*time.Hour, time.Minute, 365*24*time.Hour),

		DBMaxConns:         integer("DB_MAX_CONNS", 20, 1, 500),
		DBStatementTimeout: duration("DB_STATEMENT_TIMEOUT", 10*time.Second, 100*time.Millisecond, 5*time.Minute),
		ShutdownTimeout:    duration("SHUTDOWN_TIMEOUT", 20*time.Second, time.Second, 5*time.Minute),
		RequestTimeout:     duration("REQUEST_TIMEOUT", 15*time.Second, 500*time.Millisecond, 5*time.Minute),
	}
	for _, cidr := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		if cidr = strings.TrimSpace(cidr); cidr != "" {
			cfg.TrustedProxyCIDRs = append(cfg.TrustedProxyCIDRs, cidr)
		}
	}
	if cfg.MetricsAddr != "" {
		_, port, err := net.SplitHostPort(cfg.MetricsAddr)
		n, portErr := strconv.Atoi(port)
		if err != nil || portErr != nil || n < 1 || n > 65535 {
			errs = append(errs, errors.New("METRICS_ADDR must be a host:port address with a port in [1, 65535]"))
		}
	}

	if cfg.SessionIdleTTL > cfg.SessionAbsoluteTTL {
		errs = append(errs, errors.New("SESSION_IDLE_TTL must not exceed SESSION_ABSOLUTE_TTL"))
	}
	for _, pair := range [][2]string{{"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"}, {"ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET"}} {
		if (os.Getenv(pair[0]) == "") != (os.Getenv(pair[1]) == "") {
			errs = append(errs, fmt.Errorf("%s and %s must be set together", pair[0], pair[1]))
		}
	}

	u, err := url.Parse(cfg.PublicURL)
	switch {
	case err != nil || u.Host == "":
		errs = append(errs, errors.New("PUBLIC_URL must be an absolute URL"))
	case u.Scheme == "https":
		if len(cfg.AppSecret) < 32 {
			errs = append(errs, errors.New("APP_SECRET must be at least 32 characters when PUBLIC_URL is https"))
		}
	default:
		if len(cfg.AppSecret) == 0 {
			var b [32]byte
			_, _ = rand.Read(b[:])
			cfg.AppSecret = hex.EncodeToString(b[:])
		}
	}
	return cfg, errors.Join(errs...)
}
