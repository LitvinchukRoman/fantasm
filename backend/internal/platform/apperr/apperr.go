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
)

type Error struct {
	Kind Kind
	Msg  string
	Err  error
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
