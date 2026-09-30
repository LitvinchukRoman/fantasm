package domain

type Visibility string

const (
	Public           Visibility = "PUBLIC"
	MembersOnly      Visibility = "MEMBERS_ONLY"
	OrganizationOnly Visibility = "ORGANIZATION_ONLY"
)

type OrganizationAccess interface {
	Can(string, string) bool
}

func (v Visibility) CanRead(organizationID string, authenticated bool, access OrganizationAccess) bool {
	switch v {
	case Public:
		return true
	case MembersOnly:
		return authenticated
	case OrganizationOnly:
		return authenticated && organizationID != "" && access != nil && access.Can(organizationID, "ideas.read_internal")
	default:
		return false
	}
}

func (v Visibility) CanCreate(organizationID string, authenticated bool, access OrganizationAccess) bool {
	if !authenticated {
		return false
	}
	switch v {
	case Public, MembersOnly:
		return organizationID == ""
	case OrganizationOnly:
		return organizationID != "" && access != nil && access.Can(organizationID, "ideas.create_internal")
	default:
		return false
	}
}
