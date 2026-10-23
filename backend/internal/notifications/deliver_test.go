package notifications

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"testing"
	"time"

	iddomain "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

type memPush struct {
	subs      map[string][]domain.Subscription
	claimed   []domain.Delivery
	released  []string
	forgotten []string
	failSave  bool
}

func (m *memPush) SaveSubscription(_ context.Context, userID string, sub domain.Subscription) error {
	if m.failSave {
		return errors.New("db down")
	}
	m.subs[userID] = append(m.subs[userID], sub)
	return nil
}
func (m *memPush) DeleteSubscription(_ context.Context, userID, endpoint string) error {
	kept := m.subs[userID][:0]
	for _, sub := range m.subs[userID] {
		if sub.Endpoint != endpoint {
			kept = append(kept, sub)
		}
	}
	m.subs[userID] = kept
	return nil
}
func (m *memPush) Subscriptions(_ context.Context, userID string) ([]domain.Subscription, error) {
	return m.subs[userID], nil
}
func (m *memPush) ForgetSubscription(_ context.Context, endpoint string) error {
	m.forgotten = append(m.forgotten, endpoint)
	return nil
}
func (m *memPush) ClaimUnpushed(context.Context, int, time.Time, time.Time) ([]domain.Delivery, error) {
	out := m.claimed
	m.claimed = nil
	return out, nil
}
func (m *memPush) ReleaseUnpushed(_ context.Context, ids []string, _ time.Time) error {
	m.released = append(m.released, ids...)
	return nil
}

type scriptedSend struct {
	gone map[string]bool
	fail map[string]bool
}

func (s scriptedSend) Send(_ context.Context, sub domain.Subscription, _ []byte, _ string) error {
	if s.gone[sub.Endpoint] {
		return domain.ErrSubscriptionGone
	}
	if s.fail[sub.Endpoint] {
		return errors.New("push service status 503")
	}
	return nil
}

func pushService(store *memPush, send pushSender) *Service {
	s := NewService(nil, []byte("secretsecretsecretsecretsecretsecret"))
	s.now = func() time.Time { return time.Date(2026, 10, 23, 20, 0, 0, 123456, time.UTC) }
	return s.WithPush("public", store, send, nil, true)
}

func TestSubscribeRejectsForeignHosts(t *testing.T) {
	store := &memPush{subs: map[string][]domain.Subscription{}}
	s := pushService(store, scriptedSend{})
	v := viewer.Viewer{Authenticated: true, User: iddomain.User{ID: "user-1"}}
	err := s.Subscribe(context.Background(), v, "https://evil.example/push", key(65), key(16))
	var status *apperr.Error
	if !errors.As(err, &status) || status.Kind != apperr.KindUnprocessable || len(store.subs) != 0 {
		t.Fatalf("err=%v subs=%d", err, len(store.subs))
	}
	if err := s.Subscribe(context.Background(), v, "http://127.0.0.1:9/push/device", key(65), key(16)); err != nil {
		t.Fatal(err)
	}
	if got := store.subs["user-1"]; len(got) != 1 || got[0].Endpoint != "http://127.0.0.1:9/push/device" {
		t.Fatalf("stored %#v", got)
	}
}

func TestDeliverRetriesOnlyTemporaryFailures(t *testing.T) {
	store := &memPush{subs: map[string][]domain.Subscription{
		"user-1": {{Endpoint: "https://fcm.googleapis.com/fcm/send/gone"}, {Endpoint: "https://fcm.googleapis.com/fcm/send/down"}},
		"user-2": {{Endpoint: "https://fcm.googleapis.com/fcm/send/ok"}},
	}}
	store.claimed = []domain.Delivery{
		{ID: "n1", UserID: "user-1", Type: domain.Comment, Payload: map[string]any{"ideaTitle": "А", "ideaSlug": "a"}},
		{ID: "n2", UserID: "user-2", Type: domain.Vote, Payload: map[string]any{"ideaTitle": "Б", "ideaSlug": "b"}},
		{ID: "n3", UserID: "user-3", Type: domain.System, Payload: map[string]any{}},
	}
	s := pushService(store, scriptedSend{
		gone: map[string]bool{"https://fcm.googleapis.com/fcm/send/gone": true},
		fail: map[string]bool{"https://fcm.googleapis.com/fcm/send/down": true},
	})
	sent, err := s.Deliver(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if sent != 2 { // the healthy browser, and the person with none
		t.Fatalf("sent %d", sent)
	}
	if len(store.forgotten) != 1 || store.forgotten[0] != "https://fcm.googleapis.com/fcm/send/gone" {
		t.Fatalf("forgotten %#v", store.forgotten)
	}
	if len(store.released) != 1 || store.released[0] != "n1" {
		t.Fatalf("released %#v", store.released)
	}
}

func key(n int) string {
	return base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{1}, n))
}
