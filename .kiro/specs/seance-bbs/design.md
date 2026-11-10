# Design Document — Séance BBS

## Overview

Séance BBS is a single-page, static web application that recreates a 1990s
dial-up bulletin board system. It has no backend, no build step, and no
runtime network calls: three files (`index.html`, `styles.css`, `app.js`)
plus static art text files under `assets/art/`. All mutable state lives in
`localStorage` under one versioned key. The app is deployable to GitHub
Pages as-is.

The design optimizes for three things:

1. **Authenticity of ritual** — the boot/connect sequence, handle prompt,
   and menu-driven terminal navigation reproduce the *feel* of dialing a
   BBS in 1994.
2. **Simplicity of machinery** — one file of vanilla JS, a tiny hash router,
   a single-document state store, and a deterministic rule engine for the
   SysOp Ghost. Nothing here needs a framework.
3. **Legibility and safety** — the CRT costume is removable (contrast
   mode), motion respects OS settings, and the ghost's fiction never
   crosses into real occult instruction or crisis mockery.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        index.html                            │
│  <header> status line · <nav> menu · <main id="screen">      │
│  <div id="terminal"> transcript + active screen </div>       │
└──────────────┬───────────────────────────────────────────────┘
               │ loads
        styles.css            app.js (single script, modules below)
               │                     │
               │        ┌────────────┴─────────────┐
               │        │  BootSequence            │  scripted dial/connect,
               │        │  Router / Screens        │  hash routes, rendering
               │        │  Store                   │  localStorage, schema v1
               │        │  GhostEngine             │  triggers, pools, cooldowns
               │        │  SeedData                │  first-run content
               │        └────────────┬─────────────┘
               │                     │ read/write (JSON)
               │              localStorage["seance-bbs:v1"]
               │
        assets/art/*.txt  (fetched at build/authoring time only —
                           content inlined into seed data; no runtime fetch)
```

Wait — one clarification on the art pipeline: because the app makes **no
runtime network calls**, art text files under `assets/art/` are the
*authoring source*, and their contents are embedded into `app.js` seed data
(as string constants) for the shipped site. The files remain in the repo as
the canonical, editable source of the artwork, and the README-sync hook
keeps the gallery index honest. If a future iteration chooses to `fetch()`
them from the same origin, that is a deliberate design change, not an
accident.

### Module breakdown inside `app.js`

`app.js` is organized as clearly delimited sections (banner comments), each
exposing a small namespace object. No modules/bundler — plain script,
IIFE-wrapped.

#### 1. `Store` — persistence layer

- Owns the single key `seance-bbs:v1` and the in-memory `state` object.
- API: `load()`, `save()`, `reset()`, `get()`, `update(mutatorFn)`.
- `load()` handles: empty → seed; parse error or unknown future version →
  backup to `seance-bbs:backup`, reseed, set a `restoredFromBackup` flag
  the boot sequence mentions.
- Every mutation flows through `update()`, which mutates, stamps
  `state.meta.updatedAt`, and saves — so no code path can forget to
  persist.
- IDs are generated as `id = Date.now().toString(36) + counter` — unique
  enough for a single-device board, sortable by creation time.

#### 2. `SeedData` — first-run content

- Constants: `SEED_BOARDS`, `SEED_THREADS`, `SEED_LOG`, `SEED_ART`,
  `GHOST_POOLS`.
- Written by `Store.load()` exactly once, when no state exists.
- Seed posts are written "in character" by fictional 90s callers
  (`VHS_GH0ST`, `baud_rate_barbie`, `CAPTAIN_KERMIT`…) and backdated over
  the previous weeks so the board feels lived-in. Timestamps are computed
  relative to first-run time so they never look futuristic.
- Also contains 2–3 pre-written ghost replies to seed threads, so
  first-time callers see the SysOp Ghost has "always been here".

#### 3. `BootSequence` — the dial-up ritual

- A data-driven script: an array of `{ text, delay, class }` steps
  rendered into the transcript with a typewriter effect.
- Steps: `ATDT 555-0199`, `DIALING...`, modem noise described as text
  (`~ screech ~ hiss ~ bong ~`), negotiation lines (`CARRIER 14400`,
  `PROTOCOL: LAP-M ERROR CORRECT`), `CONNECT 14400`, welcome banner
  (ASCII logo), then hand-off to Router.
- Skip: any keypress or click on the skip hint fast-forwards. Returning
  callers (handle exists) get `BOOT_SCRIPT_SHORT` ("redial").
- If `prefers-reduced-motion` or contrast mode is on: print the whole
  transcript instantly, no timers.

#### 4. `Router` + `Screens` — navigation and rendering

- Hash routes: `#/` (menu), `#/boards`, `#/board/:boardId`,
  `#/thread/:threadId`, `#/log`, `#/gallery`, `#/art/:artId`,
  `#/settings`.
- `Router` listens to `hashchange`, parses the route, and calls the
  matching screen renderer with parsed params.
- Each screen renderer is a pure-ish function `(state, params) → HTML
  string`, then a thin binder attaches event handlers. All user content
  is passed through `escapeHtml()` before interpolation — no exceptions.
- Rendering re-renders only `<main id="screen">`; the transcript/status
  line in the header (handle, "baud rate", clock) is updated separately.
- Forms are real `<form>` elements with submit handlers
  (`preventDefault`), so Enter-to-post and keyboard flow work naturally.

#### 5. `GhostEngine` — the SysOp Ghost

- Pure rule evaluation over new content; no randomness at module scope —
  the RNG and clock are injectable for testability.
- **Trigger rules** (evaluated once per new post/entry, in order):
  1. *Comfort rule (checked first, short-circuits everything else):* text
     matches the crisis/comfort blocklist → no ghost reply; UI shows the
     plain-language support signpost instead (handled by the screen
     renderer, not the engine).
  2. *Summoning words:* text contains `ghost`, `sysop`, `haunt`,
     `séance`, `anyone here`, `hello?` (case-insensitive).
  3. *Help desk:* text contains `help`, `how do i`, `stuck` → reply drawn
     from the *helpful* pool (in-fiction but genuinely instructional
     about using the board).
  4. *Witching hour:* item created between 00:00 and 03:59 local time.
  5. *Chance:* 15% roll for any other item.
- **Reply pools:** `GHOST_POOLS = { greeting: [...], helpful: [...],
  spooky: [...], log: [...] }`, ~10 short pre-written lines each,
  spooky-but-friendly, never giving occult instructions, never claiming
  to be a real spirit or a real person.
- **Scheduling:** a matched reply is queued with an in-app delay of
  20–90 s (`setTimeout`), then appended as a normal post/entry authored
  by `The SysOp Ghost`, and persisted like any other content.
- **Rate limits (hard invariants):**
  - at most one ghost reply per target item (tracked by
    `ghostRepliedTo: Set<itemId>` in state);
  - never replies to items authored by the ghost itself;
  - ≥10 min between ghost replies (`state.meta.lastGhostReplyAt`);
  - ≤3 ghost replies per session (in-memory counter, resets on reload);
  - pending timers are *not* persisted; a reload simply loses a scheduled
    reply — acceptable, and it prevents "ghost debt" piling up.

### Data models

All models are plain JSON-serializable objects inside the single state
document.

```js
state = {
  version: 1,
  meta: {
    createdAt: ISODate,
    updatedAt: ISODate,
    handle: string | null,          // caller's current handle
    lastGhostReplyAt: ISODate | null,
    ghostRepliedTo: string[],       // item ids the ghost already answered
    preferences: { contrast: boolean, reducedMotion: boolean | null }
  },
  boards: Board[],
  posts: Post[],
  log: GuestbookEntry[],
  art: ArtPiece[]
}
```

**Board** — `{ id, slug, name, description, order }`
Boards are fixed by seed (callers can't create boards — very BBS-authentic:
the SysOp owns the board list).

**Post** — `{ id, boardId, threadId, parentId | null, subject | null,
author, body, createdAt, ghost: boolean }`
A thread is a post with `parentId: null`; its `threadId` is its own id.
Replies carry the thread's id in `threadId` and the post they answer in
`parentId`. Threads are derived by grouping, never stored separately.

**GuestbookEntry** — `{ id, author, message, createdAt, ghost: boolean }`

**ArtPiece** — `{ id, title, artist, year, lines: string[], palette:
boolean }`
Art is stored as an array of lines to preserve spacing exactly; `palette`
marks pieces whose lines contain the internal color-span markup the
renderer converts to ANSI-palette CSS classes (after escaping).

### Error handling

| Failure | Handling |
|---|---|
| `localStorage` full / unavailable (private mode) | `Store.save()` catches `QuotaExceededError`/exceptions; app continues in-memory and shows a status-line warning: "TAPE DRIVE OFFLINE — this session won't be remembered." |
| Corrupt stored JSON | Backup raw value to `seance-bbs:backup`, reseed, boot notice: "restored from backup tapes". |
| Stored version > app version | Same path as corrupt: never attempt to downgrade-migrate unknown future data. |
| Invalid form input | Reject in-terminal with the specific rule (length, characters); never throw, never lose the draft text. |
| Unknown hash route | Render the menu with a playful `404 — CARRIER LOST` line. |
| Ghost timer fires after navigation | Harmless: reply is appended to state and persisted; it appears next time the thread/log is viewed. |

### Testing strategy

No test framework (no-build constraint). Two layers:

1. **Manual verification checklist** (kept in `tasks.md` checkpoints and
   executed before submission): fresh-profile first run (seed appears,
   handle prompt, posting works), reload persistence, skip-boot,
   reduced-motion boot, contrast mode toggle persistence, keyboard-only
   pass over every screen, narrow-viewport pass, corrupt-state recovery
   (hand-edit localStorage to garbage → backup + reseed notice),
   reset-board flow.

2. **Property-style invariants** — stated as properties the implementation
   must always satisfy, and spot-checked with throwaway console snippets
   during development:
   - *Ghost uniqueness:* for any item id, `ghostRepliedTo` contains it at
     most once, and no post authored by the ghost ever has a ghost reply.
   - *Ghost budget:* in any session, ghost replies ≤ 3, and any two ghost
     replies are ≥10 minutes apart in `createdAt`.
   - *Round-trip:* for any reachable state, `JSON.parse(serialize(state))`
     deep-equals `state` (no functions, no `undefined` fields leak in).
   - *Seed determinism:* seeding twice from empty produces structurally
     identical boards/art (relative timestamps may differ).
   - *Escaping:* for any user string, rendered HTML contains no unescaped
     `<` originating from that string.
   - *Route totality:* every hash the UI generates parses back to the
     screen that generated it.

## Design decisions & rationale

- **Static-only, no backend.** A real BBS had a phone line and one machine;
  our honest modern equivalent of "one machine" is the caller's own
  browser. It also makes the piece deployable anywhere, free, forever.
- **One JS file.** Matches the era's monolithic BBS software and keeps the
  no-build promise trivially true. Sections + banner comments keep it
  navigable.
- **The ghost is rules, not AI.** Deterministic, rate-limited, testable,
  free, offline — and funnier: a SysOp who answers *sometimes*, late, and
  only in canned lines is both a better joke and a better citizen.
- **Costume is a preference, not a prison.** CRT effects are the default
  skin; contrast mode and reduced-motion support are first-class settings,
  because a resurrection you can't read is just a séance nobody attends.
