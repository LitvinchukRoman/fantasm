package admin

import "math"

// Totals are the counts a verdict compares. Actions is votes + posts + participations.
type Totals struct {
	Visitors int
	Active   int
	Signups  int
	Actions  int
	Ideas    int
}

// Verdict is the answer to "are we growing?".
type Verdict struct {
	Status  string   `json:"status"`
	Score   float64  `json:"score"`
	Summary string   `json:"summary"`
	Reasons []string `json:"reasons"`
}

// Judge compares the last complete week with the week before it.
// Deltas are clipped to ±100% so one empty week cannot dominate.
// Below 30 visitors or 5 active people in the baseline, the numbers are shown
// but not called growth or decline.
func Judge(current, previous Totals) Verdict {
	if previous.Visitors < 30 || previous.Active < 5 {
		return Verdict{
			Status:  "insufficient",
			Summary: "Замало даних",
			Reasons: []string{
				"За попередні 7 днів менше ніж 30 відвідувачів або 5 активних людей, тож порівняння ще ненадійне.",
				formatCounts(current),
			},
		}
	}
	parts := []struct {
		name   string
		weight float64
		cur    int
		prev   int
	}{
		{"відвідувачі", 0.25, current.Visitors, previous.Visitors},
		{"активні люди", 0.25, current.Active, previous.Active},
		{"реєстрації", 0.15, current.Signups, previous.Signups},
		{"дії з ідеями", 0.25, current.Actions, previous.Actions},
		{"нові ідеї", 0.10, current.Ideas, previous.Ideas},
	}
	score := 0.0
	var reasons []string
	for _, p := range parts {
		delta := clippedDelta(p.cur, p.prev)
		score += p.weight * delta
		if math.Abs(delta) >= 0.15 && p.prev >= 5 {
			reasons = append(reasons, changeText(p.name, p.cur, p.prev, delta))
		}
	}
	score = math.Round(score*1000) / 1000
	if reasons == nil {
		reasons = []string{}
	}
	switch {
	case score >= 0.10:
		return Verdict{Status: "growing", Score: score, Summary: "Ростемо", Reasons: reasons}
	case score <= -0.10:
		return Verdict{Status: "falling", Score: score, Summary: "Падаємо", Reasons: reasons}
	default:
		if len(reasons) == 0 {
			reasons = []string{"Жодна з головних метрик не зрушила більше ніж на 15%."}
		}
		return Verdict{Status: "steady", Score: score, Summary: "Стабільно", Reasons: reasons}
	}
}

func clippedDelta(cur, prev int) float64 {
	if prev <= 0 {
		if cur <= 0 {
			return 0
		}
		return 1
	}
	d := float64(cur-prev) / float64(prev)
	if d > 1 {
		return 1
	}
	if d < -1 {
		return -1
	}
	return d
}

func changeText(name string, cur, prev int, delta float64) string {
	way := "виросли"
	if delta < 0 {
		way = "впали"
	}
	return name + " " + way + ": " + itoa(prev) + " → " + itoa(cur)
}

func formatCounts(t Totals) string {
	return "За останні 7 днів: " + itoa(t.Visitors) + " відвідувачів, " + itoa(t.Active) + " активних, " +
		itoa(t.Signups) + " реєстрацій, " + itoa(t.Ideas) + " нових ідей."
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [12]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}
