package domain

import "testing"

func TestIdentityValidate(t *testing.T) {
	for _, email := range []string{"", "person@example.com", "person@university.example"} {
		if err := (Identity{Provider: Google, Issuer: "https://accounts.google.com", Subject: "subject", Email: email}).Validate(); err != nil {
			t.Fatalf("email %q: %v", email, err)
		}
	}
	if err := (Identity{Provider: Google, Issuer: "https://accounts.google.com", Subject: "subject", Email: "invalid"}).Validate(); err == nil {
		t.Fatal("invalid email accepted")
	}
}
