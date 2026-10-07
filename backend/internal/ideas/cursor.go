package ideas

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
)

var errBadCursor = errors.New("invalid cursor")

// cursorCodec signs pagination cursors. A client cannot craft a position, so a
// cursor can never be used to probe the database with chosen values.
type cursorCodec struct{ key []byte }

func (c cursorCodec) mac(payload string) []byte {
	m := hmac.New(sha256.New, c.key)
	m.Write([]byte(payload))
	return m.Sum(nil)[:16]
}

// encode binds the cursor to the listing it came from (scope), so it cannot be
// replayed against a different filter or sort.
func (c cursorCodec) encode(scope, key, id string) string {
	payload := scope + "|" + key + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(c.mac(payload))
}

func (c cursorCodec) decode(raw, scope string) (*ports.Cursor, error) {
	if raw == "" {
		return nil, nil
	}
	body, sig, ok := strings.Cut(raw, ".")
	if !ok || len(raw) > 512 {
		return nil, errBadCursor
	}
	payload, err := strictEncoding.DecodeString(body)
	if err != nil {
		return nil, errBadCursor
	}
	want, err := strictEncoding.DecodeString(sig)
	if err != nil || !hmac.Equal(want, c.mac(string(payload))) {
		return nil, errBadCursor
	}
	parts := strings.Split(string(payload), "|")
	if len(parts) != 3 || parts[0] != scope || parts[1] == "" || !domainID(parts[2]) {
		return nil, errBadCursor
	}
	if c.encode(scope, parts[1], parts[2]) != raw {
		return nil, errBadCursor
	}
	return &ports.Cursor{Key: parts[1], ID: parts[2]}, nil
}

func domainID(s string) bool { return len(s) == 36 && strings.Count(s, "-") == 4 }

func scopeOf(f domain.Filter) string {
	return strings.Join([]string{string(f.Sort), string(f.Category), f.Tag, f.Campus, string(f.Status), f.AuthorID, boolString(f.Mine)}, "/")
}

func boolString(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// strictEncoding rejects non-canonical base64, so one cursor has exactly one valid spelling and cannot be varied without invalidating it.
var strictEncoding = base64.RawURLEncoding.Strict()
