package regression_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
)

// limited turns the plan limits on: two active ideas on the free plan, three on Plus.
func limited(c *config.Config) { c.PlanFreeActiveIdeas, c.PlanPlusActiveIdeas = 2, 3 }

func newIdea(c *apptest.Client, status string) *apptest.Response {
	body := map[string]any{"title": "An idea under a plan", "summary": "summary", "category": "PROJECT"}
	if status != "" {
		body["status"] = status
	}
	return c.Do(http.MethodPost, "/api/ideas", body)
}

func wantCode(t *testing.T, label string, r *apptest.Response, want int) {
	t.Helper()
	if r.Code != want {
		t.Fatalf("%s: %d, want %d: %s", label, r.Code, want, r.Body)
	}
}

type overview struct {
	Plan struct {
		Code              string
		Status            *string
		CurrentPeriodEnd  *time.Time
		CancelAtPeriodEnd bool
	}
	Usage struct {
		ActiveIdeas int
		Limit       *int
	}
	Sponsorships []struct {
		ID     string
		Tier   string
		Status string
	}
	Payments []struct {
		ID          string
		Kind        string
		AmountMinor int
		Status      string
	}
	Replayed bool
}

func billingOf(t *testing.T, c *apptest.Client) overview {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/me/billing", nil)
	wantCode(t, "billing", r, http.StatusOK)
	var o overview
	r.Decode(&o)
	return o
}

func TestTheFreePlanCapsActiveIdeas(t *testing.T) {
	env := apptest.New(t, apptest.WithConfig(limited))
	who := cast(env)

	wantCode(t, "first", newIdea(who.Outsider, ""), http.StatusCreated)
	wantCode(t, "second", newIdea(who.Outsider, ""), http.StatusCreated)
	r := newIdea(who.Outsider, "")
	wantCode(t, "third on the free plan", r, http.StatusPaymentRequired)
	if r.Map()["code"] != "payment_required" {
		t.Fatalf("error code: %s", r.Body)
	}

	// Drafts are not active: writing them is never blocked, publishing one is.
	draft := newIdea(who.Outsider, "DRAFT")
	wantCode(t, "draft", draft, http.StatusCreated)
	slug := draft.Map()["slug"].(string)
	wantCode(t, "publish over the cap", who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/status", map[string]any{"status": "OPEN"}), http.StatusPaymentRequired)

	o := billingOf(t, who.Outsider)
	if o.Plan.Code != "FREE" || o.Usage.ActiveIdeas != 2 || o.Usage.Limit == nil || *o.Usage.Limit != 2 {
		t.Fatalf("usage: %+v", o)
	}

	// Plus raises the cap at once and charges one (mock) payment.
	wantCode(t, "upgrade", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	wantCode(t, "publish on Plus", who.Outsider.Do(http.MethodPost, "/api/ideas/"+slug+"/status", map[string]any{"status": "OPEN"}), http.StatusOK)
	wantCode(t, "fourth on Plus", newIdea(who.Outsider, ""), http.StatusPaymentRequired)
	if got := count(env, `SELECT count(*) FROM billing_payments WHERE kind = 'PLAN' AND amount_minor > 0`); got != 1 {
		t.Fatalf("payments after upgrade: %d", got)
	}
	// Choosing the same plan again neither charges nor changes anything.
	wantCode(t, "same plan", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	if got := count(env, `SELECT count(*) FROM billing_payments`); got != 1 {
		t.Fatalf("payments after re-choosing: %d", got)
	}

	// Finishing an idea frees its slot.
	finished := apptest.Scalar[string](env, `SELECT slug FROM ideas WHERE status = 'OPEN' AND author_id = (SELECT id FROM users WHERE email = $1) LIMIT 1`, outsiderMail)
	wantCode(t, "finish", who.Outsider.Do(http.MethodPost, "/api/ideas/"+finished+"/status", map[string]any{"status": "DONE"}), http.StatusOK)
	wantCode(t, "after finishing", newIdea(who.Outsider, ""), http.StatusCreated)

	// Pro has no cap (one more is all the daily limit of five leaves room for).
	wantCode(t, "pro", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PRO"}), http.StatusOK)
	wantCode(t, "past the Plus cap on Pro", newIdea(who.Outsider, ""), http.StatusCreated)

	// Staff are never capped.
	for range 3 {
		wantCode(t, "moderator", newIdea(who.Mod, ""), http.StatusCreated)
	}
}

func TestACanceledPlanLastsUntilThePeriodEnds(t *testing.T) {
	env := apptest.New(t, apptest.WithConfig(limited))
	who := cast(env)

	wantCode(t, "upgrade", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	r := who.Outsider.Do(http.MethodDelete, "/api/me/billing/plan", nil)
	wantCode(t, "cancel", r, http.StatusOK)
	var o overview
	r.Decode(&o)
	if o.Plan.Code != "PLUS" || !o.Plan.CancelAtPeriodEnd || o.Usage.Limit == nil || *o.Usage.Limit != 3 {
		t.Fatalf("a canceled plan should stay in effect until its period ends: %+v", o)
	}
	for range 3 {
		wantCode(t, "while still Plus", newIdea(who.Outsider, ""), http.StatusCreated)
	}

	// The period ends: the renewal job must not charge, and the free cap applies to new ideas.
	env.Exec(`UPDATE plan_subscriptions SET current_period_start = now() - interval '1 month 1 minute', current_period_end = now() - interval '1 minute'`)
	runJobs(t, env)
	if got := count(env, `SELECT count(*) FROM billing_payments`); got != 1 {
		t.Fatalf("a canceled plan was charged again: %d payments", got)
	}
	o = billingOf(t, who.Outsider)
	if o.Plan.Code != "FREE" || o.Plan.Status != nil {
		t.Fatalf("after the period: %+v", o.Plan)
	}
	wantCode(t, "over the free cap", newIdea(who.Outsider, ""), http.StatusPaymentRequired)
	if got := count(env, `SELECT count(*) FROM ideas WHERE deleted_at IS NULL AND author_id = (SELECT id FROM users WHERE email = $1)`, outsiderMail); got != 3 {
		t.Fatalf("existing ideas must survive a downgrade: %d", got)
	}

	// Resuming before the end is free; after the end, choosing the plan again charges anew.
	wantCode(t, "subscribe again", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	if got := count(env, `SELECT count(*) FROM billing_payments`); got != 2 {
		t.Fatalf("payments after subscribing again: %d", got)
	}
	who.Outsider.Do(http.MethodDelete, "/api/me/billing/plan", nil)
	wantCode(t, "resume", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	if got := count(env, `SELECT count(*) FROM billing_payments`); got != 2 {
		t.Fatalf("resuming charged: %d payments", got)
	}
}

func runJobs(t *testing.T, env *apptest.Env) {
	t.Helper()
	for _, j := range env.Jobs {
		if err := j(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRenewalChargesEachPeriodOnce(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	gone, goneID := idea(t, env, who.Member2, nil)

	wantCode(t, "upgrade", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PRO"}), http.StatusOK)
	wantCode(t, "sponsor", who.Outsider.Do(http.MethodPut, "/api/ideas/"+slug+"/sponsorship", map[string]any{"tier": "SUPPORTER"}), http.StatusOK)
	wantCode(t, "sponsor the doomed", who.Outsider.Do(http.MethodPut, "/api/ideas/"+gone+"/sponsorship", map[string]any{"tier": "PATRON"}), http.StatusOK)
	who.Member2.Do(http.MethodDelete, "/api/ideas/"+gone, nil)

	env.Exec(`UPDATE plan_subscriptions SET current_period_start = now() - interval '1 month 1 minute', current_period_end = now() - interval '1 minute'`)
	env.Exec(`UPDATE idea_sponsorships SET current_period_start = now() - interval '1 month 1 minute', current_period_end = now() - interval '1 minute'`)
	runJobs(t, env)
	runJobs(t, env) // a second run finds nothing due

	if got := count(env, `SELECT count(*) FROM billing_payments`); got != 5 {
		t.Fatalf("payments: %d, want 3 first charges + plan renewal + one sponsorship renewal", got)
	}
	if got := count(env, `SELECT count(*) FROM plan_subscriptions WHERE current_period_end > now()`); got != 1 {
		t.Fatal("the plan period did not move forward")
	}
	if got := count(env, `SELECT count(*) FROM idea_sponsorships WHERE idea_id = $1 AND status = 'CANCELED'`, goneID); got != 1 {
		t.Fatal("a sponsorship of a deleted idea must stop instead of renewing")
	}
}

func TestSponsoringAnIdea(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)
	path := "/api/ideas/" + slug + "/sponsorship"

	wantCode(t, "anonymous sponsor", who.Anon.Do(http.MethodPut, path, map[string]any{"tier": "BACKER"}), http.StatusUnauthorized)
	wantCode(t, "own idea", who.Member.Do(http.MethodPut, path, map[string]any{"tier": "BACKER"}), http.StatusUnprocessableEntity)
	wantCode(t, "unknown tier", who.Outsider.Do(http.MethodPut, path, map[string]any{"tier": "GOLD"}), http.StatusUnprocessableEntity)
	wantCode(t, "sponsor", who.Outsider.Do(http.MethodPut, path, map[string]any{"tier": "BACKER"}), http.StatusOK)
	wantCode(t, "change tier", who.Outsider.Do(http.MethodPut, path, map[string]any{"tier": "PATRON"}), http.StatusOK)
	wantCode(t, "second sponsor", who.Third.Do(http.MethodPut, path, map[string]any{"tier": "SUPPORTER"}), http.StatusOK)

	if got := count(env, `SELECT count(*) FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = $1) AND type = 'SYSTEM'`, memberMail); got != 2 {
		t.Fatalf("the author should hear about each new sponsor once, got %d notifications", got)
	}

	// The public sees how many; only the author sees who and how much.
	public := who.Anon.Do(http.MethodGet, path, nil).Map()
	if public["sponsors"] != float64(2) || public["accepting"] != true || public["supporters"] != nil || public["monthlyMinor"] != nil {
		t.Fatalf("public view: %v", public)
	}
	author := who.Member.Do(http.MethodGet, path, nil).Map()
	if author["own"] != true || len(author["supporters"].([]any)) != 2 || author["monthlyMinor"] != float64(55000) {
		t.Fatalf("author view: %v", author)
	}
	mine := who.Outsider.Do(http.MethodGet, path, nil).Map()["mine"].(map[string]any)
	if mine["tier"] != "PATRON" {
		t.Fatalf("my sponsorship: %v", mine)
	}

	// Canceling keeps the sponsorship until the paid month ends.
	id := mine["id"].(string)
	wantCode(t, "someone else's sponsorship", who.Third.Do(http.MethodDelete, "/api/me/billing/sponsorships/"+id, nil), http.StatusNotFound)
	wantCode(t, "cancel", who.Outsider.Do(http.MethodDelete, "/api/me/billing/sponsorships/"+id, nil), http.StatusOK)
	if who.Anon.Do(http.MethodGet, path, nil).Map()["sponsors"] != float64(2) {
		t.Fatal("a canceled sponsorship stops counting before its month ends")
	}
	env.Exec(`UPDATE idea_sponsorships SET current_period_start = now() - interval '1 month 1 minute', current_period_end = now() - interval '1 minute' WHERE id = $1`, id)
	if who.Anon.Do(http.MethodGet, path, nil).Map()["sponsors"] != float64(1) {
		t.Fatal("an ended sponsorship still counts")
	}

	// Finished and hidden ideas take no new sponsors.
	env.Exec(`UPDATE ideas SET status = 'DONE' WHERE slug = $1`, slug)
	wantCode(t, "finished idea", who.Mod.Do(http.MethodPut, path, map[string]any{"tier": "BACKER"}), http.StatusConflict)
	if who.Anon.Do(http.MethodGet, path, nil).Map()["accepting"] != false {
		t.Fatal("a finished idea still accepts sponsors")
	}
	env.Exec(`UPDATE ideas SET status = 'OPEN', moderation_state = 'PENDING' WHERE slug = $1`, slug)
	wantCode(t, "hidden idea", who.Mod.Do(http.MethodPut, path, map[string]any{"tier": "BACKER"}), http.StatusNotFound)
}

// ---- the support bot ----

func TestTheSupportBotActsOnlyForTheUserTalkingToIt(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Member, nil)

	wantCode(t, "upgrade", who.Outsider.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PLUS"}), http.StatusOK)
	wantCode(t, "sponsor", who.Outsider.Do(http.MethodPut, "/api/ideas/"+slug+"/sponsorship", map[string]any{"tier": "BACKER"}), http.StatusOK)
	wantCode(t, "third upgrades", who.Third.Do(http.MethodPut, "/api/me/billing/plan", map[string]any{"plan": "PRO"}), http.StatusOK)
	theirs := billingOf(t, who.Third).Payments[0].ID

	bot := who.Outsider.SupportHeaders()
	act := func(body map[string]any) *apptest.Response {
		return who.Anon.DoWith(http.MethodPost, "/api/integrations/support/billing/actions", body, bot)
	}
	snapshot := who.Anon.DoWith(http.MethodGet, "/api/integrations/support/billing", nil, bot)
	wantCode(t, "snapshot", snapshot, http.StatusOK)
	var o overview
	snapshot.Decode(&o)
	if snapshot.Map()["user"].(map[string]any)["handle"] != apptestHandle(env, outsiderMail) || o.Plan.Code != "PLUS" || len(o.Sponsorships) != 1 || len(o.Payments) != 2 {
		t.Fatalf("snapshot: %s", snapshot.Body)
	}
	if snapshot.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("support answers must not be cached")
	}

	// Cancel, and a retry of the same action is replayed, not applied twice.
	r := act(map[string]any{"actionId": "chat-1:cancel", "action": "CANCEL_PLAN"})
	wantCode(t, "cancel plan", r, http.StatusOK)
	r.Decode(&o)
	if !o.Plan.CancelAtPeriodEnd || o.Replayed {
		t.Fatalf("after cancel: %+v", o)
	}
	r = act(map[string]any{"actionId": "chat-1:cancel", "action": "CANCEL_PLAN"})
	wantCode(t, "retry", r, http.StatusOK)
	r.Decode(&o)
	if !o.Replayed {
		t.Fatal("a retried action id should be reported as replayed")
	}
	wantCode(t, "action id reused for something else", act(map[string]any{"actionId": "chat-1:cancel", "action": "RESUME_PLAN"}), http.StatusConflict)
	if got := count(env, `SELECT count(*) FROM billing_support_actions`); got != 1 {
		t.Fatalf("support actions recorded: %d", got)
	}

	// Resume and extend.
	wantCode(t, "resume", act(map[string]any{"actionId": "chat-1:resume", "action": "RESUME_PLAN"}), http.StatusOK)
	before := billingOf(t, who.Outsider).Plan.CurrentPeriodEnd
	wantCode(t, "extend too far", act(map[string]any{"actionId": "chat-1:extend-big", "action": "EXTEND_PLAN", "days": 90}), http.StatusUnprocessableEntity)
	wantCode(t, "extend", act(map[string]any{"actionId": "chat-1:extend", "action": "EXTEND_PLAN", "days": 7}), http.StatusOK)
	if after := billingOf(t, who.Outsider).Plan.CurrentPeriodEnd; after.Sub(*before) != 7*24*time.Hour {
		t.Fatalf("extended from %v to %v", before, after)
	}

	// Refunds: own recent payments only, once.
	var plan string
	for _, p := range billingOf(t, who.Outsider).Payments {
		if p.Kind == "PLAN" {
			plan = p.ID
		}
	}
	wantCode(t, "refund someone else's payment", act(map[string]any{"actionId": "chat-1:steal", "action": "REFUND_PAYMENT", "subject": theirs}), http.StatusNotFound)
	wantCode(t, "refund", act(map[string]any{"actionId": "chat-1:refund", "action": "REFUND_PAYMENT", "subject": plan}), http.StatusOK)
	wantCode(t, "refund twice", act(map[string]any{"actionId": "chat-1:refund-again", "action": "REFUND_PAYMENT", "subject": plan}), http.StatusConflict)
	if got := count(env, `SELECT count(*) FROM billing_payments WHERE status = 'REFUNDED'`); got != 1 {
		t.Fatalf("refunded payments: %d", got)
	}
	env.Exec(`UPDATE billing_payments SET created_at = now() - interval '15 days' WHERE kind = 'SPONSORSHIP'`)
	old := apptest.Scalar[string](env, `SELECT id FROM billing_payments WHERE kind = 'SPONSORSHIP'`)
	wantCode(t, "refund an old payment", act(map[string]any{"actionId": "chat-1:refund-old", "action": "REFUND_PAYMENT", "subject": old}), http.StatusConflict)

	// Cancel a sponsorship.
	sponsorship := billingOf(t, who.Outsider).Sponsorships[0].ID
	wantCode(t, "cancel sponsorship", act(map[string]any{"actionId": "chat-1:unsponsor", "action": "CANCEL_SPONSORSHIP", "subject": sponsorship}), http.StatusOK)
	if s := billingOf(t, who.Outsider).Sponsorships[0]; s.Status != "CANCELED" {
		t.Fatalf("sponsorship after cancel: %+v", s)
	}

	// Malformed requests.
	for name, body := range map[string]map[string]any{
		"short action id":    {"actionId": "x", "action": "CANCEL_PLAN"},
		"unknown action":     {"actionId": "chat-1:nope", "action": "DELETE_ACCOUNT"},
		"subject missing":    {"actionId": "chat-1:nosubj", "action": "REFUND_PAYMENT"},
		"subject not wanted": {"actionId": "chat-1:subj", "action": "CANCEL_PLAN", "subject": plan},
		"days not wanted":    {"actionId": "chat-1:days", "action": "CANCEL_PLAN", "days": 3},
	} {
		if r := act(body); r.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s: %d %s", name, r.Code, r.Body)
		}
	}

	// A plan that already ended can be neither resumed nor extended by support.
	env.Exec(`UPDATE plan_subscriptions SET status = 'CANCELED', current_period_start = now() - interval '1 month 1 minute', current_period_end = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, outsiderMail)
	wantCode(t, "resume an ended plan", act(map[string]any{"actionId": "chat-2:resume", "action": "RESUME_PLAN"}), http.StatusConflict)
}

func TestSupportRoutesIgnoreBrowserCredentials(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	user := who.Outsider.SupportHeaders()["X-Fantasm-Support-User"]
	bearer := "Bearer " + apptest.SupportAPIToken
	path := "/api/integrations/support/billing"

	for name, h := range map[string]map[string]string{
		"admin session, same origin":     {"Origin": apptest.Origin, "Sec-Fetch-Site": "same-origin"},
		"admin session and a user token": {"Origin": apptest.Origin, "X-Fantasm-Support-User": user},
		"wrong bearer":                   {"Authorization": "Bearer " + apptest.SupportAPIToken + "x", "X-Fantasm-Support-User": user},
		"bearer, other scheme":           {"Authorization": "Basic " + apptest.SupportAPIToken, "X-Fantasm-Support-User": user},
		"bearer without a user token":    {"Authorization": bearer},
		"bearer and a forged token":      {"Authorization": bearer, "X-Fantasm-Support-User": user[:len(user)-2] + "AA"},
		"bearer and a session token":     {"Authorization": bearer, "X-Fantasm-Support-User": who.Admin.Cookie("fantasm_session")},
	} {
		if r := who.Admin.DoWith(http.MethodGet, path, nil, h); r.Code != http.StatusUnauthorized {
			t.Errorf("%s: %d, want 401", name, r.Code)
		}
		if r := who.Admin.DoWith(http.MethodPost, path+"/actions", map[string]any{"actionId": "forged-action", "action": "CANCEL_PLAN"}, h); r.Code != http.StatusUnauthorized {
			t.Errorf("%s (write): %d, want 401", name, r.Code)
		}
	}
	if got := count(env, `SELECT count(*) FROM billing_support_actions`); got != 0 {
		t.Fatal("a refused support call changed something")
	}

	// Without a configured credential the integration does not exist at all.
	off := apptest.New(t, apptest.WithConfig(func(c *config.Config) { c.SupportAPIToken = "" }))
	if r := off.Anon().DoWith(http.MethodGet, path, nil, map[string]string{"Authorization": bearer}); r.Code != http.StatusNotFound {
		t.Fatalf("integration without a token: %d", r.Code)
	}
}
