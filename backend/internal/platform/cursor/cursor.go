// Package cursor signs keyset pagination cursors. A client cannot craft a
// position, so a cursor can never be used to probe the database with chosen
// values, and it is bound to the listing it came from.
package cursor

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"
)

var ErrInvalid = errors.New("invalid cursor")

// Position is where a listing resumes: the last sort key and row id seen.
type Position struct {
	Key string
	ID  string
}

type Codec struct{ key []byte }

func New(secret []byte) Codec { return Codec{key: secret} }

func (c Codec) mac(payload string) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write([]byte(payload))
	return m.Sum(nil)[:16]
}

// Encode binds the position to scope, so it cannot be replayed against another filter.
func (c Codec) Encode(scope string, p Position) string {
	payload := scope + "|" + p.Key + "|" + p.ID
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(c.mac(payload))
}

// Decode returns nil for an empty cursor and ErrInvalid for anything forged, mangled or from another scope.
func (c Codec) Decode(raw, scope string) (*Position, error) {
	if raw == "" {
		return nil, nil
	}
	body, sig, ok := strings.Cut(raw, ".")
	if !ok || len(raw) > 512 {
		return nil, ErrInvalid
	}
	payload, err := strictEncoding.DecodeString(body)
	if err != nil {
		return nil, ErrInvalid
	}
	want, err := strictEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(want, c.mac(string(payload))) {
		return nil, ErrInvalid
	}
	parts := strings.Split(string(payload), "|")
	if len(parts) != 3 || parts[0] != scope || parts[1] == "" || len(parts[2]) != 36 || strings.Count(parts[2], "-") != 4 {
		return nil, ErrInvalid
	}
	pos := &Position{Key: parts[1], ID: parts[2]}
	// The decoder skips line breaks, so a signed cursor could be respelled; only the exact text we issued is valid.
	if c.Encode(scope, *pos) != raw {
		return nil, ErrInvalid
	}
	return pos, nil
}

// Time reads a position key written by FormatTime.
func Time(key string) (time.Time, error) { return time.Parse(time.RFC3339Nano, key) }

// FormatTime writes a timestamp as a position key, at the microsecond precision Postgres stores.
func FormatTime(t time.Time) string {
	return t.UTC().Truncate(time.Microsecond).Format(time.RFC3339Nano)
}

// strictEncoding rejects non-canonical base64, so one cursor has exactly one valid spelling and cannot be varied without invalidating it.
var strictEncoding = base64.RawURLEncoding.Strict()
