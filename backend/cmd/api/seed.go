package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
	// The runtime image has no zoneinfo; event times are wall-clock Kyiv time.
	_ "time/tzdata"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas"
	ideaspostgres "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	identitypostgres "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

// seedFile is the format of backend/seed/*.json.
type seedFile struct {
	Author struct {
		Handle string `json:"handle"`
		Name   string `json:"name"`
		Email  string `json:"email"`
	} `json:"author"`
	Ideas []seedIdea `json:"ideas"`
}

type seedIdea struct {
	Slug         string   `json:"slug"`
	Title        string   `json:"title"`
	Summary      string   `json:"summary"`
	Body         string   `json:"body"`
	Category     string   `json:"category"`
	Status       string   `json:"status"`
	Organization string   `json:"organization"`
	Tags         []string `json:"tags"`
	NeedsRoles   []string `json:"needsRoles"`
	DaysAgo      int      `json:"daysAgo"`
	Event        *struct {
		// Weekday and Time ("friday", "19:00") give the next such evening in Kyiv,
		// at least two days ahead, so a seeded event is always upcoming.
		Weekday  string `json:"weekday"`
		Time     string `json:"time"`
		Place    string `json:"place"`
		Capacity *int   `json:"capacity"`
	} `json:"event"`
}

// runSeed publishes the ideas of a seed file as one system author that has no
// login. Ideas whose slug exists are skipped, so a rerun is safe:
//
//	docker exec api-<env> /app/api seed /app/seed/demo-ideas.json
func runSeed(ctx context.Context, cfg config.Config, logger *slog.Logger, path string) error {
	//nolint:gosec // G703: the operator names the file on the command line; there is no remote input here
	raw, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		return err
	}
	var file seedFile
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		return fmt.Errorf("parse %s: %w", path, err)
	}
	policy, err := organizations.Load(cfg.OrganizationRulesFile)
	if err != nil {
		return err
	}
	db, err := postgres.ConnectWith(ctx, cfg.DatabaseURL, postgres.Options{MaxConns: 2, StatementTimeout: cfg.DBStatementTimeout})
	if err != nil {
		return err
	}
	defer db.Close()
	created, err := seedIdeas(ctx, db, policy, []byte(cfg.AppSecret), file, time.Now(), logger)
	if err != nil {
		return err
	}
	logger.Info("seed done", "file", path, "created", created, "total", len(file.Ideas))
	return nil
}

func seedIdeas(ctx context.Context, db *postgres.DB, policy *organizations.Policy, secret []byte, file seedFile, now time.Time, logger *slog.Logger) (int, error) {
	kyiv, err := time.LoadLocation("Europe/Kyiv")
	if err != nil {
		return 0, err
	}
	var authorID string
	err = db.Querier(ctx).QueryRow(ctx, `
		INSERT INTO users (id, handle, name, email, onboarded_at) VALUES (gen_random_uuid(), $1, $2, $3, now())
		ON CONFLICT (handle) DO UPDATE SET handle = EXCLUDED.handle WHERE users.email = EXCLUDED.email
		RETURNING id`, file.Author.Handle, file.Author.Name, file.Author.Email).Scan(&authorID)
	if postgres.IsNoRows(err) {
		return 0, fmt.Errorf("handle %s belongs to someone else, not the seed author", file.Author.Handle)
	}
	if err != nil {
		return 0, fmt.Errorf("seed author: %w", err)
	}

	identities := identity.NewService(identitypostgres.NewRepository(db), db, nil, identity.WithMembershipPolicy(policy))
	service := ideas.NewService(ideaspostgres.NewRepository(db), db, identities, policy, secret)
	created := 0
	for _, s := range file.Ideas {
		content := domain.Content{
			Title: s.Title, Summary: s.Summary, Body: s.Body, Category: domain.Category(s.Category),
			Tags: s.Tags, NeedsRoles: s.NeedsRoles,
		}
		if s.Event != nil {
			at, err := nextEvening(now.In(kyiv), s.Event.Weekday, s.Event.Time)
			if err != nil {
				return 0, fmt.Errorf("seed %s: %w", s.Slug, err)
			}
			content.EventDate, content.EventPlace, content.EventCapacity = &at, s.Event.Place, s.Event.Capacity
		}
		ok, err := service.Seed(ctx, authorID, ideas.SeedInput{
			Slug: s.Slug, Content: content, Status: domain.Status(s.Status), BadgeOrganizationID: s.Organization,
			WrittenAt: now.AddDate(0, 0, -s.DaysAgo),
		})
		if err != nil {
			return 0, err
		}
		if ok {
			created++
		}
		logger.Info("seed idea", "slug", s.Slug, "created", ok)
	}

	// Seeded ideas read as written days ago, not as published at the moment of seeding.
	if _, err := db.Querier(ctx).Exec(ctx, `
		UPDATE ideas SET published_at = created_at WHERE author_id = $1 AND published_at > created_at`, authorID); err != nil {
		return 0, fmt.Errorf("backdate seeded ideas: %w", err)
	}
	if _, err := db.Querier(ctx).Exec(ctx, `
		UPDATE users SET approved_ideas = (
			SELECT count(*) FROM ideas WHERE author_id = $1 AND moderation_state = 'APPROVED' AND deleted_at IS NULL)
		WHERE id = $1`, authorID); err != nil {
		return 0, fmt.Errorf("count seeded ideas: %w", err)
	}
	if _, err := service.RecomputeHot(ctx); err != nil {
		return 0, err
	}
	return created, nil
}

func nextEvening(now time.Time, weekday, clock string) (time.Time, error) {
	var day time.Weekday = -1
	for d := time.Sunday; d <= time.Saturday; d++ {
		if strings.EqualFold(d.String(), weekday) {
			day = d
		}
	}
	if day < 0 {
		return time.Time{}, fmt.Errorf("unknown weekday %q", weekday)
	}
	hm, err := time.Parse("15:04", clock)
	if err != nil {
		return time.Time{}, fmt.Errorf("event time %q: %w", clock, err)
	}
	earliest := now.AddDate(0, 0, 2)
	at := time.Date(earliest.Year(), earliest.Month(), earliest.Day(), hm.Hour(), hm.Minute(), 0, 0, now.Location())
	for at.Weekday() != day || at.Before(earliest) {
		at = at.AddDate(0, 0, 1)
	}
	return at.UTC(), nil
}
