// Package postgres stores product events and the daily rollup the dashboard reads.
package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

// RolledMetrics are rebuilt from raw events. Snapshots and HTTP counters are not.
var RolledMetrics = []string{
	"visitors", "pageviews", "active_users", "signups", "logins",
	"ideas_created", "ideas_published", "votes", "participations", "posts",
	"reports", "cases_opened", "cases_decided",
	"decision_seconds_sum", "decision_seconds_count", "idea_views",
}

type Repository struct{ db *postgres.DB }

func NewRepository(db *postgres.DB) *Repository { return &Repository{db: db} }

// Within runs fn in a transaction so a batch of events is stored together.
func (r *Repository) Within(ctx context.Context, fn func(context.Context) error) error {
	return r.db.WithinTx(ctx, fn)
}

// Record implements ports.Recorder on the transaction carried by ctx.
func (r *Repository) Record(ctx context.Context, e ports.Event) error {
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now().UTC()
	}
	if e.Props == nil {
		e.Props = map[string]any{}
	}
	props, err := json.Marshal(e.Props)
	if err != nil {
		return fmt.Errorf("marshal analytics props: %w", err)
	}
	var actor, visitor any
	if e.ActorID != "" {
		actor = e.ActorID
	}
	if e.Visitor != "" {
		visitor = e.Visitor
	}
	_, err = r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO analytics_events (occurred_at, name, actor_id, visitor, subject_type, subject_id, path, props)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		e.OccurredAt.UTC(), e.Name, actor, visitor, e.SubjectType, e.SubjectID, e.Path, props)
	return err
}

// Rollup rebuilds daily counters for events in [start, end).
func (r *Repository) Rollup(ctx context.Context, start, end time.Time) error {
	return r.db.WithinTx(ctx, func(ctx context.Context) error {
		q := r.db.Querier(ctx)
		if _, err := q.Exec(ctx, `
			DELETE FROM analytics_daily
			WHERE day >= ($1 AT TIME ZONE 'Europe/Kyiv')::date
			  AND day < ($2 AT TIME ZONE 'Europe/Kyiv')::date
			  AND metric = ANY($3)`, start, end, RolledMetrics); err != nil {
			return err
		}
		_, err := q.Exec(ctx, rollupSQL, start, end)
		return err
	})
}

// Snapshot writes point-in-time totals for one calendar day. verifiedDomains
// counts members whose verified email is on one of those domains.
func (r *Repository) Snapshot(ctx context.Context, day time.Time, verifiedDomains []string, now time.Time) error {
	if verifiedDomains == nil {
		verifiedDomains = []string{}
	}
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO analytics_daily (day, metric, dim, value) VALUES
			($1::date, 'users_total', '', (SELECT count(*) FROM users)),
			($1::date, 'users_verified', '', (
				SELECT count(DISTINCT user_id) FROM external_identities
				WHERE email_verified AND lower(split_part(email, '@', 2)) = ANY($2::text[]))),
			($1::date, 'ideas_live_total', '', (
				SELECT count(*) FROM ideas WHERE moderation_state = 'APPROVED' AND deleted_at IS NULL AND status <> 'DRAFT')),
			($1::date, 'queue_open', '', (SELECT count(*) FROM moderation_cases WHERE state = 'OPEN')),
			($1::date, 'queue_oldest_hours', '', (
				SELECT COALESCE(floor(extract(epoch FROM ($3::timestamptz - min(created_at))) / 3600), 0)::bigint
				FROM moderation_cases WHERE state = 'OPEN'))
		ON CONFLICT (day, metric, dim) DO UPDATE SET value = EXCLUDED.value`,
		domain.DayString(day), verifiedDomains, now.UTC())
	return err
}

// AddHTTP adds request counters flushed from the in-memory health tracker.
func (r *Repository) AddHTTP(ctx context.Context, day string, requests, clientErrors, serverErrors int) error {
	_, err := r.db.Querier(ctx).Exec(ctx, `
		INSERT INTO analytics_daily (day, metric, dim, value)
		SELECT $1::date, metric, '', value FROM (VALUES
			('http_requests'::text, $2::bigint),
			('http_4xx', $3::bigint),
			('http_5xx', $4::bigint)
		) AS v(metric, value)
		WHERE value > 0
		ON CONFLICT (day, metric, dim) DO UPDATE SET value = analytics_daily.value + EXCLUDED.value`,
		day, requests, clientErrors, serverErrors)
	return err
}

// Purge deletes raw events older than before and reports how many went.
func (r *Repository) Purge(ctx context.Context, before time.Time) (int64, error) {
	tag, err := r.db.Querier(ctx).Exec(ctx, `DELETE FROM analytics_events WHERE occurred_at < $1`, before)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// Sums returns dim="" totals for the metrics over [from, to).
func (r *Repository) Sums(ctx context.Context, from, to string, metrics []string) (map[string]int, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT metric, COALESCE(sum(value), 0)
		FROM analytics_daily
		WHERE dim = '' AND day >= $1::date AND day < $2::date AND metric = ANY($3)
		GROUP BY metric`, from, to, metrics)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var metric string
		var value int
		if err := rows.Scan(&metric, &value); err != nil {
			return nil, err
		}
		out[metric] = value
	}
	return out, rows.Err()
}

type Point struct {
	Day   string
	Value int
}

// Series is one metric (dim exactly) per day, without gap filling.
func (r *Repository) Series(ctx context.Context, metric, dim, from, to string) ([]Point, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT to_char(day, 'YYYY-MM-DD'), value FROM analytics_daily
		WHERE metric = $1 AND dim = $2 AND day >= $3::date AND day < $4::date
		ORDER BY day`, metric, dim, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Point
	for rows.Next() {
		var p Point
		if err := rows.Scan(&p.Day, &p.Value); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type Dim struct {
	Key   string
	Value int
}

// Breakdown sums a metric whose dim starts with prefix (the prefix is stripped).
func (r *Repository) Breakdown(ctx context.Context, metric, prefix, from, to string, limit int) ([]Dim, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT substring(dim FROM char_length($2) + 1), sum(value)::bigint
		FROM analytics_daily
		WHERE metric = $1 AND dim LIKE $2 || '%' AND day >= $3::date AND day < $4::date
		GROUP BY dim ORDER BY sum(value) DESC, dim LIMIT $5`, metric, prefix, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Dim{}
	for rows.Next() {
		var d Dim
		if err := rows.Scan(&d.Key, &d.Value); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type Funnel struct{ Visitors, SignedIn, Acted, Authors int }

func (r *Repository) Funnel(ctx context.Context, start, end time.Time) (Funnel, error) {
	var f Funnel
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT
			(SELECT count(DISTINCT visitor) FROM analytics_events
			 WHERE name = 'page_view' AND visitor IS NOT NULL AND occurred_at >= $1 AND occurred_at < $2),
			(SELECT count(DISTINCT actor_id) FROM analytics_events
			 WHERE name IN ('user.signed_in', 'user.signed_up') AND actor_id IS NOT NULL AND occurred_at >= $1 AND occurred_at < $2),
			(SELECT count(DISTINCT actor_id) FROM analytics_events
			 WHERE name IN ('vote.cast', 'post.created', 'participation.set', 'idea.created') AND actor_id IS NOT NULL AND occurred_at >= $1 AND occurred_at < $2),
			(SELECT count(DISTINCT actor_id) FROM analytics_events
			 WHERE name = 'idea.published' AND actor_id IS NOT NULL AND occurred_at >= $1 AND occurred_at < $2)`,
		start, end).Scan(&f.Visitors, &f.SignedIn, &f.Acted, &f.Authors)
	return f, err
}

type Cohort struct {
	Week  string
	Size  int
	Weeks []float64
}

func (r *Repository) Retention(ctx context.Context, now time.Time) ([]Cohort, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		WITH signups AS (
			SELECT actor_id, date_trunc('week', occurred_at AT TIME ZONE 'Europe/Kyiv')::date AS cohort
			FROM analytics_events
			WHERE name = 'user.signed_up' AND actor_id IS NOT NULL
			  AND occurred_at >= (date_trunc('week', $1::timestamptz AT TIME ZONE 'Europe/Kyiv') - interval '8 weeks')
		),
		acts AS (
			SELECT DISTINCT actor_id, date_trunc('week', occurred_at AT TIME ZONE 'Europe/Kyiv')::date AS week
			FROM analytics_events
			WHERE actor_id IS NOT NULL AND name IN (
				'page_view', 'vote.cast', 'post.created', 'participation.set', 'idea.created', 'idea.published', 'user.signed_in')
		)
		SELECT to_char(s.cohort, 'YYYY-MM-DD'), count(DISTINCT s.actor_id),
			count(DISTINCT s.actor_id) FILTER (WHERE a.week = s.cohort),
			count(DISTINCT s.actor_id) FILTER (WHERE a.week = s.cohort + 7),
			count(DISTINCT s.actor_id) FILTER (WHERE a.week = s.cohort + 14),
			count(DISTINCT s.actor_id) FILTER (WHERE a.week = s.cohort + 21),
			count(DISTINCT s.actor_id) FILTER (WHERE a.week = s.cohort + 28)
		FROM signups s
		LEFT JOIN acts a ON a.actor_id = s.actor_id
		GROUP BY s.cohort ORDER BY s.cohort`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Cohort{}
	for rows.Next() {
		var c Cohort
		var w [5]int
		if err := rows.Scan(&c.Week, &c.Size, &w[0], &w[1], &w[2], &w[3], &w[4]); err != nil {
			return nil, err
		}
		c.Weeks = make([]float64, 5)
		if c.Size > 0 {
			for i, n := range w {
				c.Weeks[i] = float64(n) / float64(c.Size)
			}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type IdeaStat struct {
	Slug, Title                string
	Views, Votes, Posts, Joins int
}

func (r *Repository) TopIdeas(ctx context.Context, start, end time.Time, limit int) ([]IdeaStat, error) {
	rows, err := r.db.Querier(ctx).Query(ctx, `
		SELECT e.subject_id, COALESCE(i.title, ''),
			count(*) FILTER (WHERE e.name = 'page_view'),
			count(*) FILTER (WHERE e.name = 'vote.cast'),
			count(*) FILTER (WHERE e.name = 'post.created'),
			count(*) FILTER (WHERE e.name = 'participation.set')
		FROM analytics_events e
		LEFT JOIN ideas i ON i.slug = e.subject_id
		WHERE e.subject_type = 'idea' AND e.occurred_at >= $1 AND e.occurred_at < $2
		GROUP BY e.subject_id, i.title
		ORDER BY count(*) FILTER (WHERE e.name = 'page_view') DESC, count(*) FILTER (WHERE e.name = 'vote.cast') DESC, e.subject_id
		LIMIT $3`, start, end, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []IdeaStat{}
	for rows.Next() {
		var it IdeaStat
		if err := rows.Scan(&it.Slug, &it.Title, &it.Views, &it.Votes, &it.Posts, &it.Joins); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// MedianDecisionSeconds is the median open-to-decision time in the window, or 0 when none.
func (r *Repository) MedianDecisionSeconds(ctx context.Context, start, end time.Time) (float64, error) {
	var seconds float64
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'seconds')::double precision), 0)
		FROM analytics_events
		WHERE name = 'case.decided' AND occurred_at >= $1 AND occurred_at < $2 AND props ? 'seconds'`,
		start, end).Scan(&seconds)
	return seconds, err
}

// CampusShare is the fraction of idea.published events marked campus, and how many were published.
func (r *Repository) CampusShare(ctx context.Context, start, end time.Time) (share float64, published int, err error) {
	var campus int
	err = r.db.Querier(ctx).QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE props->>'campus' = 'true'), count(*)
		FROM analytics_events
		WHERE name = 'idea.published' AND occurred_at >= $1 AND occurred_at < $2`, start, end).Scan(&campus, &published)
	if err != nil || published == 0 {
		return 0, published, err
	}
	return float64(campus) / float64(published), published, nil
}

// BestWeekday is the ISO day (1 = Monday) with the most visitors in [from, to), or 0 when there are none.
func (r *Repository) BestWeekday(ctx context.Context, from, to string) (int, error) {
	var day int
	err := r.db.Querier(ctx).QueryRow(ctx, `
		SELECT COALESCE((
			SELECT EXTRACT(ISODOW FROM day)::int FROM analytics_daily
			WHERE metric = 'visitors' AND dim = '' AND day >= $1::date AND day < $2::date
			GROUP BY 1 ORDER BY sum(value) DESC, 1 LIMIT 1
		), 0)`, from, to).Scan(&day)
	return day, err
}

// WeekdayBaseline is yesterday's value of metric and the average of the same weekday over the previous four weeks.
func (r *Repository) WeekdayBaseline(ctx context.Context, metric string, yesterday time.Time) (value int, average float64, err error) {
	day := domain.DayString(yesterday)
	err = r.db.Querier(ctx).QueryRow(ctx, `
		SELECT
			COALESCE((SELECT value FROM analytics_daily WHERE metric = $1 AND dim = '' AND day = $2::date), 0),
			COALESCE((SELECT avg(value) FROM analytics_daily
				WHERE metric = $1 AND dim = '' AND day >= ($2::date - 28) AND day < $2::date
				  AND EXTRACT(ISODOW FROM day) = EXTRACT(ISODOW FROM $2::date)), 0)`,
		metric, day).Scan(&value, &average)
	return value, average, err
}

const rollupSQL = `
WITH ev AS (
	SELECT (occurred_at AT TIME ZONE 'Europe/Kyiv')::date AS day,
		name, actor_id, visitor, path, subject_type, subject_id, props
	FROM analytics_events
	WHERE occurred_at >= $1 AND occurred_at < $2
)
INSERT INTO analytics_daily (day, metric, dim, value)
SELECT day, metric, left(dim, 160), value::bigint FROM (
	SELECT day, 'visitors' AS metric, '' AS dim, count(DISTINCT visitor) AS value
	FROM ev WHERE name = 'page_view' AND visitor IS NOT NULL GROUP BY day
	UNION ALL
	SELECT day, 'pageviews', '', count(*) FROM ev WHERE name = 'page_view' GROUP BY day
	UNION ALL
	SELECT day, 'pageviews', 'path:' || left(path, 120), count(*)
	FROM ev WHERE name = 'page_view' AND path <> '' GROUP BY day, left(path, 120)
	UNION ALL
	SELECT day, 'pageviews', dim, value FROM (
		SELECT day, 'ref:' || ref AS dim, count(*) AS value,
			row_number() OVER (PARTITION BY day ORDER BY count(*) DESC, ref) AS n
		FROM (
			SELECT day, left(props->>'referrer', 80) AS ref FROM ev
			WHERE name = 'page_view' AND coalesce(props->>'referrer', '') <> ''
		) refs GROUP BY day, ref
	) capped WHERE n <= 20
	UNION ALL
	SELECT day, 'pageviews', dim, value FROM (
		SELECT day, 'utm:' || src AS dim, count(*) AS value,
			row_number() OVER (PARTITION BY day ORDER BY count(*) DESC, src) AS n
		FROM (
			SELECT day, left(props->>'utm_source', 80) AS src FROM ev
			WHERE name = 'page_view' AND coalesce(props->>'utm_source', '') <> ''
		) srcs GROUP BY day, src
	) capped WHERE n <= 20
	UNION ALL
	SELECT day, 'active_users', '', count(DISTINCT actor_id)
	FROM ev WHERE actor_id IS NOT NULL AND name NOT LIKE 'admin.%' GROUP BY day
	UNION ALL
	SELECT day, 'signups', '', count(*) FROM ev WHERE name = 'user.signed_up' GROUP BY day
	UNION ALL
	SELECT day, 'logins', '', count(*) FROM ev WHERE name = 'user.signed_in' GROUP BY day
	UNION ALL
	SELECT day, 'ideas_created', '', count(*) FROM ev WHERE name = 'idea.created' GROUP BY day
	UNION ALL
	SELECT day, 'ideas_published', '', count(*) FROM ev WHERE name = 'idea.published' GROUP BY day
	UNION ALL
	SELECT day, 'ideas_published', 'cat:' || left(coalesce(props->>'category', 'OTHER'), 32), count(*)
	FROM ev WHERE name = 'idea.published' GROUP BY day, 3
	UNION ALL
	SELECT day, 'votes', '', count(*) FROM ev WHERE name = 'vote.cast' GROUP BY day
	UNION ALL
	SELECT day, 'participations', '', count(*) FROM ev WHERE name = 'participation.set' GROUP BY day
	UNION ALL
	SELECT day, 'posts', '', count(*) FROM ev WHERE name = 'post.created' GROUP BY day
	UNION ALL
	SELECT day, 'reports', '', count(*) FROM ev WHERE name = 'report.created' GROUP BY day
	UNION ALL
	SELECT day, 'cases_opened', '', count(*) FROM ev WHERE name = 'case.opened' GROUP BY day
	UNION ALL
	SELECT day, 'cases_decided', '', count(*) FROM ev WHERE name = 'case.decided' GROUP BY day
	UNION ALL
	SELECT day, 'cases_decided', 'dec:' || left(coalesce(props->>'decision', 'UNKNOWN'), 16), count(*)
	FROM ev WHERE name = 'case.decided' GROUP BY day, 3
	UNION ALL
	SELECT day, 'decision_seconds_sum', '', COALESCE(sum((props->>'seconds')::bigint), 0)::bigint
	FROM ev WHERE name = 'case.decided' AND props ? 'seconds' GROUP BY day
	UNION ALL
	SELECT day, 'decision_seconds_count', '', count(*)
	FROM ev WHERE name = 'case.decided' AND props ? 'seconds' GROUP BY day
	UNION ALL
	SELECT day, 'idea_views', slug, value FROM (
		SELECT day, left(subject_id, 80) AS slug, count(*) AS value,
			row_number() OVER (PARTITION BY day ORDER BY count(*) DESC, left(subject_id, 80)) AS n
		FROM ev WHERE name = 'page_view' AND subject_type = 'idea' AND subject_id <> ''
		GROUP BY day, left(subject_id, 80)
	) ideas WHERE n <= 100
) rolled
WHERE value > 0
`
