package domain

import "slices"

type Membership struct {
	OrganizationID string   `json:"organizationId"`
	Name           string   `json:"name"`
	Badge          string   `json:"badge"`
	Capabilities   []string `json:"capabilities"`
	Benefits       Benefits `json:"benefits"`
}

type Benefits struct {
	VoteWeight        int     `json:"voteWeight"`
	RankingMultiplier float64 `json:"rankingMultiplier"`
	KarmaMultiplier   float64 `json:"karmaMultiplier"`
	SkipPremoderation bool    `json:"skipPremoderation"`
}

func (u User) Can(organizationID, capability string) bool {
	if organizationID == "" || capability == "" {
		return false
	}
	for _, membership := range u.Memberships {
		if membership.OrganizationID == organizationID && slices.Contains(membership.Capabilities, capability) {
			return true
		}
	}
	return false
}

// Badge is the public mark of an organization member.
type Badge struct {
	OrganizationID string `json:"id"`
	Label          string `json:"label"`
}

// BadgeOf picks the badge shown next to a person: the membership with the
// strongest ranking multiplier (first one on a tie).
func BadgeOf(memberships []Membership) (Badge, bool) {
	var best Membership
	found := false
	for _, m := range memberships {
		if !found || m.Benefits.RankingMultiplier > best.Benefits.RankingMultiplier {
			best, found = m, true
		}
	}
	return Badge{OrganizationID: best.OrganizationID, Label: best.Badge}, found
}
