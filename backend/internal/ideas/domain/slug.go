package domain

import (
	"crypto/rand"
	"strings"
)

var translit = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "h", 'ґ': "g", 'д': "d", 'е': "e", 'є': "ie", 'ж': "zh", 'з': "z",
	'и': "y", 'і': "i", 'ї': "i", 'й': "i", 'к': "k", 'л': "l", 'м': "m", 'н': "n", 'о': "o", 'п': "p",
	'р': "r", 'с': "s", 'т': "t", 'у': "u", 'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "shch",
	'ь': "", 'ю': "iu", 'я': "ia", 'ъ': "", 'ы': "y", 'э': "e", 'ё': "io", '\'': "", '’': "", 'ʼ': "",
}

// Slugify makes a lowercase ASCII slug of at most max characters from any text.
// Ukrainian (and basic Russian) letters are transliterated; everything else that
// is not a letter or digit becomes a single hyphen. The result may be empty.
func Slugify(s string, max int) string {
	var b strings.Builder
	dash := true // swallow leading separators
	for _, r := range strings.ToLower(s) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			dash = false
			continue
		}
		if t, ok := translit[r]; ok {
			// Soft sign and apostrophes map to "" and neither add nor break a word.
			if t != "" {
				b.WriteString(t)
				dash = false
			}
			continue
		}
		// Punctuation, spaces and letters we cannot transliterate all separate words.
		if !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	out := b.String()
	if len(out) > max {
		out = out[:max]
	}
	return strings.Trim(out, "-")
}

// IdeaSlug builds the base slug for a title; "idea" stands in when nothing survives.
func IdeaSlug(title string) string {
	if s := Slugify(title, 60); len(s) >= 3 {
		return s
	}
	return "idea"
}

const slugAlphabet = "abcdefghjkmnpqrstuvwxyz23456789"

// WithSuffix appends a short random suffix, used when the base slug is taken.
func WithSuffix(base string) string {
	var b [5]byte
	_, _ = rand.Read(b[:])
	for i := range b {
		b[i] = slugAlphabet[int(b[i])%len(slugAlphabet)]
	}
	return base + "-" + string(b[:])
}
