// Package ports is the narrow surface other contexts use to record product events.
// Record runs inside the caller's transaction (the transaction is carried by ctx),
// so an event exists if and only if the action it describes was committed.
package ports

import (
	"context"
	"time"
)

// Event is one thing that happened. ActorID is empty for an anonymous visitor.
// Props must stay small and free of message text, addresses and secrets.
type Event struct {
	Name        string
	ActorID     string
	Visitor     string
	SubjectType string
	SubjectID   string
	Path        string
	Props       map[string]any
	OccurredAt  time.Time
}

// Recorder stores one event.
type Recorder interface {
	Record(ctx context.Context, e Event) error
}

// Discard drops every event. Tests of other contexts leave the recorder nil;
// Discard is for a wired app that has nowhere to write yet.
type Discard struct{}

func (Discard) Record(context.Context, Event) error { return nil }

// Record stores e when r is set and ignores a nil recorder.
func Record(ctx context.Context, r Recorder, e Event) error {
	if r == nil {
		return nil
	}
	if e.Props == nil {
		e.Props = map[string]any{}
	}
	return r.Record(ctx, e)
}
