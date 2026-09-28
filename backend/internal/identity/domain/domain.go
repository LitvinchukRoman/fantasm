package domain

import (
	"errors"
	"net/mail"
	"strings"
	"time"
)

type Provider string

const (
	Google Provider = "google"
	Entra  Provider = "entra"
)

type Affiliation string

const (
	External     Affiliation = "EXTERNAL"
	UKMAVerified Affiliation = "UKMA_VERIFIED"
)

type Role string

const (
	UserRole      Role = "USER"
	ModeratorRole Role = "MODERATOR"
	AdminRole     Role = "ADMIN"
)

var ErrNotFound = errors.New("identity not found")

type User struct {
	ID          string
	Handle      string
	Name        string
	Email       string
	AvatarURL   string
	Bio         string
	Faculty     string
	Affiliation Affiliation
	Role        Role
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type Identity struct {
	Provider      Provider
	Issuer        string
	Subject       string
	TenantID      string
	Email         string
	EmailVerified bool
	Name          string
	AvatarURL     string
}

func (i Identity) Validate() error {
	if i.Provider != Google && i.Provider != Entra {
		return errors.New("unsupported identity provider")
	}
	if i.Issuer == "" || i.Subject == "" {
		return errors.New("missing external identity")
	}
	if i.Email != "" {
		address, err := mail.ParseAddress(i.Email)
		if err != nil || address.Address != i.Email {
			return errors.New("invalid identity email")
		}
	}
	return nil
}

func (i Identity) Affiliation(ukmaTenantID string) Affiliation {
	if ukmaTenantID == "" || i.Provider != Entra || !strings.EqualFold(i.TenantID, ukmaTenantID) || !i.EmailVerified {
		return External
	}
	if i.Issuer != "https://login.microsoftonline.com/"+strings.ToLower(ukmaTenantID)+"/v2.0" {
		return External
	}
	address, err := mail.ParseAddress(i.Email)
	if err != nil || address.Address != i.Email {
		return External
	}
	_, domain, ok := strings.Cut(i.Email, "@")
	if !ok || !strings.EqualFold(domain, "ukma.edu.ua") {
		return External
	}
	return UKMAVerified
}

type Session struct {
	TokenHash string
	UserID    string
	ExpiresAt time.Time
}

type LoginAttempt struct {
	StateHash   string
	BrowserHash string
	Provider    Provider
	Nonce       string
	Verifier    string
	ExpiresAt   time.Time
}
