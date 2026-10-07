package domain_test

import (
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement/domain"
)

func TestVoteKarma(t *testing.T) {
	tests := []struct {
		weight int
		mult   float64
		want   int
	}{{1, 1, 1}, {3, 2, 6}, {1, 1.5, 2}, {3, 1.5, 5}, {1, 0.1, 1}, {0, 1, 1}}
	for _, tt := range tests {
		if got := domain.VoteKarma(tt.weight, tt.mult); got != tt.want {
			t.Errorf("VoteKarma(%d, %v) = %d, want %d", tt.weight, tt.mult, got, tt.want)
		}
	}
}

func TestStates(t *testing.T) {
	for state, want := range map[domain.State]struct{ requestable, counts bool }{
		domain.Interested: {true, false}, domain.Joined: {true, true}, domain.Accepted: {false, true}, domain.Declined: {false, false}, "X": {false, false},
	} {
		if state.Requestable() != want.requestable || state.Counts() != want.counts {
			t.Errorf("%s: requestable=%v counts=%v", state, state.Requestable(), state.Counts())
		}
	}
}

func TestCleanRole(t *testing.T) {
	if got, err := domain.CleanRole("  Go   dev "); err != nil || got != "Go dev" {
		t.Fatalf("got %q, %v", got, err)
	}
	for _, bad := range []string{strings.Repeat("я", 41), "a\x00b", "a\u0007b"} {
		if _, err := domain.CleanRole(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}
