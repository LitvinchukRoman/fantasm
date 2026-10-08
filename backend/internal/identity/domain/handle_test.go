package domain

import (
	"strings"
	"testing"
)

func TestHandleCandidates(t *testing.T) {
	for name, want := range map[string]string{
		"Roman Litvinchuk":  "roman-litvinchuk",
		"Роман Литвинчук":   "roman-lytvynchuk",
		"Юлія Щербак":       "yuliia-shcherbak",
		"Ярослав Зінчук":    "yaroslav-zinchuk",
		"Олег Мар'янович":   "oleh-marianovych",
		"José  O'Neil":      "jos-oneil",
		"  --Anna__Bell.  ": "anna-bell",
		"Ab":                "",
		"admin":             "",
		"":                  "",
		"<script>":          "script",
		"Дуже Довге Ім'я Користувача Що Не Влазить": "duzhe-dovhe-imia-korystuvacha",
	} {
		got := HandleCandidates(name)
		if want == "" {
			if got != nil {
				t.Errorf("%q: got %v, want none", name, got)
			}
			continue
		}
		if len(got) != 9 || got[0] != want {
			t.Fatalf("%q: got %v, want first %q", name, got, want)
		}
		for _, h := range got {
			if !handlePattern.MatchString(h) || len(h) > maxHandleLen || reservedHandles[h] || IsGeneratedHandle(h) {
				t.Errorf("%q: invalid candidate %q", name, h)
			}
		}
		if !strings.HasSuffix(got[8], "-9") {
			t.Errorf("%q: last candidate %q", name, got[8])
		}
	}
}
