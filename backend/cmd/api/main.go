package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/jobs"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/migrate"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

func main() {
	cfg, err := config.Load()
	logger := logging.New(os.Stdout, cfg.LogLevel)
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, cfg, logger); err != nil {
		logger.Error("fantasm api stopped", "error", err)
		os.Exit(1)
	}
	logger.Info("fantasm api stopped cleanly")
}

func run(ctx context.Context, cfg config.Config, logger *slog.Logger) error {
	policy, err := organizations.Load(cfg.OrganizationRulesFile)
	if err != nil {
		return err
	}

	if cfg.MigrateOnStart {
		if err := migrate.Up(cfg.DatabaseURL, cfg.MigrationsDir); err != nil {
			return err
		}
	}
	db, err := postgres.ConnectWith(ctx, cfg.DatabaseURL, postgres.Options{MaxConns: cfg.DBMaxConns, StatementTimeout: cfg.DBStatementTimeout})
	if err != nil {
		return err
	}
	defer db.Close()

	providers := make(map[domain.Provider]identity.Provider)
	for _, providerConfig := range []identityoidc.Config{
		{Provider: domain.Google, ClientID: cfg.GoogleClientID, ClientSecret: cfg.GoogleClientSecret},
		{Provider: domain.Entra, ClientID: cfg.EntraClientID, ClientSecret: cfg.EntraClientSecret},
	} {
		if providerConfig.ClientID == "" && providerConfig.ClientSecret == "" {
			continue
		}
		providerConfig.RedirectURL = strings.TrimSuffix(cfg.PublicURL, "/") + "/api/auth/" + string(providerConfig.Provider) + "/callback"
		provider, err := identityoidc.NewProvider(ctx, providerConfig)
		if err != nil {
			return err
		}
		providers[providerConfig.Provider] = provider
	}
	if len(providers) == 0 {
		logger.Warn("no identity provider configured; nobody can sign in")
	}

	application, err := app.Build(cfg, logger, db, policy, providers)
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
	go func() {
		logger.Info("fantasm api listening", "addr", cfg.Addr, "public_url", cfg.PublicURL)
		serverErr <- server.ListenAndServe()
	}()

	var result error
	select {
	case err := <-serverErr:
		result = err
	case <-ctx.Done():
		logger.Info("shutdown requested")
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
