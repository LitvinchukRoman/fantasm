// Package httpx holds the HTTP plumbing shared by every bounded context:
// middleware, strict JSON decoding and one error-to-response mapping.
package httpx

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
)

type ctxKey int

const (
	requestIDKey ctxKey = iota
	infoKey
)

// info is filled while a request travels down the chain so the access log can
// report who made it.
type info struct{ userID string }

func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

// recorder remembers status and size, and whether the header was sent.
type recorder struct {
	http.ResponseWriter
	status int
	bytes  int
	wrote  bool
}

func (r *recorder) WriteHeader(code int) {
	if r.wrote {
		return
	}
	r.wrote = true
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *recorder) Write(b []byte) (int, error) {
	if !r.wrote {
		r.WriteHeader(http.StatusOK)
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// Unwrap lets http.ResponseController reach Flush and friends.
func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func record(w http.ResponseWriter) *recorder {
	if r, ok := w.(*recorder); ok {
		return r
	}
	return &recorder{ResponseWriter: w, status: http.StatusOK}
}

func WriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

type errorBody struct {
	Error     string            `json:"error"`
	Code      string            `json:"code"`
	Fields    map[string]string `json:"fields,omitempty"`
	RequestID string            `json:"requestId,omitempty"`
}

func statusOf(kind apperr.Kind) (int, string) {
	switch kind {
	case apperr.KindInvalid:
		return http.StatusBadRequest, "invalid_request"
	case apperr.KindUnauthorized:
		return http.StatusUnauthorized, "unauthorized"
	case apperr.KindForbidden:
		return http.StatusForbidden, "forbidden"
	case apperr.KindNotFound:
		return http.StatusNotFound, "not_found"
	case apperr.KindConflict:
		return http.StatusConflict, "conflict"
	case apperr.KindRateLimited:
		return http.StatusTooManyRequests, "rate_limited"
	case apperr.KindTooLarge:
		return http.StatusRequestEntityTooLarge, "payload_too_large"
	case apperr.KindUnprocessable:
		return http.StatusUnprocessableEntity, "validation_failed"
	case apperr.KindUnsupportedMedia:
		return http.StatusUnsupportedMediaType, "unsupported_media_type"
	case apperr.KindMethodNotAllowed:
		return http.StatusMethodNotAllowed, "method_not_allowed"
	case apperr.KindNotImplemented:
		return http.StatusNotImplemented, "not_implemented"
	default:
		return http.StatusInternalServerError, "internal_error"
	}
}

// WriteError is the single place where an error becomes a response. Anything
// that is not a deliberate apperr is logged and answered with a generic 500, so
// internals never reach the client.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	kind := apperr.KindOf(err)
	status, code := statusOf(kind)
	body := errorBody{Error: "internal server error", Code: code, RequestID: RequestIDFrom(r.Context())}
	if status == http.StatusInternalServerError {
		logging.From(r.Context()).ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "error", err)
	} else {
		body.Error = apperr.MessageOf(err)
		body.Fields = apperr.FieldsOf(err)
	}
	WriteJSON(w, status, body)
}
