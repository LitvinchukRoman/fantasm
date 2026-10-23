package domain

import (
	"encoding/base64"
	"errors"
	"net/url"
	"strings"
)

// ErrSubscriptionGone means the push service no longer has this browser.
// The subscription must be deleted; retrying it will not succeed.
var ErrSubscriptionGone = errors.New("push subscription is gone")

// Subscription is one browser that asked to be woken up.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Delivery is a stored notification that still needs a browser push.
type Delivery struct {
	ID      string
	UserID  string
	Type    Type
	Payload map[string]any
}

// NormalizeEndpoint accepts the address a browser received from its push
// service. Anything else is rejected so the server never posts to an arbitrary URL.
// allowLocal permits http://localhost and http://127.0.0.1, which is how tests
// and a local site subscribe; production (https) does not.
func NormalizeEndpoint(raw string, allowLocal bool) (string, string) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 2000 {
		return "", "must be a push service address"
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || u.Path == "" || u.Path == "/" {
		return "", "must be a push service address"
	}
	host := strings.ToLower(u.Hostname())
	switch u.Scheme {
	case "https":
		if port := u.Port(); port != "" && port != "443" {
			return "", "must be a push service address"
		}
		if !pushHost(host) {
			return "", "must be a push service address"
		}
	case "http":
		if !allowLocal || (host != "localhost" && host != "127.0.0.1") {
			return "", "must be a push service address"
		}
	default:
		return "", "must be a push service address"
	}
	return raw, ""
}

func pushHost(host string) bool {
	switch host {
	case "fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com":
		return true
	}
	return hasHost(host, "push.apple.com") || hasHost(host, "notify.windows.com")
}

func hasHost(host, suffix string) bool {
	return host == suffix || strings.HasSuffix(host, "."+suffix)
}

// NormalizeKey checks a subscription key and returns it as unpadded base64url.
// size is the decoded length: 65 for the public key, 16 for the auth secret.
func NormalizeKey(raw string, size int) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > 200 {
		return "", false
	}
	for _, enc := range []*base64.Encoding{base64.RawURLEncoding, base64.URLEncoding, base64.RawStdEncoding, base64.StdEncoding} {
		decoded, err := enc.DecodeString(raw)
		if err == nil && len(decoded) == size {
			return base64.RawURLEncoding.EncodeToString(decoded), true
		}
	}
	return "", false
}

// ValidVAPID reports whether a key pair has the shape GenerateVAPIDKeys produces.
func ValidVAPID(publicKey, privateKey string) bool {
	pub, err := base64.RawURLEncoding.DecodeString(publicKey)
	if err != nil || len(pub) != 65 || pub[0] != 4 {
		return false
	}
	priv, err := base64.RawURLEncoding.DecodeString(privateKey)
	return err == nil && len(priv) == 32
}
