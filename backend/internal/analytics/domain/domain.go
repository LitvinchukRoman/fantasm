// Package domain holds the rules of product analytics that need no database:
// which client events are accepted, how a path becomes a pattern, and how a
// visitor is recognized for a single day without becoming identifiable later.
package domain

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	_ "time/tzdata" // the runtime image has no zoneinfo; the admin day is Europe/Kyiv
)

// Kyiv is the calendar the dashboard uses. A "day" starts at midnight there.
var Kyiv = mustKyiv()

func mustKyiv() *time.Location {
	loc, err := time.LoadLocation("Europe/Kyiv")
	if err != nil {
		panic(err)
	}
	return loc
}

// DayStart is midnight in Kyiv on the calendar day of t.
func DayStart(t time.Time) time.Time {
	t = t.In(Kyiv)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, Kyiv)
}

// DayString is the calendar date of t in Kyiv, YYYY-MM-DD.
func DayString(t time.Time) string { return DayStart(t).Format("2006-01-02") }

const (
	PageView   = "page_view"
	UIClick    = "ui.click"
	FeedFilter = "feed.filter"

	MaxBatch = 10
	MaxPath  = 200
)

// ClientEvents are the only names a browser may submit. Everything else is
// recorded by the server, inside the transaction of the action.
var ClientEvents = map[string]bool{PageView: true, UIClick: true, FeedFilter: true}

// ClickTargets are the calls to action worth counting.
var ClickTargets = map[string]bool{"publish": true, "login": true, "share": true}

var staticPaths = map[string]struct{}{
	"/": {}, "/ideas": {}, "/ideas/new": {}, "/events": {}, "/guides": {},
	"/login": {}, "/register": {}, "/welcome": {}, "/cookies": {},
	"/notifications": {}, "/settings": {}, "/moderation": {},
	"/admin": {}, "/admin/analytics": {}, "/admin/moderation": {}, "/admin/users": {}, "/admin/settings": {},
}

// Pattern collapses a URL path so charts group by screen, not by slug.
// ideaSlug is set when the path is a single idea. An unusable path returns "".
func Pattern(raw string) (pattern, ideaSlug string) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > MaxPath || !strings.HasPrefix(raw, "/") || strings.Contains(raw, "..") || strings.ContainsAny(raw, "\x00?#\\") {
		return "", ""
	}
	if _, ok := staticPaths[raw]; ok {
		return raw, ""
	}
	parts := strings.Split(strings.Trim(raw, "/"), "/")
	switch {
	case len(parts) == 2 && parts[0] == "ideas" && ideaSlugOK(parts[1]):
		return "/ideas/:slug", parts[1]
	case len(parts) == 2 && parts[0] == "ideas":
		return "/ideas/:slug", ""
	case len(parts) == 2 && parts[0] == "u":
		return "/u/:handle", ""
	case len(parts) == 2 && parts[0] == "admin":
		return "/admin/:section", ""
	case len(parts) == 1:
		return "/:hub", ""
	case len(parts) == 2:
		return "/:hub/:slug", ""
	default:
		return "/other", ""
	}
}

func ideaSlugOK(s string) bool {
	if s == "" || len(s) > 90 {
		return false
	}
	for _, r := range s {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}

// Visitor is a day-scoped pseudonym of an address and a user agent. The salt
// rotates at midnight in Kyiv, so the same person is one visitor today and a
// different one tomorrow; the address cannot be recovered from the hash.
func Visitor(secret string, now time.Time, ip, ua string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(DayString(now)))
	sum := sha256.New()
	_, _ = sum.Write(mac.Sum(nil))
	_, _ = sum.Write([]byte{0})
	_, _ = sum.Write([]byte(ip))
	_, _ = sum.Write([]byte{0})
	_, _ = sum.Write([]byte(ua))
	return hex.EncodeToString(sum.Sum(nil))
}

// Bot reports user agents that are not a person looking at the site.
func Bot(ua string) bool {
	if ua == "" {
		return false
	}
	ua = strings.ToLower(ua)
	for _, mark := range []string{
		"bot", "spider", "crawl", "slurp", "mediapartners", "facebookexternalhit",
		"wget/", "curl/", "python-requests", "go-http-client", "headlesschrome", "bytespider", "petalbot",
	} {
		if strings.Contains(ua, mark) {
			return true
		}
	}
	return false
}

// CleanProps keeps only the keys a client event is allowed to carry.
func CleanProps(name string, props map[string]string) (map[string]any, bool) {
	out := map[string]any{}
	switch name {
	case PageView:
		if ref := referrerHost(props["referrer"]); ref != "" {
			out["referrer"] = ref
		}
		for _, key := range []string{"utm_source", "utm_medium", "utm_campaign"} {
			if v, ok := token(props[key], 80); ok && v != "" {
				out[key] = v
			} else if props[key] != "" && !ok {
				return nil, false
			}
		}
	case UIClick:
		target, ok := token(props["target"], 32)
		if !ok || !ClickTargets[target] {
			return nil, false
		}
		out["target"] = target
	case FeedFilter:
		for _, key := range []string{"sort", "category", "campus"} {
			if props[key] == "" {
				continue
			}
			v, ok := token(props[key], 40)
			if !ok {
				return nil, false
			}
			out[key] = v
		}
	default:
		return nil, false
	}
	for key := range props {
		switch name {
		case PageView:
			if key != "referrer" && key != "utm_source" && key != "utm_medium" && key != "utm_campaign" && key != "path" {
				return nil, false
			}
		case UIClick:
			if key != "target" {
				return nil, false
			}
		case FeedFilter:
			if key != "sort" && key != "category" && key != "campus" {
				return nil, false
			}
		}
	}
	return out, true
}

func referrerHost(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || len(u.Hostname()) > 80 {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	for _, r := range host {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '.' && r != '-' {
			return ""
		}
	}
	return host
}

func token(s string, max int) (string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", true
	}
	if !utf8.ValidString(s) || utf8.RuneCountInString(s) > max {
		return "", false
	}
	for _, r := range s {
		if unicode.IsControl(r) {
			return "", false
		}
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && !strings.ContainsRune("._:-", r) {
			return "", false
		}
	}
	return s, true
}
