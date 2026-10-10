package domain

import "testing"

func TestProfileUpdateRejectsPlaceholderHandles(t *testing.T) {
	for h, want := range map[string]bool{"u_4aebc32e53054bf490d34e06984e68bd": true, "admin": true, "u_roman": false, "ivan-franko": false} {
		fields := ProfileUpdate{Handle: &h}.Validate()
		if got := fields["handle"] != ""; got != want {
			t.Errorf("%q rejected = %v, want %v (fields %v)", h, got, want, fields)
		}
	}
}

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
