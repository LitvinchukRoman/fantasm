package oidc

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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
	for _, providerName := range []domain.Provider{domain.Google, domain.Entra} {
		for _, tt := range tests {
			t.Run(string(providerName)+"/"+tt.name, func(t *testing.T) {
				var raw string
				const tenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
				var server *httptest.Server
				server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					if strings.HasSuffix(r.URL.Path, "/.well-known/openid-configuration") {
						if r.URL.Path != "/"+tenant+"/v2.0/.well-known/openid-configuration" {
							t.Errorf("unexpected discovery path: %s", r.URL.Path)
						}
						_ = json.NewEncoder(w).Encode(map[string]any{"issuer": entraIssuer(tenant), "jwks_uri": server.URL + "/keys", "authorization_endpoint": server.URL + "/authorize", "token_endpoint": server.URL + "/token"})
						return
					}

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
				claims := map[string]any{"iss": server.URL, "sub": "subject", "aud": "client", "exp": time.Now().Add(time.Minute).Unix(), "iat": time.Now().Unix(), "nonce": "nonce", "email": "person@example.com", "email_verified": true}
				if providerName == domain.Entra {
					claims["iss"] = entraIssuer(tenant)
					claims["tid"] = tenant
					claims["verified_primary_email"] = claims["email"]
				}
				tt.change(claims)
				if providerName == domain.Entra && tt.name == "invalid email" {
					claims["verified_primary_email"] = "invalid"
				}

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
					name: providerName, issuer: server.URL, client: server.Client(),
					oauth:    oauth2.Config{ClientID: "client", ClientSecret: "secret", Endpoint: oauth2.Endpoint{TokenURL: server.URL + "/token"}},
					verifier: coreoidc.NewVerifier(server.URL, coreoidc.NewRemoteKeySet(t.Context(), server.URL+"/keys"), &coreoidc.Config{ClientID: "client"}),
				}
				localURL, _ := url.Parse(server.URL)
				transport := server.Client().Transport
				p.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
					if r.URL.Host == "login.microsoftonline.com" {
						r = r.Clone(r.Context())
						copied := *r.URL
						copied.Scheme, copied.Host = localURL.Scheme, localURL.Host
						r.URL = &copied
					}
					return transport.RoundTrip(r)
				})}
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

}

func TestEntraIdentity(t *testing.T) {
	const tenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	p := &Provider{name: domain.Entra}
	for _, tt := range []struct {
		name      string
		issuer    string
		claims    tokenClaims
		wantError bool
		verified  bool
	}{
		{"plain email", entraIssuer(tenant), tokenClaims{TenantID: tenant, Email: "person@example.com", EmailVerified: true}, false, false},
		{"verified email", entraIssuer(tenant), tokenClaims{TenantID: tenant, VerifiedPrimaryEmail: "person@example.com"}, false, true},
		{"missing email", entraIssuer(tenant), tokenClaims{TenantID: tenant}, false, false},
		{"personal account", entraIssuer("9188040d-6c67-4c5b-b112-36a304b66dad"), tokenClaims{TenantID: "9188040d-6c67-4c5b-b112-36a304b66dad"}, false, false},
		{"issuer mismatch", "https://attacker.example", tokenClaims{TenantID: tenant}, true, false},
		{"invalid tenant", entraIssuer(tenant), tokenClaims{TenantID: "other"}, true, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			profile, err := p.identity(tt.issuer, "subject", tt.claims)
			if tt.wantError {
				if apperr.KindOf(err) != apperr.KindUnauthorized {
					t.Fatalf("expected unauthorized, got %v", err)
				}
			} else if err != nil || profile.EmailVerified != tt.verified || profile.Issuer != tt.issuer {
				t.Fatalf("profile = %+v, error = %v", profile, err)
			}
		})
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

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestExchangeFailureKeepsOnlyCodes(t *testing.T) {
	err := &oauth2.RetrieveError{ErrorCode: "invalid_client", ErrorDescription: "AADSTS7000215: Invalid client secret provided for person@ukma.edu.ua. Trace ID: 1"}
	if got := exchangeFailure(err); got != ": invalid_client AADSTS7000215" {
		t.Fatalf("got %q", got)
	}
	if got := exchangeFailure(&oauth2.RetrieveError{ErrorCode: "<script>"}); got != ":" {
		t.Fatalf("untrusted code leaked: %q", got)
	}
	if got := exchangeFailure(http.ErrHandlerTimeout); got != "" {
		t.Fatalf("non-OAuth error: %q", got)
	}
}
