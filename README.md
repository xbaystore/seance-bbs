# Séance BBS

> The board is dead. Long live the board.

**Séance BBS** resurrects the 1990s dial-up bulletin board system as a
modern web app — built for **Kiroween 2026** (AWS Kiro's hackathon on
Devpost) in the **Resurrection** category. You dial in through a simulated
14.4k modem connect sequence, pick a caller handle, and step onto a
phosphor-green terminal board that has been running, unattended, since
1997. The SysOp never left. He's just… no longer alive. He still answers
posts, though. Sometimes.

No servers were harmed — or used: the entire board runs in your browser.
Your handle, posts, and guestbook entries live only in your own
`localStorage`. Nothing is transmitted anywhere.

## Features

- **The dial-up ritual** — AT commands, modem negotiation, `CONNECT
  14400`, and an ASCII banner before the menu appears. Skippable, and
  shortened to a "redial" on return visits.
- **Handle-based identity** — pick a BBS handle (2–20 characters), no
  account, no password. The board remembers you on this device.
- **Message boards** — themed boards with threads and replies, seeded
  with fictional 1994 callers so the board feels lived-in from minute
  one.
- **The Séance Log** — a guestbook in the tradition of BBS one-liner
  walls. 140 characters, sign your name in the dark.
- **ANSI/ASCII art gallery** — an art-pack style gallery rendered in
  true monospace with the classic 16-color ANSI palette.
- **The SysOp Ghost** — a local, rule-based resident who occasionally
  replies to posts and log entries (summoning words help; posting at
  2 a.m. helps more). Rate-limited, never spammy, spooky but friendly.
- **A costume you can take off** — full CRT treatment (scanlines,
  flicker, vignette) by default, plus a persisted high-contrast readable
  mode, `prefers-reduced-motion` support, and full keyboard navigation.

## Run it locally

No build step, no dependencies. Either:

```bash
# Option 1: just open the file
open index.html            # or double-click it

# Option 2: serve the folder (recommended — matches production)
python3 -m http.server 8000
# then visit http://localhost:8000
```

That's the whole pipeline — the repo root *is* the deployable site
(GitHub Pages serves it as-is).

## Gallery index

Artwork is authored in [`assets/art/`](assets/art/) and inlined into the
app's seed data (the board makes no runtime network calls — a BBS was one
machine, and so is this).

| File | Title | Artist | Year |
|---|---|---|---|
| `seance-logo.txt` | SÉANCE BBS — Logo Banner | The SysOp Ghost | 1994 |
| `haunted-house.txt` | The Board House on Baud Hill | VHS_GH0ST | 1995 |
| `modem.txt` | 14.4 and Still Screeching | baud_rate_barbie | 1994 |
| `the-sysop.txt` | Portrait of the Operator | null_sector | 1996 |
| `pumpkin-mainframe.txt` | Pumpkin Mainframe | CAPTAIN_KERMIT | 1995 |
| `rip-floppy.txt` | R.I.P. 1.44MB | diskette_diva | 1997 |

## Built with Kiro

This project was developed spec-first with **Kiro** (AWS's agentic
development environment), and the [`.kiro`](.kiro/) directory is kept in
the repo — un-ignored, on purpose — as the working record:

- **Specs** — [`.kiro/specs/seance-bbs/`](.kiro/specs/seance-bbs/)
  contains `requirements.md` (user stories with EARS-format acceptance
  criteria), `design.md` (architecture, data models, ghost-engine rules,
  testing invariants), and `tasks.md` (the incremental implementation
  plan executed against the spec).
- **Steering** — [`.kiro/steering/`](.kiro/steering/) holds `product.md`
  (vision and tone: spooky but friendly, playful fiction), `tech.md`
  (vanilla-only, no-build, no-network constraints), and `structure.md`
  (the three-file layout and naming conventions every change follows).
- **Hooks** — [`.kiro/hooks/readme-sync.kiro.hook`](.kiro/hooks/)
  watches `assets/art/**` and asks the agent to keep this README's
  gallery index and the app's seed metadata in sync with the art on
  disk.

The spec-driven workflow mattered most for the SysOp Ghost: its trigger
rules, reply pools, and hard rate limits (once per item, never to itself,
≤3 per session) were pinned down as testable invariants in the design
doc *before* a line of the engine was written.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 0xby.
