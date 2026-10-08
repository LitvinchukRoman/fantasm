package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/apptest"
	"github.com/LitvinchukRoman/fantasm/backend/internal/organizations"
)

func TestSeedDemoIdeas(t *testing.T) {
	env := apptest.New(t)
	raw, err := os.ReadFile("../../seed/demo-ideas.json")
	if err != nil {
		t.Fatal(err)
	}
	var file seedFile
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&file); err != nil {
		t.Fatal(err)
	}
	policy, err := organizations.Load("../../config/organizations.json")
	if err != nil {
		t.Fatal(err)
	}
	logger := slog.New(slog.DiscardHandler)
	now := time.Now()

	created, err := seedIdeas(t.Context(), env.DB, policy, []byte("test-secret"), file, now, logger)
	if err != nil {
		t.Fatal(err)
	}
	if created != len(file.Ideas) {
		t.Fatalf("created %d of %d", created, len(file.Ideas))
	}
	if again, err := seedIdeas(t.Context(), env.DB, policy, []byte("test-secret"), file, now, logger); err != nil || again != 0 {
		t.Fatalf("rerun created %d, err %v; want 0, nil", again, err)
	}

	anon := env.Anon()
	var feed struct {
		Items []struct {
			Slug string `json:"slug"`
		} `json:"items"`
	}
	anon.Do(http.MethodGet, "/api/ideas?sort=new&limit=50", nil).Decode(&feed)
	if len(feed.Items) != len(file.Ideas) || feed.Items[0].Slug != file.Ideas[0].Slug {
		t.Fatalf("feed has %d ideas starting with %+v; want %d starting with %s", len(feed.Items), feed.Items[:1], len(file.Ideas), file.Ideas[0].Slug)
	}

	var idea struct {
		HTML   string `json:"html"`
		Campus *struct {
			ID string `json:"id"`
		} `json:"campus"`
	}
	r := anon.Do(http.MethodGet, "/api/ideas/debatnyi-klub", nil)
	if r.Code != http.StatusOK {
		t.Fatalf("legacy slug: %d", r.Code)
	}
	r.Decode(&idea)
	if idea.HTML == "" || idea.Campus == nil || idea.Campus.ID != "naukma" {
		t.Fatalf("debatnyi-klub: html %q, campus %+v", idea.HTML, idea.Campus)
	}

	var events struct {
		Items []json.RawMessage `json:"items"`
	}
	anon.Do(http.MethodGet, "/api/events", nil).Decode(&events)
	wantEvents := 0
	for _, s := range file.Ideas {
		if s.Event != nil {
			wantEvents++
		}
	}
	if len(events.Items) != wantEvents {
		t.Fatalf("upcoming events %d, want %d", len(events.Items), wantEvents)
	}
}

func TestNextEvening(t *testing.T) {
	kyiv, err := time.LoadLocation("Europe/Kyiv")
	if err != nil {
		t.Fatal(err)
	}
	thursday := time.Date(2026, 10, 8, 23, 0, 0, 0, kyiv)
	for _, tc := range []struct {
		weekday string
		want    time.Time
	}{
		{"saturday", time.Date(2026, 10, 17, 16, 0, 0, 0, kyiv)}, // 10.10 16:00 is under two days away
		{"friday", time.Date(2026, 10, 16, 16, 0, 0, 0, kyiv)},
		{"thursday", time.Date(2026, 10, 15, 16, 0, 0, 0, kyiv)},
	} {
		got, err := nextEvening(thursday, tc.weekday, "16:00")
		if err != nil || !got.Equal(tc.want) {
			t.Errorf("%s: got %v (%v), want %v", tc.weekday, got.In(kyiv), err, tc.want)
		}
	}
	if _, err := nextEvening(thursday, "someday", "16:00"); err == nil {
		t.Error("unknown weekday accepted")
	}
}
