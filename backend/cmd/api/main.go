package main

import
(
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	identityhttp "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/http"
	identityoidc "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/oidc"
	identitypostgres "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/migrate"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	if err := run(logger); err != nil {
		logger.Error("fantasm api stopped", "err", err)
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	cfg := config.Load()
	policy, err := organizations.Load(cfg.OrganizationRulesFile)
	if err != nil {
		return err
	}

	if cfg.MigrateOnStart {
		if err := migrate.Up(cfg.DatabaseURL, cfg.MigrationsDir); err != nil {
			return err
		}
	}

	db, err := postgres.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	mux := http.NewServeMux()
	providers := make(map[domain.Provider]identity.Provider)
	for _, providerConfig := range []identityoidc.Config{
		{Provider: domain.Google, ClientID: cfg.GoogleClientID, ClientSecret: cfg.GoogleClientSecret},
		{Provider: domain.Entra, ClientID: cfg.EntraClientID, ClientSecret: cfg.EntraClientSecret},
	} {
		if providerConfig.ClientID == "" && providerConfig.ClientSecret == "" {
			continue
		}
		providerConfig.RedirectURL = strings.TrimSuffix(cfg.PublicURL, "/") + "/api/auth/" + string(providerConfig.Provider) + "/callback"
		provider, err := identityoidc.NewProvider(context.Background(), providerConfig)
		if err != nil {
			return err
		}
		providers[providerConfig.Provider] = provider
	}
	repository := identitypostgres.NewRepository(db)
	service := identity.NewService(repository, db, providers, identity.WithMembershipPolicy(policy))
	handler, err := identityhttp.NewHandler(service, logger, cfg.PublicURL)
	if err != nil {
		return err
	}
	handler.Register(mux)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	logger.Info("fantasm api listening", "addr", cfg.Addr)
	server := &http.Server{Addr: cfg.Addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	return server.ListenAndServe()
}
