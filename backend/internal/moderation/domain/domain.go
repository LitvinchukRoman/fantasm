// Package domain holds the moderation rules: when reports hide an idea and which decisions are valid.
package domain

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	// AutoHideThreshold is how many open reports hide an approved idea until a moderator looks.
	AutoHideThreshold = 5
	MaxReasonRunes    = 500
	MaxNoteRunes      = 1000
	MaxQueueLimit     = 50
	DefaultQueueLimit = 20
	MaxReports        = 100
)

type Decision string

const (
	Approved Decision = "APPROVED"
	Hidden   Decision = "HIDDEN"
	Rejected Decision = "REJECTED"
)

func (d Decision) Valid() bool { return d == Approved || d == Hidden || d == Rejected }

type State string

const (
	Pending State = "PENDING"
	// HiddenState is an idea taken off the site by reports or a moderator, awaiting review.
	HiddenState State = "HIDDEN"
)

func (s State) Valid() bool { return s == Pending || s == HiddenState }

type Source string

const (
	Premoderation Source = "PREMODERATION"
	Reports       Source = "REPORTS"
)

// ShouldAutoHide says whether the open report count takes an approved idea down.
func ShouldAutoHide(openReports int) bool { return openReports >= AutoHideThreshold }

// CountsAsApproval is whether a decision raises the author's approved_ideas: only
// the first approval of a pending idea does, restoring a hidden one does not.
func CountsAsApproval(from State, d Decision) bool { return from == Pending && d == Approved }

// CleanText trims free text typed by a person and rejects anything that is not
// plain text: bad UTF-8, NUL and other control characters (newline and tab are fine).
func CleanText(s string, min, max int) (string, bool) {
	s = strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n"))
	n := utf8.RuneCountInString(s)
	if !utf8.ValidString(s) || n < min || n > max {
		return "", false
	}
	for _, r := range s {
		if unicode.IsControl(r) && r != '\n' && r != '\t' {
			return "", false
		}
	}
	return s, true
}

type Author struct{ ID, Handle, Name string }

// QueueItem is one open case with enough of the idea for a moderator to decide.
type QueueItem struct {
	CaseID         string
	IdeaID         string
	Slug           string
	Title          string
	Summary        string
	Category       string
	HTML           string
	Author         Author
	State          State
	Source         Source
	OpenedAt       time.Time
	OpenReports    int
	AuthorKarma    int
	AuthorApproved int
}

type Report struct {
	Reporter  Author
	Reason    string
	Status    string
	CreatedAt time.Time
}
