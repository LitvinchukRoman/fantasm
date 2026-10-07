package domain

import (
	"regexp"
	"testing"
)

var slugShape = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// FuzzSlugify: whatever the title, a slug is empty or a valid, bounded path segment.
func FuzzSlugify(f *testing.F) {
	for _, s := range []string{"Hello World", "Привіт, світе! Ґанок їжак", "../../etc/passwd", "a/b?c=d#e", "  ", "---", "ЩЩЩЩ", "\x00", "💥 boom", "ʼ’'"} {
		f.Add(s, 60)
	}
	f.Fuzz(func(t *testing.T, s string, max int) {
		max = max%200 + 1
		if max < 1 {
			max = 1
		}
		got := Slugify(s, max)
		if len(got) > max {
			t.Fatalf("%q longer than %d", got, max)
		}
		if got != "" && !slugShape.MatchString(got) {
			t.Fatalf("%q is not a slug (from %q)", got, s)
		}
		if idea := IdeaSlug(s); !slugShape.MatchString(idea) || len(idea) > 90 {
			t.Fatalf("idea slug %q (from %q)", idea, s)
		}
	})
}
