package httpx

import (
	"net/http"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// probe captures what ServeMux's own error handlers would send, without sending it.
type probe struct {
	header http.Header
	status int
}

func (p *probe) Header() http.Header         { return p.header }
func (p *probe) Write(b []byte) (int, error) { return len(b), nil }
func (p *probe) WriteHeader(code int)        { p.status = code }

// JSONFallbacks makes the router's own 404 and 405 answers use the standard
// error body, so every response of the API has one shape and carries the request
// id. Matched routes and the router's redirects pass through untouched.
func JSONFallbacks(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, pattern := mux.Handler(r)
		if pattern != "" {
			// Not h.ServeHTTP: only the mux itself records the matched path values on the request.
			mux.ServeHTTP(w, r)
			return
		}
		p := &probe{header: http.Header{}}
		h.ServeHTTP(p, r)
		switch p.status {
		case http.StatusNotFound:
			WriteError(w, r, apperr.NotFound("not found"))
		case http.StatusMethodNotAllowed:
			if allow := p.header.Get("Allow"); allow != "" {
				w.Header().Set("Allow", allow)
			}
			WriteError(w, r, apperr.New(apperr.KindMethodNotAllowed, "method not allowed"))
		default:
			mux.ServeHTTP(w, r)
		}
	})
}
