package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// ErrBadToken covers every way a support identity token can fail; the caller must not learn which.
var ErrBadToken = errors.New("invalid support identity token")

// SupportTokenTTL is how long the browser may hand one token to the support bot.
const SupportTokenTTL = 15 * time.Minute

// TokenSigner issues the short-lived token that tells the support bot which signed-in
// person it is talking to. The bot cannot read or forge it; it only passes it back to
// this API, which accepts it together with the bot's own credential.
type TokenSigner struct{ key []byte }

func NewTokenSigner(appSecret string) TokenSigner {
	mac := hmac.New(sha256.New, []byte(appSecret))
	mac.Write([]byte("fantasm/support-identity/v1"))
	return TokenSigner{key: mac.Sum(nil)}
}

func (s TokenSigner) sign(payload string) string {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// Issue returns a token for userID that expires SupportTokenTTL after now.
func (s TokenSigner) Issue(userID string, now time.Time) (string, time.Time) {
	expires := now.Add(SupportTokenTTL).UTC().Truncate(time.Second)
	payload := base64.RawURLEncoding.EncodeToString([]byte(userID + "." + strconv.FormatInt(expires.Unix(), 10)))
	return "v1." + payload + "." + s.sign(payload), expires
}

// Verify returns the user the token was issued for.
func (s TokenSigner) Verify(token string, now time.Time) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "v1" || len(token) > 200 {
		return "", ErrBadToken
	}
	if !hmac.Equal([]byte(s.sign(parts[1])), []byte(parts[2])) {
		return "", ErrBadToken
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", ErrBadToken
	}
	userID, exp, ok := strings.Cut(string(raw), ".")
	unix, err := strconv.ParseInt(exp, 10, 64)
	if !ok || err != nil || userID == "" || !now.Before(time.Unix(unix, 0)) {
		return "", ErrBadToken
	}
	return userID, nil
}
