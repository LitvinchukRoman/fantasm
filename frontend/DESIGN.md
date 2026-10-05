---
name: Fantasm
description: Dark, quiet platform where ideas find people. One base, two registers (Story and Signal).
colors:
  ink: "#08090a"
  ink-soft: "#0c0d10"
  graphite: "#111216"
  graphite-raised: "#17181d"
  sheet: "#121316"
  hairline: "rgb(255 255 255 / 8%)"
  hairline-strong: "rgb(255 255 255 / 14%)"
  paper-text: "#edeef2"
  muted-text: "#9ba1ac"
  faint-text: "#6b7078"
  signal-red: "#ff6363"
  signal-red-pressed: "#ff4a4a"
  signal-red-wash: "rgb(255 99 99 / 14%)"
  negative: "#ef4444"
typography:
  display-hero:
    fontFamily: "Onest, Helvetica, Arial, sans-serif"
    fontSize: "clamp(3.25rem, 6.2vw, 5rem)"
    fontWeight: 400
    lineHeight: 0.96
    letterSpacing: "-0.06em"
  headline:
    fontFamily: "Onest, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.5rem, 2.4vw, 2rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  entity:
    fontFamily: "Onest, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2.3vw, 2.6rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "0.02em"
  body:
    fontFamily: "Onest, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  card: "20px"
  control: "999px"
  chip: "6px"
  field: "12px"
spacing:
  section: "6rem"
  gutter: "1.25rem"
  gutter-wide: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.signal-red-pressed}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted-text}"
    rounded: "{rounded.chip}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper-text}"
    rounded: "{rounded.card}"
    padding: "24px"
---

# Design System: Fantasm

## Overview

**Creative North Star: "The Quiet Signal"**

Fantasm is a near-black room with one warm point of light. Almost everything is hairline, graphite and off-white; the single red appears on actions and on the seal, so it reads as "do this" and "this person is verified", never as decoration. The product promise is people finding each other, so the interface stays out of the way and lets titles, names and counts carry the weight.

The system has one base and two registers. The base is identical everywhere: tokens, navigation, footer, buttons, chips, the seal. The registers are two ways of speaking on that base:

- **Story** (landing, guides, events, sign-in): sentence-case headlines, soft 20px cards, accent pill buttons. It explains and persuades.
- **Signal** (feed, idea page with forum, profile): entity names in capitals, mono labels, hairline rules instead of cards, numbering. It is a readout of live things.

The difference between registers is intentional and the bridges between them are explicit: the landing shows real feed rows, its three steps are numbered like the feed, the idea page repeats the landing's marquee band, and buttons, seal and footer never change.

**Key Characteristics:**
- Near-black surfaces, one accent, hairline borders instead of shadows.
- Onest everywhere (Cyrillic-complete) plus one mono stack for labels.
- Capitals only on entity names and mono labels, never on headlines of the Story register.
- Motion is decoration; everything reads and works with reduced motion.

## Colors

A single-accent dark palette: graphite layers on near-black, off-white text, one red.

### Primary
- **Signal Red** (#ff6363): primary actions, the seal, active filter value, selection. Pressed state is **Signal Red Pressed** (#ff4a4a).

### Neutral
- **Ink** (#08090a): page background.
- **Ink Soft** (#0c0d10): alternating bands without a theme jump.
- **Graphite** (#111216) and **Graphite Raised** (#17181d): cards, menus, hover.
- **Sheet** (#121316): the curved gray sheet on the landing and the footer; the same value, one token.
- **Paper Text** (#edeef2), **Muted Text** (#9ba1ac), **Faint Text** (#6b7078): text ramp.
- **Hairline** (8%) and **Hairline Strong** (14% white): every divider and border.

### Named Rules
**The One Red Rule.** Red marks an action or the seal. If a screen has red in three unrelated places, two of them are wrong.
**The No Stray Hex Rule.** Every color comes from a token. A raw `#hex` or `rgba(255,0,0,…)` in a component is a defect.

## Typography

**Display and Body Font:** Onest (fallbacks: system sans). **Label Font:** system mono.

**Character:** Onest is geometric and friendly with full Cyrillic; mono labels add the readout feel of the Signal register without a third family.

### Hierarchy
- **Display Hero** (400, clamp 3.25–5rem, 0.96, -0.06em): the landing hero only, sentence case.
- **Headline** (500, clamp 1.5–2rem, 1.1, -0.02em, sentence case): section headings in the Story register.
- **Entity** (500, clamp 1.5–2.6rem, 1.08, +0.02em, uppercase): idea and person names in the Signal register. Titles are capped at 72 characters.
- **Body** (400, 1rem, 1.7, 42rem max): prose and descriptions.
- **Label** (mono 11px, +0.2em, uppercase): crumbs, counts, meta keys, section indexes.

### Named Rules
**The Entity Capitals Rule.** Uppercase belongs to names of things and to mono labels. Headlines that explain stay in sentence case.
**The Two Families Rule.** Onest and one mono stack. Adding a third family needs a Cyrillic check first.

## Layout

Content sits in a 6xl (72rem) container with 1.25rem gutters, 2rem from 640px. Sections breathe at 5–6rem vertical rhythm. The idea page uses a two-column head (about, meta) over a sticky index column for the body and forum. The feed has two modes: a full-viewport curved reel on fine-pointer wide screens, and a flat single column everywhere else; both show the same rows. Mobile collapses to one column with a bottom action dock.

## Elevation & Depth

Flat by default. Depth is tonal (ink to graphite to graphite raised) and drawn with hairlines; shadows appear only on floating layers (menus, the action dock).

### Named Rules
**The Flat-By-Default Rule.** At rest nothing casts a shadow. A shadow means the element floats above the page.

## Shapes

Cards 20px, controls fully round, chips 6px, form fields 12px. The Signal register uses no cards: rows are separated by hairlines. Mixing a rounded card inside a Signal row is a defect.

## Components

### Buttons
- **Shape:** full pill (999px).
- **Primary:** Signal Red fill, Ink text, 10px 20px; optional round arrow chip on the right. Hover darkens to Signal Red Pressed and scales to 1.05 on pointer devices only.
- **Secondary:** transparent, hairline-strong border, Paper Text.

### Chips
- **Style:** 6px radius, hairline-strong border, Muted Text, mono 11px uppercase. Selected state uses Paper Text. A chip is a tag, category, campus or role; it is never a button.

### Cards / Containers
- **Corner Style:** 20px. **Background:** Graphite. **Border:** hairline. **Padding:** 24px. Story register only.

### Navigation
- Sticky glass bar, logo torus plus wordmark, three links, red "Ідея" pill and "Увійти". Solid on every page except the landing hero and the curved feed.

### Idea Row (signature, Signal)
- Number, entity title, chips, two-line summary, vote readout panel. A white line grows across the top and bottom on hover; a "Відкрити" pill follows the cursor on fine pointers.

### Seal
- The verified mark: dotted outline filling in with red wash. One component used on authors, profiles and the landing perks block.

## Do's and Don'ts

### Do:
- **Do** write Story headlines in sentence case with negative tracking (-0.02em).
- **Do** use `--color-*` tokens for every color and `--font-mono` for every label.
- **Do** show real feed rows on the landing; numbers (stats, counters) appear only above zero.
- **Do** end every page with an action and the shared footer (except sign-in).

### Don't:
- **Don't** add a global rule that uppercases `h1`–`h3`; it silences utilities such as `tracking-tight`.
- **Don't** put a card inside a Signal row, or hairline rows inside a Story card.
- **Don't** import fonts from a reference whose glyph set lacks Cyrillic.
- **Don't** animate on a loop what the reader is trying to read (steps, titles, body text).
