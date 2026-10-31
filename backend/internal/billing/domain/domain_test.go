package domain_test

import (
	"strings"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
)

func TestPeriodInEffect(t *testing.T) {
	start := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	end := domain.NextPeriodEnd(start)
	if want := time.Date(2026, 12, 1, 12, 0, 0, 0, time.UTC); !end.Equal(want) {
		t.Fatalf("next period end = %v, want %v (Go normalizes 31 November)", end, want)
	}
	active := domain.Period{Status: domain.Active, Start: start, End: end}
	canceled := domain.Period{Status: domain.Canceled, Start: start, End: end}
	cases := []struct {
		name string
		p    domain.Period
		at   time.Time
		want bool
	}{
		{"active within the period", active, start.Add(time.Hour), true},
		{"active after the period: renewal is only late", active, end.Add(time.Hour), true},
		{"canceled within the period", canceled, end.Add(-time.Second), true},
		{"canceled at the end", canceled, end, false},
		{"canceled after the end", canceled, end.Add(time.Hour), false},
	}
	for _, c := range cases {
		if got := c.p.InEffect(c.at); got != c.want {
			t.Errorf("%s: %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCatalog(t *testing.T) {
	c := domain.NewCatalog(domain.Limits{FreeActiveIdeas: 3, PlusActiveIdeas: 15})
	free, ok := c.Plan(domain.Free)
	if !ok || free.PriceMinor != 0 || free.ActiveIdeas != 3 || free.Code.Paid() {
		t.Fatalf("free plan: %+v", free)
	}
	pro, _ := c.Plan(domain.Pro)
	if pro.ActiveIdeas != 0 || !strings.Contains(pro.Perks[0], "Без ліміту") {
		t.Fatalf("pro must be unlimited: %+v", pro)
	}
	for i := 1; i < len(c.Plans); i++ {
		if c.Plans[i].PriceMinor <= c.Plans[i-1].PriceMinor {
			t.Errorf("plans must go from the cheapest: %s after %s", c.Plans[i].Code, c.Plans[i-1].Code)
		}
	}
	for i := 1; i < len(c.Tiers); i++ {
		if c.Tiers[i].PriceMinor <= c.Tiers[i-1].PriceMinor {
			t.Errorf("tiers must go from the cheapest: %s after %s", c.Tiers[i].Code, c.Tiers[i-1].Code)
		}
	}
	if _, ok := c.Plan("GOLD"); ok {
		t.Error("unknown plan found")
	}
	if _, ok := c.Tier(domain.Patron); !ok {
		t.Error("patron tier missing")
	}
}

func TestRefundable(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	p := domain.Payment{Status: domain.Succeeded, AmountMinor: 14900, CreatedAt: now.Add(-24 * time.Hour)}
	if !p.Refundable(now) {
		t.Error("a fresh charge must be refundable")
	}
	old := p
	old.CreatedAt = now.Add(-domain.RefundWindow - time.Minute)
	refunded := p
	refunded.Status = domain.Refunded
	free := p
	free.AmountMinor = 0
	for name, q := range map[string]domain.Payment{"old": old, "refunded": refunded, "free": free} {
		if q.Refundable(now) {
			t.Errorf("%s charge must not be refundable", name)
		}
	}
}

func TestSupportToken(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	signer := domain.NewTokenSigner("test-secret-test-secret-test-secret!")
	token, expires := signer.Issue("4b1f6a2e-0000-4000-8000-000000000001", now)
	if !expires.Equal(now.Add(domain.SupportTokenTTL)) {
		t.Fatalf("expires = %v", expires)
	}
	if user, err := signer.Verify(token, now.Add(time.Minute)); err != nil || user != "4b1f6a2e-0000-4000-8000-000000000001" {
		t.Fatalf("verify = %q, %v", user, err)
	}
	if _, err := signer.Verify(token, expires); err == nil {
		t.Error("an expired token was accepted")
	}
	other := domain.NewTokenSigner("another-secret-another-secret-12345")
	if _, err := other.Verify(token, now); err == nil {
		t.Error("a token from another deployment was accepted")
	}
	parts := strings.Split(token, ".")
	forged, _ := signer.Issue("someone-else", now)
	swapped := parts[0] + "." + strings.Split(forged, ".")[1] + "." + parts[2]
	for name, bad := range map[string]string{
		"empty": "", "garbage": "x", "no version": strings.TrimPrefix(token, "v1."), "swapped payload": swapped,
		"truncated signature": token[:len(token)-2], "extra part": token + ".x", "huge": "v1." + strings.Repeat("a", 300) + ".b",
	} {
		if _, err := signer.Verify(bad, now); err == nil {
			t.Errorf("%s token was accepted", name)
		}
	}
}
