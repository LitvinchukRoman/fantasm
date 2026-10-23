// Package push sends a stored notification to the browser's push service.
package push

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
)

// Sender signs a payload with the site's VAPID key and posts it to the
// subscription endpoint. It does not follow redirects.
type Sender struct {
	public  string
	private string
	subject string
	client  *http.Client
}

func New(publicKey, privateKey, publicURL string) *Sender {
	return &Sender{
		public: publicKey, private: privateKey, subject: subject(publicURL),
		client: &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func subject(publicURL string) string {
	u, err := url.Parse(publicURL)
	if err == nil && u.Scheme == "https" && u.Host != "" {
		return publicURL
	}
	return "mailto:push@localhost"
}

// Send delivers one payload. topic collapses retries of the same notification.
func (s *Sender) Send(ctx context.Context, sub domain.Subscription, payload []byte, topic string) error {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
	}, &webpush.Options{
		HTTPClient:      s.client,
		Subscriber:      s.subject,
		Topic:           topic,
		TTL:             24 * 60 * 60,
		VAPIDPublicKey:  s.public,
		VAPIDPrivateKey: s.private,
	})
	if resp != nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
	}
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		return errors.New("push delivery failed")
	}
	if resp == nil {
		return errors.New("push delivery failed")
	}
	switch resp.StatusCode {
	case http.StatusOK, http.StatusCreated, http.StatusAccepted:
		return nil
	case http.StatusNotFound, http.StatusGone:
		return domain.ErrSubscriptionGone
	default:
		return fmt.Errorf("push service status %d", resp.StatusCode)
	}
}
