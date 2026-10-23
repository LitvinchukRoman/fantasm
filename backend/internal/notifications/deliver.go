package notifications

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

const pushBatch = 10

// pushStore is the subscription book and the queue of notifications not yet pushed.
type pushStore interface {
	SaveSubscription(ctx context.Context, userID string, sub domain.Subscription) error
	DeleteSubscription(ctx context.Context, userID, endpoint string) error
	Subscriptions(ctx context.Context, userID string) ([]domain.Subscription, error)
	ForgetSubscription(ctx context.Context, endpoint string) error
	ClaimUnpushed(ctx context.Context, limit int, at, since time.Time) ([]domain.Delivery, error)
	ReleaseUnpushed(ctx context.Context, ids []string, at time.Time) error
}

// pushSender posts one already-built payload. topic collapses a retried notification.
type pushSender interface {
	Send(ctx context.Context, sub domain.Subscription, payload []byte, topic string) error
}

type pushChannel struct {
	publicKey  string
	store      pushStore
	send       pushSender
	logger     *slog.Logger
	allowLocal bool
}

// WithPush turns on browser delivery. The inbox write stays in the caller's
// transaction; Deliver runs later and can fail without undoing that write.
func (s *Service) WithPush(publicKey string, store pushStore, send pushSender, logger *slog.Logger, allowLocal bool) *Service {
	if publicKey == "" || store == nil || send == nil {
		return s
	}
	s.push = &pushChannel{publicKey: publicKey, store: store, send: send, logger: logger, allowLocal: allowLocal}
	return s
}

// PublicKey is the VAPID key a browser uses to subscribe. The second result
// is false when browser notifications are not configured.
func (s *Service) PublicKey() (string, bool) {
	if s == nil || s.push == nil {
		return "", false
	}
	return s.push.publicKey, true
}

// Subscribe stores one browser. The same endpoint moves to the signed-in user,
// so a shared device does not keep waking the previous account.
func (s *Service) Subscribe(ctx context.Context, v viewer.Viewer, endpoint, p256dh, auth string) error {
	if err := requireAuth(v); err != nil {
		return err
	}
	if s.push == nil {
		return apperr.NotFound("browser notifications are not available")
	}
	endpoint, msg := domain.NormalizeEndpoint(endpoint, s.push.allowLocal)
	if msg != "" {
		return apperr.Validation(map[string]string{"endpoint": msg})
	}
	p256dh, ok := domain.NormalizeKey(p256dh, 65)
	if !ok {
		return apperr.Validation(map[string]string{"p256dh": "must be a public key"})
	}
	auth, ok = domain.NormalizeKey(auth, 16)
	if !ok {
		return apperr.Validation(map[string]string{"auth": "must be an auth secret"})
	}
	if err := s.push.store.SaveSubscription(ctx, v.ID(), domain.Subscription{Endpoint: endpoint, P256dh: p256dh, Auth: auth}); err != nil {
		return err
	}
	return nil
}

// Unsubscribe forgets one browser of the signed-in user. A missing row is success.
func (s *Service) Unsubscribe(ctx context.Context, v viewer.Viewer, endpoint string) error {
	if err := requireAuth(v); err != nil {
		return err
	}
	if s.push == nil {
		return apperr.NotFound("browser notifications are not available")
	}
	endpoint = strings.TrimSpace(endpoint)
	if endpoint == "" || len(endpoint) > 2000 {
		return apperr.Validation(map[string]string{"endpoint": "must be a push service address"})
	}
	return s.push.store.DeleteSubscription(ctx, v.ID(), endpoint)
}

// Deliver pushes notifications that were committed and not yet sent.
// A push service that is down leaves the row to be tried again. A browser
// that is gone is forgotten. Nothing here is inside the transaction that
// created the notification.
func (s *Service) Deliver(ctx context.Context) (int, error) {
	if s.push == nil {
		return 0, nil
	}
	at := s.now().UTC().Truncate(time.Microsecond)
	claimed, err := s.push.store.ClaimUnpushed(ctx, pushBatch, at, at.Add(-72*time.Hour))
	if err != nil {
		return 0, err
	}
	sent := 0
	var retry []string
	for _, item := range claimed {
		if ctx.Err() != nil {
			retry = append(retry, item.ID)
			continue
		}
		again := s.dispatch(ctx, item)
		if again {
			retry = append(retry, item.ID)
			continue
		}
		sent++
	}
	if len(retry) > 0 {
		relCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
		err = s.push.store.ReleaseUnpushed(relCtx, retry, at)
		cancel()
		if err != nil {
			return sent, err
		}
	}
	if sent > 0 && s.push.logger != nil {
		s.push.logger.InfoContext(ctx, "pushed notifications", "event", "notifications.push", "outcome", "success", "count", sent)
	}
	return sent, nil
}

type pushBody struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
}

// dispatch reports whether the notification should be tried again.
func (s *Service) dispatch(ctx context.Context, item domain.Delivery) bool {
	subs, err := s.push.store.Subscriptions(ctx, item.UserID)
	if err != nil {
		s.warn(ctx, item, err)
		return true
	}
	if len(subs) == 0 {
		return false
	}
	title, body, path := domain.Message(item.Type, item.Payload)
	raw, err := json.Marshal(pushBody{Title: title, Body: body, URL: path, Tag: item.ID})
	if err != nil {
		return false
	}
	again := false
	for _, sub := range subs {
		err := s.push.send.Send(ctx, sub, raw, item.ID)
		if err == nil {
			continue
		}
		if errors.Is(err, domain.ErrSubscriptionGone) {
			if forgetErr := s.push.store.ForgetSubscription(ctx, sub.Endpoint); forgetErr != nil {
				s.warn(ctx, item, forgetErr)
				again = true
			}
			continue
		}
		s.warn(ctx, item, err)
		again = true
	}
	return again
}

func (s *Service) warn(ctx context.Context, item domain.Delivery, err error) {
	if s.push.logger == nil {
		return
	}
	s.push.logger.WarnContext(ctx, "push failed", "event", "notifications.push", "outcome", "error", "notification_id", item.ID, "user_id", item.UserID, "error", safePushErr(err))
}

func safePushErr(err error) string {
	msg := err.Error()
	if strings.Contains(msg, "http://") || strings.Contains(msg, "https://") || len(msg) > 160 {
		return "push delivery failed"
	}
	return msg
}
