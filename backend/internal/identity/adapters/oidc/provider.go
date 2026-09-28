package oidc

import (
	"context"
	"crypto/subtle"
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
	TenantID     string
}

type Provider struct {
	name     domain.Provider
	issuer   string
	tenantID string
	oauth    oauth2.Config
	verifier *coreoidc.IDTokenVerifier
	client   *http.Client
}

func NewProvider(ctx context.Context, cfg Config) (*Provider, error) {
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURL == "" {
		return nil, fmt.Errorf("incomplete %s OIDC configuration", cfg.Provider)
	}
	issuer := "https://accounts.google.com"
	switch cfg.Provider {
	case domain.Google:
	case domain.Entra:
		if !validTenantID(cfg.TenantID) {
			return nil, fmt.Errorf("Entra requires a tenant UUID")
		}
		cfg.TenantID = strings.ToLower(cfg.TenantID)
		issuer = "https://login.microsoftonline.com/" + cfg.TenantID + "/v2.0"
	default:
		return nil, fmt.Errorf("unsupported OIDC provider %q", cfg.Provider)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	ctx = coreoidc.ClientContext(ctx, client)
	discovered, err := coreoidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("discover %s: %w", cfg.Provider, err)
	}
	return &Provider{
		name: cfg.Provider, issuer: issuer, tenantID: cfg.TenantID, client: client,
		oauth: oauth2.Config{
			ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, RedirectURL: cfg.RedirectURL,
			Endpoint: discovered.Endpoint(), Scopes: []string{coreoidc.ScopeOpenID, "profile", "email"},
		},
		verifier: discovered.VerifierContext(coreoidc.ClientContext(context.Background(), client), &coreoidc.Config{ClientID: cfg.ClientID, SupportedSigningAlgs: []string{"RS256"}}),
	}, nil
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
	verified, err := p.verifier.Verify(ctx, raw)
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
	return p.identity(verified.Subject, claims)
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

func (p *Provider) identity(subject string, claims tokenClaims) (domain.Identity, error) {
	result := domain.Identity{
		Provider: p.name, Issuer: p.issuer, Subject: subject,
		Email: strings.TrimSpace(claims.Email), EmailVerified: claims.EmailVerified,
		Name: strings.TrimSpace(claims.Name), AvatarURL: claims.Picture,
	}
	if p.name == domain.Entra {
		if !strings.EqualFold(claims.TenantID, p.tenantID) {
			return domain.Identity{}, apperr.Unauthorized("invalid provider tenant")
		}
		result.TenantID = p.tenantID
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
