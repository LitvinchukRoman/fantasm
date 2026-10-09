package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Middleware func(http.Handler) http.Handler

// Chain wraps h so that the first middleware is the outermost one.
func Chain(h http.Handler, mws ...Middleware) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

// RequestID tags the request. An incoming X-Request-ID is honoured only from a
// trusted proxy, otherwise clients could forge identifiers in our logs.
func RequestID(proxies Proxies) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")
			if !validRequestID.MatchString(id) || !proxies.Trusted(r) {
				var b [12]byte
				_, _ = rand.Read(b[:])
				id = hex.EncodeToString(b[:])
			}
			w.Header().Set("X-Request-ID", id)
			ctx := context.WithValue(r.Context(), requestIDKey, id)
			ctx = logging.With(ctx, logging.From(ctx).With("request_id", id))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// AccessLog writes one structured line per request, after it finished.
type RequestObserver interface {
	ObserveHTTP(method, route string, status, bytes int, duration time.Duration)
}

type AccessOptions struct {
	Secret   string
	Router   *http.ServeMux
	Observer RequestObserver
}

func RequestMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions, http.MethodConnect, http.MethodTrace:
		return method
	default:
		return "OTHER"
	}
}

func AccessLog(logger *slog.Logger, proxies Proxies, options ...AccessOptions) Middleware {
	var opts AccessOptions
	if len(options) > 0 {
		opts = options[0]
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := record(w)
			meta := &info{route: "unmatched"}
			if opts.Router != nil {
				if _, pattern := opts.Router.Handler(r); pattern != "" {
					meta.route = pattern
				}
			}
			ctx := context.WithValue(r.Context(), infoKey, meta)
			ctx = logging.With(ctx, logger.With("request_id", RequestIDFrom(ctx), "route", meta.route))
			defer func() {
				duration := time.Since(start)
				method := RequestMethod(r.Method)
				if opts.Observer != nil {
					opts.Observer.ObserveHTTP(method, meta.route, rec.status, rec.bytes, duration)
				}
				level := slog.LevelInfo
				switch {
				case rec.status >= 500:
					level = slog.LevelError
				case rec.status >= 400:
					level = slog.LevelWarn
				}
				logger.Log(ctx, level, "request",
					"event", "http.request",
					"request_id", RequestIDFrom(ctx),
					"method", method,
					"route", meta.route,
					"status", rec.status,
					"bytes", rec.bytes,
					"duration_ms", float64(duration)/float64(time.Millisecond),
					"client_hash", logging.AddressHash(opts.Secret, proxies.ClientIP(r)),
					"user_id", meta.userID,
					"error_kind", meta.errorCode,
				)
			}()
			next.ServeHTTP(rec, r.WithContext(ctx))
		})
	}
}

// Recover turns a panic into a logged 500 with a generic body.
func Recover() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rec := record(w)
			defer func() {
				v := recover()
				if v == nil {
					return
				}
				if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
					panic(v)
				}
				logging.From(r.Context()).ErrorContext(r.Context(), "panic recovered",
					"event", "http.panic", "method", RequestMethod(r.Method), "panic", v, "stack", string(debug.Stack()))
				if meta, ok := r.Context().Value(infoKey).(*info); ok {
					meta.errorCode = "panic"
				}
				if !rec.wrote {
					rec.Header().Set("Cache-Control", "no-store")
					WriteJSON(rec, http.StatusInternalServerError, errorBody{
						Error: "internal server error", Code: "internal_error", RequestID: RequestIDFrom(r.Context()),
					})
				}
			}()
			next.ServeHTTP(rec, r)
		})
	}
}

// SecurityHeaders sets the defensive headers for a JSON API. Responses default
// to no-store because most of them depend on who is asking; a handler that is
// safe to cache overrides Cache-Control itself.
func SecurityHeaders(secure bool) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Cross-Origin-Resource-Policy", "same-origin")
			h.Set("Cache-Control", "no-store")
			if secure {
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Limits bounds the body size and gives the request a deadline.
func Limits(maxBody int64, timeout time.Duration) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > maxBody {
				WriteError(w, r, apperr.TooLarge("request body too large"))
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBody)
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func unsafeMethod(m string) bool {
	return m != http.MethodGet && m != http.MethodHead && m != http.MethodOptions
}

// SameOrigin reports whether a state-changing request came from our own origin.
// Browsers always send Sec-Fetch-Site and Origin on cross-site writes; a request
// with neither is not from a browser page and must prove itself with Origin.
func SameOrigin(r *http.Request, origin string) bool {
	got := r.Header.Get("Origin")
	if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
		if site != "same-origin" {
			return false
		}
		return got == "" || got == origin
	}
	return got == origin
}

// CSRF rejects cross-site state-changing requests (defence in depth on top of
// SameSite=Lax cookies; see OWASP CSRF cheat sheet: Fetch Metadata + Origin).
func CSRF(origin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if unsafeMethod(r.Method) && !SameOrigin(r, origin) {
				WriteError(w, r, apperr.Forbidden("invalid request origin"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Resolver turns a session token into the viewer behind it.
type Resolver func(ctx context.Context, token string) (viewer.Viewer, error)

// Auth resolves the session cookie into a Viewer. Missing, expired or revoked
// sessions simply yield an anonymous viewer; only infrastructure failures
// abort the request.
func Auth(cookieName string, resolve Resolver) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Add("Vary", "Cookie")
			v := viewer.Anonymous
			if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
				resolved, err := resolve(r.Context(), c.Value)
				switch {
				case err == nil:
					v = resolved
				case apperr.KindOf(err) == apperr.KindUnauthorized:
				default:
					WriteError(w, r, err)
					return
				}
			}
			if meta, ok := r.Context().Value(infoKey).(*info); ok {
				meta.userID = v.ID()
			}
			next.ServeHTTP(w, r.WithContext(viewer.With(r.Context(), v)))
		})
	}
}

// Authed lets only signed-in viewers through.
func Authed(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !viewer.From(r.Context()).Authenticated {
			WriteError(w, r, apperr.Unauthorized("authentication required"))
			return
		}
		next(w, r)
	}
}

// Staff lets only moderators and admins through.
func Staff(next http.HandlerFunc) http.HandlerFunc {
	return requireRole(next, func(v viewer.Viewer) bool { return v.IsStaff() })
}

// Admin lets only admins through.
func Admin(next http.HandlerFunc) http.HandlerFunc {
	return requireRole(next, func(v viewer.Viewer) bool { return v.IsAdmin() })
}

func requireRole(next http.HandlerFunc, ok func(viewer.Viewer) bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		v := viewer.From(r.Context())
		if !v.Authenticated {
			WriteError(w, r, apperr.Unauthorized("authentication required"))
			return
		}
		if !ok(v) {
			WriteError(w, r, apperr.Forbidden("insufficient role"))
			return
		}
		next(w, r)
	}
}

// IPKey keys a limiter by client address.
func IPKey(proxies Proxies) func(*http.Request) string {
	return func(r *http.Request) string { return "ip:" + proxies.ClientIP(r) }
}

// UserKey keys a limiter by user, falling back to the address for anonymous callers.
func UserKey(proxies Proxies) func(*http.Request) string {
	return func(r *http.Request) string {
		if v := viewer.From(r.Context()); v.Authenticated {
			return "user:" + v.ID()
		}
		return "ip:" + proxies.ClientIP(r)
	}
}
