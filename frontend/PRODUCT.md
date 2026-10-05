# Product

<!-- impeccable:product-schema 1 -->

<!-- Source: composed from ../FULL_CONTEXT.md, ../STRATEGY.md and the owner's brief (2026-10-05). Not re-interviewed; fields marked "open" are undecided in those documents. -->

## Platform

web

## Users

Primary: students and alumni of the Kyiv-Mohyla Academy (NaUKMA) who have an idea (startup, project, event, book club, volunteering shift, research) and need people, or who want to join something real. The job: publish an idea, collect votes and discussion, form a team, show up.

Secondary: non-NaUKMA visitors arriving from search on long-tail queries ("шукаємо дизайнера у стартап", "книжковий клуб Київ"). They read without logging in. Acting (vote, join, post, report) requires login.

## Product Purpose

An open platform where an idea finds its people. Not a job board, not a media site, not an accelerator. Success at stage 0 is a weekly cohort that returns without reminders and the first initiatives that finish (team formed, event held, club alive beyond a semester).

Long term: a global "Genesis + Y Combinator" hybrid; money and programs arrive only on top of live teams. Beachhead is NaUKMA, then multi-campus Ukraine.

## Positioning

The forum under every idea. A discussion that stays attached to the idea, where roles, time and format are agreed, instead of sinking in a Telegram chat. Each idea and each forum topic is a permanent, indexable URL.

The Mohylian seal (verified by university tenant plus domain email) is the trust asset. It must never be diluted or given away for an email.

## Operating Context

- Public pages are rendered on the server or prerendered (React Router v7, framework mode). SEO is a product requirement: idea page = long-tail landing, profile = trust page, forum topic = `DiscussionForumPosting`.
- `UKMA_ONLY` ideas do not exist for non-verified viewers (404, never 403).
- The feed reads without login. Idea body is sanitized Markdown, never raw HTML.
- Backend (Go) is not built yet. Votes, joins and posts link to `/login` until it exists.

## Capabilities and Constraints

- Idea kinds: startup, project, event, community (incl. book club), volunteering, other. Events are ideas with `eventAt`.
- Feed sorts: hot, new, top. Hot formula favours fresh ideas with people and conversation over old like-lists.
- Moderation: first ideas of external authors are queued; reports auto-hide at 5.
- Open decisions: forum shape beyond a single thread per idea (single thread chosen for stage 0), whether guides and the campus map stay core (default: no), numeric campus boosts versus qualitative advantage.
- Explicit non-goals at stages 0 and 1: job board, ticketing, equity or money.

## Brand Commitments

- Name: Fantasm. Mark: the torus from `public/favicon.jpg`.
- UI language: Ukrainian. Tone: direct, second person singular ("Публікуй", "Збери голоси").
- Accent `#FF6363` and the dark theme are established. Shopify Editions and raycast.com were the references for the landing hero; saifullah.dev "mindset-of-success" is the binding reference for the idea page composition (structure only, no fonts or assets).

## Evidence on Hand

- Real content exists only as editorial MVP samples and 15 SEO guides under `content/`. There are no real users, votes or comments yet. Do not fabricate testimonials, counts or customer names. Counters show only when above zero.
- Forum fixtures may exist behind `IDEAS_SEED` for development and previews and are `noindex`.

## Product Principles

1. An idea is a place to start doing, not a post to read. Every page ends in an action.
2. The seal is earned and visible: on the person and on the idea.
3. Honest emptiness beats seeded noise. Empty states invite the first real idea.
4. Public means indexable: if a page can answer a search, it renders its content in HTML.
5. Conversation belongs to the idea, never to a detached forum feed.

## Accessibility & Inclusion

Ukrainian-language content; Cyrillic must render in every font used. Respect `prefers-reduced-motion` (motion is decoration, never required to read or act). Dark theme only; keep text contrast at AA on `#08090a` surfaces.
