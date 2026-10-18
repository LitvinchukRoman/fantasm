// Package app is the composition root: it builds every bounded context, wires
// them together and puts the middleware chain in front. cmd/api and the
// integration tests share it, so tests exercise the real stack.
package app

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/admin"
	adminhttp "github.com/LitvinchukRoman/fantasm/backend/internal/admin/adapters/http"
	"github.com/LitvinchukRoman/fantasm/backend/internal/analytics"
	analyticshttp "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/adapters/http"
	analyticspg "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/adapters/postgres"
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
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/health"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/httpx"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/jobs"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/logging"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/settings"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type App struct {
	// API serves /api/*: the full middleware chain.
	API http.Handler
	// Jobs are the periodic maintenance tasks, to be run by jobs.Runner.
	Jobs []jobs.Job
	// ObserveJob records the latest run of a background job for the admin health view.
	ObserveJob func(name string, duration time.Duration, err error)
}

type multiObserver []httpx.RequestObserver

func (m multiObserver) ObserveHTTP(method, route string, status, bytes int, duration time.Duration) {
	for _, observer := range m {
		if observer != nil {
			observer.ObserveHTTP(method, route, status, bytes, duration)
		}
	}
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

	store := settings.New(db)
	domains := []string{}
	if policy != nil {
		domains = policy.VerifiedDomains()
	}
	retentionDays := cfg.AnalyticsRetentionDays
	if retentionDays <= 0 {
		retentionDays = 180
	}
	beaconPerMin := cfg.AnalyticsRatePerMin
	if beaconPerMin <= 0 {
		beaconPerMin = 60
	}
	analyticsService := analytics.NewService(analyticspg.NewRepository(db), cfg.AppSecret, domains, time.Duration(retentionDays)*24*time.Hour)
	tracker := health.New()

	identityService := identity.NewService(identitypostgres.NewRepository(db), db, providers,
		identity.WithMembershipPolicy(policy),
		identity.WithSessionPolicy(cfg.SessionAbsoluteTTL, cfg.SessionIdleTTL),
		identity.WithBootstrapAdmins(cfg.AdminEmails),
		identity.WithEvents(analyticsService))
	identityHandler, err := identityhttp.NewHandler(identityService, logger, cfg.PublicURL,
		identityhttp.WithClientInfo(clientInfo(cfg.AppSecret, proxies)),
		identityhttp.WithAuthRateLimit(func(next http.HandlerFunc) http.HandlerFunc {
			return loginLimit.Wrap(httpx.IPKey(proxies), next)
		}))
	if err != nil {
		return nil, err
	}

	ideasService := ideas.NewService(ideaspostgres.NewRepository(db), db, identityService, policy, []byte(cfg.AppSecret)).
		WithGate(store).WithEvents(analyticsService)
	ideasHandler := ideashttp.NewHandler(ideasService, identityService)

	inbox := notificationspostgres.NewRepository(db)
	engagementService := engagement.NewService(engagementpostgres.NewRepository(db), db, identityService, inbox).WithEvents(analyticsService)
	engagementHandler := engagementhttp.NewHandler(engagementService)

	discussionService := discussion.NewService(discussionpostgres.NewRepository(db), db, identityService, inbox).WithEvents(analyticsService)
	postLimit := httpx.NewLimiter(float64(cfg.RateLimitPostsPerMin)/60, cfg.RateLimitPostsPerMin)
	discussionHandler := discussionhttp.NewHandler(discussionService, func(next http.HandlerFunc) http.HandlerFunc {
		return postLimit.Wrap(httpx.UserKey(proxies), next)
	})

	moderationService := moderation.NewService(moderationpostgres.NewRepository(db), db, inbox, []byte(cfg.AppSecret), logger).WithEvents(analyticsService)
	reportLimit := httpx.NewLimiter(float64(cfg.RateLimitPostsPerMin)/60, cfg.RateLimitPostsPerMin)
	moderationHandler := moderationhttp.NewHandler(moderationService, func(next http.HandlerFunc) http.HandlerFunc {
		return reportLimit.Wrap(httpx.UserKey(proxies), next)
	})

	notificationsService := notifications.NewService(inbox, []byte(cfg.AppSecret))
	notificationsHandler := notificationshttp.NewHandler(notificationsService)

	adminService := admin.NewService(db, analyticsService, store, tracker, identityService, []byte(cfg.AppSecret), cfg.AdminEmails, logger)
	adminHandler := adminhttp.NewHandler(adminService)
	beaconLimit := httpx.NewLimiter(float64(beaconPerMin)/60, beaconPerMin)
	analyticsHandler := analyticshttp.NewHandler(analyticsService, proxies.ClientIP, func(next http.HandlerFunc) http.HandlerFunc {
		return beaconLimit.Wrap(httpx.IPKey(proxies), next)
	})

	mux := http.NewServeMux()
	identityHandler.Register(mux)
	ideasHandler.Register(mux)
	engagementHandler.Register(mux)
	discussionHandler.Register(mux)
	moderationHandler.Register(mux)
	notificationsHandler.Register(mux)
	adminHandler.Register(mux)
	analyticsHandler.Register(mux)
	access := httpx.AccessOptions{Secret: cfg.AppSecret, Router: mux, Observer: multiObserver(append([]httpx.RequestObserver{tracker}, observers...))}

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
			{Name: "analytics-rollup", Interval: 5 * time.Minute, Timeout: 2 * time.Minute, Run: analyticsService.Rollup},
			{Name: "analytics-purge", Interval: 24 * time.Hour, Timeout: time.Minute, Run: analyticsService.Purge},
			{Name: "health-flush", Interval: time.Minute, Timeout: 15 * time.Second, Run: func(ctx context.Context) error {
				day, requests, clientErrors, serverErrors := tracker.TakePending()
				if day == "" || requests == 0 {
					return nil
				}
				if err := analyticsService.AddHTTP(ctx, day, requests, clientErrors, serverErrors); err != nil {
					tracker.RestorePending(day, requests, clientErrors, serverErrors)
					return err
				}
				return nil
			}},
		},
		ObserveJob: tracker.ObserveJob,
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
