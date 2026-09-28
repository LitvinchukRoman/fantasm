package http

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type Handler struct {
	service       *identity.Service
	logger        *slog.Logger
	origin        string
	secure        bool
	sessionCookie string
	loginCookie   string
}

func NewHandler(service *identity.Service, logger *slog.Logger, publicURL string) (*Handler, error) {
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
	return h, nil
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/auth/{provider}/login", h.beginLogin)
	mux.HandleFunc("GET /api/auth/{provider}/callback", h.completeLogin)
	mux.HandleFunc("POST /api/auth/logout", h.logout)
	mux.HandleFunc("GET /api/me", h.me)
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
		h.writeError(w, r, err)
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
	query := r.URL.Query()
	auth, err := h.service.CompleteLogin(r.Context(), domain.Provider(r.PathValue("provider")), query.Get("state"), cookieValue(r, h.loginCookie), query.Get("code"), cookieValue(r, h.sessionCookie))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	h.setCookie(w, h.sessionCookie, auth.Token, auth.ExpiresAt, int(identity.SessionTTL.Seconds()))
	http.Redirect(w, r, h.origin+"/", http.StatusSeeOther)
}

func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	user, err := h.service.CurrentUser(r.Context(), cookieValue(r, h.sessionCookie))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, userResponse{
		ID: user.ID, Handle: user.Handle, Name: user.Name, Email: user.Email,
		AvatarURL: user.AvatarURL, Bio: user.Bio, Faculty: user.Faculty,
		Affiliation: user.Affiliation, Role: user.Role, CreatedAt: user.CreatedAt,
	})
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	h.private(w)
	if r.Header.Get("Origin") != h.origin {
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

type userResponse struct {
	ID          string             `json:"id"`
	Handle      string             `json:"handle"`
	Name        string             `json:"name"`
	Email       string             `json:"email"`
	AvatarURL   string             `json:"avatarUrl"`
	Bio         string             `json:"bio"`
	Faculty     string             `json:"faculty"`
	Affiliation domain.Affiliation `json:"affiliation"`
	Role        domain.Role        `json:"role"`
	CreatedAt   time.Time          `json:"createdAt"`
}

func (h *Handler) private(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Add("Vary", "Cookie")
}

func (h *Handler) setCookie(w http.ResponseWriter, name, value string, expires time.Time, maxAge int) {
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
	status := http.StatusInternalServerError
	message := "internal server error"
	switch apperr.KindOf(err) {
	case apperr.KindInvalid:
		status = http.StatusBadRequest
	case apperr.KindUnauthorized:
		status = http.StatusUnauthorized
	case apperr.KindForbidden:
		status = http.StatusForbidden
	case apperr.KindNotFound:
		status = http.StatusNotFound
	case apperr.KindConflict:
		status = http.StatusConflict
	}
	if status == http.StatusInternalServerError {
		h.logger.ErrorContext(r.Context(), "identity request failed", "path", r.URL.Path, "error", err)
	} else {
		message = apperr.MessageOf(err)
	}
	writeJSON(w, status, struct {
		Error string `json:"error"`
	}{Error: message})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
