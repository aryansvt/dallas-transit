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
  board-lit: '#1c384d'
  board-deep: '#09131c'
  amber-lit: '#fabf4f'
  amber-deep: '#f2b03a'
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
- A three-level ink-tinted elevation scale; hero panels in a lit ink material
- Square-cornered line badges colored by the feed, white-on-color or black-on-color by contrast
- 48px minimum targets, 3px focus rings, safe-area aware
- Route colors lead: a proportional route line on cards and heroes, line-colored rails in the steps
- Motion with purpose: results stagger in, the tapped card morphs into the trip summary, values roll on change
- Reduced motion keeps fades and color changes and drops movement

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
- **Board Lit** (#1c384d) and **Board Deep** (#09131c): the two ends of the hero material gradient around Board Ink.
- **Amber Lit** (#fabf4f) and **Amber Deep** (#f2b03a): the primary button's top-lit gradient.

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
- **Time** (700, tabular, -0.02em on heroes): 44px in lists, 64px for the next class, `clamp(60px, 19vw, 76px)` on the leave board and trip summary. The meridiem is set at 0.42em so the digits carry the size.
- **Headline** (700, 30px): destination name on the trip panel.
- **Title** (700, 22px): section headings.
- **Body** (400 to 600, 17px, 1.45): default. Secondary text is 15px.
- **Label** (700, 13px, 0.08em, uppercase): field labels, tags, "Get off".

In `globals.css` every size is a `--text-*` token (label 13, secondary 15, body 17, field 18 for inputs and place names, title 22, headline 30, time 44, time-xl 64, time-hero, display) and every radius a `--radius-*` token (xs 4, sm 8, md 12, control 14, lg 16, xl 20, sheet 24). Circles use 50%.

### Named Rules

**The Tabular Time Rule.** Every time and duration uses tabular figures and never wraps.

## Layout

Mobile first, single column. Workspace padding is 16px (12px under 360px), 32px from 600px (content capped at 760px), and from 1000px a two-column grid: planner and itinerary at 380 to 480px, sticky map filling the rest. The header is a full-bleed Board Ink bar, 48px tall content, padded for safe areas.

Home leads with the heading, the planner card, then saved and recent places as divided rows. Results are stacked cards. Trip detail replaces the planner on phones with the Board Ink summary, the map panel, and the step timeline.

## Elevation & Depth

Three levels, each an ink-tinted contact shadow plus a soft ambient one. Elevated surfaces trade the hairline for `--border-soft` (#0e1c2812). Dividers inside a surface keep the hairline.

| Token                | Value                                                | Used on                                                      |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `--elevation-1`      | `0 1px 2px #0e1c280f, 0 4px 12px -4px #0e1c281f`     | route cards, grouped lists, chips, map panel, state messages |
| `--elevation-2`      | `0 2px 4px #0e1c280f, 0 10px 24px -6px #0e1c2829`    | planner, hovered cards and chips, selected route card        |
| `--elevation-3`      | `0 4px 8px #0e1c2814, 0 24px 48px -12px #0e1c2847`   | map buttons and captions, the map-unavailable card, sheets   |
| `--elevation-hero`   | `inset 0 1px 0 #ffffff1a`, then a 16px/32px ink drop | leave board, trip summary, next class, arrival card          |
| `--elevation-button` | inset white highlight plus a brass-tinted drop       | the amber primary button                                     |

**Hero material.** `--hero-fill`: a 160deg gradient from #1c384d through Board Ink to #09131c, an LED dot grid (white at 7%, 9px pitch) and a fade that lets the dots fall away toward the bottom. The lit top edge is the inset highlight.

Sheets sit over a `#0e1c28aa` backdrop.

### Named Rules

**The Elevation Rule.** Resting cards sit at level 1 and lift to level 2 under a fine pointer; a press pushes them down 1px with a contact-only shadow. Floating chrome is level 3. No colored glows, no glass, nothing outside this scale.

## Shapes

Rounded but disciplined: 16 to 20px for cards and panels, 12 to 14px for controls and inputs, 8px for line badges and tags, 24px for sheets. Markers encode type by shape: circle for stops, amber circle for origin, rounded square for destination. Selected route cards take a 2px ink outline, never a side stripe.

## Components

### Buttons

- **Primary:** full-width Signal Amber (a gentle top-lit gradient, `--elevation-button`), Board Ink text, 56px, 14px radius, arrow nudges 4px on hover. Press scales to 0.97 and sinks into an inner shadow.
- **Secondary:** white, 1.5px ink border, 48px, level 1.
- **Text and icon:** 48px minimum, underline links, quiet hover fill only on hover-capable devices.

### Cards / Containers

- **Route card:** white, level 1, 16px radius. Large time left, duration and tag right, the route line, line badges, "Board X at Y" with the stop in bold, then a "View journey" footer rule. Cards rise in with a 50ms stagger, lift 2px on hover and press down on tap. Tapping one morphs it into the trip summary (View Transitions, 420ms drawer curve).
- **Route line:** each leg as its share of the trip. Rides are 8px bars in the feed's line color, walks a 4px gray thread, 3px gaps. Decorative (`aria-hidden`); badges and steps name every route. On heroes it draws left to right as the panel settles.
- **Planner:** white 20px card at level 2 with a dashed route track (amber origin, ink square destination).
- **Grouped lists:** Home, School, saved and recent places sit on one level-1 card; dividers start after the icon tile.
- **Loading:** three skeleton cards in the route card's shape. Blocks breathe; an amber light travels along each route line.
- **State message:** white card with an ink icon tile, plain heading, one action.

### Inputs / Fields

White with 2px ink border, 14px radius, 18px text to avoid iOS zoom. Focus adds a 3px Brass ring (amber on ink) that contracts onto the control from 7px to 3px offset. Radios in the time sheet are drawn: the ink dot scales in.

### Navigation

Board Ink bar: brand mark and wordmark left, underlined About link right, small uppercase descriptor from 600px.

### Trip Summary Panel (signature)

Hero material panel with destination, the hero amber arrival time, duration at right, the route line, transfer and walking line, line badges, and a "Scheduled" tag with the service date. It settles in on the drawer curve.

### Itinerary Timeline (signature)

A ride's rail (4px) and square dot take its line color, with the contrast-checked text color from the feed logic; walking keeps the dashed rail and round dot. Times sit right in condensed bold. Transfers get an Amber Wash band. Arrival is a hero card with an amber time. Steps rise in with a 30ms stagger.

### Leave-By Board (signature)

Arrive-by results open with a hero panel that settles in: "Leave by" over the hero amber time (it rolls up when it changes), the route line, a relative pill that rolls each minute ("in 26 min", "6 min ago", or the date), then Arrive and Early by facts split by a board-line rule. A passed time is struck through and its pill turns amber. A leave time inside a class, or a passed one, adds an Amber Wash callout with an ink alert tile and one action ("Leave at 11:15 AM instead", "Leave now instead").

### Transfer Tags

Comfortable, Tight or Risky, from the router's scheduled shortfall per transfer (0, up to 180 s, above 180 s). Icon plus word, never color alone: check on Quiet Surface, clock on Amber Wash with Brass text, alert on Board Ink. On ink panels Risky takes the amber fill. Cards show the tightest; steps show each with its minutes to connect. No data, no tag.

### Map

When there is no street style, the canvas shows a schematic instead of a blank box: a faint street grid at two angles, a river arc and a soft vignette. Markers, buttons and the caption float at level 3; "Street map unavailable" is a floating card.

### Sheets

Bottom sheets on phones with a grabber, centered modals from 600px. Enter with an ease-out drawer curve over 280ms. Details and the class schedule expand to their natural height (300ms) with a turning chevron.

### Motion

Durations stay under 450ms; entrances use `--ease-out`, panels `--ease-drawer`, travel `--ease-in-out`. Reduced motion keeps opacity and color changes and drops every transform, the route-line draw, the travelling skeleton light and the card morph (it becomes a crossfade).

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
- **Don't** use shadows outside the elevation scale, colored glows, or colored side stripes on cards.
- **Don't** convey status by color alone.
- **Don't** animate frequent or keyboard actions beyond press feedback and one-time entrances.
- **Don't** use em dashes or marketing-sounding copy.
