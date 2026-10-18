// Package settings stores the switches an admin can flip at runtime.
package settings

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

const (
	KeyPremoderation = "premoderation"
	// ExternalOnly is the historical rule: organization members publish at once,
	// everyone else waits until they have been approved enough times.
	ExternalOnly = "EXTERNAL_ONLY"
	// All sends every newly published idea through the moderation queue.
	All = "ALL"
)

// Store reads and writes platform_settings. Reads are cached briefly so publishing
// an idea does not pay a query on every request; Set invalidates the key.
type Store struct {
	db  *postgres.DB
	ttl time.Duration
	now func() time.Time

	mu    sync.Mutex
	cache map[string]entry
}

type entry struct {
	value string
	until time.Time
}

func New(db *postgres.DB) *Store {
	return &Store{db: db, ttl: 30 * time.Second, now: time.Now, cache: map[string]entry{}}
}

// RequireReview reports whether every new idea must wait for a moderator.
// A missing or corrupt value keeps the historical rule rather than queueing everyone.
func (s *Store) RequireReview(ctx context.Context) (bool, error) {
	mode, err := s.Premoderation(ctx)
	if err != nil {
		return false, err
	}
	return mode == All, nil
}

// Premoderation returns EXTERNAL_ONLY or ALL.
func (s *Store) Premoderation(ctx context.Context) (string, error) {
	value, err := s.Get(ctx, KeyPremoderation)
	if err != nil {
		return "", err
	}
	if value != ExternalOnly && value != All {
		return ExternalOnly, nil
	}
	return value, nil
}

// Get returns the JSON string stored under key.
func (s *Store) Get(ctx context.Context, key string) (string, error) {
	if value, ok := s.cached(key); ok {
		return value, nil
	}
	var value string
	err := s.db.Querier(ctx).QueryRow(ctx, `SELECT value #>> '{}' FROM platform_settings WHERE key = $1`, key).Scan(&value)
	if postgres.IsNoRows(err) {
		return "", apperr.NotFound("setting not found")
	}
	if err != nil {
		return "", fmt.Errorf("read setting: %w", err)
	}
	s.store(key, value)
	return value, nil
}

// Set writes a JSON string. The caller invalidates only after its transaction commits;
// Forget drops the cache so the next read sees the new value.
func (s *Store) Set(ctx context.Context, key, value, userID string) error {
	if key == KeyPremoderation && value != ExternalOnly && value != All {
		return apperr.Validation(map[string]string{"premoderation": "must be EXTERNAL_ONLY or ALL"})
	}
	var actor any
	if userID != "" {
		actor = userID
	}
	_, err := s.db.Querier(ctx).Exec(ctx, `
		INSERT INTO platform_settings (key, value, updated_at, updated_by)
		VALUES ($1, to_jsonb($2::text), now(), $3)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by`,
		key, value, actor)
	if err != nil {
		return fmt.Errorf("write setting: %w", err)
	}
	return nil
}

// Forget drops one cached key.
func (s *Store) Forget(key string) {
	s.mu.Lock()
	delete(s.cache, key)
	s.mu.Unlock()
}

func (s *Store) cached(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.cache[key]
	if !ok || !s.now().Before(e.until) {
		return "", false
	}
	return e.value, true
}

func (s *Store) store(key, value string) {
	s.mu.Lock()
	s.cache[key] = entry{value: value, until: s.now().Add(s.ttl)}
	s.mu.Unlock()
}
