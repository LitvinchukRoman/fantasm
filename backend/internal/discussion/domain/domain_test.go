package domain_test

import (
	"testing"
	"time"

	"github.com/LitvinchukRoman/fantasm/backend/internal/discussion/domain"
)

func TestBuildTree(t *testing.T) {
	posts := []domain.Post{
		{ID: "a"}, {ID: "b", ParentID: "a"}, {ID: "c", ParentID: "a"}, {ID: "d", ParentID: "b", Deleted: true},
		{ID: "e"}, {ID: "orphan", ParentID: "missing"}, {ID: "self", ParentID: "self"},
	}
	roots := domain.BuildTree(posts)
	if len(roots) != 4 || roots[0].ID != "a" || roots[1].ID != "e" || roots[2].ID != "orphan" || roots[3].ID != "self" {
		t.Fatalf("roots: %+v", roots)
	}
	if a := roots[0]; len(a.Replies) != 2 || a.Replies[0].ID != "b" || a.Replies[1].ID != "c" || len(a.Replies[0].Replies) != 1 {
		t.Fatalf("replies of a: %+v", a.Replies)
	}
	if n := domain.CountLive(roots); n != 6 {
		t.Fatalf("live posts = %d", n)
	}
	if domain.BuildTree(nil) == nil {
		t.Fatal("an empty thread must be an empty list, not null")
	}
}

func TestCanEdit(t *testing.T) {
	now := time.Now()
	p := domain.Post{Author: domain.Author{ID: "u1"}, CreatedAt: now.Add(-10 * time.Minute)}
	if !domain.CanEdit(p, "u1", now) || domain.CanEdit(p, "u2", now) || domain.CanEdit(p, "", now) {
		t.Fatal("author check")
	}
	p.CreatedAt = now.Add(-16 * time.Minute)
	if domain.CanEdit(p, "u1", now) {
		t.Fatal("edit window")
	}
	p.CreatedAt, p.Deleted = now, true
	if domain.CanEdit(p, "u1", now) {
		t.Fatal("deleted post editable")
	}
}

func TestEffectiveParent(t *testing.T) {
	if id, d := domain.EffectiveParent("p", "gp", 3); id != "p" || d != 4 {
		t.Fatalf("shallow: %s %d", id, d)
	}
	if id, d := domain.EffectiveParent("p", "gp", domain.MaxDepth); id != "gp" || d != domain.MaxDepth {
		t.Fatalf("at the limit: %s %d", id, d)
	}
}
