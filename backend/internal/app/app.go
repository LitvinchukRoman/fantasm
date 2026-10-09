// Package app is the composition root: it builds every bounded context, wires
// them together and puts the middleware chain in front. cmd/api and the
// integration tests share it, so tests exercise the real stack.
package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion"
	discussionhttp "github.com/LitvinchukRoman/fantasm/backend/internal/discussion/adapters/http"
	discussionpostgres "github.com/LitvinchukRoman/fantasm/backend/internal/discussion/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/engagement"
	engagementhttp "github.com/LitvinchukRoman/fantasm/backend/internal/engagement/adapters/http"
	engagementpostgres "github.com/LitvinchukRoman/fantasm/backend/internal/engagement/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas"
	ideashttp "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/http"
	ideaspostgres "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity"
	identityhttp "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/http"
	identitypostgres "github.com/LitvinchukRoman/fantasm/backend/internal/identity/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/moderation"
	moderationhttp "github.com/LitvinchukRoman/fantasm/backend/internal/moderation/adapters/http"
	moderationpostgres "github.com/LitvinchukRoman/fantasm/backend/internal/moderation/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications"
	notificationshttp "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/adapters/http"
	notificationspostgres "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/adapters/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/config"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/jobs"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type App struct {
	// API serves /api/*: the full middleware chain.
	API http.Handler
	// Jobs are the periodic maintenance tasks, to be run by jobs.Runner.
	Jobs []jobs.Job
}

// Build wires the application. providers may be empty: nobody can sign in then, which is a valid (if useless) state.
func Build(cfg config.Config, logger *slog.Logger, db *postgres.DB, policy *organizations.Policy, providers map[domain.Provider]identity.Provider, observers ...httpx.RequestObserver) (*App, error) {
	proxies, err := httpx.ParseProxies(cfg.TrustedProxyCIDRs)
	if err != nil {
		return nil, err
	}
	anonLimit := httpx.NewLimiter(cfg.RateLimitAnonRPS, cfg.RateLimitAnonBurst)
	userLimit := httpx.NewLimiter(cfg.RateLimitUserRPS, cfg.RateLimitUserBurst)
	loginLimit := httpx.NewLimiter(float64(cfg.RateLimitLoginPerMin)/60, cfg.RateLimitLoginPerMin)

	identityService := identity.NewService(identitypostgres.NewRepository(db), db, providers,
		identity.WithMembershipPolicy(policy),
		identity.WithSessionPolicy(cfg.SessionAbsoluteTTL, cfg.SessionIdleTTL))
	identityHandler, err := identityhttp.NewHandler(identityService, logger, cfg.PublicURL,
		identityhttp.WithClientInfo(clientInfo(cfg.AppSecret, proxies)),
		identityhttp.WithAuthRateLimit(func(next http.HandlerFunc) http.HandlerFunc {
			return loginLimit.Wrap(httpx.IPKey(proxies), next)
		}))
	if err != nil {
		return nil, err
	}

	ideasService := ideas.NewService(ideaspostgres.NewRepository(db), db, identityService, policy, []byte(cfg.AppSecret))
	ideasHandler := ideashttp.NewHandler(ideasService, identityService)

	inbox := notificationspostgres.NewRepository(db)
	engagementService := engagement.NewService(engagementpostgres.NewRepository(db), db, identityService, inbox)
	engagementHandler := engagementhttp.NewHandler(engagementService)

	discussionService := discussion.NewService(discussionpostgres.NewRepository(db), db, identityService, inbox)
	postLimit := httpx.NewLimiter(float64(cfg.RateLimitPostsPerMin)/60, cfg.RateLimitPostsPerMin)
	discussionHandler := discussionhttp.NewHandler(discussionService, func(next http.HandlerFunc) http.HandlerFunc {
		return postLimit.Wrap(httpx.UserKey(proxies), next)
	})

	moderationService := moderation.NewService(moderationpostgres.NewRepository(db), db, inbox, []byte(cfg.AppSecret), logger)
	reportLimit := httpx.NewLimiter(float64(cfg.RateLimitPostsPerMin)/60, cfg.RateLimitPostsPerMin)
	moderationHandler := moderationhttp.NewHandler(moderationService, func(next http.HandlerFunc) http.HandlerFunc {
		return reportLimit.Wrap(httpx.UserKey(proxies), next)
	})

	notificationsService := notifications.NewService(inbox, []byte(cfg.AppSecret))
	notificationsHandler := notificationshttp.NewHandler(notificationsService)

	mux := http.NewServeMux()
	identityHandler.Register(mux)
	ideasHandler.Register(mux)
	engagementHandler.Register(mux)
	discussionHandler.Register(mux)
	moderationHandler.Register(mux)
	notificationsHandler.Register(mux)
	access := httpx.AccessOptions{Secret: cfg.AppSecret, Router: mux}
	if len(observers) > 0 {
		access.Observer = observers[0]
	}

	api := httpx.Chain(httpx.JSONFallbacks(mux),
		httpx.RequestID(proxies),
		httpx.AccessLog(logger, proxies, access),
		httpx.Recover(),
		httpx.SecurityHeaders(identityHandler.Secure()),
		httpx.Limits(httpx.MaxBody, cfg.RequestTimeout),
		httpx.CSRF(identityHandler.Origin()),
		httpx.Auth(identityHandler.SessionCookie(), identityHandler.Resolver()),
		rateLimit(anonLimit, userLimit, proxies),
	)

	return &App{
		API: api,
		Jobs: []jobs.Job{
			{Name: "purge-expired", Interval: time.Hour, Timeout: time.Minute, Run: func(ctx context.Context) error {
				n, err := identityService.PurgeExpired(ctx)
				if err == nil && n > 0 {
					logger.Info("purged expired rows", "rows", n)
				}
				return err
			}},
			{Name: "purge-notifications", Interval: 6 * time.Hour, Timeout: time.Minute, Run: func(ctx context.Context) error {
				n, err := notificationsService.PurgeOld(ctx)
				if err == nil && n > 0 {
					logger.Info("purged old notifications", "rows", n)
				}
				return err
			}},
			{Name: "rank-hot", Interval: 10 * time.Minute, Timeout: time.Minute, Run: func(ctx context.Context) error {
				_, err := ideasService.RecomputeHot(ctx)
				return err
			}},
		},
	}, nil
}

// rateLimit throttles signed-in viewers by user and everyone else by address.
func rateLimit(anon, user *httpx.Limiter, proxies httpx.Proxies) httpx.Middleware {
	byUser := user.Middleware(httpx.UserKey(proxies))
	byIP := anon.Middleware(httpx.IPKey(proxies))
	return func(next http.Handler) http.Handler {
		authed, anonymous := byUser(next), byIP(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if viewer.From(r.Context()).Authenticated {
				authed.ServeHTTP(w, r)
				return
			}
			anonymous.ServeHTTP(w, r)
		})
	}
}

// clientInfo records a keyed hash of the address, never the address itself, so
// the session list can tell devices apart without becoming a location log.
func clientInfo(secret string, proxies httpx.Proxies) func(*http.Request) identity.ClientInfo {
	return func(r *http.Request) identity.ClientInfo {
		return identity.ClientInfo{IPHash: logging.AddressHash(secret, proxies.ClientIP(r)), UserAgent: r.UserAgent()}
	}
}
