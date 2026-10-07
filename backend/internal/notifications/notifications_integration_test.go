package notifications_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
)

const owner = "boris@example.com"

type item struct {
	ID      string
	Type    string
	Payload map[string]any
	Read    bool
}

type page struct {
	Items      []item
	NextCursor *string
	Unread     int
}

// inbox makes the owner's idea collect n comments, one notification each.
func inbox(t *testing.T, env *apptest.Env, n int) (boris *apptest.Client, slug string) {
	t.Helper()
	boris = env.SignIn(owner)
	r := boris.Do(http.MethodPost, "/api/ideas", map[string]any{"title": "Popular", "summary": "s", "category": "PROJECT"})
	slug = r.Map()["slug"].(string)
	env.Exec(`UPDATE ideas SET moderation_state = 'APPROVED' WHERE slug = $1`, slug)
	for i := 0; i < n; i++ {
		c := env.SignIn(fmt.Sprintf("commenter%d@example.com", i))
		if r := c.Do(http.MethodPost, "/api/ideas/"+slug+"/posts", map[string]any{"body": "nice"}); r.Code != http.StatusCreated {
			t.Fatalf("comment: %d %s", r.Code, r.Body)
		}
		env.Exec(`UPDATE notifications SET created_at = now() + $1 * interval '1 second' WHERE id = (SELECT id FROM notifications ORDER BY created_at DESC LIMIT 1)`, i)
	}
	return boris, slug
}

func list(t *testing.T, c *apptest.Client, query string) (page, int) {
	t.Helper()
	r := c.Do(http.MethodGet, "/api/me/notifications"+query, nil)
	var p page
	r.Decode(&p)
	return p, r.Code
}

func TestInboxListingAndPaging(t *testing.T) {
	env := apptest.New(t)
	boris, slug := inbox(t, env, 5)

	if _, code := list(t, env.Anon(), ""); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", code)
	}
	first, code := list(t, boris, "?limit=2")
	if code != http.StatusOK || len(first.Items) != 2 || first.NextCursor == nil || first.Unread != 5 {
		t.Fatalf("first page: %d %+v", code, first)
	}
	if it := first.Items[0]; it.Type != "COMMENT" || it.Read || it.Payload["ideaSlug"] != slug {
		t.Fatalf("item: %+v", it)
	}
	seen := map[string]bool{}
	for p, n := first, 0; ; n++ {
		for _, it := range p.Items {
			if seen[it.ID] {
				t.Fatalf("duplicate %s across pages", it.ID)
			}
			seen[it.ID] = true
		}
		if p.NextCursor == nil {
			break
		}
		if n > 5 {
			t.Fatal("paging does not terminate")
		}
		p, _ = list(t, boris, "?limit=2&cursor="+*p.NextCursor)
	}
	if len(seen) != 5 {
		t.Fatalf("saw %d notifications", len(seen))
	}

	// A cursor belongs to one user and one filter.
	other := env.SignIn("mallory@example.com")
	for name, c := range map[string]struct {
		who   *apptest.Client
		query string
	}{
		"other user":      {other, "?cursor=" + *first.NextCursor},
		"other filter":    {boris, "?unread=true&cursor=" + *first.NextCursor},
		"forged":          {boris, "?cursor=" + *first.NextCursor + "x"},
		"bad unread flag": {boris, "?unread=maybe"},
		"bad limit":       {boris, "?limit=abc"},
	} {
		if _, code := list(t, c.who, c.query); code != http.StatusUnprocessableEntity && code != http.StatusBadRequest {
			t.Errorf("%s: %d", name, code)
		}
	}
	if mine, _ := list(t, other, ""); len(mine.Items) != 0 || mine.Unread != 0 {
		t.Errorf("another user's inbox leaks: %+v", mine)
	}
}

func TestMarkReadAndUnreadCount(t *testing.T) {
	env := apptest.New(t)
	boris, _ := inbox(t, env, 4)
	other := env.SignIn("mallory@example.com")
	all, _ := list(t, boris, "")

	count := func() int {
		var out struct{ Unread int }
		boris.Do(http.MethodGet, "/api/me/notifications/unread-count", nil).Decode(&out)
		return out.Unread
	}
	if count() != 4 {
		t.Fatalf("unread = %d", count())
	}

	// Somebody else's ids change nothing.
	r := other.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"ids": []string{all.Items[0].ID}})
	if r.Code != http.StatusOK || count() != 4 {
		t.Fatalf("foreign mark: %d %s unread=%d", r.Code, r.Body, count())
	}

	var res struct {
		Updated int
		Unread  int
	}
	r = boris.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"ids": []string{all.Items[0].ID, all.Items[1].ID}})
	r.Decode(&res)
	if r.Code != http.StatusOK || res.Updated != 2 || res.Unread != 2 {
		t.Fatalf("mark ids: %d %s", r.Code, r.Body)
	}
	// Marking again is harmless.
	r = boris.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"ids": []string{all.Items[0].ID}})
	r.Decode(&res)
	if res.Updated != 0 || res.Unread != 2 {
		t.Fatalf("repeat mark: %+v", res)
	}
	if unread, _ := list(t, boris, "?unread=true"); len(unread.Items) != 2 {
		t.Fatalf("unread filter: %+v", unread)
	}

	for name, body := range map[string]map[string]any{
		"nothing":      {},
		"both":         {"ids": []string{all.Items[0].ID}, "all": true},
		"bad id":       {"ids": []string{"nope"}},
		"too many ids": {"ids": make([]string, 101)},
		"unknown key":  {"all": true, "extra": 1},
	} {
		if r := boris.Do(http.MethodPost, "/api/me/notifications/read", body); r.Code != http.StatusUnprocessableEntity && r.Code != http.StatusBadRequest {
			t.Errorf("%s: %d %s", name, r.Code, r.Body)
		}
	}

	r = boris.Do(http.MethodPost, "/api/me/notifications/read", map[string]any{"all": true})
	r.Decode(&res)
	if r.Code != http.StatusOK || res.Updated != 2 || res.Unread != 0 || count() != 0 {
		t.Fatalf("mark all: %d %s", r.Code, r.Body)
	}
}

func TestPurgeJobKeepsRecentNotifications(t *testing.T) {
	env := apptest.New(t)
	boris, _ := inbox(t, env, 3)
	all, _ := list(t, boris, "")
	env.Exec(`UPDATE notifications SET read_at = now() - interval '31 days' WHERE id = $1`, all.Items[0].ID)
	env.Exec(`UPDATE notifications SET read_at = now() - interval '1 day' WHERE id = $1`, all.Items[1].ID)
	env.Exec(`UPDATE notifications SET created_at = now() - interval '200 days' WHERE id = $1`, all.Items[2].ID)

	for _, run := range env.Jobs {
		if err := run(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	if left := apptest.Scalar[int](env, `SELECT count(*) FROM notifications`); left != 1 {
		t.Fatalf("%d notifications left, want only the recently read one", left)
	}
}
