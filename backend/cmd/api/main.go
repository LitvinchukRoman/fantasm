package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"

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
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	logger.Info("fantasm api listening", "addr", cfg.Addr)
	return http.ListenAndServe(cfg.Addr, mux)
}
