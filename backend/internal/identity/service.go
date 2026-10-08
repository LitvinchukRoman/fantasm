package identity

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"maps"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

const (
	LoginTTL = 10 * time.Minute
	// SessionTTL is the default absolute lifetime of a session; SessionIdleTTL
	// ends it earlier when the browser stays away. Both are overridable with WithSessionPolicy.
	SessionTTL     = 30 * 24 * time.Hour
	SessionIdleTTL = 7 * 24 * time.Hour

	// lastSeenInterval throttles the idle-clock write so reads stay reads.
	lastSeenInterval = 5 * time.Minute
)

type Repository interface {
	CreateLogin(context.Context, domain.LoginAttempt) error
	ConsumeLogin(context.Context, string, string, domain.Provider, time.Time) (domain.LoginAttempt, error)
	// UpsertUser creates the user on first login with the first free handle
	// from handles, falling back to candidate.Handle, which is always unique.
	UpsertUser(ctx context.Context, external domain.Identity, candidate domain.User, handles []string) (domain.User, error)
	CreateSession(context.Context, domain.Session) error
	// UserBySession finds the owner of a live session: not past its absolute
	// expiry (now) and seen since idleCutoff.
	UserBySession(ctx context.Context, tokenHash string, now, idleCutoff time.Time) (domain.User, error)
	// TouchSession moves the idle clock forward when it is older than staleBefore.
	TouchSession(ctx context.Context, tokenHash string, now, staleBefore time.Time) error
	DeleteSession(context.Context, string) error
	IdentitiesByUser(context.Context, string) ([]domain.Identity, error)

	AccountRepository
}

// ClientInfo is coarse request metadata stored with a session.
type ClientInfo struct {
	IPHash    string
	UserAgent string
}

type clientKey struct{}

// WithClient attaches request metadata for CompleteLogin to record.
func WithClient(ctx context.Context, c ClientInfo) context.Context {
	return context.WithValue(ctx, clientKey{}, c)
}

func clientFrom(ctx context.Context) ClientInfo {
	c, _ := ctx.Value(clientKey{}).(ClientInfo)
	return c
}

type Transactor interface {
	WithinTx(context.Context, func(context.Context) error) error
}

type Provider interface {
	AuthorizationURL(state, nonce, verifier string) string
	Authenticate(ctx context.Context, code, nonce, verifier string) (domain.Identity, error)
}

type MembershipPolicy interface {
	Evaluate([]domain.Identity) []domain.Membership
}

type Service struct {
	membershipPolicy MembershipPolicy
	repository       Repository
	transactions     Transactor
	providers        map[domain.Provider]Provider
	now              func() time.Time
	sessionTTL       time.Duration
	sessionIdleTTL   time.Duration
}

func NewService(repository Repository, transactions Transactor, providers map[domain.Provider]Provider, options ...func(*Service)) *Service {
	service := &Service{
		repository:   repository,
		transactions: transactions,
		providers:    maps.Clone(providers),
		now:          time.Now,

		sessionTTL:     SessionTTL,
		sessionIdleTTL: SessionIdleTTL,
	}
	for _, option := range options {
		option(service)
	}
	return service
}

// WithSessionPolicy sets the absolute and idle lifetimes of new sessions.
func WithSessionPolicy(absolute, idle time.Duration) func(*Service) {
	return func(s *Service) { s.sessionTTL, s.sessionIdleTTL = absolute, idle }
}

func WithMembershipPolicy(policy MembershipPolicy) func(*Service) {
	return func(s *Service) { s.membershipPolicy = policy }
}

type Login struct {
	URL          string
	BrowserToken string
	ExpiresAt    time.Time
}

func (s *Service) BeginLogin(ctx context.Context, providerName domain.Provider) (Login, error) {
	provider, ok := s.providers[providerName]
	if !ok {
		return Login{}, apperr.NotFound("login provider not available")
	}
	state, browserToken, nonce, verifier := randomToken(), randomToken(), randomToken(), randomToken()
	expiresAt := s.now().Add(LoginTTL)
	attempt := domain.LoginAttempt{
		StateHash: hashToken(state), BrowserHash: hashToken(browserToken),
		Provider: providerName, Nonce: nonce, Verifier: verifier, ExpiresAt: expiresAt,
	}
	if err := s.repository.CreateLogin(ctx, attempt); err != nil {
		return Login{}, fmt.Errorf("create login attempt: %w", err)
	}
	return Login{URL: provider.AuthorizationURL(state, nonce, verifier), BrowserToken: browserToken, ExpiresAt: expiresAt}, nil
}

type Authentication struct {
	User      domain.User
	Token     string
	ExpiresAt time.Time
}

func (s *Service) CompleteLogin(ctx context.Context, providerName domain.Provider, state, browserToken, code, previousToken string) (Authentication, error) {
	provider, ok := s.providers[providerName]
	if !ok {
		return Authentication{}, apperr.NotFound("login provider not available")
	}
	if !validToken(state) || !validToken(browserToken) || code == "" || len(code) > 8192 {
		return Authentication{}, apperr.Unauthorized("invalid login attempt")
	}
	attempt, err := s.repository.ConsumeLogin(ctx, hashToken(state), hashToken(browserToken), providerName, s.now())
	if errors.Is(err, domain.ErrNotFound) {
		return Authentication{}, apperr.Unauthorized("login attempt expired or already used")
	}
	if err != nil {
		return Authentication{}, fmt.Errorf("consume login attempt: %w", err)
	}
	external, err := provider.Authenticate(ctx, code, attempt.Nonce, attempt.Verifier)
	if err != nil {
		return Authentication{}, fmt.Errorf("authenticate provider: %w", err)
	}
	if external.Provider != providerName || external.Validate() != nil {
		return Authentication{}, apperr.Unauthorized("invalid provider identity")
	}
	now := s.now().UTC()
	id := randomID()
	candidate := domain.User{
		ID: id, Handle: "u_" + strings.ReplaceAll(id, "-", ""),
		Name: domain.CleanName(external.Name), Email: external.Email, AvatarURL: external.AvatarURL,
		Role:      domain.UserRole,
		CreatedAt: now, UpdatedAt: now,
	}
	if candidate.Name == "" {
		candidate.Name = candidate.Handle
	}
	client := clientFrom(ctx)
	auth := Authentication{Token: randomToken(), ExpiresAt: now.Add(s.sessionTTL)}
	err = s.transactions.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		auth.User, err = s.repository.UpsertUser(ctx, external, candidate, domain.HandleCandidates(external.Name))
		if err != nil {
			return fmt.Errorf("save user: %w", err)
		}
		if err := s.resolveMemberships(ctx, &auth.User); err != nil {
			return err
		}
		if validToken(previousToken) {
			if err := s.repository.DeleteSession(ctx, hashToken(previousToken)); err != nil {
				return fmt.Errorf("rotate session: %w", err)
			}
		}
		if err := s.repository.CreateSession(ctx, domain.Session{
			TokenHash: hashToken(auth.Token), UserID: auth.User.ID, ExpiresAt: auth.ExpiresAt,
			UserAgent: client.UserAgent, IPHash: client.IPHash,
		}); err != nil {
			return fmt.Errorf("create session: %w", err)
		}
		return nil
	})
	if err != nil {
		return Authentication{}, err
	}
	return auth, nil
}

func (s *Service) CurrentUser(ctx context.Context, token string) (domain.User, error) {
	if !validToken(token) {
		return domain.User{}, apperr.Unauthorized("authentication required")
	}
	now := s.now()
	user, err := s.repository.UserBySession(ctx, hashToken(token), now, now.Add(-s.sessionIdleTTL))
	if errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, apperr.Unauthorized("session expired or revoked")
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("find session user: %w", err)
	}
	// Best effort: a failed idle-clock write must not log the user out.
	_ = s.repository.TouchSession(ctx, hashToken(token), now, now.Add(-lastSeenInterval))
	if err := s.resolveMemberships(ctx, &user); err != nil {
		return domain.User{}, err
	}
	return user, nil
}

func (s *Service) resolveMemberships(ctx context.Context, user *domain.User) error {
	user.Memberships = []domain.Membership{}
	if s.membershipPolicy == nil {
		return nil
	}
	identities, err := s.repository.IdentitiesByUser(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("load membership evidence: %w", err)
	}
	user.Memberships = s.membershipPolicy.Evaluate(identities)
	return nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	if !validToken(token) {
		return nil
	}
	if err := s.repository.DeleteSession(ctx, hashToken(token)); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

func randomToken() string {
	var value [32]byte
	_, _ = rand.Read(value[:])
	return base64.RawURLEncoding.EncodeToString(value[:])
}

func validToken(token string) bool {
	if len(token) != 43 {
		return false
	}
	value, err := base64.RawURLEncoding.Strict().DecodeString(token)
	return err == nil && len(value) == 32
}

func hashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

func randomID() string {
	var value [16]byte
	_, _ = rand.Read(value[:])
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", value[:4], value[4:6], value[6:8], value[8:10], value[10:])
}

func (s *Service) AvailableProviders() []domain.Provider {
	providers := []domain.Provider{}
	for _, name := range []domain.Provider{domain.Google, domain.Entra} {
		if _, ok := s.providers[name]; ok {
			providers = append(providers, name)
		}
	}
	return providers
}

func (s *Service) Providers() []domain.Provider {
	list := make([]domain.Provider, 0, len(s.providers))
	for p := range s.providers {
		list = append(list, p)
	}
	return list
}
