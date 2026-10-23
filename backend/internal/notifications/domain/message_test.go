package domain

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

func TestMessageMatchesTheInbox(t *testing.T) {
	payload := map[string]any{"ideaSlug": "lecture-notes", "ideaTitle": "Конспект", "actorName": "Оля"}
	cases := []struct {
		kind Type
		body string
	}{
		{Approved, "Вашу ідею «Конспект» схвалено й опубліковано."},
		{Comment, "Оля коментує ідею «Конспект»."},
		{Vote, "Оля підтримує вашу ідею «Конспект»."},
		{Join, "Оля хоче долучитися до ідеї «Конспект»."},
		{Accepted, "Вас прийнято до команди ідеї «Конспект»."},
		{EventReminder, "Нагадування про подію «Конспект»."},
	}
	for _, tc := range cases {
		_, body, path := Message(tc.kind, payload)
		if body != tc.body || path != "/ideas/lecture-notes" {
			t.Errorf("%s: %q %s", tc.kind, body, path)
		}
	}
	hidden := map[string]any{"ideaTitle": "Конспект", "ideaSlug": "lecture-notes", "automatic": true}
	if _, body, _ := Message(Hidden, hidden); body != "Вашу ідею «Конспект» тимчасово сховано через скарги. Її перевірить модератор." {
		t.Errorf("automatic: %s", body)
	}
	hidden["automatic"] = false
	hidden["decision"] = "REJECTED"
	hidden["note"] = "Немає опису"
	if _, body, _ := Message(Hidden, hidden); body != "Вашу ідею «Конспект» відхилено. Примітка: Немає опису" {
		t.Errorf("rejected: %s", body)
	}
	if _, body, path := Message(System, map[string]any{"message": "Привіт"}); body != "Привіт" || path != "/notifications" {
		t.Errorf("system: %s %s", body, path)
	}
	if _, _, path := Message(Comment, map[string]any{"ideaSlug": "../admin"}); path != "/notifications" {
		t.Errorf("bad slug opened %s", path)
	}
	if _, body, _ := Message(Comment, map[string]any{"actorName": "100%", "ideaTitle": "А"}); !strings.Contains(body, "100%") || !strings.Contains(body, "«А»") {
		t.Errorf("percent name: %s", body)
	}
}

func TestEndpointAllowlist(t *testing.T) {
	ok := []string{
		"https://fcm.googleapis.com/fcm/send/abc",
		"https://updates.push.services.mozilla.com/wpush/v2/abc",
		"https://web.push.apple.com/Q",
		"https://wns2-pn1p.notify.windows.com/w/?token=abc",
	}
	for _, raw := range ok {
		if got, msg := NormalizeEndpoint(raw, false); got != raw || msg != "" {
			t.Errorf("%s: %q %s", raw, got, msg)
		}
	}
	bad := []string{
		"https://evil.example/push",
		"https://fcm.googleapis.com.evil/push",
		"http://fcm.googleapis.com/fcm/send/abc",
		"https://127.0.0.1/push",
		"https://fcm.googleapis.com/",
		"javascript:alert(1)",
	}
	for _, raw := range bad {
		if _, msg := NormalizeEndpoint(raw, false); msg == "" {
			t.Errorf("accepted %s", raw)
		}
	}
	if _, msg := NormalizeEndpoint("http://127.0.0.1:9/push/one", false); msg == "" {
		t.Error("localhost accepted in production")
	}
	if got, msg := NormalizeEndpoint("http://127.0.0.1:9/push/one", true); got == "" || msg != "" {
		t.Errorf("local: %q %s", got, msg)
	}
}

func TestKeyShape(t *testing.T) {
	if _, ok := NormalizeKey("aa", 65); ok {
		t.Error("short key accepted")
	}
	pub := append([]byte{4}, bytes.Repeat([]byte{1}, 64)...)
	priv := bytes.Repeat([]byte{2}, 32)
	if !ValidVAPID(base64.RawURLEncoding.EncodeToString(pub), base64.RawURLEncoding.EncodeToString(priv)) {
		t.Error("rejected a well-shaped pair")
	}
	if ValidVAPID("abc", "def") {
		t.Error("accepted garbage")
	}
}
