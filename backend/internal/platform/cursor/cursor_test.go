package cursor

import (
	"strings"
	"testing"
	"time"
)

const id = "0b0f6c52-6c1e-4c0e-9f7d-4a3a9b2f1c11"

func TestRoundTrip(t *testing.T) {
	c := New([]byte("secret"))
	want := Position{Key: "2026-10-08T00:00:00Z", ID: id}
	got, err := c.Decode(c.Encode("feed/hot", want), "feed/hot")
	if err != nil || got == nil || *got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
	if got, err := c.Decode("", "feed/hot"); got != nil || err != nil {
		t.Fatalf("empty cursor: %+v, %v", got, err)
	}
}

func TestRejectsForgedCursors(t *testing.T) {
	c, other := New([]byte("secret")), New([]byte("another"))
	good := c.Encode("scope", Position{Key: "k", ID: id})
	body, sig, _ := strings.Cut(good, ".")
	cases := map[string]string{
		"other secret":    other.Encode("scope", Position{Key: "k", ID: id}),
		"other scope":     c.Encode("different", Position{Key: "k", ID: id}),
		"no signature":    body,
		"empty signature": body + ".",
		"flipped payload": "A" + body[1:] + "." + sig,
		"flipped sig":     body + "." + "A" + sig[1:],
		"not base64":      "!!!.???",
		"too long":        strings.Repeat("a", 600) + "." + sig,
		"extra parts":     body + "." + sig + "." + sig,
		"bad id":          c.Encode("scope", Position{Key: "k", ID: "not-an-id"}),
		"empty key":       c.Encode("scope", Position{Key: "", ID: id}),
	}
	for name, raw := range cases {
		if p, err := c.Decode(raw, "scope"); err == nil || p != nil {
			t.Errorf("%s accepted: %+v", name, p)
		}
	}
}

func TestTimeKeyKeepsMicroseconds(t *testing.T) {
	at := time.Date(2026, 10, 8, 1, 2, 3, 123456789, time.FixedZone("x", 3*3600))
	got, err := Time(FormatTime(at))
	if err != nil || !got.Equal(at.Truncate(time.Microsecond)) {
		t.Fatalf("%v, %v", got, err)
	}
	if _, err := Time("yesterday"); err == nil {
		t.Fatal("garbage parsed as time")
	}
}

// FuzzDecode: whatever bytes arrive, decoding never panics and never accepts a cursor that was not signed with our key.
func FuzzDecode(f *testing.F) {
	c := New([]byte("secret"))
	f.Add(c.Encode("s", Position{Key: "k", ID: id}), "s")
	f.Add("", "s")
	f.Add("a.b", "s")
	f.Add("....", "")
	f.Fuzz(func(t *testing.T, raw, scope string) {
		p, err := c.Decode(raw, scope)
		if err == nil && p != nil && c.Encode(scope, *p) != raw {
			t.Fatalf("accepted a cursor we did not issue: %q -> %+v", raw, p)
		}
	})
}
