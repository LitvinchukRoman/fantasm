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
