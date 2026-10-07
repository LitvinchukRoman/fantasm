package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type Handler struct {
	service       *identity.Service
	logger        *slog.Logger
	origin        string
	secure        bool
	sessionCookie string
	loginCookie   string
	clientInfo    func(*http.Request) identity.ClientInfo
	limitAuth     func(http.HandlerFunc) http.HandlerFunc
}

// Option customizes a Handler.
type Option func(*Handler)

// WithClientInfo supplies the request metadata recorded with new sessions.
func WithClientInfo(fn func(*http.Request) identity.ClientInfo) Option {
	return func(h *Handler) { h.clientInfo = fn }
}

// WithAuthRateLimit wraps the login and callback routes, which are open to anyone.
func WithAuthRateLimit(wrap func(http.HandlerFunc) http.HandlerFunc) Option {
	return func(h *Handler) { h.limitAuth = wrap }
}

func NewHandler(service *identity.Service, logger *slog.Logger, publicURL string, opts ...Option) (*Handler, error) {
	u, err := url.Parse(publicURL)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
		return nil, fmt.Errorf("PUBLIC_URL must be an origin without a path, credentials, query, or fragment")
	}
	secure := u.Scheme == "https"
	if !secure && (u.Scheme != "http" || u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1") {
		return nil, fmt.Errorf("PUBLIC_URL must use HTTPS except on loopback")
	}
	h := &Handler{service: service, logger: logger, origin: u.Scheme + "://" + u.Host, secure: secure, sessionCookie: "fantasm_session", loginCookie: "fantasm_login"}
	if secure {
		h.sessionCookie = "__Host-fantasm_session"
		h.loginCookie = "__Host-fantasm_login"
	}
	for _, opt := range opts {
		opt(h)
	}
	if h.limitAuth == nil {
		h.limitAuth = func(next http.HandlerFunc) http.HandlerFunc { return next }
	}
	return h, nil
}

// SessionCookie is the name of the session cookie, for the auth middleware.
func (h *Handler) SessionCookie() string { return h.sessionCookie }

// Origin is the browser-facing origin that state-changing requests must come from.
func (h *Handler) Origin() string { return h.origin }

// Secure reports whether the deployment is served over HTTPS.
func (h *Handler) Secure() bool { return h.secure }

// Resolver turns a session token into a Viewer for httpx.Auth.
func (h *Handler) Resolver() httpx.Resolver {
	return func(ctx context.Context, token string) (viewer.Viewer, error) {
		user, err := h.service.CurrentUser(ctx, token)
		if err != nil {
			return viewer.Anonymous, err
		}
		return viewer.Viewer{Authenticated: true, User: user}, nil
	}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/providers", h.providers)
	mux.HandleFunc("GET /api/auth/{provider}/login", h.limitAuth(h.beginLogin))
	mux.HandleFunc("GET /api/auth/{provider}/callback", h.limitAuth(h.completeLogin))
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("POST /api/auth/logout-all", httpx.Authed(h.logoutAll))
	mux.HandleFunc("GET /api/me", h.me)
	mux.HandleFunc("PATCH /api/me", httpx.Authed(h.updateMe))
	mux.HandleFunc("GET /api/me/sessions", httpx.Authed(h.sessions))
	mux.HandleFunc("DELETE /api/me/sessions/{id}", httpx.Authed(h.revokeSession))
	mux.HandleFunc("PATCH /api/admin/users/{handle}/role", httpx.Admin(h.setRole))
}

func (h *Handler) beginLogin(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	login, err := h.service.BeginLogin(r.Context(), domain.Provider(r.PathValue("provider")))
	if err != nil {
		h.loginError(w, r, err)
		return
	}
	h.setCookie(w, h.loginCookie, login.BrowserToken, login.ExpiresAt, int(identity.LoginTTL.Seconds()))
	http.Redirect(w, r, login.URL, http.StatusFound)
}

func (h *Handler) completeLogin(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	h.clearCookie(w, h.loginCookie)
	ctx := r.Context()
	if h.clientInfo != nil {
		ctx = identity.WithClient(ctx, h.clientInfo(r))
	}
	provider := domain.Provider(r.PathValue("provider"))
	query := r.URL.Query()
	auth, err := h.service.CompleteLogin(ctx, provider, query.Get("state"), cookieValue(r, h.loginCookie), query.Get("code"), cookieValue(r, h.sessionCookie))
	if err != nil {
		h.log(r).WarnContext(ctx, "login failed", "provider", provider, "outcome", "failure", "kind", apperr.KindOf(err))
		h.loginError(w, r, err)
		return
	}
	h.log(r).InfoContext(ctx, "login succeeded", "provider", provider, "outcome", "success", "user_id", auth.User.ID)
	h.setCookie(w, h.sessionCookie, auth.Token, auth.ExpiresAt, maxAge(auth.ExpiresAt))
	http.Redirect(w, r, h.origin+"/", http.StatusSeeOther)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	v := viewer.From(r.Context())
	if !v.Authenticated {
		h.writeError(w, r, apperr.Unauthorized("authentication required"))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toUserResponse(v.User))
}

func (h *Handler) updateMe(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	var body struct {
		Handle  *string `json:"handle"`
		Name    *string `json:"name"`
		Bio     *string `json:"bio"`
		Faculty *string `json:"faculty"`
	}
	if err := httpx.DecodeJSON(w, r, &body); err != nil {
		h.writeError(w, r, err)
		return
	}
	user, err := h.service.UpdateProfile(r.Context(), viewer.From(r.Context()).ID(), domain.ProfileUpdate{
		Handle: body.Handle, Name: body.Name, Bio: body.Bio, Faculty: body.Faculty,
	})
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, toUserResponse(user))
}

func (h *Handler) sessions(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	list, err := h.service.Sessions(r.Context(), viewer.From(r.Context()).ID(), cookieValue(r, h.sessionCookie))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Sessions []domain.SessionInfo `json:"sessions"`
	}{Sessions: list})
}

func (h *Handler) revokeSession(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	id := r.PathValue("id")
	if !httpx.IsUUID(id) {
		h.writeError(w, r, apperr.NotFound("session not found"))
		return
	}
	if err := h.service.RevokeSession(r.Context(), viewer.From(r.Context()).ID(), id); err != nil {
		h.writeError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	if !httpx.SameOrigin(r, h.origin) {
		h.writeError(w, r, apperr.Forbidden("invalid request origin"))
		return
	}
	if err := h.service.Logout(r.Context(), cookieValue(r, h.sessionCookie)); err != nil {
		h.writeError(w, r, err)
		return
	}
	h.clearCookie(w, h.sessionCookie)
	h.clearCookie(w, h.loginCookie)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) logoutAll(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	if !httpx.SameOrigin(r, h.origin) {
		h.writeError(w, r, apperr.Forbidden("invalid request origin"))
		return
	}
	if err := h.service.RevokeAllSessions(r.Context(), viewer.From(r.Context()).ID()); err != nil {
		h.writeError(w, r, err)
		return
	}
	h.clearCookie(w, h.sessionCookie)
	h.clearCookie(w, h.loginCookie)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setRole(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	var body struct {
		Role domain.Role `json:"role"`
	}
	if err := httpx.DecodeJSON(w, r, &body); err != nil {
		h.writeError(w, r, err)
		return
	}
	actor := viewer.From(r.Context())
	user, err := h.service.SetRole(r.Context(), actor.ID(), r.PathValue("handle"), body.Role)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	h.log(r).WarnContext(r.Context(), "role changed", "actor_id", actor.ID(), "target_id", user.ID, "role", user.Role)
	httpx.WriteJSON(w, http.StatusOK, struct {
		Handle string      `json:"handle"`
		Role   domain.Role `json:"role"`
	}{Handle: user.Handle, Role: user.Role})
}

type userResponse struct {
	Memberships []domain.Membership `json:"memberships"`
	ID          string              `json:"id"`
	Handle      string              `json:"handle"`
	Name        string              `json:"name"`
	Email       string              `json:"email"`
	AvatarURL   string              `json:"avatarUrl"`
	Bio         string              `json:"bio"`
	Faculty     string              `json:"faculty"`
	Role        domain.Role         `json:"role"`
	Karma       int                 `json:"karma"`
	Verified    bool                `json:"verified"`
	CreatedAt   time.Time           `json:"createdAt"`
}

func toUserResponse(u domain.User) userResponse {
	memberships := u.Memberships
	if memberships == nil {
		memberships = []domain.Membership{}
	}
	return userResponse{
		ID: u.ID, Handle: u.Handle, Name: u.Name, Email: u.Email,
		AvatarURL: u.AvatarURL, Bio: u.Bio, Faculty: u.Faculty,
		Role: u.Role, Karma: u.Karma, Verified: len(memberships) > 0,
		CreatedAt: u.CreatedAt, Memberships: memberships,
	}
}

func (h *Handler) private(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Add("Vary", "Cookie")
}

func (h *Handler) log(r *http.Request) *slog.Logger { return logging.From(r.Context()) }

func maxAge(expires time.Time) int { return max(int(time.Until(expires).Seconds()), 1) }

func (h *Handler) setCookie(w http.ResponseWriter, name, value string, expires time.Time, maxAge int) {
	// Secure follows the config: it is false only for plain-http local development.
	//nolint:gosec // G124: Secure is deliberately configuration-driven
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: h.secure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: maxAge})
}

func (h *Handler) clearCookie(w http.ResponseWriter, name string) {
	h.setCookie(w, name, "", time.Unix(1, 0), -1)
}

func cookieValue(r *http.Request, name string) string {
	cookie, err := r.Cookie(name)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (h *Handler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	httpx.WriteError(w, r, err)
}

func (h *Handler) providers(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	list := h.service.Providers()
	if list == nil {
		list = []domain.Provider{}
	}
	httpx.WriteJSON(w, http.StatusOK, struct {
		Providers []domain.Provider `json:"providers"`
	}{Providers: list})
}

func (h *Handler) loginError(w http.ResponseWriter, r *http.Request, err error) {
	w.Header().Add("Vary", "Accept")
	if !strings.Contains(r.Header.Get("Accept"), "text/html") {
		h.writeError(w, r, err)
		return
	}
	code := "authentication_failed"
	if apperr.KindOf(err) == apperr.KindNotFound {
		code = "provider_unavailable"
	}
	if apperr.KindOf(err) == apperr.KindInternal {
		h.log(r).ErrorContext(r.Context(), "identity login failed", "error", err)
	}
	http.Redirect(w, r, h.origin+"/login?error="+code, http.StatusSeeOther)
}
