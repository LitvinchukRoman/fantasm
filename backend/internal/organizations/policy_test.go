package organizations

import (
	"strings"
	"testing"

	"github.com/LitvinchukRoman/fantasm/backend/internal/identity/domain"
)

const tenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

func parsePolicy(t *testing.T, match string) *Policy {
	t.Helper()
	p, err := Parse(strings.NewReader(`{"version":1,"organizations":[{"id":"campus","name":"Campus","badge":"Member","match":` + match + `,"capabilities":["ideas.read_internal"],"benefits":{"voteWeight":2}}]}`))
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestMembershipRequiresEvidenceFromOneIdentity(t *testing.T) {
	p := parsePolicy(t, `{"all":[{"provider":"entra"},{"tenantId":"`+tenant+`"},{"verifiedEmailDomain":"university.example"}]}`)
	valid := domain.Identity{Provider: domain.Entra, Issuer: "https://login.microsoftonline.com/" + tenant + "/v2.0", Subject: "subject", TenantID: tenant, Email: "person@university.example", EmailVerified: true}
	for _, tc := range []struct {
		name string
		edit func(*domain.Identity)
		want bool
	}{
		{"valid", func(i *domain.Identity) {}, true},
		{"domain case", func(i *domain.Identity) { i.Email = "person@UNIVERSITY.EXAMPLE" }, true},
		{"unverified", func(i *domain.Identity) { i.EmailVerified = false }, false},
		{"other tenant", func(i *domain.Identity) { i.TenantID = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee" }, false},
		{"other issuer", func(i *domain.Identity) { i.Issuer = "https://attacker.example" }, false},
		{"google", func(i *domain.Identity) { i.Provider = domain.Google; i.Issuer = "https://accounts.google.com" }, false},
		{"subdomain", func(i *domain.Identity) { i.Email = "person@sub.university.example" }, false},
		{"suffix", func(i *domain.Identity) { i.Email = "person@university.example.attacker.example" }, false},
		{"missing email", func(i *domain.Identity) { i.Email = "" }, false},
		{"missing subject", func(i *domain.Identity) { i.Subject = "" }, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			i := valid
			tc.edit(&i)
			memberships := p.Evaluate([]domain.Identity{i})
			if (len(memberships) == 1) != tc.want {
				t.Fatalf("memberships = %+v", memberships)
			}
		})
	}
	a, b := valid, valid
	a.EmailVerified = false
	b.TenantID = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee"
	if len(p.Evaluate([]domain.Identity{a, b})) != 0 {
		t.Fatal("combined evidence from different identities")
	}
	memberships := p.Evaluate([]domain.Identity{valid, valid})
	if len(memberships) != 1 || memberships[0].Benefits.VoteWeight != 2 || memberships[0].Benefits.KarmaMultiplier != 1 {
		t.Fatalf("unexpected benefits: %+v", memberships)
	}
	u := domain.User{Memberships: memberships}
	if !u.Can("campus", "ideas.read_internal") || u.Can("other", "ideas.read_internal") || u.Can("campus", "ideas.create_internal") || u.Can("", "") {
		t.Fatal("organization capability scope was not enforced")
	}
	memberships[0].Capabilities[0] = "changed"
	if p.Evaluate([]domain.Identity{valid})[0].Capabilities[0] != "ideas.read_internal" {
		t.Fatal("caller mutated policy")
	}
}

func TestAnyAndIndependentOrganizations(t *testing.T) {
	p, err := Parse(strings.NewReader(`{"version":1,"organizations":[
	{"id":"first","name":"First","match":{"any":[{"verifiedEmailDomain":"first.example"},{"verifiedEmailDomain":"second.example"}]}},
	{"id":"second","name":"Second","match":{"all":[{"provider":"google"},{"issuer":"https://accounts.google.com"},{"verifiedEmailDomain":"second.example"}]}}
	]}`))
	if err != nil {
		t.Fatal(err)
	}
	i := domain.Identity{Provider: domain.Google, Issuer: "https://accounts.google.com", Subject: "subject", Email: "person@second.example", EmailVerified: true}
	if memberships := p.Evaluate([]domain.Identity{i}); len(memberships) != 2 {
		t.Fatalf("memberships: %+v", memberships)
	}
	i.EmailVerified = false
	if len(p.Evaluate([]domain.Identity{i})) != 0 {
		t.Fatal("unverified identity granted memberships")
	}
}

func TestInvalidConfiguration(t *testing.T) {
	for _, match := range []string{
		`{}`, `{"all":[]}`, `{"any":[]}`, `{"provider":"unknown"}`,
		`{"provider":"google","verifiedEmailDomain":"example.com"}`,
		`{"tenantId":"tenant"}`, `{"verifiedEmailDomain":"*.example.com"}`,
		`{"verifiedEmailDomain":"EXAMPLE.COM"}`, `{"emailDomain":"example.com"}`,
		`{"issuer":"http://example.com"}`, `{"any":[{}]}`,
	} {
		if _, err := Parse(strings.NewReader(`{"version":1,"organizations":[{"id":"org","name":"Org","match":` + match + `}]}`)); err == nil {
			t.Errorf("accepted %s", match)
		}
	}
	for _, data := range []string{
		`null`, `{}`, `{"version":2,"organizations":[]}`, `{"version":1,"organizations":null}`,
		`{"version":1,"organizations":[],"unknown":true}`, `{"version":1,"organizations":[]} {}`,
		`{"version":1,"organizations":[{"id":"org","name":"Org","match":{"provider":"google"},"benefits":{"voteWeight":-1}}]}`,
		`{"version":1,"organizations":[{"id":"org","name":"Org","match":{"provider":"google"}},{"id":"org","name":"Org","match":{"provider":"entra"}}]}`,
	} {
		if _, err := Parse(strings.NewReader(data)); err == nil {
			t.Errorf("accepted %s", data)
		}
	}
	if _, err := Load("missing-rules.json"); err == nil {
		t.Fatal("missing configured file silently ignored")
	}
	p, err := Parse(strings.NewReader(`{"version":1,"organizations":[]}`))
	if err != nil || p.Evaluate(nil) == nil || len(p.Evaluate(nil)) != 0 {
		t.Fatalf("empty policy: %v", err)
	}
}

func TestShippedConfigurations(t *testing.T) {
	for _, path := range []string{"../../config/organizations.json", "../../config/organizations.example.json"} {
		if _, err := Load(path); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
	}
}
