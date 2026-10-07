package apperr

import "errors"

type Kind int

const (
	KindInternal Kind = iota
	KindInvalid
	KindUnauthorized
	KindForbidden
	KindNotFound
	KindConflict
	KindNotImplemented
	KindRateLimited
	KindTooLarge
	KindUnprocessable
	KindUnsupportedMedia
	KindMethodNotAllowed
)

type Error struct {
	Kind   Kind
	Msg    string
	Err    error
	Fields map[string]string
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Msg + ": " + e.Err.Error()
	}
	return e.Msg
}

func (e *Error) Unwrap() error { return e.Err }

func New(kind Kind, msg string) error { return &Error{Kind: kind, Msg: msg} }

func Wrap(kind Kind, msg string, err error) error { return &Error{Kind: kind, Msg: msg, Err: err} }

func Invalid(msg string) error      { return New(KindInvalid, msg) }
func Unauthorized(msg string) error { return New(KindUnauthorized, msg) }
func Forbidden(msg string) error    { return New(KindForbidden, msg) }
func NotFound(msg string) error     { return New(KindNotFound, msg) }
func Conflict(msg string) error     { return New(KindConflict, msg) }
func RateLimited(msg string) error  { return New(KindRateLimited, msg) }
func TooLarge(msg string) error     { return New(KindTooLarge, msg) }

// Validation reports well-formed input that breaks a domain rule. Fields maps
// a request field name to a message that is safe to show the client.
func Validation(fields map[string]string) error {
	return &Error{Kind: KindUnprocessable, Msg: "validation failed", Fields: fields}
}

func NotImplemented(what string) error { return New(KindNotImplemented, what+" is not implemented") }

func KindOf(err error) Kind {
	var e *Error
	if errors.As(err, &e) {
		return e.Kind
	}
	return KindInternal
}

func MessageOf(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Msg
	}
	return err.Error()
}

// FieldsOf returns the validation fields attached to err, if any.
func FieldsOf(err error) map[string]string {
	var e *Error
	if errors.As(err, &e) {
		return e.Fields
	}
	return nil
}
