// Package domain holds the rules of votes and participation.
package domain

import (
	"math"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

type State string

const (
	Interested State = "INTERESTED"
	Joined     State = "JOINED"
	Accepted   State = "ACCEPTED"
	Declined   State = "DECLINED"
)

// Requestable states are the ones a person may pick for themselves; the other two are the author's decision.
func (s State) Requestable() bool { return s == Interested || s == Joined }

// Counts reports whether a participation takes a seat and counts in joins_count.
func (s State) Counts() bool { return s == Joined || s == Accepted }

// VoteKarma is the karma an author earns from one vote of the given weight.
// The multiplier was frozen on the idea at creation. Every vote is worth at least 1.
func VoteKarma(weight int, multiplier float64) int {
	return max(int(math.Round(float64(weight)*multiplier)), 1)
}

const MaxRole = 40

// CleanRole trims a role and rejects control characters and excess length.
func CleanRole(role string) (string, error) {
	role = strings.Join(strings.Fields(role), " ")
	if utf8.RuneCountInString(role) > MaxRole {
		return "", apperr.Validation(map[string]string{"role": "must be at most 40 characters"})
	}
	for _, r := range role {
		if unicode.IsControl(r) {
			return "", apperr.Validation(map[string]string{"role": "must not contain control characters"})
		}
	}
	return role, nil
}

type Participation struct {
	State State
	Role  string
}
