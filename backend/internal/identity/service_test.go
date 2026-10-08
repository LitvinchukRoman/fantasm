package identity

import (
	"context"
	"errors"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"maps"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type memoryRepository struct {
	identities  map[string]domain.Identity
	logins      map[string]domain.LoginAttempt
	users       map[string]domain.User
	sessions    map[string]domain.Session
	failSession bool
	seen        map[string]time.Time
}

func newMemoryRepository() *memoryRepository {
	return &memoryRepository{identities: make(map[string]domain.Identity), logins: make(map[string]domain.LoginAttempt), users: make(map[string]domain.User), sessions: make(map[string]domain.Session), seen: make(map[string]time.Time)}
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

func (r *memoryRepository) UpsertUser(_ context.Context, external domain.Identity, candidate domain.User, handles []string) (domain.User, error) {
	key := external.Issuer + "|" + external.Subject
	r.identities[key] = external
	if existing, ok := r.users[key]; ok {
		existing.Email = candidate.Email
		r.users[key] = existing
		return existing, nil
	}
	taken := map[string]bool{}
	for _, u := range r.users {
		taken[u.Handle] = true
	}
	for _, h := range handles {
		if !taken[h] {
			candidate.Handle = h
			break
		}
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

func (r *memoryRepository) UserBySession(_ context.Context, hash string, now, idleCutoff time.Time) (domain.User, error) {
	s, ok := r.sessions[hash]
	if ok && s.ExpiresAt.After(now) && (r.seen[hash].IsZero() || r.seen[hash].After(idleCutoff)) {
		for _, user := range r.users {
			if user.ID == s.UserID {
				return user, nil
			}
		}
	}
	return domain.User{}, domain.ErrNotFound
}

func (r *memoryRepository) TouchSession(_ context.Context, hash string, now, staleBefore time.Time) error {
	if _, ok := r.sessions[hash]; ok && (r.seen[hash].IsZero() || r.seen[hash].Before(staleBefore)) {
		r.seen[hash] = now
	}
	return nil
}

func (r *memoryRepository) UpdateProfile(context.Context, string, domain.ProfileUpdate, time.Time) (domain.User, error) {
	return domain.User{}, errors.New("not implemented")
}

func (r *memoryRepository) UserByHandle(context.Context, string) (domain.User, error) {
	return domain.User{}, domain.ErrNotFound
}

func (r *memoryRepository) SetRole(context.Context, string, domain.Role, time.Time) (domain.User, error) {
	return domain.User{}, errors.New("not implemented")
}

func (r *memoryRepository) ListSessions(context.Context, string, time.Time, time.Time) ([]domain.SessionInfo, error) {
	return nil, nil
}

func (r *memoryRepository) DeleteSessionByID(context.Context, string, string) (bool, error) {
	return false, nil
}

func (r *memoryRepository) DeleteUserSessions(_ context.Context, userID string) error {
	for hash, s := range r.sessions {
		if s.UserID == userID {
			delete(r.sessions, hash)
		}
	}
	return nil
}

func (r *memoryRepository) IdentitiesByUsers(context.Context, []string) (map[string][]domain.Identity, error) {
	return nil, nil
}

func (r *memoryRepository) PurgeExpired(context.Context, time.Time, time.Time) (int64, error) {
	return 0, nil
}

func (r *memoryRepository) DeleteSession(_ context.Context, hash string) error {
	delete(r.sessions, hash)
	return nil
}

func (r *memoryRepository) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	users, sessions, identities := maps.Clone(r.users), maps.Clone(r.sessions), maps.Clone(r.identities)
	if err := fn(ctx); err != nil {
		r.users, r.sessions, r.identities = users, sessions, identities
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
	p := &fakeProvider{profile: domain.Identity{Provider: domain.Google, Issuer: "https://accounts.google.com", Subject: "subject", Email: "person@example.com", EmailVerified: true, Name: "Student"}}
	s := NewService(r, r, map[domain.Provider]Provider{domain.Google: p})
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
	if auth.User.Role != domain.UserRole {
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

func (r *memoryRepository) IdentitiesByUser(_ context.Context, id string) ([]domain.Identity, error) {
	identities := []domain.Identity{}
	for key, user := range r.users {
		if user.ID == id {
			identities = append(identities, r.identities[key])
		}
	}
	return identities, nil
}

func TestMembershipRefreshAndPolicyRevocation(t *testing.T) {
	s, repository, provider := testService()
	policy, err := organizations.Parse(strings.NewReader(`{"version":1,"organizations":[{"id":"campus","name":"Campus","match":{"verifiedEmailDomain":"example.com"},"capabilities":["ideas.read_internal"]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	s.membershipPolicy = policy
	auth := signIn(t, s, "")
	if !auth.User.Can("campus", "ideas.read_internal") || auth.User.Role != domain.UserRole {
		t.Fatalf("membership at login: %+v", auth.User)
	}
	user, err := s.CurrentUser(t.Context(), auth.Token)
	if err != nil || !user.Can("campus", "ideas.read_internal") {
		t.Fatalf("membership in session: %+v, %v", user, err)
	}
	empty, err := organizations.Parse(strings.NewReader(`{"version":1,"organizations":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	restarted := NewService(repository, repository, nil, WithMembershipPolicy(empty))
	restarted.now = s.now
	user, err = restarted.CurrentUser(t.Context(), auth.Token)
	if err != nil || len(user.Memberships) != 0 {
		t.Fatalf("stale membership after rules changed: %+v, %v", user, err)
	}
	provider.profile.EmailVerified = false
	refreshed := signIn(t, s, "")
	if len(refreshed.User.Memberships) != 0 {
		t.Fatal("unverified evidence retained membership")
	}
	user, err = s.CurrentUser(t.Context(), auth.Token)
	if err != nil || len(user.Memberships) != 0 {
		t.Fatalf("old session retained revoked membership: %+v, %v", user, err)
	}
}

func TestAvailableProviders(t *testing.T) {
	s, _, _ := testService()
	providers := s.AvailableProviders()
	if len(providers) != 1 || providers[0] != domain.Google {
		t.Fatalf("providers: %v", providers)
	}
	s.providers[domain.Entra] = &fakeProvider{}
	providers = s.AvailableProviders()
	if len(providers) != 2 || providers[0] != domain.Google || providers[1] != domain.Entra {
		t.Fatalf("providers: %v", providers)
	}
}
