// Package testdb gives integration tests a private, fully migrated schema.
package testdb

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

var counter atomic.Int64

// DSN returns the test database URL. TEST_DATABASE_URL wins; the old
// IDENTITY_TEST_DATABASE_URL keeps working. Empty means integration tests are off.
func DSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return os.Getenv("IDENTITY_TEST_DATABASE_URL")
}

// Scratch creates a uniquely named empty schema and returns a pool pinned to
// it. The schema is dropped when the test ends. Without a configured database
// the test is skipped, never failed.
func Scratch(t testing.TB) *postgres.DB {
	t.Helper()
	dsn := DSN()
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	admin, err := pgxpool.New(t.Context(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("it_%d_%d", time.Now().UnixNano(), counter.Add(1))
	if _, err := admin.Exec(t.Context(), "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
		admin.Close()
	})

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	db, err := postgres.Connect(t.Context(), u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}

// Migration is one numbered step, in one direction.
type Migration struct {
	Version int
	Name    string // file name
	SQL     string
}

// Migrations reads the migrations of one direction ("up" or "down"), oldest first.
func Migrations(t testing.TB, direction string) []Migration {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	dir := filepath.Join(filepath.Dir(file), "..", "..", "..", "migrations")
	paths, err := filepath.Glob(filepath.Join(dir, "*."+direction+".sql"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("find migrations: %v", err)
	}
	sort.Strings(paths)
	out := make([]Migration, 0, len(paths))
	for _, path := range paths {
		sql, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		name := filepath.Base(path)
		var version int
		if _, err := fmt.Sscanf(strings.SplitN(name, "_", 2)[0], "%d", &version); err != nil {
			t.Fatalf("migration %s has no version: %v", name, err)
		}
		out = append(out, Migration{Version: version, Name: name, SQL: string(sql)})
	}
	return out
}

// New returns a scratch schema with every migration applied.
func New(t testing.TB) *postgres.DB {
	t.Helper()
	db := Scratch(t)
	for _, m := range Migrations(t, "up") {
		if _, err := db.Querier(t.Context()).Exec(t.Context(), m.SQL); err != nil {
			t.Fatalf("apply %s: %v", m.Name, err)
		}
	}
	return db
}
