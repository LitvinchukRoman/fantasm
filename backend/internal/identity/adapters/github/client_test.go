package github

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"golang.org/x/oauth2"
)

func TestAccount(t *testing.T) {
	var mu sync.Mutex
	revoked := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/login/oauth/access_token":
			_ = r.ParseForm()
			if r.Form.Get("client_id") != "app" || r.Form.Get("client_secret") != "secret" || r.Form.Get("code") != "good" ||
				r.Form.Get("code_verifier") != "verifier" || r.Form.Get("redirect_uri") != "https://app.example/callback" {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"error":"bad_verification_code","error_description":"The code passed is incorrect or expired."}`))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"access_token":"ghu_token","token_type":"bearer","expires_in":28800}`))
		case r.URL.Path == "/user":
			if r.Header.Get("Authorization") != "Bearer ghu_token" || r.Header.Get("User-Agent") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(`{"id":583231,"login":"Octo-Cat","type":"User"}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/applications/app/token":
			if id, secret, ok := r.BasicAuth(); !ok || id != "app" || secret != "secret" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			var body struct {
				AccessToken string `json:"access_token"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			mu.Lock()
			revoked = append(revoked, body.AccessToken)
			mu.Unlock()
			w.WriteHeader(http.StatusNoContent)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer server.Close()
	c := NewClient(Config{ClientID: "app", ClientSecret: "secret", RedirectURL: "https://app.example/callback", WebURL: server.URL + "/", APIURL: server.URL})

	auth, err := url.Parse(c.AuthorizationURL("state", "verifier"))
	if err != nil {
		t.Fatal(err)
	}
	q := auth.Query()
	if auth.Path != "/login/oauth/authorize" || q.Get("state") != "state" || q.Get("client_id") != "app" ||
		q.Get("code_challenge") != oauth2.S256ChallengeFromVerifier("verifier") || q.Get("code_challenge_method") != "S256" {
		t.Fatalf("authorization URL: %s", auth)
	}

	account, err := c.Account(t.Context(), "good", "verifier")
	if err != nil || account.ID != 583231 || account.Login != "Octo-Cat" {
		t.Fatalf("account = %+v, %v", account, err)
	}
	mu.Lock()
	if len(revoked) != 1 || revoked[0] != "ghu_token" {
		t.Errorf("token not revoked after use: %v", revoked)
	}
	mu.Unlock()

	_, err = c.Account(t.Context(), "stale", "verifier")
	if err == nil || !strings.Contains(err.Error(), "bad_verification_code") || strings.Contains(err.Error(), "incorrect") {
		t.Fatalf("bad code: %v, want only the error code", err)
	}
	if _, err := c.Account(t.Context(), "good", "other-verifier"); err == nil {
		t.Fatal("a code redeemed without its PKCE verifier was accepted")
	}
}
