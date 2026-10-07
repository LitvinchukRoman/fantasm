// Package viewer carries the identity of the caller through a request. It is a
// shared kernel: HTTP middleware stores a Viewer, services receive it as an
// explicit argument and never read it from the context themselves.
package viewer

import (
	"context"
	"slices"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
)

const (
	CapReadInternal   = "ideas.read_internal"
	CapCreateInternal = "ideas.create_internal"
)

type Viewer struct {
	Authenticated bool
	User          domain.User
}

// Anonymous is the zero viewer: not signed in, no privileges.
var Anonymous = Viewer{}

// ID is the user id, or "" for an anonymous viewer.
func (v Viewer) ID() string {
	if !v.Authenticated {
		return ""
	}
	return v.User.ID
}

func (v Viewer) IsStaff() bool {
	return v.Authenticated && (v.User.Role == domain.ModeratorRole || v.User.Role == domain.AdminRole)
}

func (v Viewer) IsAdmin() bool { return v.Authenticated && v.User.Role == domain.AdminRole }

// Can reports whether the viewer holds the capability inside the organization.
func (v Viewer) Can(organizationID, capability string) bool {
	return v.Authenticated && v.User.Can(organizationID, capability)
}

// ReadableOrganizations lists organizations whose internal ideas the viewer may read.
func (v Viewer) ReadableOrganizations() []string {
	orgs := []string{}
	if !v.Authenticated {
		return orgs
	}
	for _, m := range v.User.Memberships {
		if slices.Contains(m.Capabilities, CapReadInternal) && !slices.Contains(orgs, m.OrganizationID) {
			orgs = append(orgs, m.OrganizationID)
		}
	}
	return orgs
}

// VoteWeight is the weight of a vote cast now. It is stored with the vote.
func (v Viewer) VoteWeight() int {
	weight := 1
	if !v.Authenticated {
		return weight
	}
	for _, m := range v.User.Memberships {
		weight = max(weight, m.Benefits.VoteWeight)
	}
	return weight
}

func (v Viewer) SkipPremoderation() bool {
	if !v.Authenticated {
		return false
	}
	for _, m := range v.User.Memberships {
		if m.Benefits.SkipPremoderation {
			return true
		}
	}
	return false
}

// Benefit picks the membership with the strongest ranking multiplier: the one
// whose badge and multipliers get frozen onto a new idea.
func (v Viewer) Benefit() (domain.Membership, bool) {
	var best domain.Membership
	found := false
	if !v.Authenticated {
		return best, false
	}
	for _, m := range v.User.Memberships {
		if !found || m.Benefits.RankingMultiplier > best.Benefits.RankingMultiplier {
			best, found = m, true
		}
	}
	return best, found
}

// BadgeLookup resolves current badges for many users in one round trip.
type BadgeLookup interface {
	BadgesFor(ctx context.Context, userIDs []string) (map[string]domain.Badge, error)
}

type ctxKey struct{}

func With(ctx context.Context, v Viewer) context.Context { return context.WithValue(ctx, ctxKey{}, v) }

func From(ctx context.Context) Viewer {
	v, _ := ctx.Value(ctxKey{}).(Viewer)
	return v
}
