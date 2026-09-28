package migrate

import (
	"errors"
	"fmt"
	"strings"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func Up(databaseURL, dir string) error {
	return run(databaseURL, dir, func(m *migrate.Migrate) error { return m.Up() })
}

func Down(databaseURL, dir string) error {
	return run(databaseURL, dir, func(m *migrate.Migrate) error { return m.Steps(-1) })
}

func run(databaseURL, dir string, fn func(*migrate.Migrate) error) error {
	m, err := migrate.New("file://"+dir, pgxScheme(databaseURL))
	if err != nil {
		return fmt.Errorf("open migrations: %w", err)
	}
	defer m.Close()

	if err := fn(m); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}

func pgxScheme(url string) string {
	for _, prefix := range []string{"postgresql://", "postgres://"} {
		if strings.HasPrefix(url, prefix) {
			return "pgx5://" + strings.TrimPrefix(url, prefix)
		}
	}
	return url
}
