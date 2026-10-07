// Package markdown turns user-written Markdown into safe HTML.
//
// Two independent layers protect the output. goldmark runs without html.WithUnsafe,
// so raw HTML in the source is dropped and dangerous link schemes are blanked.
// The result then passes through a bluemonday allowlist that knows only the
// elements and attributes below. Validation additionally rejects what we do not
// want to store at all: oversized text, control characters, foreign link schemes
// and non-HTTPS images. See OWASP XSS Prevention: output encoding + HTML sanitization.
package markdown

import (
	"bytes"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/microcosm-cc/bluemonday"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/text"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// HeadingIDPrefix namespaces generated heading ids so they cannot clobber
// browser globals through DOM named access.
const HeadingIDPrefix = "h-"

type TOCItem struct {
	Depth int    `json:"depth"`
	Text  string `json:"text"`
	ID    string `json:"id"`
}

type Result struct {
	HTML           string
	Text           string
	TOC            []TOCItem
	ReadingMinutes int
}

// Profile describes what one kind of content may contain.
type Profile struct {
	MaxRunes    int
	MaxLinks    int
	AllowImages bool
	HeadingIDs  bool

	policy *bluemonday.Policy
}

var (
	// Idea is the long-form body of an idea: headings with anchors, a few images.
	Idea = newProfile(Profile{MaxRunes: 20_000, MaxLinks: 40, AllowImages: true, HeadingIDs: true})
	// Post is a forum message: no images, few links, no anchors.
	Post = newProfile(Profile{MaxRunes: 5_000, MaxLinks: 10})
)

var (
	engine = goldmark.New(goldmark.WithExtensions(extension.Strikethrough, extension.Table, extension.Linkify))
	idRe   = regexp.MustCompile(`^` + HeadingIDPrefix + `[\p{L}\p{N}_-]{1,100}$`)
	langRe = regexp.MustCompile(`^language-[a-z0-9+#-]{1,24}$`)
)

func newProfile(p Profile) Profile {
	policy := bluemonday.NewPolicy()
	policy.AllowElements("p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
		"code", "pre", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td")
	policy.AllowAttrs("class").Matching(langRe).OnElements("code")
	policy.AllowAttrs("href", "title").OnElements("a")
	policy.AllowURLSchemes("http", "https", "mailto")
	policy.AllowRelativeURLs(true)
	policy.RequireParseableURLs(true)
	policy.RequireNoFollowOnLinks(true)
	policy.RequireNoReferrerOnLinks(true)
	policy.AddTargetBlankToFullyQualifiedLinks(true)
	if p.AllowImages {
		policy.AllowAttrs("src", "alt", "title").OnElements("img")
	}
	if p.HeadingIDs {
		policy.AllowAttrs("id").Matching(idRe).OnElements("h1", "h2", "h3", "h4", "h5", "h6")
	}
	p.policy = policy
	return p
}

func invalid(reason string) error { return apperr.Validation(map[string]string{"body": reason}) }

// Render validates, converts and sanitizes src.
func (p Profile) Render(src string) (Result, error) {
	if strings.TrimSpace(src) == "" {
		return Result{}, invalid("must not be empty")
	}
	if utf8.RuneCountInString(src) > p.MaxRunes {
		return Result{}, invalid("is too long")
	}
	if !utf8.ValidString(src) {
		return Result{}, invalid("must be valid UTF-8")
	}
	for _, r := range src {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return Result{}, invalid("contains control characters")
		}
	}

	source := []byte(src)
	doc := engine.Parser().Parse(text.NewReader(source))

	var (
		links int
		toc   []TOCItem
		plain bytes.Buffer
		ids   = map[string]int{}
		bad   string
	)
	_ = ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		switch n := n.(type) {
		case *ast.Heading:
			if !entering {
				plain.WriteByte(' ')
				return ast.WalkContinue, nil
			}
			label := nodeText(n, source)
			if p.HeadingIDs {
				id := uniqueID(slug(label), ids)
				n.SetAttributeString("id", []byte(id))
				if n.Level == 2 || n.Level == 3 {
					toc = append(toc, TOCItem{Depth: n.Level, Text: label, ID: id})
				}
			}
		case *ast.Link:
			if entering {
				links++
				if !safeLink(string(n.Destination)) {
					bad = "contains a link with a disallowed scheme"
				}
			}
		case *ast.AutoLink:
			if entering {
				links++
				if !safeLink(string(n.URL(source))) {
					bad = "contains a link with a disallowed scheme"
				}
			}
		case *ast.Image:
			if entering {
				if !p.AllowImages {
					bad = "images are not allowed here"
				} else if u, err := url.Parse(string(n.Destination)); err != nil || u.Scheme != "https" || u.Host == "" {
					bad = "images must use https"
				}
			}
		case *ast.Text:
			if entering {
				plain.Write(n.Segment.Value(source))
				if n.SoftLineBreak() || n.HardLineBreak() {
					plain.WriteByte(' ')
				}
			}
		case *ast.String:
			if entering {
				plain.Write(n.Value)
			}
		default:
			if !entering && n.Type() == ast.TypeBlock {
				plain.WriteByte(' ')
			}
		}
		return ast.WalkContinue, nil
	})
	if bad != "" {
		return Result{}, invalid(bad)
	}
	if links > p.MaxLinks {
		return Result{}, invalid("contains too many links")
	}

	var out bytes.Buffer
	if err := engine.Renderer().Render(&out, source, doc); err != nil {
		return Result{}, apperr.Wrap(apperr.KindInternal, "render markdown", err)
	}
	plainText := strings.Join(strings.Fields(plain.String()), " ")
	words := len(strings.Fields(plainText))
	return Result{
		HTML:           p.policy.Sanitize(out.String()),
		Text:           plainText,
		TOC:            toc,
		ReadingMinutes: max(1, (words+179)/180),
	}, nil
}

func safeLink(dest string) bool {
	dest = strings.TrimSpace(dest)
	if dest == "" {
		return false
	}
	if strings.HasPrefix(dest, "#") || (strings.HasPrefix(dest, "/") && !strings.HasPrefix(dest, "//")) {
		return true
	}
	u, err := url.Parse(dest)
	if err != nil {
		return false
	}
	switch strings.ToLower(u.Scheme) {
	case "https", "http":
		return u.Host != ""
	case "mailto":
		return true
	}
	return false
}

func nodeText(n ast.Node, source []byte) string {
	var b bytes.Buffer
	_ = ast.Walk(n, func(c ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch c := c.(type) {
		case *ast.Text:
			b.Write(c.Segment.Value(source))
		case *ast.String:
			b.Write(c.Value)
		}
		return ast.WalkContinue, nil
	})
	return strings.TrimSpace(b.String())
}

// slug mirrors github-slugger closely enough for stable anchors: lower case,
// letters and digits kept, spaces and hyphens become hyphens, the rest is dropped.
func slug(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_':
			b.WriteRune(r)
		case r == ' ' || r == '-':
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "section"
	}
	if utf8.RuneCountInString(out) > 80 {
		out = string([]rune(out)[:80])
	}
	return out
}

func uniqueID(base string, seen map[string]int) string {
	n := seen[base]
	seen[base] = n + 1
	if n == 0 {
		return HeadingIDPrefix + base
	}
	return HeadingIDPrefix + base + "-" + itoa(n)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d [20]byte
	i := len(d)
	for n > 0 {
		i--
		d[i] = byte('0' + n%10)
		n /= 10
	}
	return string(d[i:])
}

// Excerpt shortens plain text to at most max runes on a word boundary.
func Excerpt(plain string, max int) string {
	if utf8.RuneCountInString(plain) <= max {
		return plain
	}
	cut := string([]rune(plain)[:max])
	if i := strings.LastIndexByte(cut, ' '); i > max/2 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " ,.;:-") + "…"
}
