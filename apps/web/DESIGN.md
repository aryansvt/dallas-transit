---
name: LineFinder
description: A calm, high-contrast station board for Dallas transit, information first.
colors:
  paper: '#f3f3ee'
  surface: '#ffffff'
  surface-quiet: '#e9ebe5'
  board-ink: '#0e1c28'
  board-raised: '#183040'
  board-line: '#2d4558'
  board-muted: '#b4c4d2'
  slate-muted: '#475561'
  signal-amber: '#f5b53f'
  amber-wash: '#fdf1d6'
  brass: '#7a4f0c'
  hairline: '#cdd2cb'
  field-stroke: '#7d8791'
typography:
  display:
    fontFamily: 'Barlow Semi Condensed, Barlow, system-ui, sans-serif'
    fontSize: 'clamp(34px, 9vw, 48px)'
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: '-0.01em'
  time-large:
    fontFamily: 'Barlow Semi Condensed, Barlow, system-ui, sans-serif'
    fontSize: '44px'
    fontWeight: 700
    lineHeight: 1
    fontFeature: 'tnum'
  headline:
    fontFamily: 'Barlow Semi Condensed, Barlow, system-ui, sans-serif'
    fontSize: '30px'
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: 'Barlow Semi Condensed, Barlow, system-ui, sans-serif'
    fontSize: '22px'
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: 'Barlow, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'Barlow, system-ui, sans-serif'
    fontSize: '13px'
    fontWeight: 700
    letterSpacing: '0.08em'
rounded:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  sheet: '24px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '24px'
  xxl: '32px'
components:
  button-primary:
    backgroundColor: '{colors.signal-amber}'
    textColor: '{colors.board-ink}'
    rounded: '14px'
    padding: '12px 16px'
    height: '56px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.board-ink}'
    rounded: '{rounded.md}'
    padding: '10px 18px'
    height: '48px'
  route-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.board-ink}'
    rounded: '{rounded.lg}'
    padding: '16px'
  board-panel:
    backgroundColor: '{colors.board-ink}'
    textColor: '{colors.surface}'
    rounded: '{rounded.xl}'
    padding: '8px 16px 20px'
  notice:
    backgroundColor: '{colors.amber-wash}'
    textColor: '{colors.board-ink}'
    rounded: '{rounded.md}'
    padding: '12px 16px'
  search-input:
    backgroundColor: '{colors.surface}'
    rounded: '14px'
    padding: '0 12px'
---

# Design System: LineFinder

## Overview

**Creative North Star: "The Station Board"**

LineFinder reads like the departure board at a well-run station, calmed down for a phone. Two surfaces do the work: a quiet Paper canvas for browsing, and deep Board Ink panels for the facts that matter most (the header, the trip summary, the arrival). Times are large, condensed and tabular. Signal Amber is the single voice: the one action, the arrival time on ink, the fastest tag.

Information leads. Controls are big, labels are plain, and nothing decorative competes with a time or a stop name. Scheduled data always says so in words, because the app never has live data to show.

It must never look like DART. No DART logo or palette is used for chrome or identity. Route badges take their color from the feed data and nothing else. The independence note ("not affiliated with DART") stays on the home footer, About and Privacy.

**Key Characteristics:**

- Paper canvas with Board Ink panels and one amber voice
- Barlow and Barlow Semi Condensed, self-hosted, tabular numerals for every time
- Hairline borders and tonal surfaces; shadows only on floating things
- Square-cornered line badges colored by the feed, white-on-color or black-on-color by contrast
- 48px minimum targets, 3px focus rings, safe-area aware
- Sheets slide up with an ease-out drawer curve; everything honors reduced motion

## Colors

Cool ink and warm paper with a bright amber that only appears on dark panels or as a button fill.

### Primary

- **Board Ink** (#0e1c28): header bar, trip summary panel, arrival card, primary text, destination marker.

### Secondary

- **Signal Amber** (#f5b53f): the Find routes button, arrival time on ink, distinction tags, origin marker, selected star.
- **Amber Wash** (#fdf1d6): notices, transfer bands, active search row.
- **Brass** (#7a4f0c): focus rings on paper and amber-colored text or strokes on paper.

### Neutral

- **Paper** (#f3f3ee): page canvas.
- **Surface** (#ffffff): planner, cards, sheets, inputs.
- **Quiet Surface** (#e9ebe5): chips, icon tiles, hover.
- **Slate Muted** (#475561): secondary text on paper (7:1 and up).
- **Board Muted** (#b4c4d2): secondary text on ink.
- **Hairline** (#cdd2cb) and **Field Stroke** (#7d8791): dividers, and dashed walk lines and input borders.

### Named Rules

**The One Amber Rule.** Amber is a fill on ink or a button, never body text on paper. Use Brass for amber-toned text on light.

**The Scheduled Rule.** Any time the app shows departure or arrival, a "Scheduled" tag or label is within one screen. Nothing implies live status.

**The Not-DART Rule.** No agency logo, wordmark or palette in chrome.

## Typography

**Display Font:** Barlow Semi Condensed (700), self-hosted via next/font/local
**Body Font:** Barlow (400, 500, 600, 700), self-hosted
**Character:** Highway-sign lineage, narrow and confident. Condensed bold for times and headings, regular Barlow for reading.

### Hierarchy

- **Display** (700, clamp(34px, 9vw, 48px), 1.04): home heading and About title.
- **Time** (700, 44px list, 64px on the trip panel, tabular): arrival times.
- **Headline** (700, 30px): destination name on the trip panel.
- **Title** (700, 22px): section headings.
- **Body** (400 to 600, 17px, 1.45): default. Secondary text is 15px.
- **Label** (700, 13px, 0.08em, uppercase): field labels, tags, "Get off".

### Named Rules

**The Tabular Time Rule.** Every time and duration uses tabular figures and never wraps.

## Layout

Mobile first, single column. Workspace padding is 16px (12px under 360px), 32px from 600px (content capped at 760px), and from 1000px a two-column grid: planner and itinerary at 380 to 480px, sticky map filling the rest. The header is a full-bleed Board Ink bar, 48px tall content, padded for safe areas.

Home leads with the heading, the planner card, then saved and recent places as divided rows. Results are stacked cards. Trip detail replaces the planner on phones with the Board Ink summary, the map panel, and the step timeline.

## Elevation & Depth

Flat by default. Surfaces separate by tone (white on paper, ink on paper) and 1px hairlines. Shadows exist only on floating things: map buttons, markers, and sheets (`0 -12px 48px #0e1c2833`). Sheets sit over a `#0e1c28aa` backdrop.

### Named Rules

**The Flat-By-Default Rule.** Cards and the planner carry no shadow.

## Shapes

Rounded but disciplined: 16 to 20px for cards and panels, 12 to 14px for controls and inputs, 8px for line badges and tags, 24px for sheets. Markers encode type by shape: circle for stops, amber circle for origin, rounded square for destination. Selected route cards take a 2px ink outline, never a side stripe.

## Components

### Buttons

- **Primary:** full-width Signal Amber, Board Ink text, 56px, 14px radius, arrow nudges 4px on hover. Press scales to 0.97.
- **Secondary:** white, 1.5px ink border, 48px.
- **Text and icon:** 48px minimum, underline links, quiet hover fill only on hover-capable devices.

### Cards / Containers

- **Route card:** white, hairline, 16px radius. Large arrival time left, duration and tag right, line badges, "Board X at Y" with the stop in bold, then a "View journey" footer rule. Cards rise in with a 45ms stagger.
- **Planner:** white 18px card with a dashed route track (amber origin, ink square destination).
- **State message:** white card with an ink icon tile, plain heading, one action.

### Inputs / Fields

White with 2px ink border, 14px radius, 18px text to avoid iOS zoom. Focus adds a 3px Brass ring.

### Navigation

Board Ink bar: brand mark and wordmark left, underlined About link right, small uppercase descriptor from 600px.

### Trip Summary Panel (signature)

Board Ink panel with destination, a 64px amber arrival time, duration at right, transfer and walking line, line badges, and a "Scheduled" tag with the service date.

### Itinerary Timeline (signature)

Ink rail for rides, dashed rail for walking, 34px dots. Times sit right in condensed bold. Transfers get an Amber Wash band. Arrival is a Board Ink card with an amber time.

### Sheets

Bottom sheets on phones with a grabber, centered modals from 600px. Enter with an ease-out drawer curve over 280ms.

## Do's and Don'ts

### Do:

- **Do** lead with the next action and the time; the map supports the text.
- **Do** keep a "Scheduled" label near every time.
- **Do** use tabular figures and condensed bold for times.
- **Do** keep 48px targets, safe-area padding, and 16px or larger inputs.
- **Do** keep the independence note on home, About and Privacy.

### Don't:

- **Don't** use DART's logo, name as brand, or palette.
- **Don't** put amber text on paper.
- **Don't** add shadows to static cards, or colored side stripes to cards.
- **Don't** convey status by color alone.
- **Don't** animate frequent or keyboard actions beyond press feedback and one-time entrances.
- **Don't** use em dashes or marketing-sounding copy.
