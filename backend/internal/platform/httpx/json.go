package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"strconv"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// MaxBody is the largest request body any endpoint accepts.
const MaxBody = 1 << 20

// DecodeJSON reads exactly one JSON document into dst. It insists on the JSON
// content type, rejects unknown fields and trailing data, and caps the size.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return apperr.New(apperr.KindUnsupportedMedia, "content type must be application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxBody)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooLarge *http.MaxBytesError
		switch {
		case errors.As(err, &tooLarge):
			return apperr.TooLarge("request body too large")
		case errors.Is(err, io.EOF):
			return apperr.Invalid("request body is required")
		default:
			return apperr.Invalid("malformed request body")
		}
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			return apperr.TooLarge("request body too large")
		}
		return apperr.Invalid("request body must contain a single JSON document")
	}
	return nil
}

// QueryInt parses an optional integer query parameter and clamps it to [lo, hi].
// A malformed value is an error rather than a silent default.
func QueryInt(r *http.Request, name string, def, lo, hi int) (int, error) {
	raw := r.URL.Query().Get(name)
	if raw == "" {
		return def, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return 0, apperr.Invalid("query parameter " + name + " must be an integer")
	}
	return min(max(n, lo), hi), nil
}

var uuidPattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// IsUUID reports whether s is a lowercase canonical UUID. Check path values with
// it before they reach a uuid column, so a malformed id is a 404, not a database error.
func IsUUID(s string) bool { return uuidPattern.MatchString(s) }
