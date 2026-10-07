package jobs

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func logger() (*slog.Logger, *bytes.Buffer) {
	var buf bytes.Buffer
	return slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})), &buf
}

func runFor(t *testing.T, r *Runner, d time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), d)
	defer cancel()
	done := make(chan struct{})
	go func() { r.Run(ctx); close(done) }()
	select {
	case <-done:
	case <-time.After(d + 3*time.Second):
		t.Fatal("runner did not stop after its context ended")
	}
}

func TestRunsImmediatelyAndRepeats(t *testing.T) {
	var n atomic.Int32
	l, _ := logger()
	runFor(t, NewRunner(l, Job{Name: "tick", Interval: 20 * time.Millisecond, Timeout: time.Second, Run: func(context.Context) error { n.Add(1); return nil }}), 200*time.Millisecond)
	if n.Load() < 3 {
		t.Fatalf("ran %d times", n.Load())
	}
}

func TestPanicAndErrorDoNotStopTheJobOrItsNeighbours(t *testing.T) {
	var panics, fails, healthy atomic.Int32
	l, buf := logger()
	r := NewRunner(l,
		Job{Name: "panics", Interval: 20 * time.Millisecond, Timeout: time.Second, Run: func(context.Context) error { panics.Add(1); panic("boom") }},
		Job{Name: "fails", Interval: 20 * time.Millisecond, Timeout: time.Second, Run: func(context.Context) error { fails.Add(1); return errors.New("nope") }},
		Job{Name: "healthy", Interval: 20 * time.Millisecond, Timeout: time.Second, Run: func(context.Context) error { healthy.Add(1); return nil }},
	)
	runFor(t, r, 200*time.Millisecond)
	if panics.Load() < 3 || fails.Load() < 3 || healthy.Load() < 3 {
		t.Fatalf("panics=%d fails=%d healthy=%d", panics.Load(), fails.Load(), healthy.Load())
	}
	out := buf.String()
	if !strings.Contains(out, "job failed") || !strings.Contains(out, "panic: boom") || !strings.Contains(out, "job=panics") {
		t.Fatalf("failures not logged: %s", out)
	}
}

func TestTimeoutReachesTheJob(t *testing.T) {
	var sawDeadline atomic.Bool
	l, _ := logger()
	runFor(t, NewRunner(l, Job{Name: "slow", Interval: time.Hour, Timeout: 30 * time.Millisecond, Run: func(ctx context.Context) error {
		select {
		case <-ctx.Done():
			sawDeadline.Store(errors.Is(ctx.Err(), context.DeadlineExceeded))
			return ctx.Err()
		case <-time.After(5 * time.Second):
			return nil
		}
	}}), 300*time.Millisecond)
	if !sawDeadline.Load() {
		t.Fatal("a stuck job was not cut off by its timeout")
	}
}

func TestNoRunAfterShutdown(t *testing.T) {
	var n atomic.Int32
	l, _ := logger()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	NewRunner(l, Job{Name: "late", Interval: time.Millisecond, Timeout: time.Second, Run: func(context.Context) error { n.Add(1); return nil }}).Run(ctx)
	if n.Load() != 0 {
		t.Fatalf("ran %d times after cancel", n.Load())
	}
}
