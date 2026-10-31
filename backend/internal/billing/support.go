package billing

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"time"

	anports "github.com/LitvinchukRoman/fantasm/backend/internal/analytics/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/billing/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/viewer"
)

// The support bot acts only for the person who is talking to it: the browser obtains a
// short-lived identity token from IssueSupportToken and hands it to the bot, the bot
// sends it back together with its own credential. The bot can therefore never name an
// arbitrary user, and every change it makes is recorded under its action id.

// IssueSupportToken returns a token the support bot can use to act for the viewer.
func (s *Service) IssueSupportToken(v viewer.Viewer) (string, time.Time, error) {
	if err := requireAuth(v); err != nil {
		return "", time.Time{}, err
	}
	token, expires := s.tokens.Issue(v.ID(), s.now().UTC())
	return token, expires, nil
}

// SupportUser resolves the identity token into the user it was issued for.
func (s *Service) SupportUser(ctx context.Context, token string) (ports.UserCard, error) {
	userID, err := s.tokens.Verify(token, s.now().UTC())
	if err != nil {
		return ports.UserCard{}, apperr.Unauthorized("support credentials required")
	}
	card, err := s.repo.User(ctx, userID)
	if errors.Is(err, domain.ErrNotFound) {
		return ports.UserCard{}, apperr.Unauthorized("support credentials required")
	}
	if err != nil {
		return ports.UserCard{}, fmt.Errorf("load user: %w", err)
	}
	return card, nil
}

// SupportSnapshot is what the support bot knows about the user's billing.
type SupportSnapshot struct {
	User ports.UserCard
	Overview
	// Replayed is true when the action id was seen before and nothing was applied again.
	Replayed bool
}

// SupportOverview is the snapshot for the bot's context step.
func (s *Service) SupportOverview(ctx context.Context, user ports.UserCard) (SupportSnapshot, error) {
	o, err := s.overview(ctx, user.ID, s.now().UTC())
	if err != nil {
		return SupportSnapshot{}, err
	}
	return SupportSnapshot{User: user, Overview: o}, nil
}

// SupportRequest is one change the bot asks for. ActionID is the bot's idempotency key.
type SupportRequest struct {
	ActionID string
	Action   domain.SupportAction
	// Subject is the sponsorship or payment id the action is about, when it has one.
	Subject string
	Days    int
}

var actionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{8,100}$`)

// SupportAct applies a change for the user and records it under the action id. Repeating
// an action id replays the current state without applying anything; reusing it for a
// different change is a conflict.
func (s *Service) SupportAct(ctx context.Context, user ports.UserCard, req SupportRequest) (SupportSnapshot, error) {
	if !actionIDPattern.MatchString(req.ActionID) {
		return SupportSnapshot{}, apperr.Validation(map[string]string{"actionId": "8-100 characters: letters, digits, _ . : -"})
	}
	params := map[string]any{}
	if req.Action == domain.ExtendPlan {
		if req.Days < 1 || req.Days > domain.MaxExtensionDays {
			return SupportSnapshot{}, apperr.Validation(map[string]string{"days": "must be between 1 and " + strconv.Itoa(domain.MaxExtensionDays)})
		}
		params["days"] = req.Days
	}
	now := s.now().UTC()
	var out SupportSnapshot
	err := s.tx.WithinTx(ctx, func(ctx context.Context) error {
		if err := s.repo.LockUser(ctx, user.ID); err != nil {
			return fmt.Errorf("lock user: %w", err)
		}
		seen, err := s.repo.SupportRecord(ctx, req.ActionID)
		if err != nil {
			return fmt.Errorf("load support action: %w", err)
		}
		if seen != nil {
			if seen.UserID != user.ID || seen.Action != req.Action || seen.Subject != req.Subject || !sameParams(seen.Params, params) {
				return apperr.Conflict("this action id was already used for a different action")
			}
			out.Replayed = true
		} else {
			if err := s.applySupport(ctx, user.ID, req, now); err != nil {
				return err
			}
			if err := s.repo.InsertSupportRecord(ctx, ports.SupportRecord{ID: req.ActionID, UserID: user.ID, Action: req.Action, Subject: req.Subject, Params: params}); err != nil {
				return fmt.Errorf("record support action: %w", err)
			}
			if err := anports.Record(ctx, s.events, anports.Event{Name: "billing.support_action", ActorID: user.ID, SubjectType: "billing", SubjectID: string(req.Action)}); err != nil {
				return err
			}
		}
		o, err := s.overview(ctx, user.ID, now)
		out.User, out.Overview = user, o
		return err
	})
	return out, err
}

// sameParams compares stored JSON params with fresh ones; JSON numbers come back as float64.
func sameParams(stored, fresh map[string]any) bool {
	normal := map[string]any{}
	for k, v := range fresh {
		if n, ok := v.(int); ok {
			normal[k] = float64(n)
		} else {
			normal[k] = v
		}
	}
	return len(stored) == len(normal) && (len(stored) == 0 || reflect.DeepEqual(stored, normal))
}

func (s *Service) applySupport(ctx context.Context, userID string, req SupportRequest, now time.Time) error {
	switch req.Action {
	case domain.CancelPlan:
		return s.cancelPlan(ctx, userID, now)
	case domain.ResumePlan, domain.ExtendPlan:
		_, sub, err := s.effectivePlan(ctx, userID, now)
		if err != nil {
			return err
		}
		if sub == nil || !sub.InEffect(now) {
			return apperr.Conflict("the user has no paid plan in effect")
		}
		if req.Action == domain.ResumePlan {
			sub.Status, sub.CanceledAt = domain.Active, nil
		} else {
			sub.End = sub.End.AddDate(0, 0, req.Days)
		}
		if err := s.repo.SaveSubscription(ctx, userID, *sub, now); err != nil {
			return fmt.Errorf("save plan: %w", err)
		}
		return nil
	case domain.CancelSponsorship:
		return s.cancelSponsorship(ctx, userID, req.Subject, now)
	case domain.RefundPayment:
		p, err := s.repo.Payment(ctx, req.Subject, userID)
		if errors.Is(err, domain.ErrNotFound) {
			return apperr.NotFound("payment not found")
		}
		if err != nil {
			return fmt.Errorf("load payment: %w", err)
		}
		if !p.Refundable(now) {
			return apperr.Conflict("this payment cannot be refunded: it is free, already refunded or older than 14 days")
		}
		if err := s.repo.MarkRefunded(ctx, p.ID, now); err != nil {
			return fmt.Errorf("refund: %w", err)
		}
		return nil
	default:
		return apperr.NotFound("unknown action")
	}
}
