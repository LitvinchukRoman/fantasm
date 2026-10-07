package httpx

import (
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strings"
)

// Proxies is the set of networks whose forwarding headers are believed.
type Proxies []netip.Prefix

func ParseProxies(cidrs []string) (Proxies, error) {
	var out Proxies
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		p, err := netip.ParsePrefix(c)
		if err != nil {
			addr, aerr := netip.ParseAddr(c)
			if aerr != nil {
				return nil, fmt.Errorf("invalid proxy network %q", c)
			}
			p = netip.PrefixFrom(addr, addr.BitLen())
		}
		out = append(out, p.Masked())
	}
	return out, nil
}

func (p Proxies) contains(ip netip.Addr) bool {
	ip = ip.Unmap()
	for _, prefix := range p {
		if prefix.Contains(ip) {
			return true
		}
	}
	return false
}

// Trusted reports whether the direct peer of r is a trusted proxy.
func (p Proxies) Trusted(r *http.Request) bool {
	addr, ok := remoteAddr(r)
	return ok && p.contains(addr)
}

func remoteAddr(r *http.Request) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap(), true
}

// ClientIP returns the caller address. X-Forwarded-For is consulted only when
// the direct peer is a trusted proxy; the right-most entry that is not itself a
// trusted proxy wins, so a client cannot choose its own address by prepending one.
func (p Proxies) ClientIP(r *http.Request) string {
	peer, ok := remoteAddr(r)
	if !ok {
		return r.RemoteAddr
	}
	if !p.contains(peer) {
		return peer.String()
	}
	parts := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(parts) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(parts[i]))
		if err != nil {
			return peer.String()
		}
		if !p.contains(addr) {
			return addr.Unmap().String()
		}
	}
	return peer.String()
}
