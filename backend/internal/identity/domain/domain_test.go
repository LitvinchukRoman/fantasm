package domain

import "testing"

func TestAffiliation(t *testing.T) {
	const tenant = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
	base := Identity{Provider: Entra, Issuer: "https://login.microsoftonline.com/" + tenant + "/v2.0", Subject: "subject", TenantID: tenant, Email: "student@ukma.edu.ua", EmailVerified: true}
	tests := []struct {
		name   string
		change func(*Identity)
		tenant string
		want   Affiliation
	}{
		{"both signals", func(*Identity) {}, tenant, UKMAVerified},
		{"case insensitive domain", func(i *Identity) { i.Email = "student@UKMA.EDU.UA" }, tenant, UKMAVerified},
		{"google campus email", func(i *Identity) { i.Provider = Google }, tenant, External},
		{"unverified email", func(i *Identity) { i.EmailVerified = false }, tenant, External},
		{"wrong tenant", func(i *Identity) { i.TenantID = "another-tenant" }, tenant, External},
		{"wrong issuer", func(i *Identity) { i.Issuer = "https://attacker.example" }, tenant, External},
		{"suffix attack", func(i *Identity) { i.Email = "student@ukma.edu.ua.attacker.example" }, tenant, External},
		{"subdomain", func(i *Identity) { i.Email = "student@staff.ukma.edu.ua" }, tenant, External},
		{"display name", func(i *Identity) { i.Email = "Student <student@ukma.edu.ua>" }, tenant, External},
		{"missing email", func(i *Identity) { i.Email = "" }, tenant, External},
		{"missing configuration", func(*Identity) {}, "", External},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			profile := base
			tt.change(&profile)
			if got := profile.Affiliation(tt.tenant); got != tt.want {
				t.Fatalf("affiliation = %s, want %s", got, tt.want)
			}
		})
	}
}
