# Implementation Plan — Séance BBS

Tasks are ordered incrementally: skeleton → store → seed → screens →
ghost → polish. Each task lists the requirement(s) from `requirements.md`
it implements. Checkpoints are verification steps: stop, run the listed
checks, and only then continue.

- [ ] 1. Project skeleton and terminal shell
  - [ ] 1.1 Create `index.html` with semantic landmarks (`header` status
    line, `nav`, `main#screen`, `footer`), the terminal frame, and script/
    style tags for `styles.css` and `app.js`
  - [ ] 1.2 Create `styles.css` with the CRT theme: phosphor-green palette
    as CSS custom properties, monospace stack, scanline overlay, vignette,
    visible focus indicator
  - [ ] 1.3 Create `app.js` with the module section banners (Store,
    SeedData, BootSequence, Router/Screens, GhostEngine) and a minimal
    boot placeholder that prints "DIALING SÉANCE BBS..." + "CONNECT 14400"
  - _Requirements: 8.1, 8.5_

- [ ] 2. Store layer over localStorage
  - [ ] 2.1 Implement `Store.load/save/reset/update` against the single
    versioned key `seance-bbs:v1`, including corrupt-state backup to
    `seance-bbs:backup` and the `restoredFromBackup` flag
  - [ ] 2.2 Implement id generation and the `update(mutator)` pattern so
    every mutation persists and stamps `meta.updatedAt`
  - [ ] 2.3 Verify manually: reload keeps state; hand-corrupted storage
    triggers backup + reseed notice; storage-denied (private mode) shows
    the "TAPE DRIVE OFFLINE" warning and the app still runs
  - _Requirements: 7.2, 7.3, 7.4_

- [ ] 3. Seed content
  - [ ] 3.1 Author seed boards (at least 3: General Static, Haunted
    Hardware, The Séance Parlor) with names, descriptions, order
  - [ ] 3.2 Author at least 6 seed threads with replies from fictional 90s
    callers, backdated relative to first run; include 2 pre-written
    SysOp Ghost replies so the ghost is present from minute one
  - [ ] 3.3 Author at least 8 seed séance log entries and wire the art set
    from `assets/art/` into `SEED_ART` (lines arrays, palette flags)
  - [ ] 3.4 Verify: a fresh profile opens to a board that already feels
    alive, with no futuristic timestamps
  - _Requirements: 7.1, 3.1, 4.1, 5.1_

- [ ] 4. Boot sequence and handle prompt
  - [ ] 4.1 Implement the data-driven boot script (ATDT → DIALING →
    negotiation → CONNECT 14400 → ASCII banner) with typewriter rendering
    and skip-on-keypress/click
  - [ ] 4.2 Implement the short "redial" script for returning callers and
    the static-transcript variant for reduced-motion / contrast mode
  - [ ] 4.3 Implement handle capture with validation (2–20 chars, allowed
    character set), persistence, status-line display, and the
    change-handle menu option
  - _Requirements: 1.1–1.6, 2.1–2.6_

- [ ] 5. **Checkpoint — foundation verified**
  - [ ] Fresh-profile run: boot plays, skip works, handle is required
    before posting, reload keeps the handle
  - [ ] Reduced-motion run: boot renders instantly, no typing animation
  - [ ] Keyboard-only pass: every control reachable, focus always visible
  - _Requirements: 1, 2, 8 (partial)_

- [ ] 6. Router and menu shell
  - [ ] 6.1 Implement the hash router (`#/`, `#/boards`, `#/board/:id`,
    `#/thread/:id`, `#/log`, `#/gallery`, `#/art/:id`, `#/settings`) with
    `hashchange` handling and a playful 404 for unknown routes
  - [ ] 6.2 Implement the main menu screen and shared chrome: status line
    (handle, clock, "CONNECT 14400"), `escapeHtml()` used by every render
  - _Requirements: 3.6, 8.4, 8.5_

- [ ] 7. Message boards
  - [ ] 7.1 Board list screen with thread counts and last-activity dates
  - [ ] 7.2 Thread list screen (newest-first) and thread view
    (chronological, handle + timestamp per post)
  - [ ] 7.3 New-thread and reply forms with validation (non-empty body,
    2,000-char cap, subject required for threads) and immediate in-place
    rendering after save
  - _Requirements: 3.1–3.5_

- [ ] 8. Séance log (guestbook)
  - [ ] 8.1 Log screen, newest-first, with SYSOP-tagged ghost styling and
    20-at-a-time reveal for long logs
  - [ ] 8.2 Entry form with the 1–140 character rule enforced in-terminal
  - _Requirements: 4.1–4.5_

- [ ] 9. ANSI/ASCII art gallery
  - [ ] 9.1 Gallery index (at least 6 pieces: title, artist, year) and
    art view rendering `<pre>` with exact whitespace preservation
  - [ ] 9.2 ANSI palette spans: convert internal color markup to the
    16-color CSS palette after escaping; art block scrolls horizontally
    on narrow screens without breaking layout
  - [ ] 9.3 Author at least 6 original art pieces into `assets/art/`
    (logo banner, haunted house, modem, ghost, pumpkin mainframe, RIP
    floppy) and inline them into seed data
  - _Requirements: 5.1–5.5_

- [ ] 10. **Checkpoint — core board verified**
  - [ ] Post a thread, reply to it, sign the log, view every art piece —
    then reload and confirm everything persisted
  - [ ] Post HTML/JS-looking text in every field and confirm it renders
    as inert text everywhere
  - [ ] Resize to a narrow mobile viewport: all screens usable, art
    scrolls internally
  - _Requirements: 3, 4, 5, 7 (partial)_

- [ ] 11. SysOp Ghost engine
  - [ ] 11.1 Implement trigger evaluation (comfort blocklist first,
    summoning words, help desk, witching hour, 15% chance) run exactly
    once per new post/entry
  - [ ] 11.2 Author the reply pools (greeting / helpful / spooky / log,
    ~10 lines each), spooky-but-friendly, no occult instructions
  - [ ] 11.3 Implement scheduling (20–90 s in-app delay), posting as
    "The SysOp Ghost" with SYSOP tag, and the hard rate limits: once per
    item, never to itself, ≥10 min cooldown, ≤3 per session
  - [ ] 11.4 Implement the comfort path: blocklist matches show the
    plain-language support signpost outside the ghost fiction, and no
    joke reply is ever scheduled
  - [ ] 11.5 Verify invariants from design.md: ghost uniqueness, ghost
    budget, and no ghost-to-ghost replies across a scripted posting spree
  - _Requirements: 6.1–6.6_

- [ ] 12. Settings, contrast mode, and reset
  - [ ] 12.1 Settings screen: readable-contrast toggle (removes scanlines/
    flicker/vignette, persists preference), change handle, reset board
    with explicit confirmation
  - [ ] 12.2 Honor `prefers-reduced-motion` by default on first run;
    persist any manual override
  - _Requirements: 8.2, 8.3, 7.5, 2.6_

- [ ] 13. Final polish and pre-submission pass
  - [ ] 13.1 Full manual checklist from design.md (fresh run, persistence,
    corrupt-state recovery, keyboard pass, reduced motion, contrast,
    mobile) executed start to finish without a defect
  - [ ] 13.2 README accuracy pass: features list matches the shipped app,
    gallery index matches `assets/art/`, run instructions work from a
    clean clone
  - [ ] 13.3 Confirm GitHub Pages deployment from the repo root serves the
    board with zero console errors and zero network requests beyond the
    page's own static files
  - _Requirements: 7.6, 8.6, all (verification)_
