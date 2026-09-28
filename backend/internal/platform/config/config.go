package config

import "os"

type Config struct {
	Addr               string
	DatabaseURL        string
	MigrationsDir      string
	MigrateOnStart     bool
	PublicURL          string
	GoogleClientID     string
	GoogleClientSecret string
	EntraClientID      string
	EntraClientSecret  string
	UKMATenantID       string
}

func Load() Config {
	return Config{
		Addr:               getenv("ADDR", ":8080"),
		DatabaseURL:        getenv("DATABASE_URL", "postgres://fantasm:fantasm@localhost:5432/fantasm?sslmode=disable"),
		MigrationsDir:      getenv("MIGRATIONS_DIR", "migrations"),
		MigrateOnStart:     getenv("MIGRATE_ON_START", "false") == "true",
		PublicURL:          getenv("PUBLIC_URL", "http://localhost:8080"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		EntraClientID:      os.Getenv("ENTRA_CLIENT_ID"),
		EntraClientSecret:  os.Getenv("ENTRA_CLIENT_SECRET"),
		UKMATenantID:       os.Getenv("UKMA_TENANT_ID"),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
