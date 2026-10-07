package markdown

import (
	"regexp"
	"strings"
	"testing"

	"golang.org/x/net/html"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// Every payload must come out without anything executable, whichever profile renders it.
var xssCorpus = []string{
	`<script>alert(1)</script>`,
	`<img src=x onerror=alert(1)>`,
	`<svg onload=alert(1)><circle/></svg>`,
	`<iframe src="javascript:alert(1)"></iframe>`,
	`<a href="javascript:alert(1)">x</a>`,
	`<div style="background:url(javascript:alert(1))">x</div>`,
	`<details open ontoggle=alert(1)>x</details>`,
	"<math><mi//xlink:href=\"data:x,<script>alert(1)</script>\">",
	`<body onload=alert(1)>`,
	`<form action="javascript:alert(1)"><button>x</button></form>`,
	`<object data="data:text/html,<script>alert(1)</script>"></object>`,
	`<style>@import 'x';</style>`,
	"`<script>alert(1)</script>`",
	"```html\n<script>alert(1)</script>\n```",
	`<<script>script>alert(1)<</script>/script>`,
	`<A HREF="jAvAsCrIpT:alert(1)">x</A>`,
	`<input autofocus onfocus=alert(1)>`,
	`<a href="&#106;avascript:alert(1)">x</a>`,
}

func TestSanitizesXSSCorpus(t *testing.T) {
	for _, p := range []Profile{Idea, Post} {
		for _, payload := range xssCorpus {
			res, err := p.Render(payload)
			if err != nil {
				continue // rejected outright is also safe
			}
			if why := unsafeMarkup(res.HTML); why != "" {
				t.Errorf("payload %q produced unsafe %s: %s", payload, why, res.HTML)
			}
		}
	}
}

func TestRendersNormalMarkdown(t *testing.T) {
	res, err := Idea.Render("## Заголовок\n\nТекст з **жирним** і [посиланням](https://example.com).\n\n- один\n- два\n\n### Ще\n\n## Заголовок")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`<h2 id="h-заголовок">`, `<strong>жирним</strong>`, `href="https://example.com"`, `rel="nofollow noreferrer noopener"`, `target="_blank"`, `<li>один</li>`, `id="h-заголовок-1"`} {
		if !strings.Contains(res.HTML, want) {
			t.Errorf("missing %s in %s", want, res.HTML)
		}
	}
	if len(res.TOC) != 3 || res.TOC[0].ID != "h-заголовок" || res.TOC[2].ID != "h-заголовок-1" || res.TOC[1].Depth != 3 {
		t.Errorf("toc = %+v", res.TOC)
	}
	if strings.Contains(res.Text, "*") || !strings.Contains(res.Text, "Текст з жирним і посиланням.") {
		t.Errorf("text = %q", res.Text)
	}
}

func TestPostHasNoHeadingIDs(t *testing.T) {
	res, err := Post.Render("## hello")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(res.HTML, "id=") || len(res.TOC) != 0 {
		t.Errorf("post leaked ids: %s", res.HTML)
	}
}

func TestRejects(t *testing.T) {
	long := strings.Repeat("a", Post.MaxRunes+1)
	manyLinks := strings.Repeat("[a](https://example.com) ", Post.MaxLinks+1)
	tests := map[string]struct {
		p   Profile
		src string
	}{
		"empty":           {Post, "   \n"},
		"too long":        {Post, long},
		"control":         {Post, "a\x00b"},
		"bad utf8":        {Post, "a\xffb"},
		"js link":         {Post, "[x](javascript:alert(1))"},
		"data link":       {Post, "[x](data:text/html;base64,AAAA)"},
		"autolink js":     {Post, "<javascript:alert(1)>"},
		"image in post":   {Post, "![x](https://example.com/a.png)"},
		"http image":      {Idea, "![x](http://example.com/a.png)"},
		"data image":      {Idea, "![x](data:image/png;base64,AAAA)"},
		"too many links":  {Post, manyLinks},
		"protocol-relatv": {Post, "[x](//evil.example)"},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := tt.p.Render(tt.src)
			if apperr.KindOf(err) != apperr.KindUnprocessable {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestAllowsSafeImageAndRelativeLinks(t *testing.T) {
	res, err := Idea.Render("![лого](https://cdn.example.com/a.png)\n\n[до гайдів](/guides) [вниз](#x) <https://example.com/p>")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`<img src="https://cdn.example.com/a.png"`, `href="/guides"`, `href="#x"`, `href="https://example.com/p"`} {
		if !strings.Contains(res.HTML, want) {
			t.Errorf("missing %s in %s", want, res.HTML)
		}
	}
}

func TestExcerpt(t *testing.T) {
	if got := Excerpt("short", 10); got != "short" {
		t.Fatal(got)
	}
	if got := Excerpt("aaa bbb ccc ddd eee", 10); got != "aaa bbb…" {
		t.Fatalf("%q", got)
	}
}

var allowedAttrs = map[string]bool{"href": true, "title": true, "rel": true, "target": true, "class": true, "id": true, "src": true, "alt": true}

// unsafeMarkup tokenizes the output the way a browser would and reports any tag
// or attribute outside the allowlist. Words like "onerror=" inside text are fine.
func unsafeMarkup(out string) string {
	z := html.NewTokenizer(strings.NewReader(out))
	for {
		switch z.Next() {
		case html.ErrorToken:
			return ""
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			switch tok.Data {
			case "script", "iframe", "svg", "style", "object", "form", "input", "math":
				return "tag " + tok.Data
			}
			for _, a := range tok.Attr {
				if !allowedAttrs[a.Key] {
					return "attribute " + a.Key
				}
				if (a.Key == "href" || a.Key == "src") && !regexp.MustCompile(`(?i)^\s*(https?:|mailto:|/[^/]|#)`).MatchString(a.Val) {
					return "url " + a.Val
				}
			}
		}
	}
}

func FuzzRender(f *testing.F) {
	for _, s := range xssCorpus {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		res, err := Idea.Render(s)
		if err != nil {
			return
		}
		if why := unsafeMarkup(res.HTML); why != "" {
			t.Fatalf("unsafe %s for %q: %s", why, s, res.HTML)
		}
	})
}
