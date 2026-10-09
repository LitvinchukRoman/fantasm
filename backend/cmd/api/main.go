package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/app"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	identityoidc "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/oidc"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/jobs"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/migrate"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/telemetry"
)

func main() {
	cfg, err := config.Load()
	logger := logging.New(os.Stdout, cfg.LogLevel)
	if err != nil {
		logger.Error("invalid configuration", "event", "startup.failed", "phase", "configuration", "error", err)
		os.Exit(1)
	}
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if len(os.Args) == 3 && os.Args[1] == "seed" {
		if err := runSeed(ctx, cfg, logger, os.Args[2]); err != nil {
			logger.Error("seed failed", "error", err)
			os.Exit(1)
		}
		return
	}
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("fantasm api stopped", "event", "service.failed", "error", err)
		os.Exit(1)
	}
	logger.Info("fantasm api stopped cleanly", "event", "service.stopped")
}

func run(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	logger.InfoContext(ctx, "starting fantasm api", "event", "service.starting", "metrics_enabled", cfg.MetricsAddr != "")
	var metrics *telemetry.Metrics
	var observer httpx.RequestObserver
	var metricsErr <-chan error
	if cfg.MetricsAddr != "" {
		metrics = telemetry.New()
		observer = metrics
		listener, err := new(net.ListenConfig).Listen(ctx, "tcp", cfg.MetricsAddr)
		if err != nil {
			return fmt.Errorf("listen for metrics: %w", err)
		}
		mux := http.NewServeMux()
		mux.Handle("GET /metrics", metrics.Handler())
		server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16 << 10}
		errs := make(chan error, 1)
		metricsErr = errs
		go func() { errs <- server.Serve(listener) }()
		defer func() {
			metrics.Ready(false)
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := server.Shutdown(shutdownCtx); err != nil {
				logger.Warn("metrics shutdown failed", "event", "metrics.shutdown_failed", "error", err)
			}
		}()
		logger.InfoContext(ctx, "metrics listener started", "event", "metrics.started", "addr", listener.Addr().String())
	}
	phase := func(name string, fn func() error) error {
		start := time.Now()
		logger.InfoContext(ctx, "startup phase started", "event", "startup.phase_started", "phase", name)
		err := fn()
		duration := time.Since(start)
		if metrics != nil {
			metrics.Startup(name, duration)
		}
		if err != nil {
			logger.ErrorContext(ctx, "startup phase failed", "event", "startup.phase_failed", "phase", name, "duration_ms", float64(duration)/float64(time.Millisecond), "error", err)
			return err
		}
		logger.InfoContext(ctx, "startup phase finished", "event", "startup.phase_finished", "phase", name, "duration_ms", float64(duration)/float64(time.Millisecond))
		return nil
	}
	var policy *organizations.Policy
	if err := phase("organization_rules", func() error {
		var err error
		policy, err = organizations.Load(cfg.OrganizationRulesFile)
		return err
	}); err != nil {
		return err
	}

	if cfg.MigrateOnStart {
		if err := phase("migrations", func() error { return migrate.Up(cfg.DatabaseURL, cfg.MigrationsDir) }); err != nil {
			return err
		}
	}
	var db *postgres.DB
	if err := phase("database", func() error {
		var err error
		db, err = postgres.ConnectWith(ctx, cfg.DatabaseURL, postgres.Options{MaxConns: cfg.DBMaxConns, StatementTimeout: cfg.DBStatementTimeout})
		return err
	}); err != nil {
		return err
	}
	defer db.Close()
	if metrics != nil {
		metrics.RegisterPool(db)
	}

	providers := make(map[domain.Provider]identity.Provider)
	for _, providerConfig := range []identityoidc.Config{
		{Provider: domain.Google, ClientID: cfg.GoogleClientID, ClientSecret: cfg.GoogleClientSecret},
		{Provider: domain.Entra, ClientID: cfg.EntraClientID, ClientSecret: cfg.EntraClientSecret},
	} {
		if providerConfig.ClientID == "" && providerConfig.ClientSecret == "" {
			continue
		}
		providerConfig.RedirectURL = strings.TrimSuffix(cfg.PublicURL, "/") + "/api/auth/" + string(providerConfig.Provider) + "/callback"
		var provider *identityoidc.Provider
		if err := phase("oidc_"+string(providerConfig.Provider), func() error {
			var err error
			provider, err = identityoidc.NewProvider(ctx, providerConfig)
			return err
		}); err != nil {
			return err
		}
		providers[providerConfig.Provider] = provider
	}
	if len(providers) == 0 {
		logger.Warn("no identity provider configured; nobody can sign in")
	}

	application, err := app.Build(cfg, logger, db, policy, providers, observer)
	if err != nil {
		return err
	}

	root := http.NewServeMux()
	root.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	root.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		pingCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if err := db.Ping(pingCtx); err != nil {
			logger.Warn("readiness check failed", "error", err)
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ready"}`))
	})
	root.Handle("/", application.API)

	runner := jobs.NewRunner(logger, application.Jobs...)
	if metrics != nil {
		runner.WithObserver(metrics.ObserveJob)
	}
	jobsCtx, stopJobs := context.WithCancel(ctx)
	jobsDone := make(chan struct{})
	go func() { defer close(jobsDone); runner.Run(jobsCtx) }()

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           root,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      cfg.RequestTimeout + 5*time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
	serverErr := make(chan error, 1)
	listener, err := new(net.ListenConfig).Listen(ctx, "tcp", cfg.Addr)
	if err != nil {
		stopJobs()
		<-jobsDone
		return fmt.Errorf("listen for api: %w", err)
	}
	if metrics != nil {
		metrics.Ready(true)
	}
	go func() {
		logger.Info("fantasm api listening", "event", "service.ready", "addr", listener.Addr().String())
		serverErr <- server.Serve(listener)
	}()

	var result error
	select {
	case err := <-serverErr:
		result = err
	case err := <-metricsErr:
		result = fmt.Errorf("metrics listener stopped: %w", err)
	case <-ctx.Done():
		logger.Info("shutdown requested", "event", "service.stopping")
	}
	if metrics != nil {
		metrics.Ready(false)
	}
	stopJobs()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		result = errors.Join(result, fmt.Errorf("graceful shutdown: %w", err))
	}
	<-jobsDone
	if errors.Is(result, http.ErrServerClosed) {
		return nil
	}
	return result
}
