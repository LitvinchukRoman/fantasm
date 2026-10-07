package regression_test

import (
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/postgres"
	"github.com/LitvinchukRoman/fantasm/backend/internal/platform/testdb"
)

// signature describes everything structural in the current schema as sorted
// lines, so two databases can be compared and a difference named.
func signature(t *testing.T, db *postgres.DB) []string {
	t.Helper()
	ctx := t.Context()
	var lines []string
	collect := func(prefix, sql string) {
		rows, err := db.Querier(ctx).Query(ctx, sql)
		if err != nil {
			t.Fatalf("%s: %v", prefix, err)
		}
		defer rows.Close()
		for rows.Next() {
			var a string
			if err := rows.Scan(&a); err != nil {
				t.Fatal(err)
			}
			lines = append(lines, prefix+" "+a)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
	}
	collect("column", `
		SELECT table_name || '.' || column_name || ' ' || data_type || ' null=' || is_nullable || ' default=' || COALESCE(column_default, '')
		FROM information_schema.columns WHERE table_schema = current_schema()`)
	collect("constraint", `
		SELECT c.conrelid::regclass::text || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid)
		FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = current_schema()`)
	collect("index", `SELECT tablename || ' ' || indexdef FROM pg_indexes WHERE schemaname = current_schema()`)
	collect("function", `
		SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = current_schema()`)
	collect("trigger", `
		SELECT pg_get_triggerdef(tg.oid) FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = current_schema() AND NOT tg.tgisinternal`)
	collect("table", `SELECT tablename FROM pg_tables WHERE schemaname = current_schema()`)

	schema := apptestSchema(t, db)
	for i := range lines {
		lines[i] = strings.ReplaceAll(strings.ReplaceAll(lines[i], schema+".", ""), `"`+schema+`".`, "")
	}
	sort.Strings(lines)
	return lines
}

func apptestSchema(t *testing.T, db *postgres.DB) string {
	t.Helper()
	var s string
	if err := db.Querier(t.Context()).QueryRow(t.Context(), `SELECT current_schema()`).Scan(&s); err != nil {
		t.Fatal(err)
	}
	return s
}

func diff(a, b []string) string {
	in := func(list []string) map[string]bool {
		m := map[string]bool{}
		for _, s := range list {
			m[s] = true
		}
		return m
	}
	ma, mb := in(a), in(b)
	var out []string
	for _, s := range a {
		if !mb[s] {
			out = append(out, "  - "+s)
		}
	}
	for _, s := range b {
		if !ma[s] {
			out = append(out, "  + "+s)
		}
	}
	return strings.Join(out, "\n")
}

func run(t *testing.T, db *postgres.DB, m testdb.Migration) {
	t.Helper()
	if _, err := db.Querier(t.Context()).Exec(t.Context(), m.SQL); err != nil {
		t.Fatalf("%s: %v", m.Name, err)
	}
}

func TestMigrationsAreNumberedAndPaired(t *testing.T) {
	up, down := testdb.Migrations(t, "up"), testdb.Migrations(t, "down")
	if len(up) != len(down) {
		t.Fatalf("%d up migrations but %d down", len(up), len(down))
	}
	name := regexp.MustCompile(`^\d{6}_[a-z0-9]+(_[a-z0-9]+)*\.(up|down)\.sql$`)
	for i := range up {
		if up[i].Version != i+1 || down[i].Version != i+1 {
			t.Errorf("position %d holds versions %d/%d: numbers must be consecutive from 1", i+1, up[i].Version, down[i].Version)
		}
		if strings.TrimSuffix(up[i].Name, ".up.sql") != strings.TrimSuffix(down[i].Name, ".down.sql") {
			t.Errorf("%s and %s do not pair", up[i].Name, down[i].Name)
		}
		for _, m := range []testdb.Migration{up[i], down[i]} {
			if !name.MatchString(m.Name) {
				t.Errorf("%s is not named NNNNNN_snake_case.(up|down).sql", m.Name)
			}
			if strings.TrimSpace(m.SQL) == "" {
				t.Errorf("%s is empty", m.Name)
			}
		}
		// golang-migrate runs a file in one transaction on its own; an explicit one would nest, and
		// CONCURRENTLY cannot run in one at all.
		for _, m := range []testdb.Migration{up[i], down[i]} {
			upper := strings.ToUpper(m.SQL)
			for _, banned := range []string{"BEGIN;", "COMMIT;", "CONCURRENTLY"} {
				if strings.Contains(upper, banned) {
					t.Errorf("%s contains %s", m.Name, banned)
				}
			}
		}
	}
}

// Every step can be undone to exactly the schema it started from, and redone to
// exactly the schema it produced: the property a rollback in production relies on.
func TestMigrationsRoundTrip(t *testing.T) {
	db := testdb.Scratch(t)
	up, down := testdb.Migrations(t, "up"), testdb.Migrations(t, "down")

	sigs := [][]string{signature(t, db)} // sigs[i] is the schema after i migrations
	for _, m := range up {
		run(t, db, m)
		sigs = append(sigs, signature(t, db))
	}
	for i := len(down) - 1; i >= 0; i-- {
		run(t, db, down[i])
		if d := diff(sigs[i], signature(t, db)); d != "" {
			t.Errorf("rolling back %s does not restore the schema:\n%s", down[i].Name, d)
		}
	}
	if len(sigs[0]) != 0 {
		t.Fatalf("a fresh schema is not empty: %v", sigs[0])
	}
	for i, m := range up {
		run(t, db, m)
		if d := diff(sigs[i+1], signature(t, db)); d != "" {
			t.Errorf("re-applying %s gives a different schema:\n%s", m.Name, d)
		}
	}
}

// Rows written before a migration come out the other side correctly converted.
func TestMigrationsCarryExistingDataForward(t *testing.T) {
	db := testdb.Scratch(t)
	ctx := t.Context()
	up := testdb.Migrations(t, "up")
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Querier(ctx).Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%q: %v", sql, err)
		}
	}
	for _, m := range up[:7] { // the schema as the first release had it, with authentication in place
		run(t, db, m)
	}
	exec(`INSERT INTO users (id, handle, name, email, affiliation) VALUES
		('00000000-0000-0000-0000-000000000001', 'anna', 'Anna', 'anna@ukma.edu.ua', 'UKMA_VERIFIED'),
		('00000000-0000-0000-0000-000000000002', 'boris', 'Boris', 'boris@example.com', 'EXTERNAL')`)
	exec(`INSERT INTO ideas (id, author_id, slug, title, category, visibility, moderation_state, status, campus, votes_weighted) VALUES
		('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'internal-one', 'Internal one', 'PROJECT', 'UKMA_ONLY', 'APPROVED', 'OPEN', true, 4),
		('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000002', 'public-one',   'Public one',   'PROJECT', 'PUBLIC',    'APPROVED', 'OPEN', false, 0),
		('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000002', 'waiting-one',  'Waiting one',  'PROJECT', 'PUBLIC',    'PENDING',  'OPEN', false, 0),
		('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000002', 'drafty-one',   'Drafty one',   'PROJECT', 'PUBLIC',    'APPROVED', 'DRAFT', false, 0)`)
	exec(`INSERT INTO idea_tags (idea_id, tag) VALUES ('00000000-0000-0000-0000-0000000000a1', 'golang')`)

	for _, m := range up[7:] {
		run(t, db, m)
	}

	type idea struct {
		Visibility, Org, Badge string
		Published              bool
		Votes                  int
	}
	got := map[string]idea{}
	rows, err := db.Querier(ctx).Query(ctx, `SELECT slug, visibility, COALESCE(organization_id, ''), COALESCE(badge_organization_id, ''), published_at IS NOT NULL, votes_weighted FROM ideas`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var slug string
		var i idea
		if err := rows.Scan(&slug, &i.Visibility, &i.Org, &i.Badge, &i.Published, &i.Votes); err != nil {
			t.Fatal(err)
		}
		got[slug] = i
	}
	rows.Close()
	want := map[string]idea{
		"internal-one": {Visibility: "ORGANIZATION_ONLY", Org: "naukma", Badge: "naukma", Published: true, Votes: 4},
		"public-one":   {Visibility: "PUBLIC", Published: true},
		"waiting-one":  {Visibility: "PUBLIC"},
		"drafty-one":   {Visibility: "PUBLIC"},
	}
	for slug, w := range want {
		if got[slug] != w {
			t.Errorf("%s: migrated to %+v, want %+v", slug, got[slug], w)
		}
	}
	var label string
	if err := db.Querier(ctx).QueryRow(ctx, `SELECT label FROM idea_tags WHERE tag = 'golang'`).Scan(&label); err != nil || label != "golang" {
		t.Errorf("tag label = %q (%v)", label, err)
	}
	var users int
	_ = db.Querier(ctx).QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users)
	if users != 2 {
		t.Errorf("%d users survived, want 2", users)
	}
}

// Structural rules every table of this schema keeps; a new migration that breaks one is a review comment waiting to happen.
func TestSchemaConventions(t *testing.T) {
	db := testdb.New(t)
	ctx := t.Context()
	list := func(sql string) []string {
		t.Helper()
		rows, err := db.Querier(ctx).Query(ctx, sql)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				t.Fatal(err)
			}
			out = append(out, s)
		}
		return out
	}
	expect := func(what string, offenders []string) {
		t.Helper()
		if len(offenders) > 0 {
			t.Errorf("%s: %s", what, strings.Join(offenders, ", "))
		}
	}

	expect("tables without a primary key", list(`
		SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = current_schema() AND c.relkind = 'r'
		  AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')
		  AND c.relname <> 'schema_migrations'`))
	expect("timestamps without a time zone", list(`
		SELECT table_name || '.' || column_name FROM information_schema.columns
		WHERE table_schema = current_schema() AND data_type = 'timestamp without time zone'`))
	expect("foreign keys with no index starting with their columns", list(`
		SELECT c.conrelid::regclass::text || '(' || c.conname || ')' FROM pg_constraint c
		JOIN pg_namespace n ON n.oid = c.connamespace
		WHERE n.nspname = current_schema() AND c.contype = 'f'
		  AND NOT EXISTS (
			SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
			  AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey AND c.conkey @> (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1])`))
	expect("text columns that look like secrets and are not hashed (token, secret, password)", list(`
		SELECT table_name || '.' || column_name FROM information_schema.columns
		WHERE table_schema = current_schema() AND column_name ~ '(^|_)(token|secret|password)($|_)' AND column_name !~ 'hash'`))
	expect("extensions other than plpgsql (the schema must not need superuser)", list(`SELECT extname FROM pg_extension WHERE extname <> 'plpgsql'`))
}
