package regression_test

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
)

const sessionCookie, loginCookie = "fantasm_session", "fantasm_login"

func signedIn(c *apptest.Client) bool {
	return c.Do(http.MethodGet, "/api/me", nil).Code == http.StatusOK
}

// beginLogin starts the flow and returns the state the provider would echo back.
func beginLogin(t *testing.T, c *apptest.Client) string {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/auth/google/login", nil)
	if r.Code != http.StatusFound {
		t.Fatalf("begin login: %d %s", r.Code, r.Body)
	}
	loc, err := url.Parse(r.Header.Get("Location"))
	if err != nil || loc.Query().Get("state") == "" {
		t.Fatalf("no state in %q", r.Header.Get("Location"))
	}
	return loc.Query().Get("state")
}

func stateOf(location string) string {
	loc, err := url.Parse(location)
	if err != nil {
		return ""
	}
	return loc.Query().Get("state")
}

func callback(c *apptest.Client, state, code string) *apptest.Response {
	return c.Do(http.MethodGet, "/api/auth/google/callback?"+url.Values{"state": {state}, "code": {code}}.Encode(), nil)
}

func hashOf(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func TestSessionCookieIsHardenedAndOnlyItsHashIsStored(t *testing.T) {
	env := apptest.New(t)
	c := env.Anon()
	state := beginLogin(t, c)
	login := c.Cookie(loginCookie)
	if login == "" || strings.Contains(login, state) {
		t.Fatalf("login cookie %q must be an independent secret", login)
	}
	r := callback(c, state, outsiderMail)
	if r.Code != http.StatusSeeOther {
		t.Fatalf("callback: %d %s", r.Code, r.Body)
	}
	var set *http.Cookie
	for _, ck := range (&http.Response{Header: r.Header}).Cookies() {
		if ck.Name == sessionCookie {
			set = ck
		}
	}
	if set == nil {
		t.Fatal("no session cookie")
	}
	if !set.HttpOnly || set.SameSite != http.SameSiteLaxMode || set.Path != "/" || set.Domain != "" || set.MaxAge <= 0 {
		t.Errorf("weak cookie attributes: %+v", set)
	}
	if len(set.Value) < 40 {
		t.Errorf("token too short to be unguessable: %d chars", len(set.Value))
	}
	if n := count(env, `SELECT count(*) FROM sessions WHERE token_hash = $1`, set.Value); n != 0 {
		t.Error("the raw token is stored")
	}
	if n := count(env, `SELECT count(*) FROM sessions WHERE token_hash = $1`, hashOf(set.Value)); n != 1 {
		t.Errorf("sessions keyed by the token's SHA-256: %d, want 1", n)
	}
	// The login cookie is cleared by the callback.
	if c.Cookie(loginCookie) != "" {
		t.Error("login cookie survived the callback")
	}
	// Tokens are unique per login.
	other := env.SignIn(outsiderMail)
	if other.Cookie(sessionCookie) == set.Value {
		t.Error("two logins produced the same token")
	}
}

func TestLoginCannotBeReplayedOrHijacked(t *testing.T) {
	env := apptest.New(t)

	// A state is single use.
	victim := env.Anon()
	state := beginLogin(t, victim)
	saved := victim.Cookie(loginCookie)
	if r := callback(victim, state, outsiderMail); r.Code != http.StatusSeeOther || !signedIn(victim) {
		t.Fatalf("first use: %d", r.Code)
	}
	replayer := env.Anon()
	replayer.SetCookie(loginCookie, saved)
	if r := callback(replayer, state, outsiderMail); signedIn(replayer) {
		t.Errorf("a replayed callback signed someone in (%d)", r.Code)
	}

	// Login CSRF: an attacker's state completed in the victim's browser (no matching login cookie).
	attacker := env.Anon()
	attackerState := beginLogin(t, attacker)
	victimBrowser := env.Anon()
	if r := callback(victimBrowser, attackerState, thirdMail); signedIn(victimBrowser) {
		t.Errorf("a state started in another browser was accepted (%d)", r.Code)
	}

	// Made-up or mangled states.
	for name, st := range map[string]string{"empty": "", "random": strings.Repeat("a", 43), "huge": strings.Repeat("a", 100000), "sql": "' OR '1'='1"} {
		c := env.Anon()
		beginLogin(t, c)
		if callback(c, st, outsiderMail); signedIn(c) {
			t.Errorf("%s state signed someone in", name)
		}
	}

	// No code, an error from the provider, or no login at all.
	for name, q := range map[string]string{"missing code": "state=x", "provider error": "error=access_denied&state=x", "nothing": ""} {
		c := env.Anon()
		beginLogin(t, c)
		if r := c.Do(http.MethodGet, "/api/auth/google/callback?"+q, nil); signedIn(c) || r.Code >= 500 {
			t.Errorf("%s: %d", name, r.Code)
		}
	}

	// An expired attempt is dead.
	c := env.Anon()
	state = beginLogin(t, c)
	env.Exec(`UPDATE login_attempts SET expires_at = now() - interval '1 second'`)
	if callback(c, state, outsiderMail); signedIn(c) {
		t.Error("an expired login attempt was accepted")
	}

	// Providers that are not configured do not exist.
	for _, p := range []string{"entra", "github", "..%2f..", "GOOGLE"} {
		if r := env.Anon().Do(http.MethodGet, "/api/auth/"+p+"/login", nil); r.Code != http.StatusNotFound {
			t.Errorf("provider %q: %d, want 404", p, r.Code)
		}
	}
}

func TestSessionFixationAndRotation(t *testing.T) {
	env := apptest.New(t)

	// Fixation: a session planted by an attacker before login is dead afterwards, and the user gets a fresh token.
	victim := env.SignIn(outsiderMail)
	planted := victim.Cookie(sessionCookie)
	state := beginLogin(t, victim)
	if r := callback(victim, state, outsiderMail); r.Code != http.StatusSeeOther {
		t.Fatalf("second login: %d", r.Code)
	}
	fresh := victim.Cookie(sessionCookie)
	if fresh == "" || fresh == planted {
		t.Fatal("the session token was not rotated by logging in again")
	}
	attacker := env.Anon()
	attacker.SetCookie(sessionCookie, planted)
	if signedIn(attacker) {
		t.Error("the pre-login token still works after login")
	}
	if !signedIn(victim) {
		t.Error("the new session does not work")
	}
	if n := count(env, `SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`, outsiderMail); n != 1 {
		t.Errorf("%d sessions after re-login on one device, want 1", n)
	}
}

func TestLogoutEndsTheSessionEverywhereItWasUsed(t *testing.T) {
	env := apptest.New(t)
	c := env.SignIn(outsiderMail)
	stolen := c.Clone() // someone who copied the cookie
	if r := c.Do(http.MethodPost, "/api/auth/logout", nil); r.Code != http.StatusNoContent {
		t.Fatalf("logout: %d", r.Code)
	}
	if signedIn(c) || signedIn(stolen) {
		t.Error("the session survived logout")
	}
	if n := count(env, `SELECT count(*) FROM sessions`); n != 0 {
		t.Errorf("%d session rows left", n)
	}
	// Logging out twice, or without a session, is harmless.
	if r := c.Do(http.MethodPost, "/api/auth/logout", nil); r.Code != http.StatusNoContent {
		t.Errorf("second logout: %d", r.Code)
	}
}

func TestLogoutAllAndRevokingOneSession(t *testing.T) {
	env := apptest.New(t)
	laptop := env.SignIn(outsiderMail)
	phone := env.SignIn(outsiderMail)
	tablet := env.SignIn(outsiderMail)
	other := env.SignIn(thirdMail)
	if n := count(env, `SELECT count(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`, outsiderMail); n != 3 {
		t.Fatalf("sessions: %d", n)
	}

	var list struct {
		Sessions []struct {
			ID      string
			Current bool
		}
	}
	laptop.Do(http.MethodGet, "/api/me/sessions", nil).Decode(&list)
	if len(list.Sessions) != 3 {
		t.Fatalf("listed %d sessions", len(list.Sessions))
	}
	current := 0
	var otherID string
	for _, s := range list.Sessions {
		if s.Current {
			current++
		} else {
			otherID = s.ID
		}
	}
	if current != 1 {
		t.Fatalf("%d sessions marked current", current)
	}
	if strings.Contains(string(laptop.Do(http.MethodGet, "/api/me/sessions", nil).Body), laptop.Cookie(sessionCookie)) {
		t.Error("the session list exposes a token")
	}

	// Someone else's session cannot be revoked, and cannot be told apart from a missing one.
	if r := other.Do(http.MethodDelete, "/api/me/sessions/"+otherID, nil); r.Code != http.StatusNotFound || !signedIn(phone) && !signedIn(tablet) {
		t.Errorf("revoking another user's session: %d", r.Code)
	}
	// Revoking one of your own kills just that device.
	if r := laptop.Do(http.MethodDelete, "/api/me/sessions/"+otherID, nil); r.Code != http.StatusNoContent {
		t.Fatalf("revoke: %d %s", r.Code, r.Body)
	}
	if alive := b2i(signedIn(phone)) + b2i(signedIn(tablet)); alive != 1 {
		t.Errorf("%d of the two other devices still signed in, want 1", alive)
	}

	if r := laptop.Do(http.MethodPost, "/api/auth/logout-all", nil); r.Code != http.StatusNoContent {
		t.Fatalf("logout-all: %d", r.Code)
	}
	if signedIn(laptop) || signedIn(phone) || signedIn(tablet) {
		t.Error("a session survived logout-all")
	}
	if !signedIn(other) {
		t.Error("logout-all ended another user's session")
	}
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func TestSessionsExpire(t *testing.T) {
	env := apptest.New(t, apptest.WithConfig(func(c *config.Config) {
		c.SessionIdleTTL, c.SessionAbsoluteTTL = time.Hour, 24*time.Hour
	}))
	idle, absolute, fine := env.SignIn(outsiderMail), env.SignIn(thirdMail), env.SignIn(memberMail)
	env.Exec(`UPDATE sessions SET last_seen_at = now() - interval '2 hours' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, outsiderMail)
	env.Exec(`UPDATE sessions SET expires_at = now() - interval '1 minute' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, thirdMail)
	env.Exec(`UPDATE sessions SET last_seen_at = now() - interval '30 minutes' WHERE user_id = (SELECT id FROM users WHERE email = $1)`, memberMail)
	if signedIn(idle) {
		t.Error("a session idle past its limit still works")
	}
	if signedIn(absolute) {
		t.Error("a session past its absolute lifetime still works")
	}
	if !signedIn(fine) {
		t.Error("a session inside both limits was refused")
	}
	// The purge job removes what expired.
	for _, run := range env.Jobs {
		if err := run(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	if n := count(env, `SELECT count(*) FROM sessions WHERE expires_at < now()`); n != 0 {
		t.Errorf("%d expired sessions remain after the purge job", n)
	}
}

func TestOnlyTheCookieAuthenticates(t *testing.T) {
	env := apptest.New(t)
	c := env.SignIn(outsiderMail)
	token := c.Cookie(sessionCookie)
	anon := env.Anon()
	for name, h := range map[string]map[string]string{
		"bearer":        {"Authorization": "Bearer " + token},
		"basic":         {"Authorization": "Basic " + token},
		"custom header": {"X-Session": token, "X-Auth-Token": token},
		"other cookie":  {"Cookie": "session=" + token + "; token=" + token},
	} {
		if r := anon.DoWith(http.MethodGet, "/api/me", nil, h); r.Code != http.StatusUnauthorized {
			t.Errorf("%s accepted: %d", name, r.Code)
		}
	}
	if r := anon.DoWith(http.MethodGet, "/api/me?session="+url.QueryEscape(token), nil, nil); r.Code != http.StatusUnauthorized {
		t.Errorf("token in the query string accepted: %d", r.Code)
	}
	for name, v := range map[string]string{"tampered": token[:len(token)-2] + "xx", "truncated": token[:10], "empty": "", "huge": strings.Repeat("a", 100000), "sql": "' OR '1'='1", "hash instead of token": hashOf(token)} {
		bad := env.Anon()
		bad.SetCookie(sessionCookie, v)
		if r := bad.Do(http.MethodGet, "/api/me", nil); r.Code != http.StatusUnauthorized {
			t.Errorf("%s cookie: %d, want 401", name, r.Code)
		}
	}
	// A bad cookie on a public route is just an anonymous visit.
	bad := env.Anon()
	bad.SetCookie(sessionCookie, "garbage")
	if r := bad.Do(http.MethodGet, "/api/ideas", nil); r.Code != http.StatusOK {
		t.Errorf("public route with a bad cookie: %d", r.Code)
	}
}

func TestRoleChangesTakeEffectImmediately(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	mod2 := env.SignIn(thirdMail)

	if r := mod2.Do(http.MethodGet, "/api/moderation/queue", nil); r.Code != http.StatusForbidden {
		t.Fatalf("a user saw the queue: %d", r.Code)
	}
	handle := apptestHandle(env, thirdMail)
	for name, c := range map[string]*apptest.Client{"user": who.Outsider, "moderator": who.Mod, "anonymous": who.Anon} {
		if r := c.Do(http.MethodPatch, "/api/admin/users/"+handle+"/role", map[string]any{"role": "ADMIN"}); r.Code != http.StatusForbidden && r.Code != http.StatusUnauthorized {
			t.Errorf("%s changed a role: %d", name, r.Code)
		}
	}
	if apptest.Scalar[string](env, `SELECT role FROM users WHERE email = $1`, thirdMail) != "USER" {
		t.Fatal("a role changed without an admin")
	}

	r := who.Admin.Do(http.MethodPatch, "/api/admin/users/"+handle+"/role", map[string]any{"role": "MODERATOR"})
	if r.Code != http.StatusOK {
		t.Fatalf("promote: %d %s", r.Code, r.Body)
	}
	// Sessions of the target are revoked, so the old role cannot linger in a live session.
	if signedIn(mod2) {
		t.Error("the promoted user's old session survived the role change")
	}
	mod2 = env.SignIn(thirdMail)
	if r := mod2.Do(http.MethodGet, "/api/moderation/queue", nil); r.Code != http.StatusOK {
		t.Errorf("promoted user cannot reach the queue: %d", r.Code)
	}
	if r := who.Admin.Do(http.MethodPatch, "/api/admin/users/"+handle+"/role", map[string]any{"role": "USER"}); r.Code != http.StatusOK {
		t.Fatalf("demote: %d", r.Code)
	}
	if r := mod2.Do(http.MethodGet, "/api/moderation/queue", nil); r.Code == http.StatusOK {
		t.Error("a demoted moderator still has the queue")
	}
	for _, bad := range []string{"SUPERUSER", "admin", "", "USER' --"} {
		if r := who.Admin.Do(http.MethodPatch, "/api/admin/users/"+handle+"/role", map[string]any{"role": bad}); r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest {
			t.Errorf("role %q: %d", bad, r.Code)
		}
	}
	if r := who.Admin.Do(http.MethodPatch, "/api/admin/users/ghost-user/role", map[string]any{"role": "USER"}); r.Code != http.StatusNotFound {
		t.Errorf("unknown user: %d", r.Code)
	}
}

func TestProfileEditsAreValidatedAndScoped(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	mine := apptestHandle(env, outsiderMail)
	env.Exec(`UPDATE users SET handle = 'taken-one' WHERE email = $1`, thirdMail)
	theirs := apptestHandle(env, thirdMail)

	if r := who.Outsider.Do(http.MethodPatch, "/api/me", map[string]any{"name": "Boris B.", "bio": "I build things", "faculty": "FI"}); r.Code != http.StatusOK {
		t.Fatalf("edit: %d %s", r.Code, r.Body)
	}
	// Taking someone else's handle is a field error, not an overwrite.
	if r := who.Outsider.Do(http.MethodPatch, "/api/me", map[string]any{"handle": theirs}); r.Code != http.StatusUnprocessableEntity || !strings.Contains(string(r.Body), "already taken") {
		t.Errorf("handle clash: %d %s", r.Code, r.Body)
	}
	for name, body := range map[string]map[string]any{
		"short handle":    {"handle": "ab"},
		"bad characters":  {"handle": "Bad Handle!"},
		"long handle":     {"handle": strings.Repeat("a", 41)},
		"empty name":      {"name": "   "},
		"long name":       {"name": strings.Repeat("n", 101)},
		"long bio":        {"bio": strings.Repeat("b", 501)},
		"long faculty":    {"faculty": strings.Repeat("f", 101)},
		"nul in name":     {"name": "a\x00b"},
		"role escalation": {"role": "ADMIN"},
		"karma":           {"karma": 9999},
		"email":           {"email": "root@example.com"},
		"id":              {"id": zeroID},
	} {
		if r := who.Outsider.Do(http.MethodPatch, "/api/me", body); r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want a client error", name, r.Code)
		}
	}
	var role string
	var karma int
	row := env.DB.Querier(t.Context()).QueryRow(t.Context(), `SELECT role, karma FROM users WHERE email = $1`, outsiderMail)
	if err := row.Scan(&role, &karma); err != nil || role != "USER" || karma != 0 || apptestHandle(env, outsiderMail) != mine {
		t.Errorf("privileged fields changed: role=%s karma=%d handle=%s (%v)", role, karma, apptestHandle(env, outsiderMail), err)
	}
	// The public profile never exposes an e-mail address.
	r := who.Anon.Do(http.MethodGet, "/api/users/"+mine, nil)
	if r.Code != http.StatusOK || strings.Contains(string(r.Body), "@") {
		t.Errorf("public profile: %d %s", r.Code, r.Body)
	}
}
