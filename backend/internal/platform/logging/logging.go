// Package logging builds the structured logger and carries a request-scoped
// logger through the context.
package logging

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log/slog"
	"strings"
)

// sensitive key fragments; any attribute whose key contains one of them is redacted.
var sensitive = []string{"cookie", "authorization", "token", "secret", "password", "code", "state", "verifier", "nonce"}

const redacted = "[redacted]"

// New returns a JSON logger at the given level ("debug", "info", "warn", "error").
func New(w io.Writer, level string) *slog.Logger {
	var l slog.Level
	if err := l.UnmarshalText([]byte(strings.ToLower(level))); err != nil {
		l = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: l, ReplaceAttr: redact})).With("service", "fantasm-api")
}

func AddressHash(secret, address string) string {
	if secret == "" || address == "" {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(address))
	return hex.EncodeToString(mac.Sum(nil))[:32]
}

func redact(groups []string, a slog.Attr) slog.Attr {
	if len(groups) == 0 && (a.Key == slog.TimeKey || a.Key == slog.LevelKey || a.Key == slog.MessageKey) {
		return a
	}
	key := strings.ToLower(a.Key)
	for _, fragment := range sensitive {
		if strings.Contains(key, fragment) {
			// "request_id", "user_id" etc. never contain a fragment; keys such as
			// "status" or "decoded" would, so match whole words for the short ones.
			if (fragment == "code" || fragment == "state") && !wordMatch(key, fragment) {
				continue
			}
			return slog.String(a.Key, redacted)
		}
	}
	return a
}

func wordMatch(key, word string) bool {
	for _, part := range strings.FieldsFunc(key, func(r rune) bool { return r == '_' || r == '-' || r == '.' }) {
		if part == word {
			return true
		}
	}
	return false
}

type ctxKey struct{}

func With(ctx context.Context, l *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, l)
}

// From returns the request-scoped logger, or the default logger outside a request.
func From(ctx context.Context) *slog.Logger {
	if l, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok && l != nil {
		return l
	}
	return slog.Default()
}
