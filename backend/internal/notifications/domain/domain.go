// Package domain defines what a notification is.
package domain

import "time"

type Type string

const (
	Comment       Type = "COMMENT"
	Vote          Type = "VOTE"
	Join          Type = "JOIN"
	Accepted      Type = "ACCEPTED"
	Approved      Type = "APPROVED"
	Hidden        Type = "HIDDEN"
	EventReminder Type = "EVENT_REMINDER"
	System        Type = "SYSTEM"
)

// Notification is a message to one user. Payload carries ids and short display
// strings only: never content that was not already visible to the recipient.
type Notification struct {
	UserID  string
	Type    Type
	Payload map[string]any
	// DedupeKey, when set, suppresses the notification while an unread one of the
	// same type for the same user already contains these payload entries. A
	// person clicking vote on and off must not fill someone's inbox.
	DedupeKey map[string]any
}

// Item is a stored notification as listed to its recipient.
type Item struct {
	ID        string
	Type      Type
	Payload   map[string]any
	ReadAt    *time.Time
	CreatedAt time.Time
}
