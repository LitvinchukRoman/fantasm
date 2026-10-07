// Package domain holds the rules of a discussion thread.
package domain

import (
	"time"
)

const (
	// MaxDepth bounds nesting in storage. A reply to a post at this depth is
	// attached next to it instead, so a thread can never grow without limit.
	MaxDepth = 8
	// EditWindow is how long an author may edit a post.
	EditWindow = 15 * time.Minute
	// MaxPosts bounds one thread read.
	MaxPosts = 5000
)

type Author struct {
	ID     string
	Handle string
	Name   string
}

type Post struct {
	ID        string
	TopicID   string
	ParentID  string
	Author    Author
	Depth     int
	Body      string
	HTML      string
	Text      string
	Deleted   bool
	CreatedAt time.Time
	UpdatedAt *time.Time
}

// Node is a post with its replies.
type Node struct {
	Post
	Replies []*Node
}

// BuildTree arranges posts (given in creation order) into a forest. A post whose
// parent is missing from the input is treated as a root rather than lost.
func BuildTree(posts []Post) []*Node {
	nodes := make(map[string]*Node, len(posts))
	for _, p := range posts {
		nodes[p.ID] = &Node{Post: p, Replies: []*Node{}}
	}
	roots := []*Node{}
	for _, p := range posts {
		n := nodes[p.ID]
		if parent, ok := nodes[p.ParentID]; ok && p.ParentID != "" && p.ParentID != p.ID {
			parent.Replies = append(parent.Replies, n)
		} else {
			roots = append(roots, n)
		}
	}
	return roots
}

// CountLive counts posts that are not deleted, replies included.
func CountLive(nodes []*Node) int {
	total := 0
	for _, n := range nodes {
		if !n.Deleted {
			total++
		}
		total += CountLive(n.Replies)
	}
	return total
}

// CanEdit reports whether userID may still edit the post.
func CanEdit(p Post, userID string, now time.Time) bool {
	return !p.Deleted && userID != "" && p.Author.ID == userID && now.Sub(p.CreatedAt) <= EditWindow
}

// EffectiveParent returns where a reply to a post of the given depth attaches and at what depth.
func EffectiveParent(parentID, grandParentID string, parentDepth int) (id string, depth int) {
	if parentDepth < MaxDepth {
		return parentID, parentDepth + 1
	}
	return grandParentID, parentDepth
}
