package httpx

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// Limiter is an in-memory token bucket per key. It is per process: with several
// API instances the effective limit is multiplied, which is acceptable as a
// first line of defence in front of the database.
type Limiter struct {
	rps   rate.Limit
	burst int
	max   int
	ttl   time.Duration
	now   func() time.Time

	mu    sync.Mutex
	m     map[string]*bucket
	purge time.Time
}

type bucket struct {
	lim  *rate.Limiter
	seen time.Time
}

func NewLimiter(rps float64, burst int) *Limiter {
	return &Limiter{rps: rate.Limit(rps), burst: max(burst, 1), max: 100_000, ttl: 10 * time.Minute, now: time.Now, m: map[string]*bucket{}}
}

// Allow takes one token. When it refuses, retry is the time until one is free.
func (l *Limiter) Allow(key string) (ok bool, retry time.Duration) {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	l.gc(now)
	b := l.m[key]
	if b == nil {
		b = &bucket{lim: rate.NewLimiter(l.rps, l.burst)}
		l.m[key] = b
	}
	b.seen = now
	res := b.lim.ReserveN(now, 1)
	if !res.OK() {
		return false, time.Minute
	}
	if d := res.DelayFrom(now); d > 0 {
		res.CancelAt(now)
		return false, d
	}
	return true, 0
}

func (l *Limiter) gc(now time.Time) {
	if now.Sub(l.purge) < time.Minute && len(l.m) < l.max {
		return
	}
	l.purge = now
	for k, b := range l.m {
		if now.Sub(b.seen) > l.ttl {
			delete(l.m, k)
		}
	}
	// Still too many live keys (an address sweep): shed a tenth at random.
	if over := len(l.m) - l.max; over >= 0 {
		drop := over + l.max/10
		for k := range l.m {
			if drop <= 0 {
				break
			}
			delete(l.m, k)
			drop--
		}
	}
}

// Middleware rejects with 429 and Retry-After once key(r) runs out of tokens.
// An empty key skips the check.
func (l *Limiter) Middleware(key func(*http.Request) string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if k := key(r); k != "" {
				if ok, retry := l.Allow(k); !ok {
					w.Header().Set("Retry-After", strconv.Itoa(int(math.Ceil(retry.Seconds()))))
					WriteError(w, r, apperr.RateLimited("too many requests"))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Wrap applies the limiter to a single handler.
func (l *Limiter) Wrap(key func(*http.Request) string, h http.HandlerFunc) http.HandlerFunc {
	wrapped := l.Middleware(key)(h)
	return wrapped.ServeHTTP
}
