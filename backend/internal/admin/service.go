// Package admin answers the questions an operator asks: are we growing, who is here,
// is the process healthy, and which switch is on.
package admin

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics"
	anpg "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics/domain"
	anports "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	iddomain "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/cursor"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/health"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/settings"
)

type badges interface {
	BadgesFor(ctx context.Context, userIDs []string) (map[string]iddomain.Badge, error)
}

type Service struct {
	db        *postgres.DB
	analytics *analytics.Service
	settings  *settings.Store
	health    *health.Tracker
	badges    badges
	events    anports.Recorder
	cursor    cursor.Codec
	protected map[string]bool
	log       *slog.Logger
	now       func() time.Time
}

func NewService(db *postgres.DB, events *analytics.Service, store *settings.Store, tracker *health.Tracker, badges badges, secret []byte, emails []string, log *slog.Logger) *Service {
	protected := map[string]bool{}
	for _, email := range emails {
		protected[strings.ToLower(strings.TrimSpace(email))] = true
	}
	if log == nil {
		log = slog.Default()
	}
	return &Service{
		db: db, analytics: events, settings: store, health: tracker, badges: badges,
		events: events, cursor: cursor.New(secret), protected: protected, log: log, now: time.Now,
	}
}

type Point struct {
	Day   string `json:"day"`
	Value int    `json:"value"`
}

type KPI struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Value    int      `json:"value"`
	Previous int      `json:"previous"`
	Delta    *float64 `json:"delta"`
}

type Series struct {
	Visitors        []Point `json:"visitors"`
	Pageviews       []Point `json:"pageviews"`
	ActiveUsers     []Point `json:"activeUsers"`
	Signups         []Point `json:"signups"`
	Ideas           []Point `json:"ideas"`
	Votes           []Point `json:"votes"`
	Posts           []Point `json:"posts"`
	Participations  []Point `json:"participations"`
	CasesOpened     []Point `json:"casesOpened"`
	CasesDecided    []Point `json:"casesDecided"`
	DecisionSeconds []Point `json:"decisionSeconds"`
	HTTPRequests    []Point `json:"httpRequests"`
	HTTP5xx         []Point `json:"http5xx"`
}

type Dim struct {
	Key   string `json:"key"`
	Value int    `json:"value"`
}

type Breakdowns struct {
	Pages      []Dim `json:"pages"`
	Referrers  []Dim `json:"referrers"`
	Categories []Dim `json:"categories"`
}

type Funnel struct {
	Visitors int `json:"visitors"`
	SignedIn int `json:"signedIn"`
	Acted    int `json:"acted"`
	Authors  int `json:"authors"`
}

type Cohort struct {
	Week  string     `json:"week"`
	Size  int        `json:"size"`
	Rates []*float64 `json:"rates"`
}

type IdeaRow struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	Views int    `json:"views"`
	Votes int    `json:"votes"`
	Posts int    `json:"posts"`
	Joins int    `json:"joins"`
}

type Overview struct {
	Range      string     `json:"range"`
	From       string     `json:"from"`
	To         string     `json:"to"`
	Verdict    Verdict    `json:"verdict"`
	KPIs       []KPI      `json:"kpis"`
	Series     Series     `json:"series"`
	Funnel     Funnel     `json:"funnel"`
	Retention  []Cohort   `json:"retention"`
	Breakdowns Breakdowns `json:"breakdowns"`
	TopIdeas   []IdeaRow  `json:"topIdeas"`
	Insights   []Insight  `json:"insights"`
	Health     Status     `json:"health"`
}

func (s *Service) Overview(ctx context.Context, rawRange string) (Overview, error) {
	from, to, label, err := chartRange(s.now(), rawRange)
	if err != nil {
		return Overview{}, err
	}
	if err := s.analytics.Refresh(ctx); err != nil {
		s.log.ErrorContext(ctx, "analytics refresh failed", "error", err)
	}
	prevFrom := from.AddDate(0, 0, -daysOf(label))
	cur, err := s.sums(ctx, from, to)
	if err != nil {
		return Overview{}, err
	}
	prev, err := s.sums(ctx, prevFrom, from)
	if err != nil {
		return Overview{}, err
	}
	weekEnd := domain.DayStart(s.now())
	weekStart := weekEnd.AddDate(0, 0, -7)
	prevWeek := weekStart.AddDate(0, 0, -7)
	week, err := s.sums(ctx, weekStart, weekEnd)
	if err != nil {
		return Overview{}, err
	}
	before, err := s.sums(ctx, prevWeek, weekStart)
	if err != nil {
		return Overview{}, err
	}
	out := Overview{
		Range: label, From: from.Format("2006-01-02"), To: to.AddDate(0, 0, -1).Format("2006-01-02"),
		Verdict: Judge(totals(week), totals(before)),
		KPIs:    kpis(cur, prev),
	}
	if out.Series, err = s.series(ctx, from, to); err != nil {
		return Overview{}, err
	}
	funnel, err := s.analytics.Funnel(ctx, from, to)
	if err != nil {
		return Overview{}, err
	}
	out.Funnel = Funnel{Visitors: funnel.Visitors, SignedIn: funnel.SignedIn, Acted: funnel.Acted, Authors: funnel.Authors}
	if out.Retention, err = s.retention(ctx); err != nil {
		return Overview{}, err
	}
	if out.Breakdowns, err = s.breakdowns(ctx, from, to); err != nil {
		return Overview{}, err
	}
	ideas, err := s.analytics.TopIdeas(ctx, from, to, 8)
	if err != nil {
		return Overview{}, err
	}
	out.TopIdeas = make([]IdeaRow, len(ideas))
	for i, it := range ideas {
		out.TopIdeas[i] = IdeaRow{Slug: it.Slug, Title: it.Title, Views: it.Views, Votes: it.Votes, Posts: it.Posts, Joins: it.Joins}
	}
	if out.Insights, err = s.insights(ctx, from, to, week, before); err != nil {
		return Overview{}, err
	}
	if out.Health, err = s.Status(ctx); err != nil {
		return Overview{}, err
	}
	return out, nil
}

func (s *Service) sums(ctx context.Context, from, to time.Time) (map[string]int, error) {
	return s.analytics.Sums(ctx, from.Format("2006-01-02"), to.Format("2006-01-02"), []string{
		"visitors", "pageviews", "active_users", "signups", "ideas_published", "votes", "posts", "participations",
		"cases_opened", "cases_decided",
	})
}

func totals(m map[string]int) Totals {
	return Totals{
		Visitors: m["visitors"], Active: m["active_users"], Signups: m["signups"], Ideas: m["ideas_published"],
		Actions: m["votes"] + m["posts"] + m["participations"],
	}
}

func kpis(cur, prev map[string]int) []KPI {
	rows := []struct{ key, label string }{
		{"visitors", "Відвідувачі"}, {"pageviews", "Перегляди"}, {"active_users", "Активні"},
		{"signups", "Реєстрації"}, {"ideas_published", "Нові ідеї"}, {"votes", "Голоси"},
		{"posts", "Пости"}, {"participations", "Вступи"},
	}
	out := make([]KPI, len(rows))
	for i, row := range rows {
		out[i] = KPI{Key: row.key, Label: row.label, Value: cur[row.key], Previous: prev[row.key], Delta: ratio(cur[row.key], prev[row.key])}
	}
	return out
}

func ratio(cur, prev int) *float64 {
	if prev == 0 {
		return nil
	}
	d := float64(cur-prev) / float64(prev)
	return &d
}

func (s *Service) series(ctx context.Context, from, to time.Time) (Series, error) {
	a, b := from.Format("2006-01-02"), to.Format("2006-01-02")
	one := func(metric string) ([]Point, error) {
		points, err := s.analytics.Series(ctx, metric, "", a, b)
		if err != nil {
			return nil, err
		}
		out := make([]Point, len(points))
		for i, p := range points {
			out[i] = Point{Day: p.Day, Value: p.Value}
		}
		return out, nil
	}
	var err error
	var out Series
	if out.Visitors, err = one("visitors"); err != nil {
		return Series{}, err
	}
	if out.Pageviews, err = one("pageviews"); err != nil {
		return Series{}, err
	}
	if out.ActiveUsers, err = one("active_users"); err != nil {
		return Series{}, err
	}
	if out.Signups, err = one("signups"); err != nil {
		return Series{}, err
	}
	if out.Ideas, err = one("ideas_published"); err != nil {
		return Series{}, err
	}
	if out.Votes, err = one("votes"); err != nil {
		return Series{}, err
	}
	if out.Posts, err = one("posts"); err != nil {
		return Series{}, err
	}
	if out.Participations, err = one("participations"); err != nil {
		return Series{}, err
	}
	if out.CasesOpened, err = one("cases_opened"); err != nil {
		return Series{}, err
	}
	if out.CasesDecided, err = one("cases_decided"); err != nil {
		return Series{}, err
	}
	sum, err := s.analytics.Series(ctx, "decision_seconds_sum", "", a, b)
	if err != nil {
		return Series{}, err
	}
	count, err := s.analytics.Series(ctx, "decision_seconds_count", "", a, b)
	if err != nil {
		return Series{}, err
	}
	out.DecisionSeconds = make([]Point, len(sum))
	byDay := map[string]int{}
	for _, p := range count {
		byDay[p.Day] = p.Value
	}
	for i, p := range sum {
		value := 0
		if byDay[p.Day] > 0 {
			value = p.Value / byDay[p.Day]
		}
		out.DecisionSeconds[i] = Point{Day: p.Day, Value: value}
	}
	if out.HTTPRequests, err = one("http_requests"); err != nil {
		return Series{}, err
	}
	if out.HTTP5xx, err = one("http_5xx"); err != nil {
		return Series{}, err
	}
	day, req, srv := s.health.Pending()
	addPending(out.HTTPRequests, day, req)
	addPending(out.HTTP5xx, day, srv)
	return out, nil
}

func addPending(points []Point, day string, extra int) {
	if day == "" || extra == 0 {
		return
	}
	for i := range points {
		if points[i].Day == day {
			points[i].Value += extra
		}
	}
}

func (s *Service) retention(ctx context.Context) ([]Cohort, error) {
	rows, err := s.analytics.Retention(ctx)
	if err != nil {
		return nil, err
	}
	current := monday(s.now())
	out := make([]Cohort, 0, len(rows))
	for _, row := range rows {
		start, parseErr := time.ParseInLocation("2006-01-02", row.Week, domain.Kyiv)
		rates := make([]*float64, len(row.Weeks))
		for i, rate := range row.Weeks {
			if parseErr == nil && start.AddDate(0, 0, 7*i).After(current) {
				continue
			}
			value := rate
			rates[i] = &value
		}
		out = append(out, Cohort{Week: row.Week, Size: row.Size, Rates: rates})
	}
	return out, nil
}

func (s *Service) breakdowns(ctx context.Context, from, to time.Time) (Breakdowns, error) {
	a, b := from.Format("2006-01-02"), to.Format("2006-01-02")
	pages, err := s.analytics.Breakdown(ctx, "pageviews", "path:", a, b, 8)
	if err != nil {
		return Breakdowns{}, err
	}
	refs, err := s.analytics.Breakdown(ctx, "pageviews", "ref:", a, b, 8)
	if err != nil {
		return Breakdowns{}, err
	}
	cats, err := s.analytics.Breakdown(ctx, "ideas_published", "cat:", a, b, 8)
	if err != nil {
		return Breakdowns{}, err
	}
	return Breakdowns{Pages: stripDim(pages), Referrers: stripDim(refs), Categories: stripDim(cats)}, nil
}

func (s *Service) insights(ctx context.Context, from, to time.Time, week, before map[string]int) ([]Insight, error) {
	a, b := from.Format("2006-01-02"), to.Format("2006-01-02")
	refs, err := s.analytics.Breakdown(ctx, "pageviews", "ref:", a, b, 1)
	if err != nil {
		return nil, err
	}
	weekday, err := s.analytics.BestWeekday(ctx, a, b)
	if err != nil {
		return nil, err
	}
	weekEnd := domain.DayStart(s.now())
	median, err := s.analytics.MedianDecision(ctx, weekEnd.AddDate(0, 0, -7), weekEnd)
	if err != nil {
		return nil, err
	}
	decided := week["cases_decided"]
	share, published, err := s.analytics.CampusShare(ctx, weekEnd.AddDate(0, 0, -7), weekEnd)
	if err != nil {
		return nil, err
	}
	funnel, err := s.analytics.Funnel(ctx, weekEnd.AddDate(0, 0, -7), weekEnd)
	if err != nil {
		return nil, err
	}
	yesterday := s.now().In(domain.Kyiv).AddDate(0, 0, -1)
	value, avg, err := s.analytics.WeekdayBaseline(ctx, "visitors", yesterday)
	if err != nil {
		return nil, err
	}
	ref, hits := "", 0
	if len(refs) > 0 {
		ref, hits = refs[0].Key, refs[0].Value
	}
	return BuildInsights(InsightInput{
		Current: week, Previous: before, Referrer: ref, ReferrerHits: hits, BestWeekday: WeekdayName(weekday),
		Visitors: funnel.Visitors, Signups: funnel.SignedIn, Acted: funnel.Acted,
		MedianDecisionSeconds: median, Decisions: decided, CampusShare: share, Published: published,
		AnomalyMetric: "відвідування", AnomalyToday: value, AnomalyAvg: avg,
	}), nil
}

func chartRange(now time.Time, raw string) (from, to time.Time, label string, err error) {
	if raw == "" {
		raw = "30d"
	}
	days, ok := map[string]int{"7d": 7, "30d": 30, "90d": 90}[raw]
	if !ok {
		return time.Time{}, time.Time{}, "", apperr.Validation(map[string]string{"range": "must be 7d, 30d or 90d"})
	}
	to = domain.DayStart(now).AddDate(0, 0, 1)
	return to.AddDate(0, 0, -days), to, raw, nil
}

func daysOf(label string) int { return map[string]int{"7d": 7, "30d": 30, "90d": 90}[label] }

func monday(t time.Time) time.Time {
	day := domain.DayStart(t)
	wd := int(day.Weekday())
	if wd == 0 {
		wd = 7
	}
	return day.AddDate(0, 0, 1-wd)
}

func stripDim(rows []anpg.Dim) []Dim {
	out := make([]Dim, len(rows))
	for i, d := range rows {
		out[i] = Dim{Key: d.Key, Value: d.Value}
	}
	return out
}
