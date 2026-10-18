package regression_test

import (
	"net/http"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
)

func TestAnalyticsBeaconAndRollup(t *testing.T) {
	env := apptest.New(t)
	anon := env.Anon()
	bad := anon.Do(http.MethodPost, "/api/analytics/events", map[string]any{"events": []any{map[string]any{"name": "vote.cast"}}})
	if bad.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown event: %d %s", bad.Code, bad.Body)
	}
	bot := anon.Clone().DoWith(http.MethodPost, "/api/analytics/events", map[string]any{"events": []any{map[string]any{"name": "page_view", "path": "/"}}}, map[string]string{"Origin": apptest.Origin, "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"})
	if bot.Code != http.StatusNoContent {
		t.Fatalf("bot: %d %s", bot.Code, bot.Body)
	}
	browser := map[string]string{"Origin": apptest.Origin, "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"}
	ok := anon.DoWith(http.MethodPost, "/api/analytics/events", map[string]any{"events": []any{
		map[string]any{"name": "page_view", "path": "/", "props": map[string]string{"referrer": "t.me"}},
		map[string]any{"name": "page_view", "path": "/ideas/a-good-idea"},
		map[string]any{"name": "ui.click", "props": map[string]string{"target": "publish"}},
	}}, browser)
	if ok.Code != http.StatusNoContent {
		t.Fatalf("beacon: %d %s", ok.Code, ok.Body)
	}
	if n := count(env, `SELECT count(*) FROM analytics_events`); n != 3 {
		t.Fatalf("stored %d events, want 3 (the bot must not be stored)", n)
	}
	for _, job := range env.Jobs {
		if err := job(t.Context()); err != nil {
			t.Fatalf("job: %v", err)
		}
	}
	if n := count(env, `SELECT count(*) FROM analytics_daily WHERE metric = 'visitors' AND dim = ''`); n != 1 {
		t.Fatalf("visitor days: %d", n)
	}
	if n := count(env, `SELECT value FROM analytics_daily WHERE metric = 'pageviews' AND dim = ''`); n != 2 {
		t.Fatalf("pageviews: %d", n)
	}
}

func TestPremoderationSwitchQueuesEveryone(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	first := who.Member.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Campus idea", "summary": "summary", "category": "PROJECT"})
	if first.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", first.Code, first.Body)
	}
	slug := first.Map()["slug"].(string)
	if state := apptest.Scalar[string](env, `SELECT moderation_state FROM ideas WHERE slug = $1`, slug); state != "APPROVED" {
		t.Fatalf("member under EXTERNAL_ONLY: %s", state)
	}
	changed := who.Admin.Do(http.MethodPut, "/api/admin/settings", map[string]any{"premoderation": "ALL"})
	if changed.Code != http.StatusOK || changed.Map()["premoderation"] != "ALL" {
		t.Fatalf("settings: %d %s", changed.Code, changed.Body)
	}
	second := who.Member.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Campus idea two", "summary": "summary", "category": "PROJECT"})
	if second.Code != http.StatusCreated {
		t.Fatalf("create under ALL: %d %s", second.Code, second.Body)
	}
	slug = second.Map()["slug"].(string)
	if state := apptest.Scalar[string](env, `SELECT moderation_state FROM ideas WHERE slug = $1`, slug); state != "PENDING" {
		t.Fatalf("verified member under ALL: %s", state)
	}
	if n := count(env, `SELECT count(*) FROM moderation_cases c JOIN ideas i ON i.id = c.idea_id WHERE i.slug = $1 AND c.state = 'OPEN'`, slug); n != 1 {
		t.Fatalf("open cases: %d", n)
	}
}

func TestBootstrapAdminCannotBeDemoted(t *testing.T) {
	const mail = "owner@example.com"
	env := apptest.New(t, apptest.WithConfig(func(cfg *config.Config) { cfg.AdminEmails = []string{mail} }))
	owner := env.SignIn(mail)
	if role := owner.Do(http.MethodGet, "/api/me", nil).Map()["role"]; role != "ADMIN" {
		t.Fatalf("bootstrap role: %v", role)
	}
	who := cast(env)
	handle := apptestHandle(env, mail)
	denied := who.Admin.Do(http.MethodPatch, "/api/admin/users/"+handle+"/role", map[string]any{"role": "USER"})
	if denied.Code != http.StatusForbidden {
		t.Fatalf("demotion: %d %s", denied.Code, denied.Body)
	}
	page := who.Admin.Do(http.MethodGet, "/api/admin/users?q=owner", nil)
	if page.Code != http.StatusOK {
		t.Fatalf("users: %d %s", page.Code, page.Body)
	}
	found := false
	for _, row := range page.Map()["users"].([]any) {
		user := row.(map[string]any)
		if user["handle"] == handle {
			found = user["protected"] == true && user["role"] == "ADMIN"
		}
	}
	if !found {
		t.Fatalf("protected admin missing: %s", page.Body)
	}
	_ = apperr.KindForbidden
}

func TestModerationHistoryAndOverview(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	created := who.Outsider.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Needs a look", "summary": "summary", "category": "COMMUNITY"})
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body)
	}
	id := apptest.Scalar[string](env, `SELECT id FROM ideas WHERE slug = $1`, created.Map()["slug"])
	decision := who.Mod.Do(http.MethodPost, "/api/moderation/ideas/"+id+"/decision", map[string]any{"decision": "APPROVED", "note": ""})
	if decision.Code != http.StatusNoContent {
		t.Fatalf("decide: %d %s", decision.Code, decision.Body)
	}
	history := who.Mod.Do(http.MethodGet, "/api/moderation/history", nil)
	if history.Code != http.StatusOK {
		t.Fatalf("history: %d %s", history.Code, history.Body)
	}
	items := history.Map()["items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["decision"] != "APPROVED" {
		t.Fatalf("history items: %s", history.Body)
	}
	if who.Outsider.Do(http.MethodGet, "/api/admin/overview", nil).Code != http.StatusForbidden {
		t.Fatal("a user can open the admin overview")
	}
	overview := who.Admin.Do(http.MethodGet, "/api/admin/overview?range=7d", nil)
	if overview.Code != http.StatusOK {
		t.Fatalf("overview: %d %s", overview.Code, overview.Body)
	}
	if overview.Map()["verdict"].(map[string]any)["status"] == "" {
		t.Fatalf("verdict: %s", overview.Body)
	}
}
