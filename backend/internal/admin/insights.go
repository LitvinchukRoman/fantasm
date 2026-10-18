package admin

import (
	"math"
	"strconv"
)

// Insight is one sentence the overview shows under the charts.
type Insight struct {
	Kind string `json:"kind"`
	Text string `json:"text"`
}

// InsightInput is the evidence BuildInsights may mention. Zero values are skipped.
type InsightInput struct {
	Current               map[string]int
	Previous              map[string]int
	Referrer              string
	ReferrerHits          int
	BestWeekday           string
	Visitors              int
	Signups               int
	Acted                 int
	MedianDecisionSeconds float64
	Decisions             int
	CampusShare           float64
	Published             int
	AnomalyMetric         string
	AnomalyToday          int
	AnomalyAvg            float64
}

var weekday = []string{"", "понеділок", "вівторок", "середа", "четвер", "пʼятниця", "субота", "неділя"}

func WeekdayName(isodow int) string {
	if isodow < 1 || isodow > 7 {
		return ""
	}
	return weekday[isodow]
}

// BuildInsights turns measured facts into short Ukrainian sentences. It does not invent any.
func BuildInsights(in InsightInput) []Insight {
	var out []Insight
	if text, kind, ok := biggestMove(in.Current, in.Previous); ok {
		out = append(out, Insight{Kind: kind, Text: text})
	}
	if in.Referrer != "" && in.ReferrerHits > 0 {
		out = append(out, Insight{Kind: "referrer", Text: "Найбільше переходів за тиждень — з " + in.Referrer + " (" + strconv.Itoa(in.ReferrerHits) + ")."})
	}
	if in.BestWeekday != "" {
		out = append(out, Insight{Kind: "weekday", Text: "Найсильніший день тижня за відвідуваннями — " + in.BestWeekday + "."})
	}
	if in.Visitors > 0 {
		out = append(out, Insight{Kind: "conversion", Text: "Із відвідувачів реєструється " + pct(in.Signups, in.Visitors) + "."})
	}
	if in.Signups > 0 && in.Acted > 0 && in.Acted <= in.Signups {
		out = append(out, Insight{Kind: "conversion", Text: "Із нових людей хоч щось робить на платформі " + pct(in.Acted, in.Signups) + " протягом тижня."})
	} else if in.Acted > 0 {
		// Acted counts everyone who voted, posted or joined, including people who signed up earlier.
		// It is not a subset of this week's signups, so a ratio can exceed 100%.
		out = append(out, Insight{Kind: "conversion", Text: "За тиждень дію на платформі зробили " + strconv.Itoa(in.Acted) + " людей."})
	}
	if in.Decisions > 0 && in.MedianDecisionSeconds > 0 {
		out = append(out, Insight{Kind: "moderation", Text: "Медіанний час до рішення модератора — " + humanDuration(in.MedianDecisionSeconds) + "."})
	}
	if in.Published > 0 {
		out = append(out, Insight{Kind: "campus", Text: "Частка ідей від людей із кампусу — " + pct(int(math.Round(in.CampusShare*float64(in.Published))), in.Published) + "."})
	}
	if in.AnomalyAvg >= 10 && in.AnomalyMetric != "" {
		delta := (float64(in.AnomalyToday) - in.AnomalyAvg) / in.AnomalyAvg
		if math.Abs(delta) > 0.5 {
			way := "вище"
			if delta < 0 {
				way = "нижче"
			}
			out = append(out, Insight{Kind: "anomaly", Text: "Учора " + in.AnomalyMetric + " було " + way + " за звичайний цей день тижня: " + strconv.Itoa(in.AnomalyToday) + " проти середніх " + strconv.Itoa(int(math.Round(in.AnomalyAvg))) + "."})
		}
	}
	if out == nil {
		return []Insight{}
	}
	return out
}

var moveNames = []struct{ key, label string }{
	{"visitors", "Відвідувачі"},
	{"active_users", "Активні люди"},
	{"signups", "Реєстрації"},
	{"ideas_published", "Нові ідеї"},
	{"votes", "Голоси"},
}

func biggestMove(cur, prev map[string]int) (string, string, bool) {
	best, kind := 0.0, ""
	var text string
	for _, m := range moveNames {
		p := prev[m.key]
		if p < 5 {
			continue
		}
		d := clippedDelta(cur[m.key], p)
		if math.Abs(d) > math.Abs(best) && math.Abs(d) >= 0.15 {
			best = d
			if d > 0 {
				kind = "growth"
			} else {
				kind = "drop"
			}
			text = changeText(m.label, cur[m.key], p, d) + " проти попереднього тижня."
		}
	}
	return text, kind, kind != ""
}

func pct(part, whole int) string {
	if whole <= 0 {
		return "0%"
	}
	return strconv.Itoa(int(math.Round(100*float64(part)/float64(whole)))) + "%"
}

func humanDuration(seconds float64) string {
	if seconds < 90 {
		return strconv.Itoa(int(math.Round(seconds))) + " с"
	}
	if seconds < 90*60 {
		return strconv.Itoa(int(math.Round(seconds/60))) + " хв"
	}
	hours := seconds / 3600
	if hours < 48 {
		return strconv.FormatFloat(math.Round(hours*10)/10, 'f', -1, 64) + " год"
	}
	return strconv.Itoa(int(math.Round(hours/24))) + " д"
}
