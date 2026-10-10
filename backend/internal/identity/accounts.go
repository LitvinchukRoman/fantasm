package identity

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// AccountRepository covers everything about an existing account that is not login itself.
type AccountRepository interface {
	UpdateProfile(ctx context.Context, userID string, update domain.ProfileUpdate, now time.Time) (domain.User, error)
	UserByHandle(ctx context.Context, handle string) (domain.User, error)
	SetAvatar(ctx context.Context, userID string, avatar domain.Avatar, now time.Time) (domain.User, error)
	DeleteAvatar(ctx context.Context, userID string) (domain.User, error)
	AvatarByHandle(ctx context.Context, handle string) (domain.Avatar, error)
	SetRole(ctx context.Context, userID string, role domain.Role, now time.Time) (domain.User, error)
	ListSessions(ctx context.Context, userID string, now, idleCutoff time.Time) ([]domain.SessionInfo, error)
	DeleteSessionByID(ctx context.Context, userID, sessionID string) (bool, error)
	DeleteUserSessions(ctx context.Context, userID string) error
	IdentitiesByUsers(ctx context.Context, userIDs []string) (map[string][]domain.Identity, error)
	// PurgeExpired removes dead sessions and login attempts and reports how many rows went.
	PurgeExpired(ctx context.Context, now, idleCutoff time.Time) (int64, error)
}

// UpdateProfile applies a partial edit of the caller's own profile.
func (s *Service) UpdateProfile(ctx context.Context, userID string, update domain.ProfileUpdate) (domain.User, error) {
	update = update.Normalize()
	if update.IsEmpty() {
		return domain.User{}, apperr.Invalid("nothing to update")
	}
	if fields := update.Validate(); len(fields) > 0 {
		return domain.User{}, apperr.Validation(fields)
	}
	user, err := s.repository.UpdateProfile(ctx, userID, update, s.now().UTC())
	switch {
	case errors.Is(err, domain.ErrHandleTaken):
		return domain.User{}, apperr.Validation(map[string]string{"handle": "is already taken"})
	case errors.Is(err, domain.ErrNotFound):
		return domain.User{}, apperr.Unauthorized("account no longer exists")
	case err != nil:
		return domain.User{}, fmt.Errorf("update profile: %w", err)
	}
	if err := s.resolveMemberships(ctx, &user); err != nil {
		return domain.User{}, err
	}
	return user, nil
}

// SetAvatar stores the caller's photo. The format is sniffed from the bytes;
// the declared Content-Type is not trusted.
func (s *Service) SetAvatar(ctx context.Context, userID string, data []byte) (domain.User, error) {
	if len(data) == 0 || len(data) > domain.AvatarMaxBytes {
		return domain.User{}, apperr.Validation(map[string]string{"avatar": "must be an image of at most 256 KB"})
	}
	contentType := http.DetectContentType(data)
	if !domain.AvatarTypes[contentType] {
		return domain.User{}, apperr.Validation(map[string]string{"avatar": "must be a JPEG, PNG or WebP image"})
	}
	user, err := s.repository.SetAvatar(ctx, userID, domain.Avatar{ContentType: contentType, Data: data}, s.now().UTC())
	return s.accountResult(ctx, user, err, "set avatar")
}

func (s *Service) DeleteAvatar(ctx context.Context, userID string) (domain.User, error) {
	user, err := s.repository.DeleteAvatar(ctx, userID)
	return s.accountResult(ctx, user, err, "delete avatar")
}

// Avatar is the public photo of a user; profiles are public, so is this.
func (s *Service) Avatar(ctx context.Context, handle string) (domain.Avatar, error) {
	avatar, err := s.repository.AvatarByHandle(ctx, handle)
	if errors.Is(err, domain.ErrNoAvatar) {
		return domain.Avatar{}, apperr.NotFound("avatar not found")
	}
	if err != nil {
		return domain.Avatar{}, fmt.Errorf("find avatar: %w", err)
	}
	return avatar, nil
}

func (s *Service) accountResult(ctx context.Context, user domain.User, err error, op string) (domain.User, error) {
	switch {
	case errors.Is(err, domain.ErrNotFound):
		return domain.User{}, apperr.Unauthorized("account no longer exists")
	case err != nil:
		return domain.User{}, fmt.Errorf("%s: %w", op, err)
	}
	if err := s.resolveMemberships(ctx, &user); err != nil {
		return domain.User{}, err
	}
	return user, nil
}

// Sessions lists the caller's live sessions and marks the one making the request.
func (s *Service) Sessions(ctx context.Context, userID, currentToken string) ([]domain.SessionInfo, error) {
	now := s.now()
	list, err := s.repository.ListSessions(ctx, userID, now, now.Add(-s.sessionIdleTTL))
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	current := ""
	if validToken(currentToken) {
		current = hashToken(currentToken)
	}
	for i := range list {
		list[i].Current = current != "" && list[i].TokenHash == current
	}
	return list, nil
}

// RevokeSession ends one of the caller's own sessions.
func (s *Service) RevokeSession(ctx context.Context, userID, sessionID string) error {
	deleted, err := s.repository.DeleteSessionByID(ctx, userID, sessionID)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	if !deleted {
		return apperr.NotFound("session not found")
	}
	return nil
}

// RevokeAllSessions signs the user out everywhere, this browser included.
func (s *Service) RevokeAllSessions(ctx context.Context, userID string) error {
	if err := s.repository.DeleteUserSessions(ctx, userID); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}
	return nil
}

// SetRole changes another user's role and revokes their sessions, which forces
// a fresh login and with it a new session token under the new privileges.
func (s *Service) SetRole(ctx context.Context, actorID, handle string, role domain.Role) (domain.User, error) {
	if !role.Valid() {
		return domain.User{}, apperr.Validation(map[string]string{"role": "must be USER, MODERATOR or ADMIN"})
	}
	target, err := s.repository.UserByHandle(ctx, handle)
	if errors.Is(err, domain.ErrNotFound) {
		return domain.User{}, apperr.NotFound("user not found")
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("find user: %w", err)
	}
	if target.ID == actorID {
		return domain.User{}, apperr.Forbidden("you cannot change your own role")
	}
	var updated domain.User
	err = s.transactions.WithinTx(ctx, func(ctx context.Context) error {
		var err error
		if updated, err = s.repository.SetRole(ctx, target.ID, role, s.now().UTC()); err != nil {
			return fmt.Errorf("set role: %w", err)
		}
		if err := s.repository.DeleteUserSessions(ctx, target.ID); err != nil {
			return fmt.Errorf("revoke sessions: %w", err)
		}
		return nil
	})
	if err != nil {
		return domain.User{}, err
	}
	return updated, nil
}

// PublicProfile is a user as strangers see them: no email, no memberships detail.
type PublicProfile struct {
	User  domain.User
	Badge *domain.Badge
}

func (s *Service) PublicProfile(ctx context.Context, handle string) (PublicProfile, error) {
	user, err := s.repository.UserByHandle(ctx, handle)
	if errors.Is(err, domain.ErrNotFound) {
		return PublicProfile{}, apperr.NotFound("user not found")
	}
	if err != nil {
		return PublicProfile{}, fmt.Errorf("find user: %w", err)
	}
	badges, err := s.BadgesFor(ctx, []string{user.ID})
	if err != nil {
		return PublicProfile{}, err
	}
	profile := PublicProfile{User: user}
	if b, ok := badges[user.ID]; ok {
		profile.Badge = &b
	}
	return profile, nil
}

// BadgesFor resolves the current organization badge of each user. Users without
// one are absent from the result.
func (s *Service) BadgesFor(ctx context.Context, userIDs []string) (map[string]domain.Badge, error) {
	badges := map[string]domain.Badge{}
	if s.membershipPolicy == nil || len(userIDs) == 0 {
		return badges, nil
	}
	evidence, err := s.repository.IdentitiesByUsers(ctx, userIDs)
	if err != nil {
		return nil, fmt.Errorf("load membership evidence: %w", err)
	}
	for id, identities := range evidence {
		if badge, ok := domain.BadgeOf(s.membershipPolicy.Evaluate(identities)); ok {
			badges[id] = badge
		}
	}
	return badges, nil
}

// PurgeExpired deletes sessions and login attempts that can no longer be used.
func (s *Service) PurgeExpired(ctx context.Context) (int64, error) {
	now := s.now()
	n, err := s.repository.PurgeExpired(ctx, now, now.Add(-s.sessionIdleTTL))
	if err != nil {
		return 0, fmt.Errorf("purge expired: %w", err)
	}
	return n, nil
}
