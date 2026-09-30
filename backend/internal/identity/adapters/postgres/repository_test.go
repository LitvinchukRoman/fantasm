package postgres_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	identityhttp "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/http"
	identitypostgres "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
)

func database(t *testing.T) *postgres.DB {
	t.Helper()
	return databaseWithSetup(t, nil)
}

func databaseWithSetup(t *testing.T, before func(*postgres.DB, string)) *postgres.DB {
	t.Helper()
	dsn := os.Getenv("IDENTITY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("IDENTITY_TEST_DATABASE_URL is not set")
	}
	admin, err := pgxpool.New(t.Context(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("identity_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(t.Context(), "CREATE SCHEMA "+schema); err != nil {
		admin.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
	query := u.Query()
	query.Set("search_path", schema)
	u.RawQuery = query.Encode()
	db, err := postgres.Connect(t.Context(), u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	paths, err := filepath.Glob("../../../../migrations/*.up.sql")
	if err != nil || len(paths) == 0 {
		t.Fatalf("find migrations: %v", err)
	}
	for _, path := range paths {
		if before != nil {
			before(db, filepath.Base(path))
		}
		migration, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Querier(t.Context()).Exec(t.Context(), string(migration)); err != nil {
			t.Fatalf("apply %s: %v", path, err)
		}
	}
	return db
}

func profile(subject string) domain.Identity {
	return domain.Identity{Provider: domain.Google, Issuer: "https://accounts.google.com", Subject: subject, Email: "same@example.com", EmailVerified: true, Name: "Student"}
}

func candidate(n int) domain.User {
	return domain.User{ID: fmt.Sprintf("00000000-0000-4000-8000-%012d", n), Handle: fmt.Sprintf("user_%d", n), Name: "Student", Email: "same@example.com", Role: domain.UserRole, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
}

func TestConcurrentIdentityCreation(t *testing.T) {
	db := database(t)
	repository := identitypostgres.NewRepository(db)
	const count = 12
	results := make(chan domain.User, count)
	errors := make(chan error, count)
	var wg sync.WaitGroup
	for i := range count {
		wg.Go(func() {
			user, err := repository.UpsertUser(t.Context(), profile("same-subject"), candidate(i+1))
			results <- user
			errors <- err
		})
	}
	wg.Wait()
	close(results)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var id string
	for user := range results {
		if id != "" && id != user.ID {
			t.Fatal("concurrent login created multiple users")
		}
		id = user.ID
	}
	var users int
	if err := db.Querier(t.Context()).QueryRow(t.Context(), "SELECT count(*) FROM users").Scan(&users); err != nil || users != 1 {
		t.Fatalf("user count = %d, error = %v", users, err)
	}
	other, err := repository.UpsertUser(t.Context(), profile("other-subject"), candidate(100))
	if err != nil || other.ID == id {
		t.Fatalf("same email merged identities: %+v, %v", other, err)
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE users SET role = 'ADMIN', name = 'Edited name', bio = 'Edited bio' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	updated, err := repository.UpsertUser(t.Context(), profile("same-subject"), candidate(200))
	if err != nil || updated.Role != domain.AdminRole || updated.Name != "Edited name" || updated.Bio != "Edited bio" {
		t.Fatalf("login overwrote managed fields: %+v, %v", updated, err)
	}
}

func TestLoginAttemptConsumedExactlyOnce(t *testing.T) {
	db := database(t)
	r := identitypostgres.NewRepository(db)
	a := domain.LoginAttempt{StateHash: strings.Repeat("a", 64), BrowserHash: strings.Repeat("b", 64), Provider: domain.Google, Nonce: "nonce", Verifier: "verifier", ExpiresAt: time.Now().Add(time.Minute)}
	if err := r.CreateLogin(t.Context(), a); err != nil {
		t.Fatal(err)
	}
	if _, err := r.ConsumeLogin(t.Context(), a.StateHash, a.BrowserHash, domain.Entra, time.Now()); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("accepted wrong provider: %v", err)
	}
	results := make(chan error, 12)
	var wg sync.WaitGroup
	for range 12 {
		wg.Go(func() {
			_, err := r.ConsumeLogin(t.Context(), a.StateHash, a.BrowserHash, a.Provider, time.Now())
			results <- err
		})
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else if !errors.Is(err, domain.ErrNotFound) {
			t.Fatal(err)
		}
	}
	if successes != 1 {
		t.Fatalf("consumed %d times", successes)
	}
}

type provider struct{}

func (provider) AuthorizationURL(state, nonce, verifier string) string {
	return "https://provider.example/auth?state=" + state
}

func (provider) Authenticate(_ context.Context, code, nonce, verifier string) (domain.Identity, error) {
	return profile(code), nil
}

func TestHTTPLoginSessionAndLogout(t *testing.T) {
	db := database(t)
	r := identitypostgres.NewRepository(db)
	policy, err := organizations.Parse(strings.NewReader(`{"version":1,"organizations":[{"id":"campus","name":"Campus","match":{"verifiedEmailDomain":"example.com"},"capabilities":["ideas.read_internal"]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	s := identity.NewService(r, db, map[domain.Provider]identity.Provider{domain.Google: provider{}}, identity.WithMembershipPolicy(policy))
	h, err := identityhttp.NewHandler(s, slog.New(slog.NewTextHandler(io.Discard, nil)), "https://fantasm.example")
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	h.Register(mux)
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/google/login", nil))
	if w.Code != http.StatusFound {
		t.Fatalf("begin login: %d %s", w.Code, w.Body.String())
	}
	u, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	callback := "/api/auth/google/callback?code=subject&state=" + u.Query().Get("state")
	request := httptest.NewRequest(http.MethodGet, callback, nil)
	for _, cookie := range w.Result().Cookies() {
		request.AddCookie(cookie)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, request)
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "https://fantasm.example/" {
		t.Fatalf("complete login: %d %s", w.Code, w.Body.String())
	}
	var session *http.Cookie
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == "__Host-fantasm_session" {
			session = cookie
		}
	}
	if session == nil || !session.Secure || !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.Domain != "" || session.Path != "/" {
		t.Fatalf("invalid session cookie: %+v", session)
	}
	var hash string
	if err := db.Querier(t.Context()).QueryRow(t.Context(), "SELECT token_hash FROM sessions").Scan(&hash); err != nil || hash == session.Value || len(hash) != 64 {
		t.Fatalf("invalid stored token: %v", err)
	}
	me := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	me.AddCookie(session)
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, me)
	if w.Code != http.StatusOK || strings.Contains(w.Body.String(), session.Value) {
		t.Fatalf("current user: %d %s", w.Code, w.Body.String())
	}
	var current struct {
		Memberships []domain.Membership `json:"memberships"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &current); err != nil || len(current.Memberships) != 1 || current.Memberships[0].OrganizationID != "campus" {
		t.Fatalf("HTTP memberships: %s, %v", w.Body.String(), err)
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE users SET email = 'edited@other.example'`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, me)
	if err := json.Unmarshal(w.Body.Bytes(), &current); err != nil || len(current.Memberships) != 1 {
		t.Fatal("editable user email changed membership")
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE external_identities SET email_verified = false`); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, me)
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &current) != nil || len(current.Memberships) != 0 {
		t.Fatalf("stale HTTP membership: %s", w.Body.String())
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, request)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("callback replay: %d", w.Code)
	}
	logout := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logout.AddCookie(session)
	logout.Header.Set("Origin", "https://fantasm.example")
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, logout)
	if w.Code != http.StatusNoContent {
		t.Fatalf("logout: %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, me)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("revoked session: %d", w.Code)
	}
}

func TestFailedSessionRollsBackNewUser(t *testing.T) {
	db := database(t)
	r := identitypostgres.NewRepository(db)
	s := identity.NewService(r, db, map[domain.Provider]identity.Provider{domain.Google: provider{}})
	if _, err := db.Querier(t.Context()).Exec(t.Context(), "ALTER TABLE sessions ADD CONSTRAINT reject_test_sessions CHECK (false) NOT VALID"); err != nil {
		t.Fatal(err)
	}
	login, err := s.BeginLogin(t.Context(), domain.Google)
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(login.URL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CompleteLogin(t.Context(), domain.Google, u.Query().Get("state"), login.BrowserToken, "new-subject", ""); err == nil {
		t.Fatal("expected session failure")
	}
	for _, table := range []string{"users", "external_identities", "sessions", "login_attempts"} {
		var count int
		if err := db.Querier(t.Context()).QueryRow(t.Context(), "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("%s count = %d, error = %v", table, count, err)
		}
	}
}

func TestSessionUsesCurrentRoleAndExpiry(t *testing.T) {
	db := database(t)
	r := identitypostgres.NewRepository(db)
	u, err := r.UpsertUser(t.Context(), profile("subject"), candidate(1))
	if err != nil {
		t.Fatal(err)
	}
	session := domain.Session{TokenHash: strings.Repeat("a", 64), UserID: u.ID, ExpiresAt: time.Now().Add(time.Hour).Truncate(time.Microsecond)}
	if err := r.CreateSession(t.Context(), session); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE users SET role = 'MODERATOR' WHERE id = $1`, u.ID); err != nil {
		t.Fatal(err)
	}
	u, err = r.UserBySession(t.Context(), session.TokenHash, time.Now())
	if err != nil || u.Role != domain.ModeratorRole {
		t.Fatalf("stale session privileges: %+v %v", u, err)
	}
	if _, err := r.UserBySession(t.Context(), session.TokenHash, session.ExpiresAt); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("expired session accepted: %v", err)
	}
}

func TestIdentityEvidenceRefresh(t *testing.T) {
	db := database(t)
	r := identitypostgres.NewRepository(db)
	external := profile("subject")
	user, err := r.UpsertUser(t.Context(), external, candidate(1))
	if err != nil {
		t.Fatal(err)
	}
	evidence, err := r.IdentitiesByUser(t.Context(), user.ID)
	if err != nil || len(evidence) != 1 || evidence[0].Email != external.Email || !evidence[0].EmailVerified {
		t.Fatalf("evidence: %+v, %v", evidence, err)
	}
	external.Email = "new@other.example"
	external.EmailVerified = false
	if _, err := r.UpsertUser(t.Context(), external, candidate(2)); err != nil {
		t.Fatal(err)
	}
	evidence, err = r.IdentitiesByUser(t.Context(), user.ID)
	if err != nil || len(evidence) != 1 || evidence[0].Email != external.Email || evidence[0].EmailVerified {
		t.Fatalf("stale evidence: %+v, %v", evidence, err)
	}
}

func TestLegacyRestrictedIdeasKeepOrganizationScope(t *testing.T) {
	db := databaseWithSetup(t, func(db *postgres.DB, migration string) {
		if migration != "000008_university_agnostic.up.sql" {
			return
		}
		_, err := db.Querier(t.Context()).Exec(t.Context(), `
   INSERT INTO users (id, handle, name, email) VALUES ('00000000-0000-4000-8000-000000000001', 'legacy', 'Legacy', 'legacy@example.com');
   INSERT INTO ideas (id, author_id, slug, title, category, visibility) VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'legacy', 'Legacy', 'PROJECT', 'UKMA_ONLY');
  `)
		if err != nil {
			t.Fatal(err)
		}
	})
	var visibility, organization string
	if err := db.Querier(t.Context()).QueryRow(t.Context(), `SELECT visibility, organization_id FROM ideas WHERE slug = 'legacy'`).Scan(&visibility, &organization); err != nil || visibility != "ORGANIZATION_ONLY" || organization != "naukma" {
		t.Fatalf("legacy scope = %s/%s, %v", visibility, organization, err)
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE ideas SET organization_id = NULL WHERE slug = 'legacy'`); err == nil {
		t.Fatal("restricted idea accepted without organization")
	}
	if _, err := db.Querier(t.Context()).Exec(t.Context(), `UPDATE ideas SET visibility = 'PUBLIC' WHERE slug = 'legacy'`); err == nil {
		t.Fatal("public idea retained organization restriction")
	}
}
