# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Brandkårens Gatquiz** – a street-finding quiz for Örebro fire brigade trainees. Users are shown a street name and must click the correct street on a map. Built as a single self-contained `index.html` with no build step, no package manager, and no server required.

## Running the App

Open `index.html` directly in a browser. No build, no server, no dependencies to install.

- For full OSM live data: use Firefox on desktop (Chrome blocks the Overpass API cross-origin request from `file://`)
- On Chrome or mobile: the app falls back to the embedded `FALLBACK_STREETS` dataset (~400+ streets)

## Architecture

Everything lives in `index.html` in three sections:

**CSS** (lines ~9–115): All styles inline. Color palette: `#ff6400` (orange), `#0d0d0d` (background), `#00e676` (correct), `#ff4444` (wrong).

**HTML** (lines ~117–197): Five screens, shown/hidden via `display` style:
- `#loading-screen` – shown during OSM fetch
- `#area-screen` – area selection grid
- `header` + `#sub-bar` + `#map` – the game UI
- `#fb` – per-question feedback panel
- `#end` – end-of-session results

**JavaScript** (lines ~198–end): All logic in one `<script>` block. Key globals:
- `AREAS` – array of named bounding boxes covering Örebro neighborhoods
- `FALLBACK_STREETS` – embedded street geometry (name + coordinate segments) as a large array literal
- `allStreets` – dict of `name → {polys, bounds, area}` built as streets are loaded
- `areaStreets` – dict of `area name → [street names]`
- `selectedAreas` – Set of area names chosen by the user
- `activeNames` / `queue` / `idx` – current game state
- `phase` – state machine: `'loading'` → `'area'` → `'playing'` → `'feedback'` → `'end'`
- `score` – `{correct, wrong, skipped}`
- `attemptsLeft` – 3 per question; reaching 0 auto-advances after 3.5 s

Key functions:
- `loadOSM()` / `loadFallback()` – data loading paths; both call `addStreet(name, segList)`
- `addStreet()` – creates two Leaflet polylines per segment: a thick invisible hit target and a thin visible line; assigns the street to an area via `assignArea()`
- `beginQuiz()` / `startGame()` – shuffle `activeNames` into `queue`, call `renderQ()`
- `renderQ()` – shows the current street name, makes all active streets interactive
- `handleClick(name)` – checks answer, updates score, triggers feedback
- `applyStyle(name, styleObj)` – applies a style object `S.*` to all polylines for a street

Style constants (`S`): `hidden`, `normal`, `hover`, `target`, `correct`, `wrong`, `reveal`

## Adding/Editing Areas

Areas are defined in the `AREAS` array as `{name, bbox:[south,west,north,east]}`. Each street is assigned to the first area whose bbox contains the street's midpoint. Streets outside all areas go to `'Övrigt'`.

## Adding Fallback Streets

Add entries to `FALLBACK_STREETS`:
```js
{name:"Gatunamn", segs:[[[lat,lon],[lat,lon],[lat,lon]]]}
```
Each street can have multiple segments (array of arrays of `[lat,lon]` pairs).
