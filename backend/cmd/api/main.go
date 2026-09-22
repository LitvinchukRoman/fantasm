package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/LitvinchukRoman/fantasm/backend/internal/server"
)

func main() {
	addr := getenv("ADDR", ":8080")
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))

	srv := &http.Server{
		Addr:    addr,
		Handler: server.New(logger),
	}

	logger.Info("fantasm api listening", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
