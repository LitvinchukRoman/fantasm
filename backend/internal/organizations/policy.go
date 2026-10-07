package organizations

import (
	"encoding/json"
	"fmt"
	"io"
	"net/mail"
	"os"
	"regexp"
	"slices"
	"strings"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
)

type Policy struct {
	organizations []organization
}

type document struct {
	Version       int            `json:"version"`
	Organizations []organization `json:"organizations"`
}

type organization struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	Badge        string          `json:"badge"`
	Match        condition       `json:"match"`
	Capabilities []string        `json:"capabilities"`
	Benefits     domain.Benefits `json:"benefits"`
}

type condition struct {
	All                 []condition `json:"all,omitempty"`
	Any                 []condition `json:"any,omitempty"`
	Provider            string      `json:"provider,omitempty"`
	Issuer              string      `json:"issuer,omitempty"`
	TenantID            string      `json:"tenantId,omitempty"`
	VerifiedEmailDomain string      `json:"verifiedEmailDomain,omitempty"`
}

var identifier = regexp.MustCompile(`^[a-z][a-z0-9_.:-]{0,127}$`)
var tenantID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var emailDomain = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$`)

func Load(path string) (*Policy, error) {
	if path == "" {
		return &Policy{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open organization rules: %w", err)
	}
	defer f.Close()
	return Parse(f)
}

func Parse(r io.Reader) (*Policy, error) {
	data, err := io.ReadAll(io.LimitReader(r, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return nil, fmt.Errorf("organization rules must be readable and at most 1 MiB")
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	var doc document
	if err := decoder.Decode(&doc); err != nil {
		return nil, fmt.Errorf("decode organization rules: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fmt.Errorf("organization rules must contain one JSON document")
	}
	if doc.Version != 1 || doc.Organizations == nil {
		return nil, fmt.Errorf("organization rules require version 1 and an organizations array")
	}
	seen := map[string]bool{}
	for i := range doc.Organizations {
		org := &doc.Organizations[i]
		if !identifier.MatchString(org.ID) || seen[org.ID] || strings.TrimSpace(org.Name) == "" {
			return nil, fmt.Errorf("organization %q requires a unique ID and a name", org.ID)
		}
		seen[org.ID] = true
		if err := org.Match.validate(0); err != nil {
			return nil, fmt.Errorf("organization %q: %w", org.ID, err)
		}
		capabilities := map[string]bool{}
		for _, capability := range org.Capabilities {
			if !identifier.MatchString(capability) || capabilities[capability] {
				return nil, fmt.Errorf("organization %q has an invalid or duplicate capability", org.ID)
			}
			capabilities[capability] = true
		}
		if org.Benefits.VoteWeight == 0 {
			org.Benefits.VoteWeight = 1
		}
		if org.Benefits.RankingMultiplier == 0 {
			org.Benefits.RankingMultiplier = 1
		}
		if org.Benefits.KarmaMultiplier == 0 {
			org.Benefits.KarmaMultiplier = 1
		}
		if org.Benefits.VoteWeight < 1 || org.Benefits.VoteWeight > 100 || org.Benefits.RankingMultiplier < 1 || org.Benefits.RankingMultiplier > 100 || org.Benefits.KarmaMultiplier < 1 || org.Benefits.KarmaMultiplier > 100 {
			return nil, fmt.Errorf("organization %q benefit weights must be between 1 and 100", org.ID)
		}
	}
	return &Policy{organizations: doc.Organizations}, nil
}

func (c condition) validate(depth int) error {
	if depth > 8 {
		return fmt.Errorf("match nesting exceeds 8 levels")
	}
	kinds := 0
	if c.All != nil {
		kinds++
		if len(c.All) == 0 {
			return fmt.Errorf("all must not be empty")
		}
	}
	if c.Any != nil {
		kinds++
		if len(c.Any) == 0 {
			return fmt.Errorf("any must not be empty")
		}
	}
	for _, value := range []string{c.Provider, c.Issuer, c.TenantID, c.VerifiedEmailDomain} {
		if value != "" {
			kinds++
		}
	}
	if kinds != 1 {
		return fmt.Errorf("each match must contain exactly one operator")
	}
	if c.Provider != "" && c.Provider != "google" && c.Provider != "entra" {
		return fmt.Errorf("unknown provider %q", c.Provider)
	}
	if c.Issuer != "" && (!strings.HasPrefix(c.Issuer, "https://") || strings.TrimSpace(c.Issuer) != c.Issuer) {
		return fmt.Errorf("issuer must be an HTTPS issuer")
	}
	if c.TenantID != "" && !tenantID.MatchString(c.TenantID) {
		return fmt.Errorf("tenantId must be a lowercase UUID")
	}
	if c.VerifiedEmailDomain != "" && (len(c.VerifiedEmailDomain) > 253 || !emailDomain.MatchString(c.VerifiedEmailDomain)) {
		return fmt.Errorf("verifiedEmailDomain must be an exact lowercase DNS domain")
	}
	for _, child := range append(slices.Clone(c.All), c.Any...) {
		if err := child.validate(depth + 1); err != nil {
			return err
		}
	}
	return nil
}

func (p *Policy) Evaluate(identities []domain.Identity) []domain.Membership {
	memberships := []domain.Membership{}
	if p == nil {
		return memberships
	}
	for _, org := range p.organizations {
		for _, identity := range identities {
			if identity.Validate() == nil && org.Match.matches(identity) {
				memberships = append(memberships, domain.Membership{
					OrganizationID: org.ID, Name: org.Name, Badge: org.Badge,
					Capabilities: append([]string{}, org.Capabilities...), Benefits: org.Benefits,
				})
				break
			}
		}
	}
	return memberships
}

func (c condition) matches(i domain.Identity) bool {
	switch {
	case c.All != nil:
		for _, child := range c.All {
			if !child.matches(i) {
				return false
			}
		}
		return true
	case c.Any != nil:
		for _, child := range c.Any {
			if child.matches(i) {
				return true
			}
		}
		return false
	case c.Provider != "":
		return string(i.Provider) == c.Provider
	case c.Issuer != "":
		return i.Issuer == c.Issuer
	case c.TenantID != "":
		return i.Provider == domain.Entra && i.TenantID == c.TenantID && i.Issuer == "https://login.microsoftonline.com/"+c.TenantID+"/v2.0"
	case c.VerifiedEmailDomain != "":
		address, err := mail.ParseAddress(i.Email)
		if err != nil || !i.EmailVerified || address.Address != i.Email {
			return false
		}
		at := strings.LastIndexByte(i.Email, '@')
		return at >= 0 && strings.EqualFold(i.Email[at+1:], c.VerifiedEmailDomain)
	}
	return false
}

// Badge returns the public mark of an organization by id.
func (p *Policy) Badge(id string) (domain.Badge, bool) {
	if p == nil {
		return domain.Badge{}, false
	}
	for _, o := range p.organizations {
		if o.ID == id {
			return domain.Badge{OrganizationID: o.ID, Label: o.Badge}, true
		}
	}
	return domain.Badge{}, false
}
