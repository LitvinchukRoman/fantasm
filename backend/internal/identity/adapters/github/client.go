// Package github is the GitHub App that lets a user prove which GitHub account
// is theirs. The app asks for no permissions: it only reads who signed in.
package github

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/oauth2"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
)

const (
	DefaultWebURL = "https://github.com"
	DefaultAPIURL = "https://api.github.com"
)

type Config struct {
	ClientID, ClientSecret string
	// RedirectURL must be one of the app's callback URLs.
	RedirectURL string
	// WebURL and APIURL point at GitHub; tests point them at a fake.
	WebURL, APIURL string
}

type Client struct {
	oauth  oauth2.Config
	api    string
	client *http.Client
}

func NewClient(cfg Config) *Client {
	web := strings.TrimSuffix(cfg.WebURL, "/")
	return &Client{
		oauth: oauth2.Config{
			ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, RedirectURL: cfg.RedirectURL,
			Endpoint: oauth2.Endpoint{AuthURL: web + "/login/oauth/authorize", TokenURL: web + "/login/oauth/access_token", AuthStyle: oauth2.AuthStyleInParams},
		},
		api:    strings.TrimSuffix(cfg.APIURL, "/"),
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) AuthorizationURL(state, verifier string) string {
	return c.oauth.AuthCodeURL(state, oauth2.S256ChallengeOption(verifier))
}

func (c *Client) Account(ctx context.Context, code, verifier string) (domain.GitHubAccount, error) {
	token, err := c.oauth.Exchange(context.WithValue(ctx, oauth2.HTTPClient, c.client), code, oauth2.VerifierOption(verifier))
	if err != nil {
		// Only the error code: the rest of a token response is not ours to log.
		var re *oauth2.RetrieveError
		if errors.As(err, &re) {
			return domain.GitHubAccount{}, fmt.Errorf("github token exchange: %q", re.ErrorCode)
		}
		return domain.GitHubAccount{}, errors.New("github token exchange failed")
	}
	// The token was needed for this one read; nothing keeps it afterwards.
	defer c.revoke(context.WithoutCancel(ctx), token.AccessToken)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.api+"/user", nil)
	if err != nil {
		return domain.GitHubAccount{}, fmt.Errorf("github request: %w", err)
	}
	c.headers(req)
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	res, err := c.client.Do(req)
	if err != nil {
		return domain.GitHubAccount{}, fmt.Errorf("github user: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return domain.GitHubAccount{}, fmt.Errorf("github user: status %d", res.StatusCode)
	}
	var user struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&user); err != nil {
		return domain.GitHubAccount{}, fmt.Errorf("github user: %w", err)
	}
	return domain.GitHubAccount{ID: user.ID, Login: user.Login}, nil
}

// revoke is best effort: the token carries no permissions and expires in hours.
func (c *Client) revoke(ctx context.Context, token string) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	body, _ := json.Marshal(map[string]string{"access_token": token})
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.api+"/applications/"+url.PathEscape(c.oauth.ClientID)+"/token", bytes.NewReader(body))
	if err != nil {
		return
	}
	c.headers(req)
	req.SetBasicAuth(c.oauth.ClientID, c.oauth.ClientSecret)
	if res, err := c.client.Do(req); err == nil {
		_ = res.Body.Close()
	}
}

func (c *Client) headers(req *http.Request) {
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "fantasm")
}
