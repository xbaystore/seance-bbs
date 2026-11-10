---
inclusion: auto
---

# Tech — Séance BBS

## Hard constraints

- **Vanilla HTML, CSS, and JavaScript only.** No frameworks, no libraries,
  no bundler, no transpiler, no npm dependencies. If it can't be written
  by hand in the three files, it doesn't ship.
- **No build step.** The repo root is the deployable site. Opening
  `index.html` (or serving the folder with any static server) is the
  whole pipeline.
- **No external network calls at runtime.** No CDNs, no webfonts, no
  analytics, no APIs. Fonts come from the system monospace stack. This is
  both a design statement (a BBS was one machine) and a privacy promise.
- **GitHub Pages compatible.** Plain static files, relative paths only,
  case-sensitive filenames, no server rewrites — routing is hash-based.

## Stack

- `index.html` — semantic document shell (`header`, `nav`, `main`,
  `footer`), terminal frame, screen mount point.
- `styles.css` — all presentation. Theme via CSS custom properties so
  contrast mode is a variable swap, not a second stylesheet.
- `app.js` — all behavior, one script, IIFE-wrapped, organized in
  banner-commented sections: `Store`, `SeedData`, `BootSequence`,
  `Router`/`Screens`, `GhostEngine`. Plain script (not an ES module) so
  `file://` opening works without CORS complaints.

## Persistence

- `localStorage` only. Single versioned key: `seance-bbs:v1`; backup key
  `seance-bbs:backup` for corrupt-state recovery.
- State is one JSON document (see `design.md` for the schema). Bump the
  version suffix for any breaking schema change; unknown *newer* versions
  are backed up and reseeded, never guessed at.
- All mutations go through `Store.update()` so persistence and
  `meta.updatedAt` can never be forgotten.
- All content is local to the caller's device. Nothing is transmitted
  anywhere, ever — say so in the UI copy where relevant.

## Rendering & safety

- Screens render as HTML strings into `<main id="screen">`; every piece of
  user or seed text passes through `escapeHtml()` before interpolation.
  No `innerHTML` with raw user data, no exceptions — artwork included
  (art is escaped first, then its internal color markup is converted).
- Forms are real `<form>` elements with submit handlers; buttons are
  `<button>`; links are `<a href="#/...">` so the hash router, keyboard
  navigation, and browser history all work natively.

## Accessibility requirements

- Respect `prefers-reduced-motion` (no typing/flicker animations).
- A persisted **readable contrast** mode removes scanlines/flicker/
  vignette and raises contrast.
- Visible focus indicator at all times; logical focus order; labelled
  form controls; landmark elements on every screen.
- Touch targets ≥ 40px; layout must remain fully usable at 360px width
  (art blocks scroll horizontally, the page does not).

## Browser support

- Current evergreen browsers (Chrome, Firefox, Safari, Edge). Only
  broadly-supported APIs: `localStorage`, `hashchange`, `setTimeout`,
  template literals, `String.padStart`. No top-level await, no
  import maps, no bleeding-edge CSS.
