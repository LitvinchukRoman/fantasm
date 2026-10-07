// Package jobs runs periodic maintenance tasks inside the API process.
package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"runtime/debug"
	"sync"
	"time"
)

type Job struct {
	Name     string
	Interval time.Duration
	// Timeout bounds one run so a stuck query cannot pile up ticks.
	Timeout time.Duration
	Run     func(ctx context.Context) error
}

type Runner struct {
	logger *slog.Logger
	jobs   []Job
}

func NewRunner(logger *slog.Logger, jobs ...Job) *Runner { return &Runner{logger: logger, jobs: jobs} }

// Run starts every job and blocks until ctx is cancelled and all of them returned.
// A failing or panicking run is logged and does not stop later ticks.
func (r *Runner) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for _, job := range r.jobs {
		wg.Go(func() { r.loop(ctx, job) })
	}
	wg.Wait()
}

func (r *Runner) loop(ctx context.Context, job Job) {
	ticker := time.NewTicker(job.Interval)
	defer ticker.Stop()
	for {
		r.once(ctx, job)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (r *Runner) once(ctx context.Context, job Job) {
	if ctx.Err() != nil {
		return
	}
	runCtx, cancel := context.WithTimeout(ctx, job.Timeout)
	defer cancel()
	start := time.Now()
	err := safely(runCtx, job.Run)
	if err != nil {
		r.logger.Error("job failed", "job", job.Name, "error", err, "duration_ms", time.Since(start).Milliseconds())
		return
	}
	r.logger.Debug("job finished", "job", job.Name, "duration_ms", time.Since(start).Milliseconds())
}

func safely(ctx context.Context, fn func(context.Context) error) (err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("panic: %v\n%s", v, debug.Stack())
		}
	}()
	return fn(ctx)
}
