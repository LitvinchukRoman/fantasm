package markdown

import (
	"regexp"
	"strings"
	"testing"
	"time"
)

// dangerous finds executable markup. Attribute checks are scoped to inside a tag: "onA=" in a paragraph is just text.
var dangerous = regexp.MustCompile(`(?i)<\s*(script|iframe|object|embed|style|link|meta|base|form|svg|math)\b|<[^>]*\s(on[a-z]+\s*=|(href|src|action|formaction|xlink:href)\s*=\s*["']?\s*(javascript|data|vbscript):)`)

var seeds = []string{
	"# Title\n\nHello **world** [link](https://example.com)",
	"<script>alert(1)</script>",
	"[x](javascript:alert(1))", "[x](JaVaScRiPt:alert(1))", "[x](&#106;avascript:alert(1))", "[x]( \tjavascript:alert(1))",
	"![x](javascript:alert(1))", "![x](https://example.com/a.png)", "![x](http://example.com/a.png)", "![x](data:image/png;base64,AAAA)",
	"<img src=x onerror=alert(1)>", "<svg onload=alert(1)>", "<a href=\"javascript:alert(1)\">x</a>", "<iframe src=//evil></iframe>",
	"<style>*{background:url(javascript:alert(1))}</style>", "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
	"`<script>`", "```html\n<script>alert(1)</script>\n```", "<details open ontoggle=alert(1)>", "[a](<javascript:alert(1)>)",
	"<<script>script>alert(1)<</script>/script>", "\x00<script>", "<scr\x00ipt>alert(1)</script>", "[x][r]\n\n[r]: javascript:alert(1)",
	"<https://example.com>", "<javascript:alert(1)>", "&lt;script&gt;alert(1)&lt;/script&gt;", "# <script>alert(1)</script>",
}

// FuzzRender: for any input the profile either refuses it or returns HTML with
// no executable construct in it, and it never panics.
func FuzzRenderNeverExecutable(f *testing.F) {
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, src string) {
		for _, p := range []Profile{Idea, Post} {
			res, err := p.Render(src)
			if err != nil {
				continue
			}
			if m := dangerous.FindString(res.HTML); m != "" {
				t.Fatalf("executable construct %q in %q (from %q)", m, res.HTML, src)
			}
			if strings.Contains(res.Text, "<") && dangerous.MatchString(res.Text) && strings.Contains(res.HTML, res.Text) {
				t.Fatalf("raw markup leaked into text: %q", res.Text)
			}
		}
	})
}

func TestSeedsStaySafe(t *testing.T) {
	for _, s := range seeds {
		for _, p := range []Profile{Idea, Post} {
			if res, err := p.Render(s); err == nil {
				if m := dangerous.FindString(res.HTML); m != "" {
					t.Errorf("%q -> %q (%q)", s, res.HTML, m)
				}
			}
		}
	}
}

func TestOversizedInputIsRefusedNotTruncated(t *testing.T) {
	if _, err := Post.Render(strings.Repeat("a", 5001)); err == nil {
		t.Error("post over its limit accepted")
	}
	if _, err := Idea.Render(strings.Repeat("a", 20001)); err == nil {
		t.Error("idea over its limit accepted")
	}
	if _, err := Post.Render(strings.Repeat("[x](https://e.example) ", 11)); err == nil {
		t.Error("post with more than ten links accepted")
	}
}

func TestPathologicalInputFinishesQuickly(t *testing.T) {
	for name, src := range map[string]string{
		"nested emphasis": strings.Repeat("*a ", 1500),
		"nested brackets": strings.Repeat("[", 2000) + strings.Repeat("]", 2000),
		"nested quotes":   strings.Repeat("> ", 2000) + "x",
		"nested lists":    strings.Repeat("- ", 2000) + "x",
		"backticks":       strings.Repeat("`", 4000),
		"unclosed links":  strings.Repeat("[a](", 1000),
	} {
		done := make(chan struct{})
		go func() { _, _ = Idea.Render(src); close(done) }()
		select {
		case <-done:
		case <-timeAfter():
			t.Errorf("%s: rendering did not finish", name)
		}
	}
}

func timeAfter() <-chan time.Time { return time.After(5 * time.Second) }
