package domain

import (
	"strings"
	"unicode/utf8"
)

// Message is the sentence the browser shows. It uses the same words as the inbox.
func Message(kind Type, payload map[string]any) (title, body, path string) {
	title = "Fantasm"
	idea := clip(str(payload, "ideaTitle"), 80)
	who := actor(payload)
	var sentence string
	switch kind {
	case Approved:
		sentence = withTitle("Вашу ідею «» схвалено й опубліковано.", idea)
	case Hidden:
		switch {
		case truthy(payload["automatic"]):
			sentence = withTitle("Вашу ідею «» тимчасово сховано через скарги. Її перевірить модератор.", idea)
		case str(payload, "decision") == "REJECTED":
			sentence = withTitle("Вашу ідею «» відхилено.", idea)
		default:
			sentence = withTitle("Модератор сховав вашу ідею «».", idea)
		}
	case Comment:
		sentence = withTitle(who+" коментує ідею «».", idea)
	case Vote:
		sentence = withTitle(who+" підтримує вашу ідею «».", idea)
	case Join:
		sentence = withTitle(who+" хоче долучитися до ідеї «».", idea)
	case Accepted:
		sentence = withTitle("Вас прийнято до команди ідеї «».", idea)
	case EventReminder:
		sentence = withTitle("Нагадування про подію «».", idea)
	default:
		if message := str(payload, "message"); message != "" {
			sentence = message
		} else if idea != "" {
			sentence = "«" + idea + "»"
		} else {
			sentence = "Сповіщення від Fantasm"
		}
	}
	if note := str(payload, "note"); note != "" {
		sentence += " Примітка: " + note
	}
	return title, clip(sentence, 180), ideaPath(payload)
}

func withTitle(sentence, title string) string {
	if title == "" {
		return strings.ReplaceAll(sentence, " «»", "")
	}
	return strings.ReplaceAll(sentence, "«»", "«"+title+"»")
}

func actor(payload map[string]any) string {
	if name := str(payload, "actorName"); name != "" {
		return clip(name, 80)
	}
	if handle := str(payload, "actorHandle"); handle != "" {
		return clip(handle, 80)
	}
	return "Хтось"
}

func str(payload map[string]any, key string) string {
	value, _ := payload[key].(string)
	return strings.TrimSpace(value)
}

func truthy(value any) bool {
	on, ok := value.(bool)
	return ok && on
}

func ideaPath(payload map[string]any) string {
	slug := str(payload, "ideaSlug")
	if len(slug) > 80 || !slugOK(slug) {
		return "/notifications"
	}
	return "/ideas/" + slug
}

func slugOK(slug string) bool {
	if slug == "" {
		return false
	}
	dash := false
	for _, r := range slug {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			dash = false
		case r == '-' && !dash:
			dash = true
		default:
			return false
		}
	}
	return !dash && !strings.HasPrefix(slug, "-")
}

func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n-1]) + "…"
}
