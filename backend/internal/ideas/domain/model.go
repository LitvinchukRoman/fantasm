package domain

import (
	"errors"
	"time"
)

// ErrNotFound is returned by repositories when no row is visible to the caller.
// Hidden, deleted and absent ideas look the same on purpose.
var ErrNotFound = errors.New("not found")

type TOCItem struct {
	Depth int    `json:"depth"`
	Text  string `json:"text"`
	ID    string `json:"id"`
}

// Rendered is the sanitized output of the Markdown pipeline, stored next to the source.
type Rendered struct {
	HTML           string
	Text           string
	Story          string
	TOC            []TOCItem
	ReadingMinutes int
}

type Author struct {
	ID     string
	Handle string
	Name   string
}

// Idea is the stored aggregate. Body is the author's source and must not leave
// the API for anyone but the author and staff.
type Idea struct {
	ID                  string
	Slug                string
	Author              Author
	Title               string
	Summary             string
	Body                string
	CoverURL            string
	Category            Category
	Status              Status
	Visibility          Visibility
	OrganizationID      string
	Moderation          Moderation
	BadgeOrganizationID string
	Tags                []Tag
	EventDate           *time.Time
	EventPlace          string
	EventCapacity       *int
	NeedsRoles          []string
	Rendered            Rendered
	Votes               int
	Comments            int
	Joins               int
	HotScore            float64
	RankingMultiplier   float64
	KarmaMultiplier     float64
	CreatedAt           time.Time
	UpdatedAt           time.Time
	PublishedAt         *time.Time
}

// Content extracts the editable part of an idea.
func (i Idea) Content() Content {
	labels := make([]string, len(i.Tags))
	for n, t := range i.Tags {
		labels[n] = t.Label
	}
	return Content{
		Title: i.Title, Summary: i.Summary, Body: i.Body, CoverURL: i.CoverURL, Category: i.Category,
		Tags: labels, EventDate: i.EventDate, EventPlace: i.EventPlace, EventCapacity: i.EventCapacity,
		NeedsRoles: append([]string(nil), i.NeedsRoles...),
	}
}

// Ref is the minimum needed to link to an idea.
type Ref struct {
	Slug     string
	Title    string
	Summary  string
	Category Category
}

type Participation struct {
	State string
	Role  string
}

// ViewerState is what the signed-in viewer already did on an idea.
type ViewerState struct {
	VotedWeight   int
	Participation *Participation
}

type Sort string

const (
	SortHot Sort = "hot"
	SortNew Sort = "new"
	SortTop Sort = "top"
)

func (s Sort) Valid() bool { return s == SortHot || s == SortNew || s == SortTop }

// Filter narrows a listing. Zero values mean "no filter".
type Filter struct {
	Sort     Sort
	Category Category
	Tag      string
	Campus   string
	Status   Status
	AuthorID string
	// Mine lists the viewer's own ideas in any state; AuthorID must be the viewer.
	Mine bool
}
