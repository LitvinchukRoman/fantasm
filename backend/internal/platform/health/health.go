// Package health keeps a day of request timings in memory and turns them,
// together with the database and the job runner, into a single status.
package health

import (
	"math"
	"sync"
	"time"

	_ "time/tzdata"
)

// latencyEdges are histogram upper bounds in seconds. The last bucket is everything slower.
var latencyEdges = [...]float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10}

const slots = 24 * 60

type minute struct {
	id       int64
	requests int
	client   int
	server   int
	buckets  [len(latencyEdges) + 1]int
}

// Job is the last finished run of a background job.
type Job struct {
	Name     string
	At       time.Time
	Duration time.Duration
	Failed   bool
	Error    string
}

// Tracker is safe for concurrent observations from the access log.
type Tracker struct {
	mu      sync.Mutex
	started time.Time
	ring    [slots]minute
	pending struct {
		day                      string
		requests, client, server int
	}
	jobs map[string]Job
	now  func() time.Time
}

func New() *Tracker {
	return &Tracker{started: time.Now(), jobs: map[string]Job{}, now: time.Now}
}

// ObserveHTTP implements httpx.RequestObserver.
func (t *Tracker) ObserveHTTP(method, route string, status, bytes int, duration time.Duration) {
	_ = method
	_ = route
	_ = bytes
	now := t.now()
	id := now.Unix() / 60
	t.mu.Lock()
	defer t.mu.Unlock()
	slot := &t.ring[int(id%slots)]
	if slot.id != id {
		*slot = minute{id: id}
	}
	slot.requests++
	switch {
	case status >= 500:
		slot.server++
	case status >= 400:
		slot.client++
	}
	slot.buckets[bucket(duration.Seconds())]++
	day := now.In(kyiv()).Format("2006-01-02")
	if t.pending.day != day {
		t.pending.day = day
		t.pending.requests, t.pending.client, t.pending.server = 0, 0, 0
	}
	t.pending.requests++
	if status >= 500 {
		t.pending.server++
	} else if status >= 400 {
		t.pending.client++
	}
}

func bucket(seconds float64) int {
	for i, edge := range latencyEdges {
		if seconds <= edge {
			return i
		}
	}
	return len(latencyEdges)
}

// ObserveJob records the latest run. A later success clears the failure.
func (t *Tracker) ObserveJob(name string, duration time.Duration, err error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	job := Job{Name: name, At: t.now(), Duration: duration}
	if err != nil {
		job.Failed = true
		job.Error = err.Error()
		if len(job.Error) > 200 {
			job.Error = job.Error[:200]
		}
	}
	t.jobs[name] = job
}

// TakePending returns request counters accumulated since the previous take, for one Kyiv day.
func (t *Tracker) TakePending() (day string, requests, clientErrors, serverErrors int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	day = t.pending.day
	requests, clientErrors, serverErrors = t.pending.requests, t.pending.client, t.pending.server
	t.pending.requests, t.pending.client, t.pending.server = 0, 0, 0
	return day, requests, clientErrors, serverErrors
}

// RestorePending puts counters back when the flush could not be stored.
func (t *Tracker) RestorePending(day string, requests, clientErrors, serverErrors int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.pending.day != "" && t.pending.day != day {
		return
	}
	t.pending.day = day
	t.pending.requests += requests
	t.pending.client += clientErrors
	t.pending.server += serverErrors
}

// Pending is the not-yet-flushed part of today, added on top of the daily table.
func (t *Tracker) Pending() (day string, requests, serverErrors int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.pending.day, t.pending.requests, t.pending.server
}

// Window sums the ring over the last d.
func (t *Tracker) Window(d time.Duration) Window {
	now := t.now()
	from := now.Add(-d).Unix() / 60
	t.mu.Lock()
	defer t.mu.Unlock()
	var w Window
	var buckets [len(latencyEdges) + 1]int
	for i := range t.ring {
		slot := t.ring[i]
		if slot.id < from || slot.requests == 0 {
			continue
		}
		w.Requests += slot.requests
		w.ClientErrors += slot.client
		w.ServerErrors += slot.server
		for b, n := range slot.buckets {
			buckets[b] += n
		}
	}
	w.P95 = percentile(buckets, w.Requests, 0.95)
	return w
}

// Jobs returns a snapshot of the latest run of each job.
func (t *Tracker) Jobs() []Job {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := make([]Job, 0, len(t.jobs))
	for _, job := range t.jobs {
		out = append(out, job)
	}
	return out
}

func (t *Tracker) Uptime() time.Duration { return t.now().Sub(t.started) }

// Window is a slice of the ring.
type Window struct {
	Requests     int
	ClientErrors int
	ServerErrors int
	P95          time.Duration
}

func percentile(buckets [len(latencyEdges) + 1]int, total int, p float64) time.Duration {
	if total == 0 {
		return 0
	}
	target := int(math.Ceil(p * float64(total)))
	acc := 0
	for i, n := range buckets {
		acc += n
		if acc >= target {
			if i >= len(latencyEdges) {
				return 30 * time.Second
			}
			return time.Duration(latencyEdges[i] * float64(time.Second))
		}
	}
	return 30 * time.Second
}

// Input is everything Judge needs besides the ring, which the caller already reduced.
type Input struct {
	Ready       bool
	DBError     bool
	DBPing      time.Duration
	Hour        Window
	OldestQueue time.Duration
	JobFailed   bool
}

// Judge returns ok, degraded or down, and the reasons in Ukrainian.
func Judge(in Input) (status string, reasons []string) {
	down, degraded := []string{}, []string{}
	if !in.Ready {
		down = append(down, "процес ще не готовий приймати запити")
	}
	if in.DBError {
		down = append(down, "база даних не відповідає")
	}
	if in.Hour.Requests >= 20 {
		rate := float64(in.Hour.ServerErrors) / float64(in.Hour.Requests)
		switch {
		case rate >= 0.05:
			down = append(down, "понад 5% запитів за годину завершуються помилкою сервера")
		case rate >= 0.01:
			degraded = append(degraded, "понад 1% запитів за годину завершуються помилкою сервера")
		}
	}
	switch {
	case in.Hour.Requests > 0 && in.Hour.P95 >= 2*time.Second:
		down = append(down, "p95 відповіді за годину довший за 2 с")
	case in.Hour.Requests > 0 && in.Hour.P95 >= 500*time.Millisecond:
		degraded = append(degraded, "p95 відповіді за годину довший за 500 мс")
	}
	if in.DBPing >= 200*time.Millisecond {
		degraded = append(degraded, "перевірка бази триває довше за 200 мс")
	}
	if in.OldestQueue >= 24*time.Hour {
		degraded = append(degraded, "найстаріша ідея в черзі модерації чекає понад добу")
	}
	if in.JobFailed {
		degraded = append(degraded, "фонове завдання останнім разом упало")
	}
	if len(down) > 0 {
		return "down", append(down, degraded...)
	}
	if len(degraded) > 0 {
		return "degraded", degraded
	}
	return "ok", []string{}
}

func kyiv() *time.Location {
	loc, err := time.LoadLocation("Europe/Kyiv")
	if err != nil {
		return time.UTC
	}
	return loc
}
