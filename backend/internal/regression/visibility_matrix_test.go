package regression_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

// variant is one idea in a particular state. The matrix below checks every
// viewer against every variant on every surface that can reveal or change it.
type variant struct {
	name    string // also the title word, so the slug is easy to look for in bodies
	vis     string
	org     string
	mod     string
	status  string
	deleted bool
}

var variants = []variant{
	{name: "alpha", vis: "PUBLIC", mod: "APPROVED", status: "OPEN"},
	{name: "bravo", vis: "MEMBERS_ONLY", mod: "APPROVED", status: "OPEN"},
	{name: "charlie", vis: "ORGANIZATION_ONLY", org: "naukma", mod: "APPROVED", status: "OPEN"},
	{name: "delta", vis: "PUBLIC", mod: "PENDING", status: "OPEN"},
	{name: "echo", vis: "PUBLIC", mod: "HIDDEN", status: "OPEN"},
	{name: "foxtrot", vis: "PUBLIC", mod: "REJECTED", status: "OPEN"},
	{name: "golf", vis: "PUBLIC", mod: "APPROVED", status: "DRAFT"},
	{name: "hotel", vis: "PUBLIC", mod: "APPROVED", status: "OPEN", deleted: true},
	{name: "india", vis: "MEMBERS_ONLY", mod: "HIDDEN", status: "IN_PROGRESS"},
	{name: "juliet", vis: "ORGANIZATION_ONLY", org: "naukma", mod: "PENDING", status: "OPEN"},
}

type viewer struct {
	name                  string
	c                     *apptest.Client
	authed, member, staff bool
	author                bool
}

// listedFor is the rule for "appears in public listings": approved, published, not deleted, within visibility.
func (v variant) listedFor(w viewer) bool {
	if v.mod != "APPROVED" || v.deleted || v.status == "DRAFT" {
		return false
	}
	switch v.vis {
	case "PUBLIC":
		return true
	case "MEMBERS_ONLY":
		return w.authed
	default:
		return w.member
	}
}

// readableBy is the rule for opening the idea by its address: listing rules, plus the author and staff, never deleted.
func (v variant) readableBy(w viewer) bool {
	if v.deleted {
		return false
	}
	return w.staff || w.author || v.listedFor(w)
}

func TestVisibilityMatrix(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)

	slugs := map[string]string{}
	ids := map[string]string{}
	for _, v := range variants {
		slug, id := idea(t, env, who.Outsider, map[string]any{"title": v.name + " idea", "summary": "about " + v.name})
		slugs[v.name], ids[v.name] = slug, id
		env.Exec(`UPDATE ideas SET visibility = $2, organization_id = NULLIF($3, ''), moderation_state = $4, status = $5, deleted_at = CASE WHEN $6::bool THEN now() END WHERE id = $1`,
			id, v.vis, v.org, v.mod, v.status, v.deleted)
		env.Exec(`UPDATE ideas SET created_at = created_at - interval '3 days' WHERE id = $1`, id) // quota is per day
	}

	viewers := []viewer{
		{name: "anonymous", c: who.Anon},
		{name: "author", c: who.Outsider, authed: true, author: true},
		{name: "other user", c: who.Third, authed: true},
		{name: "org member", c: who.Member, authed: true, member: true},
		{name: "moderator", c: who.Mod, authed: true, staff: true},
		{name: "admin", c: who.Admin, authed: true, staff: true},
	}
	absent := who.Anon.Do(http.MethodGet, "/api/ideas/no-such-idea-anywhere", nil)

	for _, w := range viewers {
		// Listings: exactly the listed ones, nothing else.
		var feed struct{ Items []struct{ Slug string } }
		w.c.Do(http.MethodGet, "/api/ideas?limit=50", nil).Decode(&feed)
		inFeed := map[string]bool{}
		for _, it := range feed.Items {
			inFeed[it.Slug] = true
		}
		sitemap := string(w.c.Do(http.MethodGet, "/api/sitemap/ideas", nil).Body)

		for _, v := range variants {
			slug := slugs[v.name]
			where := fmt.Sprintf("%s / %s (%s %s %s deleted=%v)", w.name, v.name, v.vis, v.mod, v.status, v.deleted)

			if got, want := inFeed[slug], v.listedFor(w); got != want {
				t.Errorf("%s: in feed = %v, want %v", where, got, want)
			}
			if strings.Contains(sitemap, slug) && !(v.vis == "PUBLIC" && v.listedFor(w)) {
				t.Errorf("%s: the sitemap lists it", where)
			}

			// Opening it.
			detail := w.c.Do(http.MethodGet, "/api/ideas/"+slug, nil)
			readable := v.readableBy(w)
			if readable != (detail.Code == http.StatusOK) {
				t.Errorf("%s: detail %d, readable should be %v", where, detail.Code, readable)
			}
			if !readable && (shape(detail) != shape(absent) || headerShape(detail) != headerShape(absent)) {
				t.Errorf("%s: an unreadable idea is distinguishable from a missing one:\n%s\n%s", where, shape(detail), shape(absent))
			}

			// Every other surface: an idea you cannot open does not exist there either.
			for _, s := range []struct{ method, path string }{
				{"GET", "/api/ideas/" + slug + "/thread"},
				{"GET", "/api/ideas/" + slug + "/participants"},
				{"GET", "/api/ideas/" + slug + "/next"},
			} {
				r := w.c.Do(s.method, s.path, nil)
				if !readable && r.Code != http.StatusNotFound {
					t.Errorf("%s: %s %s = %d, want 404", where, s.method, s.path, r.Code)
				}
				if r.Code == http.StatusOK && strings.HasSuffix(s.path, "/next") {
					for _, other := range variants {
						if strings.Contains(string(r.Body), slugs[other.name]) && other.name != v.name && !other.listedFor(w) {
							t.Errorf("%s: /next leaks %s", where, other.name)
						}
					}
				}
			}

			// Writes need the idea to be listed for the writer, and leave no trace otherwise.
			writes := []struct {
				method, path string
				body         any
				table        string
			}{
				{"PUT", "/api/ideas/" + slug + "/vote", nil, "votes"},
				{"PUT", "/api/ideas/" + slug + "/participation", map[string]any{"state": "INTERESTED"}, "participations"},
				{"POST", "/api/ideas/" + slug + "/report", map[string]any{"reason": "this is spam for sure"}, "reports"},
				{"POST", "/api/ideas/" + slug + "/posts", map[string]any{"body": "hello"}, "posts"},
			}
			for _, s := range writes {
				r := w.c.Do(s.method, s.path, s.body)
				switch {
				case !w.authed:
					if r.Code != http.StatusUnauthorized {
						t.Errorf("%s: anonymous %s %s = %d, want 401", where, s.method, s.path, r.Code)
					}
				case !v.listedFor(w):
					if r.Code != http.StatusNotFound {
						t.Errorf("%s: %s %s = %d, want 404", where, s.method, s.path, r.Code)
					}
				}
			}
			if !v.listedFor(w) {
				user := w.c.Email
				for _, table := range []string{"votes", "participations", "reports"} {
					if n := count(env, `SELECT count(*) FROM `+table+` t JOIN users u ON u.id = t.user_id WHERE t.idea_id = $1 AND u.email = $2`, ids[v.name], user); n != 0 {
						t.Errorf("%s: left %d rows in %s", where, n, table)
					}
				}
				if n := count(env, `SELECT count(*) FROM posts p JOIN topics tp ON tp.id = p.topic_id JOIN users u ON u.id = p.author_id WHERE tp.idea_id = $1 AND u.email = $2`, ids[v.name], user); n != 0 {
					t.Errorf("%s: left %d posts", where, n)
				}
			}
		}
	}
}

// A moderator who is not in the organization does not see organization-only ideas in listings,
// but staff can still open them by address to moderate.
func TestStaffSeesWhatTheyModerateButNotInListings(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, id := idea(t, env, who.Member, map[string]any{"title": "Internal charlie", "summary": "s"})
	env.Exec(`UPDATE ideas SET visibility = 'ORGANIZATION_ONLY', organization_id = 'naukma' WHERE id = $1`, id)
	if r := who.Mod.Do(http.MethodGet, "/api/ideas/"+slug, nil); r.Code != http.StatusOK {
		t.Errorf("staff cannot open it: %d", r.Code)
	}
	var feed struct{ Items []struct{ Slug string } }
	who.Mod.Do(http.MethodGet, "/api/ideas?limit=50", nil).Decode(&feed)
	for _, it := range feed.Items {
		if it.Slug == slug {
			t.Error("an organization-only idea appears in a non-member moderator's feed")
		}
	}
	if r := who.Third.Do(http.MethodGet, "/api/ideas/"+slug, nil); r.Code != http.StatusNotFound {
		t.Errorf("outsider opened it: %d", r.Code)
	}
}

// Deleting an idea takes its comments, votes and profile entries out of every public surface.
func TestDeletedIdeaDisappearsEverywhere(t *testing.T) {
	env := apptest.New(t)
	who := cast(env)
	slug, _ := idea(t, env, who.Outsider, map[string]any{"title": "Doomed idea", "summary": "s"})
	comment(t, who.Third, slug, "a comment that will be orphaned", "")
	who.Third.Do(http.MethodPut, "/api/ideas/"+slug+"/vote", nil)

	if r := who.Outsider.Do(http.MethodDelete, "/api/ideas/"+slug, nil); r.Code != http.StatusNoContent && r.Code != http.StatusOK {
		t.Fatalf("delete: %d %s", r.Code, r.Body)
	}
	absent := who.Anon.Do(http.MethodGet, "/api/ideas/nope-nope", nil)
	for name, c := range map[string]*apptest.Client{"anonymous": who.Anon, "author": who.Outsider, "admin": who.Admin, "voter": who.Third} {
		for _, p := range []string{"", "/thread", "/participants", "/next"} {
			if r := c.Do(http.MethodGet, "/api/ideas/"+slug+p, nil); shape(r) != shape(absent) {
				t.Errorf("%s: GET %s%s still answers: %s", name, slug, p, shape(r))
			}
		}
		var feed struct{ Items []struct{ Slug string } }
		c.Do(http.MethodGet, "/api/ideas?limit=50", nil).Decode(&feed)
		for _, it := range feed.Items {
			if it.Slug == slug {
				t.Errorf("%s: the deleted idea is still in the feed", name)
			}
		}
	}
	if strings.Contains(string(who.Anon.Do(http.MethodGet, "/api/sitemap/ideas", nil).Body), slug) {
		t.Error("the sitemap still lists a deleted idea")
	}
	mine := string(who.Outsider.Do(http.MethodGet, "/api/me/ideas", nil).Body)
	if strings.Contains(mine, slug) {
		t.Error("the author's own list still shows a deleted idea")
	}
}
