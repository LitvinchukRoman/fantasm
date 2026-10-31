// Package billing owns paid plans for authors, monthly sponsorships of ideas and the
// mock payments behind both. There is no payment provider yet: every charge succeeds,
// no card data is collected, and the ledger (billing_payments) records what would
// have been charged. Every change writes its payment, notification and event in
// the same transaction as the state it describes.
package billing

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	anports "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/ports"
	ideadomain "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	ideaports "github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	notify "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/domain"
	notifyports "github.com/LitvinchukRoman/fantasm/backend/internal/notifications/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

const (
	maxSponsorsListed = 200
	maxSponsorships   = 100
	maxPayments       = 20
	renewalBatch      = 200
)

type Service struct {
	repo    ports.Repository
	tx      ports.Transactor
	notify  notifyports.Publisher
	events  anports.Recorder
	catalog domain.Catalog
	tokens  domain.TokenSigner
	now     func() time.Time
}

func NewService(repo ports.Repository, tx ports.Transactor, publisher notifyports.Publisher, limits domain.Limits, appSecret string) *Service {
	return &Service{
		repo: repo, tx: tx, notify: publisher,
		catalog: domain.NewCatalog(limits), tokens: domain.NewTokenSigner(appSecret), now: time.Now,
	}
}

// WithEvents records billing changes in the same transaction as the change.
func (s *Service) WithEvents(r anports.Recorder) *Service { s.events = r; return s }

// WithClock replaces the clock, for tests that move through billing periods.
func (s *Service) WithClock(now func() time.Time) *Service { s.now = now; return s }

func (s *Service) Catalog() domain.Catalog { return s.catalog }

func requireAuth(v viewer.Viewer) error {
	if !v.Authenticated {
		return apperr.Unauthorized("authentication required")
	}
	return nil
}

// PlanState is the plan in effect for a user right now.
type PlanState struct {
	Info domain.PlanInfo
	// Status and the period are set only for a paid plan.
	Status            domain.Status
	PeriodEnd         *time.Time
	CancelAtPeriodEnd bool
}

type Usage struct {
	ActiveIdeas int
	// Limit is 0 when the plan has no cap.
	Limit int
}

// Overview is everything a person sees about their own billing.
type Overview struct {
	Plan         PlanState
	Usage        Usage
	Sponsorships []domain.Sponsorship
	Payments     []domain.Payment
}

// effectivePlan returns the plan in effect at now and the stored subscription behind it, if any.
func (s *Service) effectivePlan(ctx context.Context, userID string, now time.Time) (PlanState, *domain.Subscription, error) {
	sub, err := s.repo.Subscription(ctx, userID)
	if err != nil {
		return PlanState{}, nil, fmt.Errorf("load subscription: %w", err)
	}
	if sub == nil || !sub.InEffect(now) {
		free, _ := s.catalog.Plan(domain.Free)
		return PlanState{Info: free}, sub, nil
	}
	info, ok := s.catalog.Plan(sub.Plan)
	if !ok {
		return PlanState{}, nil, fmt.Errorf("stored plan %q is not in the catalog", sub.Plan)
	}
	end := sub.End
	return PlanState{Info: info, Status: sub.Status, PeriodEnd: &end, CancelAtPeriodEnd: sub.Status == domain.Canceled}, sub, nil
}

// ActiveIdeaLimit is the cap the ideas context enforces on new active ideas. 0 means no cap.
func (s *Service) ActiveIdeaLimit(ctx context.Context, userID string) (int, error) {
	plan, _, err := s.effectivePlan(ctx, userID, s.now().UTC())
	if err != nil {
		return 0, err
	}
	return plan.Info.ActiveIdeas, nil
}

func (s *Service) overview(ctx context.Context, userID string, now time.Time) (Overview, error) {
	plan, _, err := s.effectivePlan(ctx, userID, now)
	if err != nil {
		return Overview{}, err
	}
	active, err := s.repo.CountActiveIdeas(ctx, userID)
	if err != nil {
		return Overview{}, fmt.Errorf("count active ideas: %w", err)
	}
	sponsorships, err := s.repo.SponsorshipsOf(ctx, userID, maxSponsorships)
	if err != nil {
		return Overview{}, fmt.Errorf("list sponsorships: %w", err)
	}
	live := sponsorships[:0]
	for _, sp := range sponsorships {
		if sp.InEffect(now) {
			live = append(live, sp)
		}
	}
	payments, err := s.repo.Payments(ctx, userID, maxPayments)
	if err != nil {
		return Overview{}, fmt.Errorf("list payments: %w", err)
	}
	return Overview{Plan: plan, Usage: Usage{ActiveIdeas: active, Limit: plan.Info.ActiveIdeas}, Sponsorships: live, Payments: payments}, nil
}

// Overview is the viewer's plan, usage, sponsorships and recent payments.
func (s *Service) Overview(ctx context.Context, v viewer.Viewer) (Overview, error) {
	if err := requireAuth(v); err != nil {
		return Overview{}, err
	}
	return s.overview(ctx, v.ID(), s.now().UTC())
}

func clip(text string, n int) string {
	if utf8.RuneCountInString(text) <= n {
		return text
	}
	return string([]rune(text)[:n-1]) + "…"
}

func planDescription(info domain.PlanInfo) string {
	return "План «" + info.Name + "» на місяць"
}

func sponsorshipDescription(tier domain.TierInfo, ideaTitle string) string {
	return "Підтримка ідеї «" + clip(ideaTitle, 120) + "», рівень «" + tier.Name + "», на місяць"
}

func (s *Service) charge(ctx context.Context, p domain.Payment) error {
	if _, err := s.repo.InsertPayment(ctx, p); err != nil {
		return fmt.Errorf("record payment: %w", err)
	}
	return nil
}

// ChangePlan subscribes the viewer to a paid plan, switches between paid plans or
// resumes a canceled one. Choosing the plan already in effect is a no-op, so a retry
// never charges twice. Switching starts a new month at the new price; there is no proration.
func (s *Service) ChangePlan(ctx context.Context, v viewer.Viewer, code domain.Plan) (Overview, error) {
	if err := requireAuth(v); err != nil {
		return Overview{}, err
	}
	info, ok := s.catalog.Plan(code)
	if !ok || !code.Paid() {
		return Overview{}, apperr.Validation(map[string]string{"plan": "must be PLUS or PRO; cancel the paid plan to return to FREE"})
	}
	now := s.now().UTC()
	var out Overview
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repo.LockUser(ctx, v.ID()); err != nil {
			return fmt.Errorf("lock user: %w", err)
		}
		current, sub, err := s.effectivePlan(ctx, v.ID(), now)
		if err != nil {
			return err
		}
		from := current.Info.Code
		switch {
		case from == code && current.Status == domain.Active:
		case from == code:
			sub.Status, sub.CanceledAt = domain.Active, nil
			if err := s.repo.SaveSubscription(ctx, v.ID(), *sub, now); err != nil {
				return fmt.Errorf("resume plan: %w", err)
			}
			if err := anports.Record(ctx, s.events, anports.Event{Name: "billing.plan_resumed", ActorID: v.ID(), SubjectType: "plan", SubjectID: string(code)}); err != nil {
				return err
			}
		default:
			next := domain.Subscription{Plan: code, Period: domain.Period{Status: domain.Active, Start: now, End: domain.NextPeriodEnd(now)}}
			if err := s.repo.SaveSubscription(ctx, v.ID(), next, now); err != nil {
				return fmt.Errorf("save plan: %w", err)
			}
			if err := s.charge(ctx, domain.Payment{UserID: v.ID(), Kind: domain.PlanPayment, Plan: code, AmountMinor: info.PriceMinor, Description: planDescription(info)}); err != nil {
				return err
			}
			if err := anports.Record(ctx, s.events, anports.Event{Name: "billing.plan_changed", ActorID: v.ID(), SubjectType: "plan", SubjectID: string(code), Props: map[string]any{"from": string(from)}}); err != nil {
				return err
			}
		}
		out, err = s.overview(ctx, v.ID(), now)
		return err
	})
	return out, err
}

// CancelPlan stops the paid plan from renewing. It stays in effect until the end of the paid month.
func (s *Service) CancelPlan(ctx context.Context, v viewer.Viewer) (Overview, error) {
	if err := requireAuth(v); err != nil {
		return Overview{}, err
	}
	now := s.now().UTC()
	var out Overview
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.cancelPlan(ctx, v.ID(), now); err != nil {
			return err
		}
		var err error
		out, err = s.overview(ctx, v.ID(), now)
		return err
	})
	return out, err
}

func (s *Service) cancelPlan(ctx context.Context, userID string, now time.Time) error {
	if err := s.repo.LockUser(ctx, userID); err != nil {
		return fmt.Errorf("lock user: %w", err)
	}
	_, sub, err := s.effectivePlan(ctx, userID, now)
	if err != nil {
		return err
	}
	if sub == nil || sub.Status != domain.Active {
		return nil
	}
	sub.Status, sub.CanceledAt = domain.Canceled, &now
	if err := s.repo.SaveSubscription(ctx, userID, *sub, now); err != nil {
		return fmt.Errorf("cancel plan: %w", err)
	}
	return anports.Record(ctx, s.events, anports.Event{Name: "billing.plan_canceled", ActorID: userID, SubjectType: "plan", SubjectID: string(sub.Plan)})
}

// IdeaSponsorship is the sponsorship side of one idea, as the viewer may see it.
type IdeaSponsorship struct {
	Sponsors int
	// Accepting is true when the viewer could start or change a sponsorship now.
	Accepting bool
	Own       bool
	// Mine is the viewer's sponsorship while it is in effect.
	Mine *domain.Sponsorship
	// Supporters and MonthlyMinor are filled for the author and staff only.
	Supporters   []ports.Sponsor
	MonthlyMinor int
	Manager      bool
}

func notFound() error { return apperr.NotFound("idea not found") }

func (s *Service) findIdea(ctx context.Context, v viewer.Viewer, slug string, readable bool) (ports.IdeaRef, error) {
	ref, err := s.repo.FindIdea(ctx, ideaports.AccessOf(v), slug, readable)
	if errors.Is(err, ideadomain.ErrNotFound) {
		return ports.IdeaRef{}, notFound()
	}
	if err != nil {
		return ports.IdeaRef{}, fmt.Errorf("find idea: %w", err)
	}
	return ref, nil
}

func (s *Service) ideaSponsorship(ctx context.Context, v viewer.Viewer, ref ports.IdeaRef, now time.Time) (IdeaSponsorship, error) {
	count, err := s.repo.CountSponsors(ctx, ref.ID, now)
	if err != nil {
		return IdeaSponsorship{}, fmt.Errorf("count sponsors: %w", err)
	}
	own := v.Authenticated && v.ID() == ref.AuthorID
	out := IdeaSponsorship{
		Sponsors:  count,
		Own:       own,
		Accepting: !own && ref.Status.Active() && ref.Moderation == ideadomain.Approved,
		Manager:   v.Authenticated && (own || v.IsStaff()),
	}
	if v.Authenticated && !own {
		mine, err := s.repo.Sponsorship(ctx, ref.ID, v.ID())
		if err != nil {
			return IdeaSponsorship{}, fmt.Errorf("load sponsorship: %w", err)
		}
		if mine != nil && mine.InEffect(now) {
			out.Mine = mine
		}
	}
	if out.Manager {
		if out.Supporters, err = s.repo.Sponsors(ctx, ref.ID, now, maxSponsorsListed); err != nil {
			return IdeaSponsorship{}, fmt.Errorf("list sponsors: %w", err)
		}
		for _, sp := range out.Supporters {
			if tier, ok := s.catalog.Tier(sp.Tier); ok {
				out.MonthlyMinor += tier.PriceMinor
			}
		}
	}
	return out, nil
}

// SponsorshipOf shows the sponsorship side of an idea. Anyone who can read the idea can read it.
func (s *Service) SponsorshipOf(ctx context.Context, v viewer.Viewer, slug string) (IdeaSponsorship, error) {
	ref, err := s.findIdea(ctx, v, slug, true)
	if err != nil {
		return IdeaSponsorship{}, err
	}
	return s.ideaSponsorship(ctx, v, ref, s.now().UTC())
}

// Sponsor starts, changes or resumes the viewer's monthly sponsorship of an idea.
// Picking the tier already in effect is a no-op; a new tier starts a new month at its price.
func (s *Service) Sponsor(ctx context.Context, v viewer.Viewer, slug string, code domain.Tier) (IdeaSponsorship, error) {
	if err := requireAuth(v); err != nil {
		return IdeaSponsorship{}, err
	}
	tier, ok := s.catalog.Tier(code)
	if !ok {
		return IdeaSponsorship{}, apperr.Validation(map[string]string{"tier": "must be SUPPORTER, BACKER or PATRON"})
	}
	now := s.now().UTC()
	var out IdeaSponsorship
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repo.LockUser(ctx, v.ID()); err != nil {
			return fmt.Errorf("lock user: %w", err)
		}
		ref, err := s.findIdea(ctx, v, slug, false)
		if err != nil {
			return err
		}
		if ref.AuthorID == v.ID() {
			return apperr.Validation(map[string]string{"sponsorship": "you cannot sponsor your own idea"})
		}
		if !ref.Status.Active() {
			return apperr.Conflict("this idea no longer accepts sponsors")
		}
		existing, err := s.repo.Sponsorship(ctx, ref.ID, v.ID())
		if err != nil {
			return fmt.Errorf("load sponsorship: %w", err)
		}
		live := existing != nil && existing.InEffect(now)
		switch {
		case live && existing.Tier == code && existing.Status == domain.Active:
		case live && existing.Tier == code:
			existing.Status, existing.CanceledAt = domain.Active, nil
			if _, err := s.repo.SaveSponsorship(ctx, *existing, now); err != nil {
				return fmt.Errorf("resume sponsorship: %w", err)
			}
			if err := anports.Record(ctx, s.events, anports.Event{Name: "sponsorship.resumed", ActorID: v.ID(), SubjectType: "idea", SubjectID: ref.Slug}); err != nil {
				return err
			}
		default:
			next := domain.Sponsorship{IdeaID: ref.ID, SponsorID: v.ID(), Tier: code, Period: domain.Period{Status: domain.Active, Start: now, End: domain.NextPeriodEnd(now)}}
			id, err := s.repo.SaveSponsorship(ctx, next, now)
			if err != nil {
				return fmt.Errorf("save sponsorship: %w", err)
			}
			if err := s.charge(ctx, domain.Payment{UserID: v.ID(), Kind: domain.SponsorshipPayment, SponsorshipID: id, AmountMinor: tier.PriceMinor, Description: sponsorshipDescription(tier, ref.Title)}); err != nil {
				return err
			}
			name := "sponsorship.changed"
			if !live {
				name = "sponsorship.started"
				if err := s.notify.Publish(ctx, notify.Notification{
					UserID: ref.AuthorID, Type: notify.System,
					Payload: map[string]any{
						"message":   clip(sponsorName(v)+" підтримує вашу ідею «"+clip(ref.Title, 80)+"» щомісячно, рівень «"+tier.Name+"».", 180),
						"ideaSlug":  ref.Slug,
						"ideaTitle": ref.Title,
						"sponsor":   v.User.Handle,
					},
					DedupeKey: map[string]any{"ideaSlug": ref.Slug, "sponsor": v.User.Handle},
				}); err != nil {
					return fmt.Errorf("notify: %w", err)
				}
			}
			if err := anports.Record(ctx, s.events, anports.Event{Name: name, ActorID: v.ID(), SubjectType: "idea", SubjectID: ref.Slug, Props: map[string]any{"tier": string(code)}}); err != nil {
				return err
			}
		}
		out, err = s.ideaSponsorship(ctx, v, ref, now)
		return err
	})
	return out, err
}

func sponsorName(v viewer.Viewer) string {
	if name := strings.TrimSpace(v.User.Name); name != "" {
		return clip(name, 60)
	}
	return v.User.Handle
}

// CancelSponsorship stops one of the viewer's sponsorships from renewing. It works
// even when the idea is no longer visible, so nobody keeps paying for what they cannot see.
func (s *Service) CancelSponsorship(ctx context.Context, v viewer.Viewer, id string) (Overview, error) {
	if err := requireAuth(v); err != nil {
		return Overview{}, err
	}
	now := s.now().UTC()
	var out Overview
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.cancelSponsorship(ctx, v.ID(), id, now); err != nil {
			return err
		}
		var err error
		out, err = s.overview(ctx, v.ID(), now)
		return err
	})
	return out, err
}

func (s *Service) cancelSponsorship(ctx context.Context, userID, id string, now time.Time) error {
	sp, err := s.repo.SponsorshipByID(ctx, id, userID)
	if errors.Is(err, domain.ErrNotFound) || err == nil && !sp.InEffect(now) {
		return apperr.NotFound("sponsorship not found")
	}
	if err != nil {
		return fmt.Errorf("load sponsorship: %w", err)
	}
	if sp.Status != domain.Active {
		return nil
	}
	sp.Status, sp.CanceledAt = domain.Canceled, &now
	if _, err := s.repo.SaveSponsorship(ctx, *sp, now); err != nil {
		return fmt.Errorf("cancel sponsorship: %w", err)
	}
	return anports.Record(ctx, s.events, anports.Event{Name: "sponsorship.canceled", ActorID: userID, SubjectType: "idea", SubjectID: sp.IdeaSlug})
}

// Renew charges every plan and sponsorship whose month has ended and moves it one month on.
// The mock provider never declines, so renewal only ever succeeds or stops a sponsorship
// whose idea is gone. A period that fell several months behind catches up one month per run.
func (s *Service) Renew(ctx context.Context) (int, error) {
	now := s.now().UTC()
	total := 0
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		plans, err := s.repo.RenewPlans(ctx, now, renewalBatch)
		if err != nil {
			return fmt.Errorf("renew plans: %w", err)
		}
		for _, r := range plans {
			info, ok := s.catalog.Plan(r.Plan)
			if !ok {
				return fmt.Errorf("stored plan %q is not in the catalog", r.Plan)
			}
			if err := s.charge(ctx, domain.Payment{UserID: r.UserID, Kind: domain.PlanPayment, Plan: r.Plan, AmountMinor: info.PriceMinor, Description: planDescription(info)}); err != nil {
				return err
			}
		}
		sponsorships, err := s.repo.RenewSponsorships(ctx, now, renewalBatch)
		if err != nil {
			return fmt.Errorf("renew sponsorships: %w", err)
		}
		for _, r := range sponsorships {
			tier, ok := s.catalog.Tier(r.Tier)
			if !ok {
				return fmt.Errorf("stored tier %q is not in the catalog", r.Tier)
			}
			if err := s.charge(ctx, domain.Payment{UserID: r.UserID, Kind: domain.SponsorshipPayment, SponsorshipID: r.SponsorshipID, AmountMinor: tier.PriceMinor, Description: sponsorshipDescription(tier, r.IdeaTitle)}); err != nil {
				return err
			}
		}
		total = len(plans) + len(sponsorships)
		return nil
	})
	return total, err
}
