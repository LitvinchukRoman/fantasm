package oidc

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	coreoidc "github.com/coreos/go-oidc/v3/oidc"
	jose "github.com/go-jose/go-jose/v4"
	"golang.org/x/oauth2"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

func TestAuthenticateValidatesToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	otherKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name         string
		change       func(map[string]any)
		badSignature bool
		wantError    bool
	}{
		{"valid", func(map[string]any) {}, false, false},
		{"wrong issuer", func(c map[string]any) { c["iss"] = "https://attacker.example" }, false, true},
		{"wrong audience", func(c map[string]any) { c["aud"] = "another-client" }, false, true},
		{"expired", func(c map[string]any) { c["exp"] = time.Now().Add(-time.Minute).Unix() }, false, true},
		{"wrong nonce", func(c map[string]any) { c["nonce"] = "another-nonce" }, false, true},
		{"missing nonce", func(c map[string]any) { delete(c, "nonce") }, false, true},
		{"missing subject", func(c map[string]any) { delete(c, "sub") }, false, true},
		{"wrong authorized party", func(c map[string]any) { c["azp"] = "another-client" }, false, true},
		{"ambiguous audience", func(c map[string]any) { c["aud"] = []string{"client", "other"} }, false, true},
		{"invalid signature", func(map[string]any) {}, true, true},
		{"invalid email", func(c map[string]any) { c["email"] = "invalid" }, false, true},
		{"invalid access token hash", func(c map[string]any) { c["at_hash"] = "wrong" }, false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var raw string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				if r.URL.Path == "/keys" {
					_ = json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, KeyID: "test", Algorithm: "RS256", Use: "sig"}}})
					return
				}
				if err := r.ParseForm(); err != nil {
					t.Error(err)
				}
				if r.Form.Get("code_verifier") != "verifier" || r.Form.Get("code") != "code" {
					t.Error("exchange missing code or PKCE verifier")
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "access", "token_type": "Bearer", "id_token": raw, "expires_in": 300})
			}))
			defer server.Close()
			claims := map[string]any{"iss": server.URL, "sub": "subject", "aud": "client", "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "nonce": "nonce", "email": "student@ukma.edu.ua", "email_verified": true}
			tt.change(claims)
			signingKey := key
			if tt.badSignature {
				signingKey = otherKey
			}
			signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: signingKey}, (&jose.SignerOptions{}).WithHeader("kid", "test"))
			if err != nil {
				t.Fatal(err)
			}
			payload, err := json.Marshal(claims)
			if err != nil {
				t.Fatal(err)
			}
			signed, err := signer.Sign(payload)
			if err != nil {
				t.Fatal(err)
			}
			raw, err = signed.CompactSerialize()
			if err != nil {
				t.Fatal(err)
			}
			p := &Provider{
				name: domain.Google, issuer: server.URL, client: server.Client(),
				oauth:    oauth2.Config{ClientID: "client", ClientSecret: "secret", Endpoint: oauth2.Endpoint{TokenURL: server.URL + "/token"}},
				verifier: coreoidc.NewVerifier(server.URL, coreoidc.NewRemoteKeySet(t.Context(), server.URL+"/keys"), &coreoidc.Config{ClientID: "client"}),
			}
			profile, err := p.Authenticate(t.Context(), "code", "nonce", "verifier")
			if tt.wantError {
				if apperr.KindOf(err) != apperr.KindUnauthorized {
					t.Fatalf("expected unauthorized, got %v", err)
				}
			} else if err != nil || profile.Subject != "subject" || !profile.EmailVerified {
				t.Fatalf("profile = %+v, error = %v", profile, err)
			}
		})
	}
}

func TestEntraEmailEvidence(t *testing.T) {
	const tenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	p := &Provider{name: domain.Entra, issuer: "https://login.microsoftonline.com/" + tenant + "/v2.0", tenantID: tenant}
	tests := []struct {
		name   string
		claims tokenClaims
		want   domain.Affiliation
	}{
		{"plain email", tokenClaims{TenantID: tenant, Email: "student@ukma.edu.ua"}, domain.External},
		{"generic flag insufficient", tokenClaims{TenantID: tenant, Email: "student@ukma.edu.ua", EmailVerified: true}, domain.External},
		{"authoritative campus email", tokenClaims{TenantID: tenant, VerifiedPrimaryEmail: "student@ukma.edu.ua"}, domain.UKMAVerified},
		{"authoritative external email", tokenClaims{TenantID: tenant, Email: "student@ukma.edu.ua", VerifiedPrimaryEmail: "student@example.com"}, domain.External},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile, err := p.identity("subject", tt.claims)
			if err != nil {
				t.Fatal(err)
			}
			if got := profile.Affiliation(tenant); got != tt.want {
				t.Fatalf("affiliation = %s, want %s", got, tt.want)
			}
		})
	}
	if _, err := p.identity("subject", tokenClaims{TenantID: "other"}); apperr.KindOf(err) != apperr.KindUnauthorized {
		t.Fatalf("wrong tenant accepted: %v", err)
	}
}

func TestAuthorizationURL(t *testing.T) {
	p := &Provider{name: domain.Google, oauth: oauth2.Config{ClientID: "client", RedirectURL: "https://app.example/callback", Endpoint: oauth2.Endpoint{AuthURL: "https://provider.example/auth"}, Scopes: []string{"openid", "email"}}}
	u, err := url.Parse(p.AuthorizationURL("state", "nonce", "verifier"))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if q.Get("state") != "state" || q.Get("nonce") != "nonce" || q.Get("code_challenge_method") != "S256" || q.Get("code_challenge") != oauth2.S256ChallengeFromVerifier("verifier") || q.Get("response_type") != "code" {
		t.Fatalf("invalid authorization parameters: %v", q)
	}
}
