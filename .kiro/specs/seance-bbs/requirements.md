# Requirements Document — Séance BBS

## Introduction

Séance BBS resurrects the 1990s dial-up bulletin board system (BBS) as a modern,
zero-backend web application. A visitor "dials in" through an animated modem
connect sequence, picks a caller handle, and lands on a phosphor-green terminal
board with message boards, a guestbook ("the séance log"), an ANSI/ASCII art
gallery, and a resident ghost SysOp who occasionally answers posts from beyond
the veil. Everything runs client-side in a single static site; all data lives
in the browser's localStorage and the whole board can be hosted on GitHub
Pages.

The product is a work of playful fiction: the "séance" and the "ghost" are
themed presentation layers over ordinary local data and rule-based canned
responses. No network calls are made at runtime, no real occult content is
presented as factual, and nothing leaves the visitor's machine.

This document is the requirements spec for the `seance-bbs` feature set in
Kiro spec-driven format. It is the source of truth that `design.md`
implements and `tasks.md` executes.

## Glossary

- **Caller** — a visitor using the board. Callers are identified only by a
  self-chosen handle; there are no accounts, passwords, or servers.
- **Handle** — the display name a caller picks on first connect (e.g.
  `N0CTURNE`, `modem_moth`). Stored locally and attached to everything the
  caller posts.
- **SysOp** — the "system operator" of a classic BBS; here, a fictional
  resident ghost (see **SysOp Ghost**).
- **SysOp Ghost** — a local, rule-based character ("The SysOp Ghost") that
  sometimes replies to board posts and guestbook entries using pre-written,
  spooky-but-friendly canned responses. It is deterministic software, not an
  AI service, and never pretends otherwise inside the fiction beyond playful
  theming.
- **Board** — a themed message area (e.g. "General Static", "Haunted
  Hardware") containing threads of posts.
- **Post** — a single message on a board, either a new thread or a reply to
  an existing thread.
- **Séance Log** — the guestbook: a single chronological list of short
  sign-ins left by callers, in the tradition of BBS "one-liner" walls and
  guestbooks.
- **Art Piece** — a preformatted ANSI/ASCII artwork rendered in a monospace
  block, optionally with classic ANSI color styling.
- **Boot Sequence** — the opening terminal experience that simulates dialing
  a modem and negotiating a connection before the board menu appears.
- **Store** — the app's persistence layer over `localStorage`, using a
  single versioned key (`seance-bbs:v1`).
- **Seed Content** — the fictional starter data (boards, threads, log
  entries, art) written on first run so the board never opens empty.

## Requirements

### Requirement 1: Terminal Boot & Connect Experience

**User Story:** As a caller, I want the site to open with a dial-up modem
connect ritual, so that I feel transported to a 1990s BBS before I ever see
a menu.

#### Acceptance Criteria

1. WHEN the app is opened THEN THE SYSTEM SHALL display a black terminal
   screen and print a scripted connect sequence that includes, in order, an
   AT-style dial command for "SÉANCE BBS", a "DIALING..." state, simulated
   modem negotiation lines, and a final "CONNECT 14400" line.
2. WHEN the connect sequence completes THEN THE SYSTEM SHALL reveal the
   board's main menu without a page reload.
3. IF the caller activates the visible "press any key / skip" affordance
   during the boot sequence THEN THE SYSTEM SHALL jump immediately to the
   end state of the sequence.
4. WHILE the boot sequence is playing THE SYSTEM SHALL keep all menu
   controls inert until the sequence completes or is skipped.
5. WHEN the caller has connected at least once before (a stored handle
   exists) THEN THE SYSTEM SHALL offer a shortened "redial" variant of the
   boot sequence that completes in no more than half the steps of the
   first-run sequence.
6. IF the caller's system reports `prefers-reduced-motion` THEN THE SYSTEM
   SHALL present the completed connect transcript statically, with no
   character-by-character typing animation.

### Requirement 2: Handle-Based Identity

**User Story:** As a caller, I want to pick a BBS handle that the board
remembers on this device, so that my posts feel like mine without creating
an account or password.

#### Acceptance Criteria

1. WHEN a first-time caller finishes the boot sequence THEN THE SYSTEM
   SHALL prompt for a handle before allowing posting.
2. WHEN a caller submits a handle THEN THE SYSTEM SHALL trim whitespace,
   require 2–20 characters, and accept letters, digits, spaces, and the
   characters `_ - .` only.
3. IF a submitted handle is empty, too short, too long, or contains
   disallowed characters THEN THE SYSTEM SHALL reject it and display an
   in-terminal error line explaining the rule that was broken.
4. WHEN a valid handle is accepted THEN THE SYSTEM SHALL persist it in the
   Store and display it in the terminal status line for the rest of the
   session and future sessions.
5. WHEN a returning caller opens the app THEN THE SYSTEM SHALL load the
   stored handle automatically and SHALL NOT prompt for a handle again.
6. WHEN the caller chooses the "change handle" menu option THEN THE SYSTEM
   SHALL allow a new handle to be set, and posts made afterwards SHALL use
   the new handle while earlier posts keep the handle they were made with.

### Requirement 3: Message Boards

**User Story:** As a caller, I want to browse themed message boards, read
threads, and post and reply, so that the board feels like a living BBS and
not a static page.

#### Acceptance Criteria

1. WHEN the caller opens the boards screen THEN THE SYSTEM SHALL list all
   boards with each board's name, one-line description, thread count, and
   the date of the most recent post.
2. WHEN the caller selects a board THEN THE SYSTEM SHALL list its threads
   newest-first, showing subject, author handle, reply count, and last
   activity date.
3. WHEN the caller opens a thread THEN THE SYSTEM SHALL display the
   original post followed by replies in chronological order, each with
   author handle and timestamp.
4. WHEN the caller submits a new thread or reply with non-empty subject
   (threads only) and body THEN THE SYSTEM SHALL save it to the Store with
   the caller's current handle, a generated id, and the current timestamp,
   and display it immediately without a reload.
5. IF a post body is empty or exceeds 2,000 characters THEN THE SYSTEM
   SHALL reject the submission and show an in-terminal validation message.
6. WHEN the caller navigates between the board list, a board, and a
   thread THEN THE SYSTEM SHALL update the URL hash (e.g. `#/boards`,
   `#/board/general`, `#/thread/<id>`) so the browser back button and
   deep links work.

### Requirement 4: Guestbook — The Séance Log

**User Story:** As a caller, I want to sign the guestbook like visitors
signed BBS one-liner walls, so that I can leave a small mark on the board
without writing a full post.

#### Acceptance Criteria

1. WHEN the caller opens the séance log screen THEN THE SYSTEM SHALL
   display all entries newest-first, each showing handle, message, and
   timestamp.
2. WHEN the caller submits a log entry THEN THE SYSTEM SHALL require a
   message of 1–140 characters and save it with the caller's handle and
   the current timestamp.
3. IF a log entry is empty or longer than 140 characters THEN THE SYSTEM
   SHALL reject it and display the character rule inside the terminal.
4. WHEN the séance log contains more entries than fit one screen THEN
   THE SYSTEM SHALL paginate or incrementally reveal entries in groups
   of 20 without losing the caller's scroll context within the terminal
   view.
5. WHILE viewing the séance log THE SYSTEM SHALL visually distinguish
   entries written by the SysOp Ghost from entries written by callers
   (distinct color and a "SYSOP" tag).

### Requirement 5: ANSI/ASCII Art Gallery

**User Story:** As a caller, I want to browse a gallery of ANSI/ASCII art
like the art packs BBSs used to trade, so that the resurrection feels
visually authentic.

#### Acceptance Criteria

1. WHEN the caller opens the gallery screen THEN THE SYSTEM SHALL list at
   least 6 art pieces with title, "artist" handle, and year.
2. WHEN the caller selects an art piece THEN THE SYSTEM SHALL render the
   artwork in a monospace `<pre>` block that preserves every space and
   line break exactly as stored.
3. WHERE an art piece defines ANSI-style color spans THE SYSTEM SHALL
   render those spans using the classic 16-color ANSI palette mapped to
   CSS classes, without executing any markup contained in the artwork.
4. WHEN artwork is rendered THEN THE SYSTEM SHALL escape all HTML special
   characters in the art source so art content can never inject elements
   into the page.
5. IF the caller's viewport is narrower than the artwork THEN THE SYSTEM
   SHALL allow horizontal scrolling of the art block only, without
   breaking the surrounding terminal layout.

### Requirement 6: The SysOp Ghost Reply Engine

**User Story:** As a caller, I want the board's ghost SysOp to occasionally
answer my posts and guestbook sign-ins, so that the board feels haunted —
and so the fiction of the piece lands.

#### Acceptance Criteria

1. WHEN the caller creates a board post or a séance log entry THEN THE
   SYSTEM SHALL evaluate the Ghost Engine's trigger rules for that item
   exactly once.
2. IF a trigger rule matches (keyword themes such as "ghost", "help",
   "anyone here", posts made between 00:00 and 03:59 local time, or the
   random-chance rule) THEN THE SYSTEM SHALL schedule one ghost reply to
   that item after a delay of 20–90 seconds of in-app time.
3. THE SYSTEM SHALL guarantee that the SysOp Ghost replies to a given
   post or entry at most once, and SHALL NOT reply to its own messages.
4. THE SYSTEM SHALL enforce a cooldown of at least 10 minutes of in-app
   time between ghost replies, and a maximum of 3 ghost replies per
   session, regardless of how many triggers fire.
5. WHEN a ghost reply is posted THEN THE SYSTEM SHALL attribute it to the
   handle "The SysOp Ghost" with a "SYSOP" tag and a distinct color, and
   draw its text from the pre-written reply pools defined in the seed /
   ghost data (no network generation).
6. IF the caller posts content containing words from the comfort blocklist
   (self-harm or crisis terms) THEN THE SYSTEM SHALL NOT reply with a
   joke response; instead it SHALL show a brief, kind, plain-language
   signpost to real-world support resources, presented outside the ghost
   fiction.

### Requirement 7: Local Persistence & Seed Content

**User Story:** As a caller, I want everything on the board to survive a
page reload, and to find a board that already feels alive the first time I
connect, so that the illusion of a long-running BBS holds.

#### Acceptance Criteria

1. WHEN the app starts and no saved state exists THEN THE SYSTEM SHALL
   write the seed content (at least 3 boards, 6 threads with replies, 8
   séance log entries, and the gallery art set) into the Store before the
   first menu is shown.
2. WHEN the caller creates or changes any content THEN THE SYSTEM SHALL
   persist the entire board state under the single versioned key
   `seance-bbs:v1` in `localStorage`.
3. WHEN the app starts and saved state exists THEN THE SYSTEM SHALL load
   it and SHALL NOT overwrite it with seed content.
4. IF the stored state fails to parse or its schema version is newer than
   the app understands THEN THE SYSTEM SHALL preserve the raw value under
   a backup key (`seance-bbs:backup`), fall back to seed content, and
   show a one-line terminal notice that the board was "restored from
   backup tapes".
5. WHEN the caller selects "reset the board" from the menu and confirms
   THEN THE SYSTEM SHALL clear the versioned key and re-seed the board.
6. THE SYSTEM SHALL make no network requests at runtime; all state SHALL
   live in `localStorage` on the caller's device only.

### Requirement 8: CRT Aesthetic & Accessibility

**User Story:** As a caller, I want the board to look like a glowing CRT
terminal — but I also want to actually be able to read and use it, so that
nostalgia never wins over usability.

#### Acceptance Criteria

1. WHILE any screen is displayed THE SYSTEM SHALL render the terminal in a
   monospace font with a phosphor-green-on-black default palette,
   scanline overlay, and subtle screen curvature vignette.
2. WHEN the caller enables "readable contrast" mode from the menu THEN
   THE SYSTEM SHALL remove the scanlines, flicker, and vignette and
   switch to a high-contrast plain palette, and SHALL persist that
   preference in the Store.
3. IF `prefers-reduced-motion` is set at the OS level THEN THE SYSTEM
   SHALL disable typing animations, flicker, and glow pulsing by default,
   while keeping all functionality available.
4. WHEN the caller navigates with a keyboard only THEN THE SYSTEM SHALL
   provide a visible focus indicator and logical focus order on every
   screen, and every action available by pointer SHALL also be available
   by keyboard.
5. WHEN semantic structure is rendered THEN THE SYSTEM SHALL use landmark
   elements (`header`, `main`, `nav`, `footer`) and label all form
   controls, so screen readers announce screens and forms correctly.
6. IF the caller's viewport is a narrow mobile screen THEN THE SYSTEM
   SHALL keep the terminal fully usable (no clipped menus, touch targets
   at least 40px, text wrapping inside the terminal frame).
