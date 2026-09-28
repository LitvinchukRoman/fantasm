package identity

import (
	"context"
	"errors"
	"maps"
	"net/url"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type memoryRepository struct {
	logins      map[string]domain.LoginAttempt
	users       map[string]domain.User
	sessions    map[string]domain.Session
	failSession bool
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{logins: make(map[string]domain.LoginAttempt), users: make(map[string]domain.User), sessions: make(map[string]domain.Session)}
}

func (r *memoryRepository) CreateLogin(_ context.Context, attempt domain.LoginAttempt) error {
	r.logins[attempt.StateHash] = attempt
	return nil
}

func (r *memoryRepository) ConsumeLogin(_ context.Context, state, browser string, provider domain.Provider, now time.Time) (domain.LoginAttempt, error) {
	a, ok := r.logins[state]
	if !ok || a.BrowserHash != browser || a.Provider != provider || !a.ExpiresAt.After(now) {
		return domain.LoginAttempt{}, domain.ErrNotFound
	}
	delete(r.logins, state)
	return a, nil
}

func (r *memoryRepository) UpsertUser(_ context.Context, external domain.Identity, candidate domain.User) (domain.User, error) {
	key := external.Issuer + "|" + external.Subject
	if existing, ok := r.users[key]; ok {
		existing.Email = candidate.Email
		existing.Affiliation = candidate.Affiliation
		r.users[key] = existing
		return existing, nil
	}
	r.users[key] = candidate
	return candidate, nil
}

func (r *memoryRepository) CreateSession(_ context.Context, session domain.Session) error {
	if r.failSession {
		return errors.New("database unavailable")
	}
	r.sessions[session.TokenHash] = session
	return nil
}

func (r *memoryRepository) UserBySession(_ context.Context, hash string, now time.Time) (domain.User, error) {
	s, ok := r.sessions[hash]
	if ok && s.ExpiresAt.After(now) {
		for _, user := range r.users {
			if user.ID == s.UserID {
				return user, nil
			}
		}
	}
	return domain.User{}, domain.ErrNotFound
}

func (r *memoryRepository) DeleteSession(_ context.Context, hash string) error {
	delete(r.sessions, hash)
	return nil
}

func (r *memoryRepository) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	users, sessions := maps.Clone(r.users), maps.Clone(r.sessions)
	if err := fn(ctx); err != nil {
		r.users, r.sessions = users, sessions
		return err
	}
	return nil
}

type fakeProvider struct {
	profile domain.Identity
	err     error
	calls   int
}

func (p *fakeProvider) AuthorizationURL(state, nonce, verifier string) string {
	return "https://provider.example/auth?" + url.Values{"state": {state}, "nonce": {nonce}, "verifier": {verifier}}.Encode()
}

func (p *fakeProvider) Authenticate(_ context.Context, code, nonce, verifier string) (domain.Identity, error) {
	p.calls++
	if code != "code" || nonce == "" || verifier == "" {
		return domain.Identity{}, errors.New("invalid test authentication")
	}
	return p.profile, p.err
}

func testService() (*Service, *memoryRepository, *fakeProvider) {
	r := newMemoryRepository()
	p := &fakeProvider{profile: domain.Identity{Provider: domain.Google, Issuer: "https://accounts.google.com", Subject: "subject", Email: "student@ukma.edu.ua", EmailVerified: true, Name: "Student"}}
	s := NewService(r, r, map[domain.Provider]Provider{domain.Google: p}, "tenant")
	s.now = func() time.Time { return time.Date(2026, 9, 29, 12, 0, 0, 0, time.UTC) }
	return s, r, p
}

func begin(t *testing.T, s *Service) (Login, string) {
	t.Helper()
	login, err := s.BeginLogin(t.Context(), domain.Google)
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(login.URL)
	if err != nil {
		t.Fatal(err)
	}
	return login, u.Query().Get("state")
}

func signIn(t *testing.T, s *Service, previous string) Authentication {
	t.Helper()
	login, state := begin(t, s)
	auth, err := s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", previous)
	if err != nil {
		t.Fatal(err)
	}
	return auth
}

func TestSessionLifecycle(t *testing.T) {
	s, r, _ := testService()
	auth := signIn(t, s, "")
	if auth.User.Affiliation != domain.External || auth.User.Role != domain.UserRole {
		t.Fatalf("unexpected privileges: %+v", auth.User)
	}
	if _, exists := r.sessions[auth.Token]; exists {
		t.Fatal("raw token persisted")
	}
	if r.sessions[hashToken(auth.Token)].UserID != auth.User.ID {
		t.Fatal("hashed session missing")
	}
	user, err := s.CurrentUser(t.Context(), auth.Token)
	if err != nil || user.ID != auth.User.ID {
		t.Fatalf("current user: %+v, %v", user, err)
	}
	second := signIn(t, s, auth.Token)
	if second.User.ID != auth.User.ID || second.Token == auth.Token {
		t.Fatal("login must preserve user identity and rotate session")
	}
	if _, err := s.CurrentUser(t.Context(), auth.Token); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("old session accepted: %v", err)
	}
	if err := s.Logout(t.Context(), second.Token); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CurrentUser(t.Context(), second.Token); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("revoked session accepted: %v", err)
	}
	if err := s.Logout(t.Context(), second.Token); err != nil {
		t.Fatal(err)
	}
}

func TestLoginRejectsWrongBrowserAndReplay(t *testing.T) {
	s, _, provider := testService()
	login, state := begin(t, s)
	_, err := s.CompleteLogin(t.Context(), domain.Google, state, randomToken(), "code", "")
	if apperr.KindOf(err) != apperr.KindUnauthorized || provider.calls != 0 {
		t.Fatalf("wrong browser accepted: %v", err)
	}
	if _, err := s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", ""); err != nil {
		t.Fatal(err)
	}
	_, err = s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", "")
	if apperr.KindOf(err) != apperr.KindUnauthorized || provider.calls != 1 {
		t.Fatalf("replay accepted: %v", err)
	}
}

func TestExpiryBoundaries(t *testing.T) {
	s, _, _ := testService()
	login, state := begin(t, s)
	s.now = func() time.Time { return login.ExpiresAt }
	_, err := s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", "")
	if apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("expired login accepted: %v", err)
	}
	auth := signIn(t, s, "")
	s.now = func() time.Time { return auth.ExpiresAt }
	if _, err := s.CurrentUser(t.Context(), auth.Token); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("expired session accepted: %v", err)
	}
}

func TestFailedSessionRollsBackUserAndRotation(t *testing.T) {
	s, r, provider := testService()
	first := signIn(t, s, "")
	provider.profile.Subject = "second-subject"
	r.failSession = true
	login, state := begin(t, s)
	if _, err := s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", first.Token); err == nil {
		t.Fatal("expected session creation failure")
	}
	if len(r.users) != 1 || len(r.sessions) != 1 {
		t.Fatal("partial transaction persisted")
	}
	if _, err := s.CurrentUser(t.Context(), first.Token); err != nil {
		t.Fatalf("previous session lost: %v", err)
	}
}

func TestMatchingEmailDoesNotLinkAccounts(t *testing.T) {
	s, r, provider := testService()
	first := signIn(t, s, "")
	provider.profile.Subject = "other-subject"
	second := signIn(t, s, "")
	if first.User.ID == second.User.ID || len(r.users) != 2 {
		t.Fatal("different subjects merged by email")
	}
}

func TestProviderFailureCreatesNoSession(t *testing.T) {
	s, r, provider := testService()
	provider.err = apperr.Unauthorized("invalid signature")
	login, state := begin(t, s)
	if _, err := s.CompleteLogin(t.Context(), domain.Google, state, login.BrowserToken, "code", ""); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(r.users) != 0 || len(r.sessions) != 0 || len(r.logins) != 0 {
		t.Fatal("failed authentication persisted credentials or reusable state")
	}
}
