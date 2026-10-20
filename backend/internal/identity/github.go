package identity

import (
	"context"
	"errors"
	"fmt"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// GitHub is the GitHub App the user authorizes so that GitHub itself vouches
// for the account on their profile. It is not a way to sign in.
type GitHub interface {
	AuthorizationURL(state, verifier string) string
	// Account exchanges the authorization code and returns who signed in to GitHub.
	Account(ctx context.Context, code, verifier string) (domain.GitHubAccount, error)
}

// WithGitHub enables linking GitHub accounts to profiles.
func WithGitHub(g GitHub) func(*Service) {
	return func(s *Service) { s.github = g }
}

// BeginGitHubLink starts the flow for a signed-in user. The returned browser
// token must come back with the callback, from the same browser.
func (s *Service) BeginGitHubLink(ctx context.Context, userID string) (Login, error) {
	if s.github == nil {
		return Login{}, apperr.NotFound("GitHub linking is not configured")
	}
	state, browserToken, verifier := randomToken(), randomToken(), randomToken()
	expiresAt := s.now().Add(LoginTTL)
	if err := s.repository.CreateGitHubLink(ctx, domain.GitHubLinkAttempt{
		StateHash: hashToken(state), BrowserHash: hashToken(browserToken), UserID: userID, Verifier: verifier, ExpiresAt: expiresAt,
	}); err != nil {
		return Login{}, fmt.Errorf("create github link attempt: %w", err)
	}
	return Login{URL: s.github.AuthorizationURL(state, verifier), BrowserToken: browserToken, ExpiresAt: expiresAt}, nil
}

// CompleteGitHubLink finishes the flow. The attempt must belong to this user and
// this browser, so a callback URL planted on someone else links nothing.
func (s *Service) CompleteGitHubLink(ctx context.Context, userID, state, browserToken, code string) (domain.User, error) {
	if s.github == nil {
		return domain.User{}, apperr.NotFound("GitHub linking is not configured")
	}
	if !validToken(state) || !validToken(browserToken) || code == "" || len(code) > 8192 {
		return domain.User{}, apperr.Unauthorized("invalid GitHub link attempt")
	}
	attempt, err := s.repository.ConsumeGitHubLink(ctx, hashToken(state), hashToken(browserToken), userID, s.now())
	if errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, apperr.Unauthorized("GitHub link attempt expired or already used")
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("consume github link attempt: %w", err)
	}
	account, err := s.github.Account(ctx, code, attempt.Verifier)
	if err != nil {
		return domain.User{}, fmt.Errorf("github account: %w", err)
	}
	if err := account.Validate(); err != nil {
		return domain.User{}, fmt.Errorf("github account: %w", err)
	}
	user, err := s.repository.SetGitHub(ctx, userID, &account, s.now().UTC())
	if errors.Is(err, domain.ErrGitHubTaken) {
		return domain.User{}, apperr.Conflict("this GitHub account is linked to another profile")
	}
	return s.accountResult(ctx, user, err, "link github")
}

func (s *Service) UnlinkGitHub(ctx context.Context, userID string) (domain.User, error) {
	user, err := s.repository.SetGitHub(ctx, userID, nil, s.now().UTC())
	return s.accountResult(ctx, user, err, "unlink github")
}
