package domain

import "testing"

func TestProfileLinksKeepOnlyTheAccountName(t *testing.T) {
	for _, tc := range []struct {
		name     string
		n        network
		in, want string
		ok       bool
	}{
		{"linkedin profile", linkedin, "https://ua.linkedin.com/in/%D1%96%D0%B2%D0%B0%D0%BD-k/", "іван-k", true},
		{"linkedin without scheme", linkedin, "linkedin.com/in/boris-b/", "boris-b", true},
		{"linkedin company", linkedin, "linkedin.com/company/naukma", "linkedin.com/company/naukma", false},
		{"linkedin lookalike host", linkedin, "https://linkedin.com.evil.example/in/boris", "https://linkedin.com.evil.example/in/boris", false},
		{"instagram at", instagram, "@boris.b", "boris.b", true},
		{"instagram plain", instagram, "  boris.b ", "boris.b", true},
		{"instagram url", instagram, "https://www.instagram.com/boris.b/?hl=uk", "boris.b", true},
		{"instagram post", instagram, "https://www.instagram.com/p/C1x2y3/", "p", false},
		{"instagram reel", instagram, "instagram.com/reel/C1x2y3", "reel", false},
		{"instagram reserved any case", instagram, "Explore", "Explore", false},
		{"instagram script", instagram, "javascript:alert(1)", "javascript:alert(1)", false},
		{"empty clears", instagram, "   ", "", true},
	} {
		got := tc.n.account(tc.in)
		if got != tc.want || tc.n.valid(got) != tc.ok {
			t.Errorf("%s: account(%q) = %q valid=%v; want %q valid=%v", tc.name, tc.in, got, tc.n.valid(got), tc.want, tc.ok)
		}
	}
}

func TestGitHubAccountValidation(t *testing.T) {
	for _, tc := range []struct {
		account GitHubAccount
		ok      bool
	}{
		{GitHubAccount{ID: 583231, Login: "octocat"}, true},
		{GitHubAccount{ID: 1, Login: "Octo-Cat"}, true},
		{GitHubAccount{ID: 0, Login: "octocat"}, false},
		{GitHubAccount{ID: 7, Login: ""}, false},
		{GitHubAccount{ID: 7, Login: "octo--cat"}, false},
		{GitHubAccount{ID: 7, Login: "octo/../cat"}, false},
	} {
		if err := tc.account.Validate(); (err == nil) != tc.ok {
			t.Errorf("%+v: err = %v, want ok=%v", tc.account, err, tc.ok)
		}
	}
}
