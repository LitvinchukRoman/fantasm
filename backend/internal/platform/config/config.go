package config

import "os"

type Config struct {
	Addr           string
	DatabaseURL    string
	MigrationsDir  string
	MigrateOnStart bool
}

func Load() Config {
	return Config{
		Addr:           getenv("ADDR", ":8080"),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://fantasm:fantasm@localhost:5432/fantasm?sslmode=disable"),
		MigrationsDir:  getenv("MIGRATIONS_DIR", "migrations"),
		MigrateOnStart: getenv("MIGRATE_ON_START", "false") == "true",
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
