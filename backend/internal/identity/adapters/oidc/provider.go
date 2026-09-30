package oidc

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	coreoidc "github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type Config struct {
	Provider     domain.Provider
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type Provider struct {
	name     domain.Provider
	issuer   string
	oauth    oauth2.Config
	verifier *coreoidc.IDTokenVerifier
	client   *http.Client
}

func NewProvider(ctx context.Context, cfg Config) (*Provider, error) {
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURL == "" {
		return nil, fmt.Errorf("incomplete %s OIDC configuration", cfg.Provider)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	p := &Provider{name: cfg.Provider, client: client, oauth: oauth2.Config{
		ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, RedirectURL: cfg.RedirectURL,
		Scopes: []string{coreoidc.ScopeOpenID, "profile", "email"},
	}}
	switch cfg.Provider {
	case domain.Google:
		p.issuer = "https://accounts.google.com"
		discovered, err := coreoidc.NewProvider(coreoidc.ClientContext(ctx, client), p.issuer)
		if err != nil {
			return nil, fmt.Errorf("discover google: %w", err)
		}
		p.oauth.Endpoint = discovered.Endpoint()
		p.verifier = discovered.VerifierContext(coreoidc.ClientContext(context.Background(), client), &coreoidc.Config{ClientID: cfg.ClientID, SupportedSigningAlgs: []string{"RS256"}})
	case domain.Entra:
		p.oauth.Endpoint = oauth2.Endpoint{
			AuthURL:   "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
			TokenURL:  "https://login.microsoftonline.com/common/oauth2/v2.0/token",
			AuthStyle: oauth2.AuthStyleInParams,
		}
	default:
		return nil, fmt.Errorf("unsupported OIDC provider %q", cfg.Provider)
	}
	return p, nil
}

func (p *Provider) AuthorizationURL(state, nonce, verifier string) string {
	options := []oauth2.AuthCodeOption{coreoidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)}
	if p.name == domain.Entra {
		options = append(options, oauth2.SetAuthURLParam("claims", `{"id_token":{"verified_primary_email":{"essential":true}}}`))
	}
	return p.oauth.AuthCodeURL(state, options...)
}

func (p *Provider) Authenticate(ctx context.Context, code, nonce, verifier string) (domain.Identity, error) {
	ctx = coreoidc.ClientContext(ctx, p.client)
	token, err := p.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return domain.Identity{}, apperr.Unauthorized("provider authentication failed")
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		return domain.Identity{}, apperr.Unauthorized("provider did not return an ID token")
	}
	verifierForToken := p.verifier
	if p.name == domain.Entra {
		verifierForToken, err = p.entraVerifier(ctx, raw)
		if err != nil {
			return domain.Identity{}, err
		}
	}
	verified, err := verifierForToken.Verify(ctx, raw)
	if err != nil {
		return domain.Identity{}, apperr.Unauthorized("invalid provider ID token")
	}
	if nonce == "" || subtle.ConstantTimeCompare([]byte(verified.Nonce), []byte(nonce)) != 1 {
		return domain.Identity{}, apperr.Unauthorized("invalid provider nonce")
	}
	if verified.AccessTokenHash != "" {
		if err := verified.VerifyAccessToken(token.AccessToken); err != nil {
			return domain.Identity{}, apperr.Unauthorized("invalid provider access token")
		}
	}
	var claims tokenClaims
	if err := verified.Claims(&claims); err != nil {
		return domain.Identity{}, apperr.Unauthorized("invalid provider claims")
	}
	if claims.AuthorizedParty != "" && claims.AuthorizedParty != p.oauth.ClientID || len(verified.Audience) > 1 && claims.AuthorizedParty != p.oauth.ClientID {
		return domain.Identity{}, apperr.Unauthorized("invalid authorized party")
	}
	return p.identity(verified.Issuer, verified.Subject, claims)
}

type tokenClaims struct {
	Email                string `json:"email"`
	EmailVerified        bool   `json:"email_verified"`
	VerifiedPrimaryEmail string `json:"verified_primary_email"`
	Name                 string `json:"name"`
	Picture              string `json:"picture"`
	TenantID             string `json:"tid"`
	AuthorizedParty      string `json:"azp"`
}

func (p *Provider) identity(issuer, subject string, claims tokenClaims) (domain.Identity, error) {
	result := domain.Identity{
		Provider: p.name, Issuer: issuer, Subject: subject,
		Email: strings.TrimSpace(claims.Email), EmailVerified: claims.EmailVerified,
		Name: strings.TrimSpace(claims.Name), AvatarURL: claims.Picture,
	}
	if p.name == domain.Entra {
		if !validTenantID(claims.TenantID) || issuer != entraIssuer(claims.TenantID) {
			return domain.Identity{}, apperr.Unauthorized("invalid provider tenant")
		}
		result.TenantID = strings.ToLower(claims.TenantID)
		result.EmailVerified = false
		if email := strings.TrimSpace(claims.VerifiedPrimaryEmail); email != "" {
			result.Email = email
			result.EmailVerified = true
		}
	}
	if err := result.Validate(); err != nil {
		return domain.Identity{}, apperr.Unauthorized("invalid provider identity")
	}
	return result, nil
}

func validTenantID(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i, char := range value {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if char != '-' {
				return false
			}
			continue
		}
		if !(char >= '0' && char <= '9' || char >= 'a' && char <= 'f' || char >= 'A' && char <= 'F') {
			return false
		}
	}
	return true
}

func entraIssuer(tenant string) string {
	return "https://login.microsoftonline.com/" + strings.ToLower(tenant) + "/v2.0"
}

func (p *Provider) entraVerifier(ctx context.Context, raw string) (*coreoidc.IDTokenVerifier, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 || len(raw) > 65536 {
		return nil, apperr.Unauthorized("invalid provider ID token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	var hint tokenClaims
	if err != nil || json.Unmarshal(payload, &hint) != nil || !validTenantID(hint.TenantID) {
		return nil, apperr.Unauthorized("invalid provider tenant")
	}
	discovered, err := coreoidc.NewProvider(ctx, entraIssuer(hint.TenantID))
	if err != nil {
		return nil, fmt.Errorf("discover Microsoft tenant: %w", err)
	}
	return discovered.VerifierContext(ctx, &coreoidc.Config{ClientID: p.oauth.ClientID, SupportedSigningAlgs: []string{"RS256"}}), nil
}
