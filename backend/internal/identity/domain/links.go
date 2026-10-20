package domain

import (
	"net/url"
	"regexp"
	"strings"
)

// A typed-in profile link is the account name on the network. People paste
// whatever they have (a full URL, "linkedin.com/in/name", "@name"), so the name is
// cut out of it here. GitHub is not typed in: see GitHubAccount.
type network struct {
	// prefix is the path before the account name, after the host.
	host, prefix string
	pattern      *regexp.Regexp
	// reserved are first path segments that fit the pattern but are pages of the
	// network itself (instagram.com/p/…), not accounts.
	reserved map[string]bool
}

func words(s string) map[string]bool {
	set := map[string]bool{}
	for _, w := range strings.Fields(s) {
		set[w] = true
	}
	return set
}

var (
	linkedin = network{host: "linkedin.com", prefix: "/in/",
		pattern: regexp.MustCompile(`^[\p{L}\p{N}_-]{3,100}$`)}
	instagram = network{host: "instagram.com", prefix: "/",
		pattern: regexp.MustCompile(`^[A-Za-z0-9._]{1,30}$`),
		reserved: words(`about accounts api challenge developer direct emails explore legal p privacy reel reels
			stories tv web`)}
)

// account returns the account name inside raw, or raw itself when it is not a link
// to this network, so that Validate rejects it.
func (n network) account(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	withScheme := s
	if !strings.Contains(s, "://") {
		withScheme = "https://" + s
	}
	if u, err := url.Parse(withScheme); err == nil && u.Host != "" {
		host := strings.ToLower(u.Hostname())
		if host == n.host || strings.HasSuffix(host, "."+n.host) {
			path := strings.TrimSuffix(u.Path, "/")
			if !strings.HasPrefix(path, n.prefix) {
				return s
			}
			name, _, _ := strings.Cut(strings.TrimPrefix(path, n.prefix), "/")
			return strings.TrimPrefix(name, "@")
		}
	}
	return strings.TrimPrefix(s, "@")
}

func (n network) valid(name string) bool {
	return name == "" || n.pattern.MatchString(name) && !n.reserved[strings.ToLower(name)]
}
