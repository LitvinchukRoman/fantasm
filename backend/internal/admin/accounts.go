package admin

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	anports "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	iddomain "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/health"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/settings"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type UserRow struct {
	Handle        string     `json:"handle"`
	Name          string     `json:"name"`
	Email         string     `json:"email"`
	Role          string     `json:"role"`
	Badge         *string    `json:"badge"`
	Karma         int        `json:"karma"`
	ApprovedIdeas int        `json:"approvedIdeas"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastSeenAt    *time.Time `json:"lastSeenAt"`
	Protected     bool       `json:"protected"`
}

type UserPage struct {
	Users      []UserRow `json:"users"`
	NextCursor *string   `json:"nextCursor"`
}

func (s *Service) Users(ctx context.Context, q, role, rawCursor string) (UserPage, error) {
	q = strings.TrimSpace(q)
	if !utf8.ValidString(q) || utf8.RuneCountInString(q) > 80 {
		return UserPage{}, apperr.Validation(map[string]string{"q": "must be at most 80 characters"})
	}
	if role != "" && !iddomain.Role(role).Valid() {
		return UserPage{}, apperr.Validation(map[string]string{"role": "must be USER, MODERATOR or ADMIN"})
	}
	after, err := s.cursor.Decode(rawCursor, "admin-users")
	if err != nil {
		return UserPage{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
	}
	const limit = 30
	args := []any{limit + 1, q, like(q), role}
	where := `($2 = '' OR u.handle ILIKE $3 ESCAPE '\' OR u.name ILIKE $3 ESCAPE '\' OR u.email ILIKE $3 ESCAPE '\') AND ($4 = '' OR u.role = $4)`
	if after != nil {
		at, err := cursor.Time(after.Key)
		if err != nil {
			return UserPage{}, apperr.Validation(map[string]string{"cursor": "invalid cursor"})
		}
		args = append(args, at, after.ID)
		where += ` AND (u.created_at, u.id) < ($5, $6::uuid)`
	}
	rows, err := s.db.Querier(ctx).Query(ctx, `
		SELECT u.id, u.handle, u.name, u.email, u.role, u.karma, u.approved_ideas, u.created_at,
			(SELECT max(last_seen_at) FROM sessions s WHERE s.user_id = u.id)
		FROM users u WHERE `+where+` ORDER BY u.created_at DESC, u.id DESC LIMIT $1`, args...)
	if err != nil {
		return UserPage{}, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	type row struct {
		UserRow
		id string
	}
	var list []row
	for rows.Next() {
		var it row
		if err := rows.Scan(&it.id, &it.Handle, &it.Name, &it.Email, &it.Role, &it.Karma, &it.ApprovedIdeas, &it.CreatedAt, &it.LastSeenAt); err != nil {
			return UserPage{}, err
		}
		it.Protected = s.protected[strings.ToLower(it.Email)]
		list = append(list, it)
	}
	if err := rows.Err(); err != nil {
		return UserPage{}, err
	}
	page := UserPage{Users: []UserRow{}}
	if len(list) > limit {
		list = list[:limit]
		token := s.cursor.Encode("admin-users", cursor.Position{Key: cursor.FormatTime(list[len(list)-1].CreatedAt), ID: list[len(list)-1].id})
		page.NextCursor = &token
	}
	ids := make([]string, len(list))
	for i := range list {
		ids[i] = list[i].id
	}
	marks, err := s.badges.BadgesFor(ctx, ids)
	if err != nil {
		return UserPage{}, err
	}
	for _, it := range list {
		if b, ok := marks[it.id]; ok && b.Label != "" {
			label := b.Label
			it.Badge = &label
		}
		page.Users = append(page.Users, it.UserRow)
	}
	return page, nil
}

func like(q string) string {
	if q == "" {
		return ""
	}
	q = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q)
	return "%" + q + "%"
}

type Setting struct {
	Premoderation string `json:"premoderation"`
}

func (s *Service) Settings(ctx context.Context) (Setting, error) {
	mode, err := s.settings.Premoderation(ctx)
	if err != nil {
		return Setting{}, err
	}
	return Setting{Premoderation: mode}, nil
}

func (s *Service) UpdateSettings(ctx context.Context, v viewer.Viewer, mode string) (Setting, error) {
	if mode != settings.ExternalOnly && mode != settings.All {
		return Setting{}, apperr.Validation(map[string]string{"premoderation": "must be EXTERNAL_ONLY or ALL"})
	}
	err := s.db.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.settings.Set(ctx, settings.KeyPremoderation, mode, v.ID()); err != nil {
			return err
		}
		return anports.Record(ctx, s.events, anports.Event{
			Name: "admin.setting_changed", ActorID: v.ID(), SubjectType: "setting", SubjectID: settings.KeyPremoderation,
			Props: map[string]any{"premoderation": mode},
		})
	})
	if err != nil {
		return Setting{}, err
	}
	s.settings.Forget(settings.KeyPremoderation)
	return Setting{Premoderation: mode}, nil
}

type Pool struct {
	Acquired int `json:"acquired"`
	Idle     int `json:"idle"`
	Max      int `json:"max"`
}

type Window struct {
	Requests     int     `json:"requests"`
	ServerErrors int     `json:"serverErrors"`
	P95Ms        float64 `json:"p95Ms"`
}

type JobRow struct {
	Name       string    `json:"name"`
	At         time.Time `json:"at"`
	DurationMs int       `json:"durationMs"`
	Failed     bool      `json:"failed"`
	Error      string    `json:"error"`
}

type Status struct {
	Status           string   `json:"status"`
	Reasons          []string `json:"reasons"`
	UptimeSeconds    int      `json:"uptimeSeconds"`
	Ready            bool     `json:"ready"`
	DBPingMs         int      `json:"dbPingMs"`
	DBPool           Pool     `json:"dbPool"`
	Jobs             []JobRow `json:"jobs"`
	Hour             Window   `json:"hour"`
	Day              Window   `json:"day"`
	OldestQueueHours int      `json:"oldestQueueHours"`
}

func (s *Service) Status(ctx context.Context) (Status, error) {
	pingCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	start := time.Now()
	pingErr := s.db.Ping(pingCtx)
	ping := time.Since(start)
	stat := s.db.Stat()
	var oldest int
	if err := s.db.Querier(ctx).QueryRow(ctx, `
		SELECT COALESCE(floor(extract(epoch FROM (now() - min(created_at))) / 3600), 0)::int
		FROM moderation_cases WHERE state = 'OPEN'`).Scan(&oldest); err != nil {
		return Status{}, fmt.Errorf("queue age: %w", err)
	}
	hour, day := s.health.Window(time.Hour), s.health.Window(24*time.Hour)
	failed := false
	jobs := []JobRow{}
	for _, job := range s.health.Jobs() {
		if job.Failed {
			failed = true
		}
		jobs = append(jobs, JobRow{Name: job.Name, At: job.At, DurationMs: int(job.Duration / time.Millisecond), Failed: job.Failed, Error: job.Error})
	}
	status, reasons := health.Judge(health.Input{
		Ready: pingErr == nil, DBError: pingErr != nil, DBPing: ping,
		Hour: hour, OldestQueue: time.Duration(oldest) * time.Hour, JobFailed: failed,
	})
	pingMs := 0
	if pingErr == nil {
		pingMs = int(ping / time.Millisecond)
	}
	return Status{
		Status: status, Reasons: reasons, UptimeSeconds: int(s.health.Uptime().Seconds()), Ready: pingErr == nil,
		DBPingMs: pingMs, DBPool: Pool{Acquired: int(stat.AcquiredConns()), Idle: int(stat.IdleConns()), Max: int(stat.MaxConns())},
		Jobs: jobs, Hour: windowOf(hour), Day: windowOf(day), OldestQueueHours: oldest,
	}, nil
}

func windowOf(w health.Window) Window {
	return Window{Requests: w.Requests, ServerErrors: w.ServerErrors, P95Ms: float64(w.P95) / float64(time.Millisecond)}
}
