package admin

import "testing"

func TestVerdictNeedsABaseline(t *testing.T) {
	v := Judge(Totals{Visitors: 4, Active: 1}, Totals{Visitors: 10, Active: 2})
	if v.Status != "insufficient" || v.Summary != "Замало даних" {
		t.Fatalf("%+v", v)
	}
}

func TestVerdictDirection(t *testing.T) {
	prev := Totals{Visitors: 100, Active: 40, Signups: 20, Actions: 80, Ideas: 10}
	up := Judge(Totals{Visitors: 180, Active: 70, Signups: 30, Actions: 140, Ideas: 16}, prev)
	if up.Status != "growing" {
		t.Fatalf("up: %+v", up)
	}
	down := Judge(Totals{Visitors: 40, Active: 15, Signups: 5, Actions: 20, Ideas: 2}, prev)
	if down.Status != "falling" {
		t.Fatalf("down: %+v", down)
	}
	flat := Judge(prev, prev)
	if flat.Status != "steady" {
		t.Fatalf("flat: %+v", flat)
	}
}

func TestInsightsStayQuietWithoutEvidence(t *testing.T) {
	if len(BuildInsights(InsightInput{})) != 0 {
		t.Fatal("empty input produced an insight")
	}
	got := BuildInsights(InsightInput{
		Current: map[string]int{"visitors": 200}, Previous: map[string]int{"visitors": 100},
		Referrer: "t.me", ReferrerHits: 40, BestWeekday: "вівторок",
		Visitors: 100, Signups: 25, Acted: 10,
		MedianDecisionSeconds: 3600, Decisions: 4,
		CampusShare: 0.5, Published: 8,
		AnomalyMetric: "відвідування", AnomalyToday: 5, AnomalyAvg: 20,
	})
	if len(got) < 6 {
		t.Fatalf("got %d insights: %+v", len(got), got)
	}
}
