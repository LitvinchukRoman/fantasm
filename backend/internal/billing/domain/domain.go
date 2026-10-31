// Package domain describes plans, idea sponsorships and the mock payments behind them.
package domain

import (
	"errors"
	"strconv"
	"time"
)

// ErrNotFound is returned by repositories for a missing row.
var ErrNotFound = errors.New("not found")

// Currency of every price and payment. Amounts are in minor units (kopiyky).
const Currency = "UAH"

// Plan is what an author pays for. Free needs no row: it is what remains when nothing else is in effect.
type Plan string

const (
	Free Plan = "FREE"
	Plus Plan = "PLUS"
	Pro  Plan = "PRO"
)

// Paid reports whether the plan can be subscribed to.
func (p Plan) Paid() bool { return p == Plus || p == Pro }

// Tier is the size of a monthly sponsorship of one idea.
type Tier string

const (
	Supporter Tier = "SUPPORTER"
	Backer    Tier = "BACKER"
	Patron    Tier = "PATRON"
)

// Status of a plan subscription or a sponsorship. A CANCELED one stays in effect
// until the end of the paid period and then stops renewing.
type Status string

const (
	Active   Status = "ACTIVE"
	Canceled Status = "CANCELED"
)

type PlanInfo struct {
	Code       Plan
	Name       string
	PriceMinor int
	// ActiveIdeas is how many active ideas an author may hold at once; 0 means no limit.
	ActiveIdeas int
	Perks       []string
}

type TierInfo struct {
	Code       Tier
	Name       string
	PriceMinor int
	Perks      []string
}

// Limits are the configurable caps of the two lower plans. Zero lifts the cap.
type Limits struct {
	FreeActiveIdeas int
	PlusActiveIdeas int
}

// Catalog is the fixed price list, ordered from the cheapest.
type Catalog struct {
	Plans []PlanInfo
	Tiers []TierInfo
}

func ideasPerk(limit int) string {
	if limit <= 0 {
		return "Без ліміту активних ідей"
	}
	return "До " + strconv.Itoa(limit) + " активних ідей одночасно"
}

func NewCatalog(l Limits) Catalog {
	return Catalog{
		Plans: []PlanInfo{
			{Code: Free, Name: "Старт", PriceMinor: 0, ActiveIdeas: l.FreeActiveIdeas,
				Perks: []string{ideasPerk(l.FreeActiveIdeas), "Голоси, команда й обговорення", "Підтримка в чаті"}},
			{Code: Plus, Name: "Плюс", PriceMinor: 14900, ActiveIdeas: l.PlusActiveIdeas,
				Perks: []string{ideasPerk(l.PlusActiveIdeas), "Усе, що є в «Старт»"}},
			{Code: Pro, Name: "Про", PriceMinor: 39900, ActiveIdeas: 0,
				Perks: []string{ideasPerk(0), "Усе, що є в «Плюс»"}},
		},
		Tiers: []TierInfo{
			{Code: Supporter, Name: "Друг ідеї", PriceMinor: 5000, Perks: []string{"Автор бачить вас серед тих, хто підтримує ідею"}},
			{Code: Backer, Name: "Меценат", PriceMinor: 20000, Perks: []string{"Усе, що дає «Друг ідеї»", "Вагоміший щомісячний внесок"}},
			{Code: Patron, Name: "Партнер", PriceMinor: 50000, Perks: []string{"Усе, що дає «Меценат»", "Найбільший внесок у старт ідеї"}},
		},
	}
}

func (c Catalog) Plan(code Plan) (PlanInfo, bool) {
	for _, p := range c.Plans {
		if p.Code == code {
			return p, true
		}
	}
	return PlanInfo{}, false
}

func (c Catalog) Tier(code Tier) (TierInfo, bool) {
	for _, t := range c.Tiers {
		if t.Code == code {
			return t, true
		}
	}
	return TierInfo{}, false
}

// NextPeriodEnd is one calendar month after start: plans and sponsorships renew monthly.
func NextPeriodEnd(start time.Time) time.Time { return start.AddDate(0, 1, 0) }

// Period is the paid span shared by plans and sponsorships.
type Period struct {
	Status     Status
	Start      time.Time
	End        time.Time
	CanceledAt *time.Time
}

// InEffect reports whether the period still grants what was paid for. An active
// one is in effect even when the renewal job is late: renewal never fails in the mock.
func (p Period) InEffect(now time.Time) bool {
	return p.Status == Active || now.Before(p.End)
}

// Subscription is a user's paid plan.
type Subscription struct {
	Plan Plan
	Period
}

// Sponsorship is one person's monthly support of one idea.
type Sponsorship struct {
	ID        string
	IdeaID    string
	IdeaSlug  string
	IdeaTitle string
	SponsorID string
	Tier      Tier
	Period
	CreatedAt time.Time
}

type PaymentKind string

const (
	PlanPayment        PaymentKind = "PLAN"
	SponsorshipPayment PaymentKind = "SPONSORSHIP"
)

type PaymentStatus string

const (
	Succeeded PaymentStatus = "SUCCEEDED"
	Refunded  PaymentStatus = "REFUNDED"
)

// RefundWindow bounds how old a charge the support bot may still refund.
const RefundWindow = 14 * 24 * time.Hour

// MaxExtensionDays bounds a goodwill extension of a plan granted through support.
const MaxExtensionDays = 31

// Payment is one mock charge. No card data exists anywhere: the provider is always "mock".
type Payment struct {
	ID            string
	UserID        string
	Kind          PaymentKind
	Plan          Plan
	SponsorshipID string
	AmountMinor   int
	Status        PaymentStatus
	Description   string
	CreatedAt     time.Time
	RefundedAt    *time.Time
}

// Refundable reports whether support may still refund the payment.
func (p Payment) Refundable(now time.Time) bool {
	return p.Status == Succeeded && p.AmountMinor > 0 && now.Sub(p.CreatedAt) <= RefundWindow
}

// SupportAction is a change the support bot may ask for on behalf of the user it talks to.
type SupportAction string

const (
	CancelPlan        SupportAction = "CANCEL_PLAN"
	ResumePlan        SupportAction = "RESUME_PLAN"
	ExtendPlan        SupportAction = "EXTEND_PLAN"
	CancelSponsorship SupportAction = "CANCEL_SPONSORSHIP"
	RefundPayment     SupportAction = "REFUND_PAYMENT"
)
