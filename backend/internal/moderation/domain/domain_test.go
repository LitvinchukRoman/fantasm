package domain

import (
	"strings"
	"testing"
)

func TestAutoHideThreshold(t *testing.T) {
	for n, want := range map[int]bool{0: false, 4: false, 5: true, 9: true} {
		if got := ShouldAutoHide(n); got != want {
			t.Errorf("ShouldAutoHide(%d) = %v", n, got)
		}
	}
}

func TestCountsAsApproval(t *testing.T) {
	if !CountsAsApproval(Pending, Approved) || CountsAsApproval(HiddenState, Approved) || CountsAsApproval(Pending, Rejected) {
		t.Fatal("only the first approval of a pending idea counts")
	}
}

func TestCleanText(t *testing.T) {
	cases := []struct {
		in   string
		min  int
		max  int
		want string
		ok   bool
	}{
		{"  spam  ", 1, 10, "spam", true},
		{"two\nlines\tok", 1, 20, "two\nlines\tok", true},
		{"", 1, 10, "", false},
		{"   ", 1, 10, "", false},
		{"", 0, 10, "", true},
		{"nul\x00byte", 1, 20, "", false},
		{"esc\x1b[31m", 1, 20, "", false},
		{"bad\xffutf8", 1, 20, "", false},
		{strings.Repeat("я", 11), 1, 10, "", false},
		{strings.Repeat("я", 10), 1, 10, strings.Repeat("я", 10), true},
	}
	for _, c := range cases {
		got, ok := CleanText(c.in, c.min, c.max)
		if got != c.want || ok != c.ok {
			t.Errorf("CleanText(%q) = %q, %v", c.in, got, ok)
		}
	}
}
