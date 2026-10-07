package postgres

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/LitvinchukRoman/fantasm/backend/internal/ideas/ports"
)

// Args collects positional query parameters so that SQL built from fragments
// never interpolates a value: every value travels as a bind parameter.
type Args struct{ Values []any }

// Add registers a value and returns its placeholder.
func (a *Args) Add(v any) string {
	a.Values = append(a.Values, v)
	return "$" + strconv.Itoa(len(a.Values))
}

// PublicVisible is the one SQL expression for "this idea is listed for this
// viewer": approved, not deleted, not a draft, and inside the visibility the
// viewer holds. Other contexts (votes, discussion, reports) reuse it, so the
// rule exists in exactly one place. Mirrors domain.Visibility.CanRead.
func PublicVisible(alias string, a *Args, ac ports.Access) string {
	vis := []string{alias + ".visibility = 'PUBLIC'"}
	if ac.Authenticated {
		vis = append(vis, alias+".visibility = 'MEMBERS_ONLY'")
	}
	if len(ac.Orgs) > 0 {
		vis = append(vis, fmt.Sprintf("(%s.visibility = 'ORGANIZATION_ONLY' AND %s.organization_id = ANY(%s::text[]))", alias, alias, a.Add(ac.Orgs)))
	}
	return fmt.Sprintf("%[1]s.moderation_state = 'APPROVED' AND %[1]s.deleted_at IS NULL AND %[1]s.status <> 'DRAFT' AND (%[2]s)", alias, strings.Join(vis, " OR "))
}

// Readable extends PublicVisible: authors also read their own unfinished or
// hidden ideas and staff read everything that is not deleted.
func Readable(alias string, a *Args, ac ports.Access) string {
	switch {
	case ac.Staff && ac.Authenticated:
		return alias + ".deleted_at IS NULL"
	case ac.Authenticated:
		return fmt.Sprintf("%[1]s.deleted_at IS NULL AND (%[1]s.author_id = %[2]s OR (%[3]s))", alias, a.Add(ac.UserID), PublicVisible(alias, a, ac))
	default:
		return PublicVisible(alias, a, ac)
	}
}
