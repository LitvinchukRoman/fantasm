// Package analytics records what people do on Fantasm and rolls it up by day.
package analytics

import (
	"context"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Service struct {
	repo      *postgres.Repository
	secret    string
	domains   []string
	retention time.Duration
	now       func() time.Time
}

func NewService(repo *postgres.Repository, secret string, domains []string, retention time.Duration) *Service {
	if retention <= 0 {
		retention = 180 * 24 * time.Hour
	}
	return &Service{repo: repo, secret: secret, domains: domains, retention: retention, now: time.Now}
}

// Record implements ports.Recorder.
func (s *Service) Record(ctx context.Context, e ports.Event) error { return s.repo.Record(ctx, e) }

// Incoming is one event a browser is allowed to submit.
type Incoming struct {
	Name  string
	Path  string
	Props map[string]string
}

// Ingest stores a small batch of client events. Bots are acknowledged and dropped.
func (s *Service) Ingest(ctx context.Context, v viewer.Viewer, ip, ua string, batch []Incoming) error {
	if domain.Bot(ua) {
		return nil
	}
	if len(batch) == 0 {
		return apperr.Validation(map[string]string{"events": "at least one event is required"})
	}
	if len(batch) > domain.MaxBatch {
		return apperr.Validation(map[string]string{"events": fmt.Sprintf("at most %d events", domain.MaxBatch)})
	}
	now := s.now().UTC()
	visitor := domain.Visitor(s.secret, now, ip, ua)
	actor := v.ID()
	return s.repo.Within(ctx, func(ctx context.Context) error {
		for i, in := range batch {
			if !domain.ClientEvents[in.Name] {
				return apperr.Validation(map[string]string{"events": "unknown event"})
			}
			props, ok := domain.CleanProps(in.Name, in.Props)
			if !ok {
				return apperr.Validation(map[string]string{"events": "invalid event properties"})
			}
			pattern, slug := domain.Pattern(in.Path)
			if in.Name == domain.PageView && pattern == "" {
				return apperr.Validation(map[string]string{"path": "must be a site path"})
			}
			ev := ports.Event{
				Name: in.Name, ActorID: actor, Visitor: visitor, Path: pattern, Props: props, OccurredAt: now,
			}
			if slug != "" {
				ev.SubjectType, ev.SubjectID = "idea", slug
			}
			if err := s.repo.Record(ctx, ev); err != nil {
				return fmt.Errorf("record event %d: %w", i, err)
			}
		}
		return nil
	})
}

// Within is exposed so ingest can be one transaction. The repository method is added below.
func (s *Service) Rollup(ctx context.Context) error {
	start, end := rollupBounds(s.now())
	if err := s.repo.Rollup(ctx, start, end); err != nil {
		return fmt.Errorf("rollup analytics: %w", err)
	}
	if err := s.repo.Snapshot(ctx, s.now(), s.domains, s.now()); err != nil {
		return fmt.Errorf("snapshot analytics: %w", err)
	}
	return nil
}

// Refresh rebuilds yesterday and today so an admin looking at the dashboard
// sees events that arrived since the last scheduled rollup.
func (s *Service) Refresh(ctx context.Context) error {
	end := domain.DayStart(s.now()).AddDate(0, 0, 1)
	start := end.AddDate(0, 0, -2)
	if err := s.repo.Rollup(ctx, start, end); err != nil {
		return err
	}
	return s.repo.Snapshot(ctx, s.now(), s.domains, s.now())
}

func (s *Service) Purge(ctx context.Context) error {
	_, err := s.repo.Purge(ctx, s.now().Add(-s.retention))
	if err != nil {
		return fmt.Errorf("purge analytics: %w", err)
	}
	return nil
}

func (s *Service) Sums(ctx context.Context, from, to string, metrics []string) (map[string]int, error) {
	return s.repo.Sums(ctx, from, to, metrics)
}

func (s *Service) Series(ctx context.Context, metric, dim, from, to string) ([]postgres.Point, error) {
	points, err := s.repo.Series(ctx, metric, dim, from, to)
	if err != nil {
		return nil, err
	}
	return fillDays(from, to, points), nil
}

func (s *Service) Breakdown(ctx context.Context, metric, prefix, from, to string, limit int) ([]postgres.Dim, error) {
	return s.repo.Breakdown(ctx, metric, prefix, from, to, limit)
}

func (s *Service) Funnel(ctx context.Context, start, end time.Time) (postgres.Funnel, error) {
	return s.repo.Funnel(ctx, start, end)
}

func (s *Service) Retention(ctx context.Context) ([]postgres.Cohort, error) {
	return s.repo.Retention(ctx, s.now())
}

func (s *Service) TopIdeas(ctx context.Context, start, end time.Time, limit int) ([]postgres.IdeaStat, error) {
	return s.repo.TopIdeas(ctx, start, end, limit)
}

func (s *Service) MedianDecision(ctx context.Context, start, end time.Time) (float64, error) {
	return s.repo.MedianDecisionSeconds(ctx, start, end)
}

func (s *Service) CampusShare(ctx context.Context, start, end time.Time) (float64, int, error) {
	return s.repo.CampusShare(ctx, start, end)
}

func (s *Service) AddHTTP(ctx context.Context, day string, requests, clientErrors, serverErrors int) error {
	return s.repo.AddHTTP(ctx, day, requests, clientErrors, serverErrors)
}

func (s *Service) BestWeekday(ctx context.Context, from, to string) (int, error) {
	return s.repo.BestWeekday(ctx, from, to)
}

func (s *Service) WeekdayBaseline(ctx context.Context, metric string, yesterday time.Time) (int, float64, error) {
	return s.repo.WeekdayBaseline(ctx, metric, yesterday)
}

// rollupBounds is today and yesterday, or the last eight days during the midnight hour
// so a day that closed a few minutes ago is not left half-counted.
func rollupBounds(now time.Time) (start, end time.Time) {
	end = domain.DayStart(now).AddDate(0, 0, 1)
	days := 2
	if now.In(domain.Kyiv).Hour() == 0 {
		days = 8
	}
	return end.AddDate(0, 0, -days), end
}

func fillDays(from, to string, points []postgres.Point) []postgres.Point {
	start, err1 := time.ParseInLocation("2006-01-02", from, domain.Kyiv)
	end, err2 := time.ParseInLocation("2006-01-02", to, domain.Kyiv)
	if err1 != nil || err2 != nil || !start.Before(end) {
		if points == nil {
			return []postgres.Point{}
		}
		return points
	}
	byDay := map[string]int{}
	for _, p := range points {
		byDay[p.Day] = p.Value
	}
	out := make([]postgres.Point, 0, int(end.Sub(start).Hours()/24))
	for day := start; day.Before(end); day = day.AddDate(0, 0, 1) {
		key := day.Format("2006-01-02")
		out = append(out, postgres.Point{Day: key, Value: byDay[key]})
	}
	return out
}
