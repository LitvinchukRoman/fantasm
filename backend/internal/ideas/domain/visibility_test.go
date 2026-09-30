package domain_test

import (
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/domain"
	identity "github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
)

func TestOrganizationVisibility(t *testing.T) {
	u := identity.User{Memberships: []identity.Membership{{OrganizationID: "first", Capabilities: []string{"ideas.read_internal"}}}}
	if !domain.OrganizationOnly.CanRead("first", true, u) || domain.OrganizationOnly.CanRead("second", true, u) || domain.OrganizationOnly.CanRead("first", false, u) || domain.OrganizationOnly.CanRead("first", true, nil) {
		t.Fatal("restricted visibility did not enforce organization membership")
	}
	if domain.OrganizationOnly.CanCreate("first", true, u) {
		t.Fatal("read permission granted create permission")
	}
	u.Memberships[0].Capabilities = append(u.Memberships[0].Capabilities, "ideas.create_internal")
	if !domain.OrganizationOnly.CanCreate("first", true, u) || domain.OrganizationOnly.CanCreate("second", true, u) || domain.OrganizationOnly.CanCreate("first", false, u) {
		t.Fatal("create permission did not enforce organization membership")
	}
	if !domain.Public.CanRead("", false, nil) || domain.MembersOnly.CanRead("", false, nil) || !domain.MembersOnly.CanRead("", true, nil) || domain.Visibility("invalid").CanRead("", true, u) {
		t.Fatal("unexpected generic visibility behavior")
	}
}
