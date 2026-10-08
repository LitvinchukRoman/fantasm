package ideas

import (
	"context"
	"fmt"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/apperr"
)

// SeedInput is demo content shipped with the code (backend/seed), not a request.
type SeedInput struct {
	Slug                string
	Content             domain.Content
	Status              domain.Status
	BadgeOrganizationID string
	// WrittenAt is when the idea appears to have been written.
	WrittenAt time.Time
}

// Seed publishes an idea under a fixed slug for authorID, past premoderation.
// Only an operator runs it. A slug that is already taken, even by a deleted
// idea, is left alone, so running the same seed again changes nothing.
func (s *Service) Seed(ctx context.Context, authorID string, in SeedInput) (created bool, err error) {
	now := s.now().UTC()
	content := in.Content.Normalize()
	fields := content.Validate(now, true)
	if in.Status == domain.Draft || !in.Status.Valid() {
		fields["status"] = "a seeded idea is published"
	}
	rendered, err := s.render(content.Body, content.Summary, fields)
	if err != nil {
		return false, err
	}
	if len(fields) > 0 {
		return false, fmt.Errorf("seed %s: %w", in.Slug, apperr.Validation(fields))
	}
	written := in.WrittenAt.UTC()
	if written.IsZero() || written.After(now) {
		written = now
	}
	err = s.tx.WithinTx(ctx, func(ctx context.Context) error {
		taken, err := s.repo.SlugTaken(ctx, in.Slug)
		if err != nil || taken {
			return err
		}
		_, slug, err := s.repo.Insert(ctx, ports.NewIdea{
			AuthorID: authorID, SlugBase: in.Slug, Content: content, Rendered: rendered,
			Status: in.Status, Visibility: domain.Public, BadgeOrganizationID: in.BadgeOrganizationID,
			Moderation: domain.Approved, RankingMultiplier: 1, KarmaMultiplier: 1, Now: written,
		})
		if err != nil {
			return fmt.Errorf("insert idea: %w", err)
		}
		if slug != in.Slug {
			return fmt.Errorf("slug %s was taken while seeding", in.Slug)
		}
		created = true
		return nil
	})
	return created, err
}
