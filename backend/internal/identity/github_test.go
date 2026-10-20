package identity

import (
	"context"
	"errors"
	"net/url"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type fakeGitHub struct {
	account domain.GitHubAccount
	calls   int
}

func (g *fakeGitHub) AuthorizationURL(state, verifier string) string {
	return "https://github.example/authorize?" + url.Values{"state": {state}}.Encode()
}

func (g *fakeGitHub) Account(_ context.Context, code, verifier string) (domain.GitHubAccount, error) {
	g.calls++
	if code != "code" || verifier == "" {
		return domain.GitHubAccount{}, errors.New("invalid test code")
	}
	return g.account, nil
}

func beginLink(t *testing.T, s *Service, userID string) (Login, string) {
	t.Helper()
	login, err := s.BeginGitHubLink(t.Context(), userID)
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(login.URL)
	if err != nil {
		t.Fatal(err)
	}
	return login, u.Query().Get("state")
}

func TestGitHubLink(t *testing.T) {
	s, r, p := testService()
	g := &fakeGitHub{account: domain.GitHubAccount{ID: 583231, Login: "Octo-Cat"}}
	WithGitHub(g)(s)
	me := signIn(t, s, "").User
	p.profile.Subject, p.profile.Email = "someone-else", "other@example.com"
	other := signIn(t, s, "").User

	login, state := beginLink(t, s, me.ID)
	for name, tc := range map[string]struct{ user, browser string }{
		"another user's session": {other.ID, login.BrowserToken},
		"another browser":        {me.ID, randomToken()},
	} {
		if _, err := s.CompleteGitHubLink(t.Context(), tc.user, state, tc.browser, "code"); apperr.KindOf(err) != apperr.KindUnauthorized {
			t.Errorf("%s: err = %v, want unauthorized", name, err)
		}
	}
	if g.calls != 0 {
		t.Fatalf("GitHub was asked %d times for a callback that was not ours", g.calls)
	}

	user, err := s.CompleteGitHubLink(t.Context(), me.ID, state, login.BrowserToken, "code")
	if err != nil || user.GitHub != "Octo-Cat" || r.githubIDs[me.ID] != 583231 {
		t.Fatalf("link: %+v, %v", user, err)
	}
	if _, err := s.CompleteGitHubLink(t.Context(), me.ID, state, login.BrowserToken, "code"); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Errorf("replayed callback: err = %v", err)
	}

	login, state = beginLink(t, s, other.ID)
	if _, err := s.CompleteGitHubLink(t.Context(), other.ID, state, login.BrowserToken, "code"); apperr.KindOf(err) != apperr.KindConflict {
		t.Errorf("same GitHub on a second profile: err = %v, want conflict", err)
	}

	g.account = domain.GitHubAccount{ID: 9, Login: "../admin"}
	login, state = beginLink(t, s, other.ID)
	if _, err := s.CompleteGitHubLink(t.Context(), other.ID, state, login.BrowserToken, "code"); err == nil {
		t.Error("a malformed login from GitHub was stored")
	}

	if user, err := s.UnlinkGitHub(t.Context(), me.ID); err != nil || user.GitHub != "" || r.githubIDs[me.ID] != 0 {
		t.Fatalf("unlink: %+v, %v", user, err)
	}
}

func TestGitHubLinkWithoutAnApp(t *testing.T) {
	s, _, _ := testService()
	me := signIn(t, s, "").User
	if _, err := s.BeginGitHubLink(t.Context(), me.ID); apperr.KindOf(err) != apperr.KindNotFound {
		t.Fatalf("begin: err = %v, want not found", err)
	}
	if _, err := s.CompleteGitHubLink(t.Context(), me.ID, randomToken(), randomToken(), "code"); apperr.KindOf(err) != apperr.KindNotFound {
		t.Fatalf("complete: err = %v, want not found", err)
	}
}
