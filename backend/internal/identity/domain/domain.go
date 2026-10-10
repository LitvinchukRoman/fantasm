package domain

import (
	"errors"
	"net/mail"
	"time"
)

type Provider string

const (
	Google Provider = "google"
	Entra  Provider = "entra"
)

type Role string

const (
	UserRole      Role = "USER"
	ModeratorRole Role = "MODERATOR"
	AdminRole     Role = "ADMIN"
)

var ErrNotFound = errors.New("identity not found")

type User struct {
	Memberships []Membership
	ID          string
	Handle      string
	Name        string
	Email       string
	AvatarURL   string
	Bio         string
	Faculty     string
	Role        Role
	Karma       int
	// ApprovedIdeas counts ideas a moderator approved; it lifts premoderation.
	ApprovedIdeas int
	// Onboarded is set once the user has confirmed their own profile after the first login.
	Onboarded bool
	// AvatarVersion is the upload time of the photo in Unix milliseconds, 0 without one.
	AvatarVersion int64
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// Valid reports whether r is one of the known roles.
func (r Role) Valid() bool { return r == UserRole || r == ModeratorRole || r == AdminRole }

var ErrHandleTaken = errors.New("handle is taken")

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

type Session struct {
	TokenHash string
	UserID    string
	ExpiresAt time.Time
	// UserAgent and IPHash are coarse client hints shown in the session list.
	// The address is stored only as a keyed hash.
	UserAgent string
	IPHash    string
}

// SessionInfo is what a user may see about their own sessions. The token hash
// never leaves the repository.
type SessionInfo struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
	UserAgent  string    `json:"userAgent"`
	Current    bool      `json:"current"`

	TokenHash string `json:"-"`
}

type LoginAttempt struct {
	StateHash   string
	BrowserHash string
	Provider    Provider
	Nonce       string
	Verifier    string
	ExpiresAt   time.Time
}
