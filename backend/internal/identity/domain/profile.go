package domain

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ProfileUpdate is a partial edit of the public profile; nil leaves a field alone.
type ProfileUpdate struct {
	Handle  *string
	Name    *string
	Bio     *string
	Faculty *string
}

var handlePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{2,29}$`)

// reservedHandles would collide with routes or impersonate the platform.
var reservedHandles = map[string]bool{
	"me": true, "admin": true, "administrator": true, "api": true, "u": true, "user": true, "users": true,
	"moderator": true, "mod": true, "root": true, "system": true, "support": true, "fantasm": true,
	"naukma": true, "ideas": true, "events": true, "guides": true, "login": true, "logout": true,
	"register": true, "settings": true, "null": true, "undefined": true, "www": true, "static": true,
	"assets": true, "healthz": true, "readyz": true, "about": true, "help": true, "new": true,
}

// IsGeneratedHandle recognises the placeholder assigned at first login.
func IsGeneratedHandle(h string) bool { return strings.HasPrefix(h, "u_") && len(h) == 34 }

// Normalize trims whitespace; it does not change meaning.
func (p ProfileUpdate) Normalize() ProfileUpdate {
	trim := func(s *string) *string {
		if s == nil {
			return nil
		}
		v := strings.TrimSpace(*s)
		return &v
	}
	lower := func(s *string) *string {
		if s == nil {
			return nil
		}
		v := strings.ToLower(strings.TrimSpace(*s))
		return &v
	}
	return ProfileUpdate{Handle: lower(p.Handle), Name: trim(p.Name), Bio: trim(p.Bio), Faculty: trim(p.Faculty)}
}

func (p ProfileUpdate) IsEmpty() bool {
	return p.Handle == nil && p.Name == nil && p.Bio == nil && p.Faculty == nil
}

// Validate returns field errors for a normalized update.
func (p ProfileUpdate) Validate() map[string]string {
	fields := map[string]string{}
	if p.Handle != nil {
		switch h := *p.Handle; {
		case !handlePattern.MatchString(h):
			fields["handle"] = "must be 3-30 characters: lowercase letters, digits, '_' or '-', starting with a letter or digit"
		case reservedHandles[h]:
			fields["handle"] = "is reserved"
		}
	}
	if p.Name != nil {
		if n := utf8.RuneCountInString(*p.Name); n < 1 || n > 100 {
			fields["name"] = "must be 1-100 characters"
		} else if !plainText(*p.Name, false) {
			fields["name"] = "contains characters that are not allowed"
		}
	}
	if p.Faculty != nil {
		if utf8.RuneCountInString(*p.Faculty) > 100 {
			fields["faculty"] = "must be at most 100 characters"
		} else if !plainText(*p.Faculty, false) {
			fields["faculty"] = "contains characters that are not allowed"
		}
	}
	if p.Bio != nil {
		if utf8.RuneCountInString(*p.Bio) > 500 {
			fields["bio"] = "must be at most 500 characters"
		} else if !plainText(*p.Bio, true) {
			fields["bio"] = "contains characters that are not allowed"
		}
	}
	return fields
}

// plainText rejects invalid UTF-8, control characters (newlines optionally allowed)
// and angle brackets: profile fields are plain text, never markup.
func plainText(s string, newlines bool) bool {
	if !utf8.ValidString(s) {
		return false
	}
	for _, r := range s {
		if r == '<' || r == '>' {
			return false
		}
		if unicode.IsControl(r) && !(newlines && (r == '\n' || r == '\r' || r == '\t')) {
			return false
		}
	}
	return true
}

// CleanName makes a provider-supplied display name fit the profile rules.
func CleanName(s string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(s) {
		if unicode.IsControl(r) || r == '<' || r == '>' {
			continue
		}
		b.WriteRune(r)
	}
	out := strings.TrimSpace(b.String())
	if utf8.RuneCountInString(out) > 100 {
		out = string([]rune(out)[:100])
	}
	return out
}
