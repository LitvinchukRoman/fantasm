package domain

import (
	"strconv"
	"strings"
	"unicode"
)

const maxHandleLen = 30

// cyrillic follows the Ukrainian national romanization (2010); Russian-only
// letters are mapped to their closest Latin form.
var cyrillic = map[rune]string{
	'а': "a", 'б': "b", 'в': "v", 'г': "h", 'ґ': "g", 'д': "d", 'е': "e", 'є': "ie",
	'ж': "zh", 'з': "z", 'и': "y", 'і': "i", 'ї': "i", 'й': "i", 'к': "k", 'л': "l",
	'м': "m", 'н': "n", 'о': "o", 'п': "p", 'р': "r", 'с': "s", 'т': "t", 'у': "u",
	'ф': "f", 'х': "kh", 'ц': "ts", 'ч': "ch", 'ш': "sh", 'щ': "shch", 'ь': "", 'ю': "iu",
	'я': "ia", 'ё': "e", 'ы': "y", 'э': "e", 'ъ': "",
}

// Word-initial forms of the iotated letters.
var cyrillicInitial = map[rune]string{'є': "ye", 'ї': "yi", 'й': "y", 'ю': "yu", 'я': "ya"}

// HandleCandidates derives readable handles from a public display name, most
// preferred first. The e-mail is never an input: handles are public and would
// leak the address.
func HandleCandidates(name string) []string {
	base := handleBase(name)
	if base == "" {
		return nil
	}
	out := []string{base}
	for i := 2; i <= 9; i++ {
		suffix := "-" + strconv.Itoa(i)
		out = append(out, cutHandle(base, maxHandleLen-len(suffix))+suffix)
	}
	return out
}

func handleBase(name string) string {
	var b strings.Builder
	wordStart := true
	for _, r := range strings.ToLower(name) {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			wordStart = false
		case r == '\'' || r == '’' || r == 'ʼ':
			// Ukrainian apostrophe is dropped inside a word.
		case cyrillic[r] != "" || r == 'ь' || r == 'ъ':
			if s, ok := cyrillicInitial[r]; ok && wordStart {
				b.WriteString(s)
			} else {
				b.WriteString(cyrillic[r])
			}
			wordStart = false
		case unicode.IsLetter(r) || unicode.IsMark(r):
			// Letters without a mapping are dropped rather than splitting the word.
			wordStart = false
		default:
			b.WriteByte('-')
			wordStart = true
		}
	}
	h := cutHandle(collapseDashes(b.String()), maxHandleLen)
	if !handlePattern.MatchString(h) || reservedHandles[h] {
		return ""
	}
	return h
}

func collapseDashes(s string) string {
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '-' })
	return strings.Join(parts, "-")
}

func cutHandle(s string, n int) string {
	if len(s) > n {
		s = s[:n]
	}
	return strings.TrimRight(s, "-")
}
