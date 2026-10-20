package domain

import (
	"errors"
	"regexp"
	"time"
)

// ErrGitHubTaken means the GitHub account already backs another profile.
var ErrGitHubTaken = errors.New("github account is linked to another user")

// GitHubAccount is the account GitHub confirmed the user signed in to. ID is
// stable across renames; Login is what the profile shows.
type GitHubAccount struct {
	ID    int64
	Login string
}

var githubLogin = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9]|-[A-Za-z0-9]){0,38}$`)

// Validate keeps a malformed answer from GitHub out of the profile and its URL.
func (a GitHubAccount) Validate() error {
	if a.ID <= 0 || !githubLogin.MatchString(a.Login) {
		return errors.New("invalid GitHub account")
	}
	return nil
}

// GitHubLinkAttempt is a started "connect GitHub" flow, bound to the user and
// the browser that started it.
type GitHubLinkAttempt struct {
	StateHash   string
	BrowserHash string
	UserID      string
	Verifier    string
	ExpiresAt   time.Time
}
