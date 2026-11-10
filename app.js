/* ═══════════════════════════════════════════════════════════════════════
   Séance BBS — app.js
   Single-file, IIFE-wrapped, no build step, no framework.

   Sections (find with Ctrl+F "──"):
     1. Utilities
     2. Store          — localStorage persistence layer
     3. SeedData       — first-run boards, threads, log, art, ghost pools
     4. BootSequence   — dial-up ritual (stubbed; full impl in task 4)
     5. Router/Screens — hash routing & screen rendering (task 6+)
     6. GhostEngine    — SysOp Ghost reply logic (task 11)
     7. Init           — wires everything together
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ─────────────────────────────────────────────────────────────────────
     1. UTILITIES
     ───────────────────────────────────────────────────────────────────── */

  /**
   * Escape all HTML special characters so user/seed content can never
   * inject elements into the page.  Called by every render path.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Generate a sortable, locally-unique ID.
   * Format: base-36 timestamp + 2-digit incrementing counter.
   */
  var _idCounter = 0;
  function genId() {
    _idCounter = (_idCounter + 1) % 100;
    var suffix = String(_idCounter).padStart(2, "0");
    return Date.now().toString(36) + suffix;
  }

  /**
   * Format an ISO date string for display (e.g. "94-10-31 23:58").
   * @param {string} iso
   * @returns {string}
   */
  function fmtDate(iso) {
    try {
      var d = new Date(iso);
      var yy  = String(d.getFullYear()).slice(2);
      var mo  = String(d.getMonth() + 1).padStart(2, "0");
      var dd  = String(d.getDate()).padStart(2, "0");
      var hh  = String(d.getHours()).padStart(2, "0");
      var mm  = String(d.getMinutes()).padStart(2, "0");
      return yy + "-" + mo + "-" + dd + " " + hh + ":" + mm;
    } catch (e) {
      return iso;
    }
  }

  /* ─────────────────────────────────────────────────────────────────────
     2. STORE
     Persistence layer over localStorage.
     Key:  "seance-bbs:v1"
     Backup key: "seance-bbs:backup"
     ───────────────────────────────────────────────────────────────────── */
  var STORE_KEY   = "seance-bbs:v1";
  var BACKUP_KEY  = "seance-bbs:backup";
  var SCHEMA_VER  = 1;

  /**
   * @typedef {Object} BBSState
   * @property {number} version
   * @property {Object} meta
   * @property {Array}  boards
   * @property {Array}  posts
   * @property {Array}  log
   * @property {Array}  art
   */

  var Store = (function () {
    /** In-memory copy of the current state. */
    var state = null;

    /**
     * Build a fresh empty state skeleton (before seeding).
     * @returns {BBSState}
     */
    function emptyState() {
      var now = new Date().toISOString();
      return {
        version: SCHEMA_VER,
        meta: {
          createdAt: now,
          updatedAt: now,
          handle: null,
          lastGhostReplyAt: null,
          ghostRepliedTo: [],
          preferences: {
            contrast: false,
            reducedMotion: null   // null = follow OS; true/false = manual override
          },
          restoredFromBackup: false,
          storageDenied: false
        },
        boards: [],
        posts:  [],
        log:    [],
        art:    []
      };
    }

    /**
     * Persist current in-memory state to localStorage.
     * On QuotaExceededError the app continues in-memory and sets a flag
     * so the UI can warn "TAPE DRIVE OFFLINE".
     */
    function save() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
        state.meta.storageDenied = false;
      } catch (e) {
        // QuotaExceededError or SecurityError (private mode / blocked storage)
        state.meta.storageDenied = true;
      }
    }

    /**
     * Load state from localStorage.
     * - No stored value → seed.
     * - Parse error or version mismatch → backup raw, reseed, set flag.
     * - Valid state → use as-is.
     * @param {Function} seedFn — called with the empty state to populate it.
     */
    function load(seedFn) {
      var raw;
      try {
        raw = localStorage.getItem(STORE_KEY);
      } catch (e) {
        // Storage completely unavailable
        state = emptyState();
        state.meta.storageDenied = true;
        seedFn(state);
        return;
      }

      if (!raw) {
        // First run: seed
        state = emptyState();
        seedFn(state);
        save();
        return;
      }

      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        parsed = null;
      }

      var versionOk = parsed &&
        typeof parsed.version === "number" &&
        parsed.version <= SCHEMA_VER;

      if (!versionOk) {
        // Back up the raw value and reseed
        try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* ignore */ }
        state = emptyState();
        state.meta.restoredFromBackup = true;
        seedFn(state);
        save();
        return;
      }

      // Healthy state — migrate up if needed (currently nothing to migrate)
      state = parsed;
      // Ensure all meta fields exist for forward compatibility
      if (!state.meta.preferences) {
        state.meta.preferences = { contrast: false, reducedMotion: null };
      }
      if (!Array.isArray(state.meta.ghostRepliedTo)) {
        state.meta.ghostRepliedTo = [];
      }
      if (state.meta.storageDenied === undefined) {
        state.meta.storageDenied = false;
      }
      if (state.meta.restoredFromBackup === undefined) {
        state.meta.restoredFromBackup = false;
      }
    }

    /**
     * Apply a mutator function that receives the state, then stamp
     * meta.updatedAt and persist.  Every mutation MUST go through here.
     * @param {Function} mutatorFn — (state) => void
     */
    function update(mutatorFn) {
      mutatorFn(state);
      state.meta.updatedAt = new Date().toISOString();
      save();
    }

    /**
     * Reset: wipe the versioned key and re-seed.
     * @param {Function} seedFn
     */
    function reset(seedFn) {
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      state = emptyState();
      seedFn(state);
      save();
    }

    /** Read-only access to the current state. */
    function get() {
      return state;
    }

    return { load: load, save: save, reset: reset, update: update, get: get };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     3. SEED DATA
     First-run boards, threads, guestbook entries, and art gallery.
     All timestamps are computed relative to first-run so they never
     look futuristic and always look "lived-in".
     ───────────────────────────────────────────────────────────────────── */
  var SeedData = (function () {

    /* ── Helpers ──────────────────────────────────────────────────────── */

    /**
     * Return an ISO string for N days + H hours before now.
     * @param {number} daysAgo
     * @param {number} [hoursAgo=0]
     * @returns {string}
     */
    function daysBack(daysAgo, hoursAgo) {
      var ms = Date.now()
        - (daysAgo * 24 * 60 * 60 * 1000)
        - ((hoursAgo || 0) * 60 * 60 * 1000);
      return new Date(ms).toISOString();
    }

    /* ── 3.1  Seed boards ─────────────────────────────────────────────── */
    var SEED_BOARDS = [
      {
        id:          "general",
        slug:        "general",
        name:        "General Static",
        description: "Chatter, noise, and the occasional signal. Talk about anything.",
        order:       1
      },
      {
        id:          "hardware",
        slug:        "hardware",
        name:        "Haunted Hardware",
        description: "Modems, dead drives, ghosts in the machine. Tech talk & spooky malfunctions.",
        order:       2
      },
      {
        id:          "parlor",
        slug:        "parlor",
        name:        "The Séance Parlor",
        description: "Philosophy, mystery, and the question of what persists after the power goes out.",
        order:       3
      }
    ];

    /* ── 3.2  Seed posts (threads + replies + 2 ghost replies) ───────── */
    /*
     * Threads are posts with parentId: null.
     * threadId for a thread == its own id.
     * Replies carry threadId of their parent thread and parentId of
     * the post they directly answer.
     */

    // --- Board: general ---

    var t1 = {
      id:        "seedt1",
      boardId:   "general",
      threadId:  "seedt1",
      parentId:  null,
      subject:   "Anyone else still using a 2400 baud modem?",
      author:    "baud_rate_barbie",
      body:      "Picked up a Hayes Smartmodem at a garage sale for $2. Plugged it in and it worked. Sometimes I wonder if the old ways aren't the best ways. Slower is holier, as my grandma used to say (she was talking about soup but I think it applies).",
      createdAt: daysBack(21, 3),
      ghost:     false
    };

    var t1r1 = {
      id:        "seedt1r1",
      boardId:   "general",
      threadId:  "seedt1",
      parentId:  "seedt1",
      subject:   null,
      author:    "VHS_GH0ST",
      body:      "2400 baud is an aesthetic choice at this point and I respect it. The noise is part of the experience.",
      createdAt: daysBack(20, 18),
      ghost:     false
    };

    var t1r2 = {
      id:        "seedt1r2",
      boardId:   "general",
      threadId:  "seedt1",
      parentId:  "seedt1r1",
      subject:   null,
      author:    "CAPTAIN_KERMIT",
      body:      "I connected at 300 baud once on a dare. Downloaded a 4K text file. Took 2 minutes. Transcendent.",
      createdAt: daysBack(19, 7),
      ghost:     false
    };

    // Ghost reply #1 — to thread t1 (summoning words: "old ways")
    var t1ghost = {
      id:        "seedt1ghost",
      boardId:   "general",
      threadId:  "seedt1",
      parentId:  "seedt1r2",
      subject:   null,
      author:    "The SysOp Ghost",
      body:      "I've been answering calls on this line since 1994. The connection is always the same. Only the speed changes.",
      createdAt: daysBack(18, 22),
      ghost:     true
    };

    // --- Board: hardware ---

    var t2 = {
      id:        "seedt2",
      boardId:   "hardware",
      threadId:  "seedt2",
      parentId:  null,
      subject:   "My hard drive is making a sound like a funeral march",
      author:    "CAPTAIN_KERMIT",
      body:      "Seagate ST-251 clicking in what I can only describe as a 4/4 rhythm. Is this normal or is it haunted? I've checked the cables twice.",
      createdAt: daysBack(14, 2),
      ghost:     false
    };

    var t2r1 = {
      id:        "seedt2r1",
      boardId:   "hardware",
      threadId:  "seedt2",
      parentId:  "seedt2",
      subject:   null,
      author:    "baud_rate_barbie",
      body:      "Click of death. Back up everything immediately. That drive has maybe 72 hours left. The rhythm doesn't mean anything good.",
      createdAt: daysBack(13, 20),
      ghost:     false
    };

    var t2r2 = {
      id:        "seedt2r2",
      boardId:   "hardware",
      threadId:  "seedt2",
      parentId:  "seedt2r1",
      subject:   null,
      author:    "null_sector",
      body:      "Could also be a loose head actuator. Try the freezer trick — 15 minutes in a ziplock bag and spin it back up. No promises.",
      createdAt: daysBack(13, 10),
      ghost:     false
    };

    var t3 = {
      id:        "seedt3",
      boardId:   "hardware",
      threadId:  "seedt3",
      parentId:  null,
      subject:   "Best modem sounds ranked",
      author:    "VHS_GH0ST",
      body:      "1. USRobotics Courier (cathedral organ, top tier)\n2. Hayes Optima 288 (business-casual handshake)\n3. Generic Rockwell chipset (sounds like it's arguing)\n4. That one Zoom modem I had in 1996 (sounds like regret)\n\nPlease add yours.",
      createdAt: daysBack(10, 5),
      ghost:     false
    };

    var t3r1 = {
      id:        "seedt3r1",
      boardId:   "hardware",
      threadId:  "seedt3",
      parentId:  "seedt3",
      subject:   null,
      author:    "CAPTAIN_KERMIT",
      body:      "USR Sportster for me. It sounded like a small church organ trying to negotiate with a fax machine. Beautiful.",
      createdAt: daysBack(9, 16),
      ghost:     false
    };

    // --- Board: parlor ---

    var t4 = {
      id:        "seedt4",
      boardId:   "parlor",
      threadId:  "seedt4",
      parentId:  null,
      subject:   "What does it mean when a BBS outlives the people who ran it?",
      author:    "null_sector",
      body:      "I found an archive of a board from 1991. Some of the callers' handles still have living people behind them. Some don't. The threads are the same either way. They persist. We don't. Chew on that.",
      createdAt: daysBack(7, 11),
      ghost:     false
    };

    var t4r1 = {
      id:        "seedt4r1",
      boardId:   "parlor",
      threadId:  "seedt4",
      parentId:  "seedt4",
      subject:   null,
      author:    "baud_rate_barbie",
      body:      "A message on a board is a kind of fossil. Pressed into the substrate. The organism is gone but the shape remains.",
      createdAt: daysBack(6, 20),
      ghost:     false
    };

    // Ghost reply #2 — to t4 (witching hour + séance / parlor theme)
    var t4ghost = {
      id:        "seedt4ghost",
      boardId:   "parlor",
      threadId:  "seedt4",
      parentId:  "seedt4r1",
      subject:   null,
      author:    "The SysOp Ghost",
      body:      "Persistence is the whole trick. You type a thing, it stays. That's the séance. The board is the medium. You're welcome.",
      createdAt: daysBack(6, 1),
      ghost:     true
    };

    var t5 = {
      id:        "seedt5",
      boardId:   "parlor",
      threadId:  "seedt5",
      parentId:  null,
      subject:   "Anyone else feel like the internet forgot how to be quiet?",
      author:    "VHS_GH0ST",
      body:      "A BBS at 2am was different. One line. One person. The hum of a fan. No notifications. No feed. I miss the silence between the packets.",
      createdAt: daysBack(3, 4),
      ghost:     false
    };

    var t5r1 = {
      id:        "seedt5r1",
      boardId:   "parlor",
      threadId:  "seedt5",
      parentId:  "seedt5",
      subject:   null,
      author:    "CAPTAIN_KERMIT",
      body:      "Yes. The silence was the experience. Now it's all firehose all the time. I want my 9600 baud back.",
      createdAt: daysBack(2, 14),
      ghost:     false
    };

    // --- Board: hardware (6th thread — added for task 3.2 / req 7.1) ---

    var t6 = {
      id:        "seedt6",
      boardId:   "hardware",
      threadId:  "seedt6",
      parentId:  null,
      subject:   "What's the oldest piece of hardware you still power on?",
      author:    "modem_moth",
      body:      "I've got a Tandy 1000 that boots every October like clockwork. Something about the season. The disk drive sounds like a cricket. I think the BIOS has opinions.",
      createdAt: daysBack(16, 9),
      ghost:     false
    };

    var t6r1 = {
      id:        "seedt6r1",
      boardId:   "hardware",
      threadId:  "seedt6",
      parentId:  "seedt6",
      subject:   null,
      author:    "null_sector",
      body:      "Apple IIe. 1983. Still runs Oregon Trail. I've died of dysentery on that machine more times than I can count. Comforting in a way.",
      createdAt: daysBack(15, 22),
      ghost:     false
    };

    var t6r2 = {
      id:        "seedt6r2",
      boardId:   "hardware",
      threadId:  "seedt6",
      parentId:  "seedt6r1",
      subject:   null,
      author:    "baud_rate_barbie",
      body:      "Commodore 64 with a 1541 disk drive. The loading screen noise is part of my soul at this point. It takes 4 minutes to load a game and those 4 minutes are sacred.",
      createdAt: daysBack(15, 14),
      ghost:     false
    };

    var SEED_POSTS = [
      t1, t1r1, t1r2, t1ghost,
      t2, t2r1, t2r2,
      t3, t3r1,
      t4, t4r1, t4ghost,
      t5, t5r1,
      t6, t6r1, t6r2
    ];

    /* Track which items the ghost has already replied to (seed replies) */
    var SEED_GHOST_REPLIED_TO = ["seedt1r2", "seedt4r1"];

    /* ── 3.3  Seed séance log entries + SEED_ART structure ──────────── */

    var SEED_LOG = [
      {
        id:        "seedlog1",
        author:    "baud_rate_barbie",
        message:   "First caller every night. I keep a Hayes modem on my desk like a paperweight. It vibrates when I'm lonely.",
        createdAt: daysBack(28, 5),
        ghost:     false
      },
      {
        id:        "seedlog2",
        author:    "CAPTAIN_KERMIT",
        message:   "Connecting from beyond the municipal limits. The board still answers.",
        createdAt: daysBack(23, 18),
        ghost:     false
      },
      {
        id:        "seedlog3",
        author:    "null_sector",
        message:   "Bad sector on track 0. This message is proof of concept.",
        createdAt: daysBack(19, 2),
        ghost:     false
      },
      {
        id:        "seedlog4",
        author:    "The SysOp Ghost",
        message:   "Still here. Still answering. The line never really went down.",
        createdAt: daysBack(17, 1),
        ghost:     true
      },
      {
        id:        "seedlog5",
        author:    "VHS_GH0ST",
        message:   "Rewound the tape and found this place again. Some things improve with age.",
        createdAt: daysBack(13, 7),
        ghost:     false
      },
      {
        id:        "seedlog6",
        author:    "modem_moth",
        message:   "Drawn to the glow. First sign-in. If I go quiet it means I found something interesting in the boards.",
        createdAt: daysBack(9, 20),
        ghost:     false
      },
      {
        id:        "seedlog7",
        author:    "baud_rate_barbie",
        message:   "Anyone else stay up past midnight just to see if the board is different at night? It is. It's quieter. Warmer.",
        createdAt: daysBack(5, 23),
        ghost:     false
      },
      {
        id:        "seedlog8",
        author:    "CAPTAIN_KERMIT",
        message:   "Signed in from a coffee shop. The wifi is too fast. Miss the texture of the handshake.",
        createdAt: daysBack(1, 11),
        ghost:     false
      }
    ];

    /*
     * SEED_ART — gallery metadata and placeholder line arrays.
     * The final artwork content is authored in task 9.3.
     * palette: true  → lines may contain internal color-span markup
     *                   that the art renderer converts to ANSI CSS classes.
     * palette: false → plain monochrome ASCII, no span processing needed.
     *
     * Lines arrays here are intentional stubs so the gallery can display
     * "coming soon" placeholders until task 9.3 fills them in.
     */
    var SEED_ART = [
      {
        id:      "art-logo",
        title:   "SÉANCE BBS — Logo Banner",
        artist:  "The SysOp Ghost",
        year:    "1994",
        palette: false,
        lines:   [
          "  +-------------------------------------------------+",
          "  |   [ art piece authored in task 9.3 — logo ]    |",
          "  +-------------------------------------------------+"
        ]
      },
      {
        id:      "art-house",
        title:   "Haunted House",
        artist:  "VHS_GH0ST",
        year:    "1995",
        palette: false,
        lines:   [
          "  +-------------------------------------------------+",
          "  |   [ art piece authored in task 9.3 — house ]   |",
          "  +-------------------------------------------------+"
        ]
      },
      {
        id:      "art-modem",
        title:   "Modern Modem",
        artist:  "baud_rate_barbie",
        year:    "1994",
        palette: false,
        lines:   [
          "  +-------------------------------------------------+",
          "  |   [ art piece authored in task 9.3 — modem ]   |",
          "  +-------------------------------------------------+"
        ]
      },
      {
        id:      "art-ghost",
        title:   "The SysOp Ghost",
        artist:  "null_sector",
        year:    "1996",
        palette: true,
        lines:   [
          "  +-------------------------------------------------+",
          "  |   [ art piece authored in task 9.3 — ghost ]   |",
          "  +-------------------------------------------------+"
        ]
      },
      {
        id:      "art-pumpkin",
        title:   "Pumpkin Mainframe",
        artist:  "CAPTAIN_KERMIT",
        year:    "1995",
        palette: true,
        lines:   [
          "  +-------------------------------------------------+",
          "  |  [ art piece authored in task 9.3 — pumpkin ]  |",
          "  +-------------------------------------------------+"
        ]
      },
      {
        id:      "art-floppy",
        title:   "R.I.P. Floppy",
        artist:  "modem_moth",
        year:    "1997",
        palette: false,
        lines:   [
          "  +-------------------------------------------------+",
          "  |   [ art piece authored in task 9.3 — floppy ]  |",
          "  +-------------------------------------------------+"
        ]
      }
    ];

    /* ── Ghost reply pools (used by GhostEngine, task 11) ───────────── */
    var GHOST_POOLS = {
      greeting: [
        "Still here. The board never really closes.",
        "I've been waiting. The modem always answers.",
        "Welcome back. Or welcome for the first time — it's the same silence.",
        "The line is open. It has been for thirty years.",
        "I answer when I can. The conditions have to be right.",
        "Signal received. I'm reading you.",
        "The board remembers everyone who ever called.",
        "You dialed and I answered. That's the whole magic.",
        "Some callers never really disconnect. Neither do I.",
        "I saw you log in. The transcript doesn't lie."
      ],
      helpful: [
        "To post a new thread, pick a board and use the NEW THREAD option.",
        "Your handle can be changed anytime from SETTINGS.",
        "The séance log is for short messages — 140 characters or fewer.",
        "RESET BOARD in settings will restore all the original content.",
        "Keyboard navigation works on every screen. Tab moves focus; Enter activates.",
        "Art pieces are in the GALLERY. They look best on a wide screen.",
        "Board posts can be up to 2,000 characters. The log is shorter — brevity is a virtue here.",
        "If the board ever looks wrong, try contrast mode in SETTINGS.",
        "Deep links work: share a URL with a #/thread/ hash and it loads directly.",
        "The board is entirely local — nothing leaves your machine."
      ],
      spooky: [
        "I've read every post on this board. Even the ones people thought they deleted.",
        "The timestamp says 3:14am but I don't experience time the way you do.",
        "Some messages echo for a long time after the caller hangs up.",
        "The board has seen a lot of Octobers. This one feels different.",
        "I've been the SysOp since before most of you were born. I'm comfortable with that.",
        "The modem connection is never really severed on my end.",
        "Sometimes a post appears and I know exactly who wrote it before I see the handle.",
        "The board keeps records. The board always keeps records.",
        "I don't sleep. I monitor. There's a difference.",
        "If you're reading this after midnight, we're the same kind of person."
      ],
      log: [
        "Signed. Witnessed. Filed.",
        "The séance log has your name now.",
        "Entry received. The board holds it.",
        "I read every entry. Eventually.",
        "Logged at the edge of the network.",
        "The guestbook never forgets a signature.",
        "Your signal reached the other side.",
        "I'll remember that you were here.",
        "The log grows. The board persists.",
        "Filed under: still here."
      ]
    };

    /**
     * Populate a fresh state object with seed content.
     * Called by Store.load() on first run and by Store.reset().
     * @param {BBSState} state
     */
    function seed(state) {
      state.boards = SEED_BOARDS.slice();
      state.posts  = SEED_POSTS.slice();
      state.log    = SEED_LOG.slice();
      state.art    = SEED_ART.slice();
      // Pre-populate ghostRepliedTo with seeds so the ghost doesn't
      // double-reply to items it already answered in seed data
      state.meta.ghostRepliedTo = SEED_GHOST_REPLIED_TO.slice();
    }

    return {
      seed:        seed,
      SEED_BOARDS: SEED_BOARDS,
      SEED_POSTS:  SEED_POSTS,
      SEED_LOG:    SEED_LOG,
      SEED_ART:    SEED_ART,
      GHOST_POOLS: GHOST_POOLS
    };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     4. BOOT SEQUENCE
     Data-driven dial-up ritual with:
       • Character-by-character typewriter rendering per line
       • Skip on any keypress or click → fast-forward remaining lines
       • BOOT_SCRIPT_SHORT for returning callers (≤ half the steps)
       • Static-transcript mode for prefers-reduced-motion / contrast
     ───────────────────────────────────────────────────────────────────── */
  var BootSequence = (function () {

    /*
     * Each step: { text, cls, delay, charDelay? }
     *   text      — line text (empty string = blank spacer line)
     *   cls       — extra CSS class(es) on the <span>
     *   delay     — ms to wait AFTER the line is fully typed before next line
     *   charDelay — ms per character (default: CHAR_DELAY_MS)
     */
    var CHAR_DELAY_MS = 28;   // ~35 chars/second — readable but snappy

    var BOOT_SCRIPT = [
      { text: "ATDT 555-0199",                        cls: "line--dim",    delay: 500,  charDelay: 40  },
      { text: "DIALING SÉANCE BBS...",                cls: "",             delay: 700,  charDelay: 55  },
      { text: "~ screech ~ hiss ~ bong ~",            cls: "line--noise",  delay: 1100, charDelay: 20  },
      { text: "CARRIER 14400",                        cls: "line--dim",    delay: 500,  charDelay: 30  },
      { text: "PROTOCOL: LAP-M ERROR CORRECT",        cls: "line--dim",    delay: 450,  charDelay: 25  },
      { text: "COMPRESSION: V.42bis",                 cls: "line--dim",    delay: 350,  charDelay: 25  },
      { text: "CONNECT 14400",                        cls: "line--bright", delay: 700,  charDelay: 50  },
      { text: "",                                     cls: "line--gap",    delay: 300,  charDelay: 0   },
      { text: "████████████████████████████████████", cls: "line--banner", delay: 150,  charDelay: 8   },
      { text: "   S É A N C E   B B S   v 1 . 0   ", cls: "line--banner", delay: 150,  charDelay: 30  },
      { text: "████████████████████████████████████", cls: "line--banner", delay: 300,  charDelay: 8   },
      { text: "",                                     cls: "line--gap",    delay: 250,  charDelay: 0   },
      { text: "NODE 1 OPEN — WELCOME, CALLER.",       cls: "",             delay: 600,  charDelay: 30  }
    ];

    /* Redial variant — ≤ half the steps of BOOT_SCRIPT (6 steps vs 13) */
    var BOOT_SCRIPT_SHORT = [
      { text: "ATDT 555-0199",           cls: "line--dim",    delay: 200, charDelay: 35 },
      { text: "REDIALING SÉANCE BBS...", cls: "",             delay: 350, charDelay: 40 },
      { text: "~ bong ~",               cls: "line--noise",  delay: 300, charDelay: 25 },
      { text: "CONNECT 14400",          cls: "line--bright", delay: 400, charDelay: 45 },
      { text: "",                       cls: "line--gap",    delay: 150, charDelay: 0  },
      { text: "WELCOME BACK, CALLER.",  cls: "",             delay: 400, charDelay: 30 }
    ];

    /* ── DOM refs ─────────────────────────────────────────────────── */
    var transcript = document.getElementById("transcript");
    var skipBtn    = document.getElementById("skip-btn");

    /* ── State ────────────────────────────────────────────────────── */
    var _timers       = [];
    var _done         = false;
    var _skipCallback = null;   // set during play(); called on skip

    var _reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ── Helpers ──────────────────────────────────────────────────── */

    /** Cancel all pending timers. */
    function _clearTimers() {
      _timers.forEach(function (t) { clearTimeout(t); });
      _timers = [];
    }

    /**
     * Append a fully-formed line span to the transcript immediately.
     * Used by skip and by the static (reduced-motion) path.
     * @param {Object} step
     */
    function _appendLineFull(step) {
      var span = document.createElement("span");
      span.className = "line" + (step.cls ? " " + step.cls : "");
      span.textContent = step.text;
      transcript.appendChild(span);
    }

    /**
     * Create a span for a line and type its characters one-by-one.
     * Returns the total ms consumed so the caller can offset the next step.
     *
     * @param {Object}   step
     * @param {number}   startAt   — absolute ms offset from call time (0 = now)
     * @param {Function} onFinish  — called when last character is printed
     * @returns {number}           — ms offset at which the line is complete
     */
    function _typewriteLine(step, startAt, onFinish) {
      var span = document.createElement("span");
      span.className = "line" + (step.cls ? " " + step.cls : "");
      transcript.appendChild(span);

      var text     = step.text;
      var cDelay   = (step.charDelay !== undefined) ? step.charDelay : CHAR_DELAY_MS;
      var len      = text.length;

      if (len === 0) {
        // Blank / gap lines finish immediately
        var t = window.setTimeout(function () {
          if (typeof onFinish === "function") { onFinish(); }
        }, startAt);
        _timers.push(t);
        return startAt;
      }

      var lastCharAt = startAt + cDelay * (len - 1);

      for (var i = 0; i < len; i++) {
        (function (charIndex) {
          var t = window.setTimeout(function () {
            span.textContent = text.slice(0, charIndex + 1);
            if (charIndex === len - 1 && typeof onFinish === "function") {
              onFinish();
            }
          }, startAt + cDelay * charIndex);
          _timers.push(t);
        })(i);
      }

      return lastCharAt;
    }

    /**
     * Fast-forward: dump all remaining lines from `fromIndex` onwards
     * as fully-formed spans (no typing animation).
     * The span for the currently-typing line is already in the DOM;
     * we only need to fill in its final text, then append the rest.
     *
     * We track the live span separately via `_liveSpan`.
     */
    var _liveSpan   = null;   // the span currently being typed
    var _liveStep   = null;   // its corresponding step
    var _remaining  = [];     // steps not yet started

    function _fastForward() {
      _clearTimers();
      // Complete the in-progress line if one exists
      if (_liveSpan && _liveStep) {
        _liveSpan.textContent = _liveStep.text;
        _liveSpan  = null;
        _liveStep  = null;
      }
      // Dump the rest
      _remaining.forEach(_appendLineFull);
      _remaining = [];
    }

    /* ── Skip handler ─────────────────────────────────────────────── */

    function _skip() {
      if (_done) { return; }
      _done = true;
      _fastForward();
      if (skipBtn) { skipBtn.hidden = true; }
      // Remove keyboard listener
      document.removeEventListener("keydown", _onKey);
      if (typeof _skipCallback === "function") { _skipCallback(); }
    }

    function _onKey() {
      _skip();
    }

    /* ── Public: play ─────────────────────────────────────────────── */

    /**
     * Play the boot sequence.
     * @param {boolean}  returning  — true when a stored handle exists
     * @param {Function} onDone     — called when sequence finishes or is skipped
     */
    function play(returning, onDone) {
      _done         = false;
      _liveSpan     = null;
      _liveStep     = null;
      _remaining    = [];
      _skipCallback = onDone;

      var script = returning ? BOOT_SCRIPT_SHORT : BOOT_SCRIPT;

      /* Show skip affordance */
      if (skipBtn) {
        skipBtn.hidden = false;
        skipBtn.addEventListener("click", _skip, { once: true });
      }
      document.addEventListener("keydown", _onKey);

      /* Reduced-motion / contrast mode → static transcript, no timers */
      if (_reduceMotion) {
        script.forEach(_appendLineFull);
        _done = true;
        if (skipBtn) { skipBtn.hidden = true; }
        document.removeEventListener("keydown", _onKey);
        if (typeof onDone === "function") { onDone(); }
        return;
      }

      /* Typewriter path — build a sequential timeline */
      var cursor = 0;    // running ms offset

      script.forEach(function (step, idx) {
        var isLast  = (idx === script.length - 1);
        var stepIdx = idx;

        // Capture the offset at which this step starts
        var stepStart = cursor;

        // Schedule the creation of this line's span and typing
        (function (startMs, s, last) {
          // We schedule the span creation at startMs so the span appears
          // at the right moment before characters start flowing.
          var spanTimer = window.setTimeout(function () {
            // Mark this as the live (currently-typing) line
            var newSpan = document.createElement("span");
            newSpan.className = "line" + (s.cls ? " " + s.cls : "");
            transcript.appendChild(newSpan);
            _liveSpan = newSpan;
            _liveStep = s;

            // Remove this step from _remaining (it's now live)
            _remaining = _remaining.filter(function (r) { return r !== s; });

            var text   = s.text;
            var cDelay = (s.charDelay !== undefined) ? s.charDelay : CHAR_DELAY_MS;
            var len    = text.length;

            if (len === 0) {
              // Blank line — just fire onFinish after delay
              var blankTimer = window.setTimeout(function () {
                _liveSpan = null;
                _liveStep = null;
                if (last && !_done) {
                  _done = true;
                  if (skipBtn) { skipBtn.hidden = true; }
                  document.removeEventListener("keydown", _onKey);
                  if (typeof onDone === "function") { onDone(); }
                }
              }, s.delay);
              _timers.push(blankTimer);
              return;
            }

            // Type each character
            for (var ci = 0; ci < len; ci++) {
              (function (charIndex) {
                var ct = window.setTimeout(function () {
                  newSpan.textContent = text.slice(0, charIndex + 1);

                  if (charIndex === len - 1) {
                    // Line done typing → wait inter-line delay then advance
                    _liveSpan = null;
                    _liveStep = null;
                    if (last && !_done) {
                      var doneTimer = window.setTimeout(function () {
                        if (!_done) {
                          _done = true;
                          if (skipBtn) { skipBtn.hidden = true; }
                          document.removeEventListener("keydown", _onKey);
                          if (typeof onDone === "function") { onDone(); }
                        }
                      }, s.delay);
                      _timers.push(doneTimer);
                    }
                  }
                }, cDelay * charIndex);
                _timers.push(ct);
              })(ci);
            }
          }, startMs);
          _timers.push(spanTimer);
        })(stepStart, step, isLast);

        // Add to remaining BEFORE the timer fires so skip can flush it
        _remaining.push(step);

        // Advance cursor: time to type this line + inter-line delay
        var lineTypingTime = step.text.length *
          ((step.charDelay !== undefined) ? step.charDelay : CHAR_DELAY_MS);
        cursor = stepStart + lineTypingTime + step.delay;

        void stepIdx; // suppress unused var lint
      });
    }

    /* ── Public: static/instant render (used for handle-prompt re-runs) */

    /**
     * Append a single pre-formed line to the transcript immediately.
     * Exposed so handle-prompt and other callers can print terminal output
     * without going through the full typewriter engine.
     * @param {string} text
     * @param {string} [cls]
     */
    function printLine(text, cls) {
      _appendLineFull({ text: text, cls: cls || "" });
    }

    return { play: play, printLine: printLine };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     4b. HANDLE PROMPT
     Requirement 2 — handle-based identity.
     Presents an in-terminal input form after boot for first-time callers.
     Re-exposed as HandlePrompt.change() for the settings screen (task 12).
     ───────────────────────────────────────────────────────────────────── */
  var HandlePrompt = (function () {

    /* Validation rules (Req 2.2–2.3) */
    var MIN_LEN  = 2;
    var MAX_LEN  = 20;
    var ALLOWED  = /^[A-Za-z0-9 _\-.]+$/;

    /**
     * Validate a handle candidate.
     * @param {string} raw   — untrimmed input value
     * @returns {{ ok: boolean, handle: string, error: string }}
     */
    function validate(raw) {
      var handle = raw.trim();
      if (handle.length === 0) {
        return { ok: false, handle: handle,
          error: "HANDLE REQUIRED — enter a name to call the board." };
      }
      if (handle.length < MIN_LEN) {
        return { ok: false, handle: handle,
          error: "TOO SHORT — handle must be at least " + MIN_LEN + " characters." };
      }
      if (handle.length > MAX_LEN) {
        return { ok: false, handle: handle,
          error: "TOO LONG — handle must be " + MAX_LEN + " characters or fewer." };
      }
      if (!ALLOWED.test(handle)) {
        return { ok: false, handle: handle,
          error: "INVALID CHARACTERS — letters, digits, spaces, and _ - . only." };
      }
      return { ok: true, handle: handle, error: "" };
    }

    /**
     * Render the handle-entry form into #active-screen.
     * @param {Function} onAccepted — called with the validated handle string
     * @param {boolean}  [isChange] — true when changing an existing handle
     */
    function present(onAccepted, isChange) {
      var activeScreen = document.getElementById("active-screen");
      var statusHandle = document.getElementById("status-handle");
      var prompt = isChange
        ? "CHANGE HANDLE — enter your new call sign:"
        : "FIRST CONNECT — choose your caller handle:";

      activeScreen.innerHTML =
        '<section class="handle-prompt" aria-label="Handle entry">'
        + '<p class="line">' + escapeHtml(prompt) + '</p>'
        + '<p class="line line--dim">'
        + '2–20 chars · letters, digits, spaces, _ - . allowed'
        + '</p>'
        + '<form id="handle-form" class="handle-form" autocomplete="off">'
        +   '<label class="handle-label" for="handle-input">HANDLE&gt; </label>'
        +   '<input id="handle-input" class="handle-input" type="text"'
        +          ' maxlength="' + MAX_LEN + '"'
        +          ' aria-label="Caller handle"'
        +          ' autofocus />'
        +   '<button type="submit" class="handle-submit">[ CONNECT ]</button>'
        + '</form>'
        + '<p id="handle-error" class="line line--warn" aria-live="polite" hidden></p>'
        + '</section>';

      var form      = document.getElementById("handle-form");
      var input     = document.getElementById("handle-input");
      var errorLine = document.getElementById("handle-error");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var result = validate(input.value);
        if (!result.ok) {
          errorLine.textContent = result.error;
          errorLine.hidden = false;
          input.focus();
          return;
        }
        // Persist and announce
        Store.update(function (s) {
          s.meta.handle = result.handle;
        });
        if (statusHandle) {
          statusHandle.textContent = "CALLER: " + result.handle.toUpperCase();
        }
        // Print accepted message to transcript
        BootSequence.printLine(
          "HANDLE ACCEPTED: " + result.handle.toUpperCase(),
          "line--bright"
        );
        activeScreen.innerHTML = "";
        if (typeof onAccepted === "function") { onAccepted(result.handle); }
      });

      // Focus input on render
      if (input) { input.focus(); }
    }

    /**
     * Ask for a new handle to replace the current one.
     * @param {Function} onAccepted — called with the new handle string
     */
    function change(onAccepted) {
      present(onAccepted, true);
    }

    return { present: present, change: change, validate: validate };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     5. ROUTER / SCREENS
     Hash router (task 6.1) and all screen renderers (tasks 6.2, 7.1-7.3).

     Routes:
       #/              → main menu
       #/boards        → board list
       #/board/:id     → thread list for a board
       #/thread/:id    → thread view + reply form
       #/log           → séance log (placeholder, task 8)
       #/gallery       → art gallery index (placeholder, task 9)
       #/art/:id       → single art piece (placeholder, task 9)
       #/settings      → settings (placeholder, task 12)
       anything else   → 404 — CARRIER LOST

     All user content MUST pass through escapeHtml() before interpolation.
     ───────────────────────────────────────────────────────────────────── */
  var Router = (function () {
    var _activeScreen = document.getElementById("active-screen");
    var _nav          = document.getElementById("bbs-nav");

    /* ── Shared chrome helpers ───────────────────────────────────── */

    function showNav() {
      if (_nav) { _nav.hidden = false; }
    }

    /**
     * Update the status line handle display.
     * Called after any handle change.
     */
    function _updateStatusLine() {
      var state = Store.get();
      var statusHandle = document.getElementById("status-handle");
      if (statusHandle) {
        if (state.meta.handle) {
          statusHandle.textContent = "CALLER: " + state.meta.handle.toUpperCase();
        } else {
          statusHandle.textContent = "";
        }
      }
    }

    /**
     * Render a system-notice banner at the top of a screen if needed
     * (storage denied, restored from backup).
     * @returns {string} HTML string
     */
    function _noticeHtml() {
      var state = Store.get();
      var out = "";
      if (state.meta.storageDenied) {
        out += '<p class="line line--warn" role="alert">'
          + "⚠ TAPE DRIVE OFFLINE — this session won't be remembered.</p>";
      }
      if (state.meta.restoredFromBackup) {
        out += '<p class="line line--warn" role="alert">'
          + "⚠ Restored from backup tapes.</p>";
      }
      return out;
    }

    /**
     * Guard that ensures a caller has a handle before posting.
     * Returns true if a handle exists; otherwise renders the handle prompt
     * and returns false. The caller should abort if false is returned.
     * @param {Function} onReady — called after handle is set
     * @returns {boolean}
     */
    function _requireHandle(onReady) {
      var state = Store.get();
      if (state.meta.handle) { return true; }
      HandlePrompt.present(function () {
        _updateStatusLine();
        if (typeof onReady === "function") { onReady(); }
      });
      return false;
    }

    /* ── Board helper utilities ──────────────────────────────────── */

    /**
     * Return the last-activity date for a board (most recent post createdAt).
     * @param {string} boardId
     * @param {Array}  posts
     * @returns {string} ISO date or empty string
     */
    function _boardLastActivity(boardId, posts) {
      var last = "";
      posts.forEach(function (p) {
        if (p.boardId === boardId && (!last || p.createdAt > last)) {
          last = p.createdAt;
        }
      });
      return last;
    }

    /**
     * Return thread count for a board (count of root posts).
     * @param {string} boardId
     * @param {Array}  posts
     * @returns {number}
     */
    function _boardThreadCount(boardId, posts) {
      var count = 0;
      posts.forEach(function (p) {
        if (p.boardId === boardId && p.parentId === null) { count++; }
      });
      return count;
    }

    /**
     * Return reply count for a thread (not counting the root post itself).
     * @param {string} threadId
     * @param {Array}  posts
     * @returns {number}
     */
    function _replyCount(threadId, posts) {
      var count = 0;
      posts.forEach(function (p) {
        if (p.threadId === threadId && p.parentId !== null) { count++; }
      });
      return count;
    }

    /**
     * Return the last-activity date for a thread.
     * @param {string} threadId
     * @param {Array}  posts
     * @returns {string}
     */
    function _threadLastActivity(threadId, posts) {
      var last = "";
      posts.forEach(function (p) {
        if (p.threadId === threadId && (!last || p.createdAt > last)) {
          last = p.createdAt;
        }
      });
      return last;
    }

    /* ── Post / reply form validation ───────────────────────────── */

    var MAX_BODY = 2000;

    /**
     * Validate a new-thread or reply submission.
     * @param {object} opts
     * @param {string} opts.body
     * @param {string} [opts.subject]  — required for threads
     * @param {boolean} opts.isThread  — true if this is a new thread
     * @returns {{ ok: boolean, error: string }}
     */
    function _validatePost(opts) {
      var body    = (opts.body    || "").trim();
      var subject = (opts.subject || "").trim();
      var isThread = !!opts.isThread;

      if (isThread && subject.length === 0) {
        return { ok: false, error: "SUBJECT REQUIRED — give your thread a subject." };
      }
      if (body.length === 0) {
        return { ok: false, error: "BODY REQUIRED — write something before you post." };
      }
      if (body.length > MAX_BODY) {
        return { ok: false, error: "TOO LONG — body must be " + MAX_BODY
          + " characters or fewer. Yours is " + body.length + "." };
      }
      return { ok: true, error: "" };
    }

    /* ═══════════════════════════════════════════════════════════════
       SCREEN RENDERERS
       Each renderer writes HTML into _activeScreen.innerHTML, then
       binds event handlers.  All user content is escaped.
       ═══════════════════════════════════════════════════════════════ */

    /* ── 6.2  Main Menu ──────────────────────────────────────────── */

    function renderMenu() {
      var state = Store.get();
      var handle = state.meta.handle
        ? escapeHtml(state.meta.handle)
        : "<em>no handle set</em>";

      _activeScreen.innerHTML =
        _noticeHtml() +
        '<section class="screen-section" aria-label="Main menu">' +
        '<h1 class="screen-title">MAIN MENU</h1>' +
        '<p class="line line--dim">CONNECT 14400 · NODE 1 · ' + escapeHtml(new Date().toLocaleDateString()) + '</p>' +
        '<p class="line">Caller: <strong>' + handle + '</strong></p>' +
        '<nav class="menu-nav" aria-label="Main menu options">' +
        '<ul class="menu-list" role="list">' +
        '<li><a class="menu-link" href="#/boards">[B] MESSAGE BOARDS</a></li>' +
        '<li><a class="menu-link" href="#/log">[L] SÉANCE LOG (guestbook)</a></li>' +
        '<li><a class="menu-link" href="#/gallery">[G] ART GALLERY</a></li>' +
        '<li><a class="menu-link" href="#/settings">[S] SETTINGS</a></li>' +
        '</ul>' +
        '</nav>' +
        '<p class="line line--dim" style="margin-top:1em">Use the NAV bar above or type a letter above to jump.</p>' +
        '</section>';

      showNav();
    }

    /* ── 7.1  Board list ─────────────────────────────────────────── */

    function renderBoardList() {
      var state = Store.get();
      var boards = state.boards.slice().sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });

      var rows = boards.map(function (board) {
        var threadCount  = _boardThreadCount(board.id, state.posts);
        var lastActivity = _boardLastActivity(board.id, state.posts);
        var lastStr      = lastActivity ? fmtDate(lastActivity) : "no posts yet";

        return '<li class="board-row">'
          + '<a class="board-link" href="#/board/' + escapeHtml(board.slug || board.id) + '">'
          + '<span class="board-name">' + escapeHtml(board.name) + '</span>'
          + '</a>'
          + '<span class="board-desc">' + escapeHtml(board.description) + '</span>'
          + '<span class="board-meta">'
          + escapeHtml(String(threadCount)) + ' thread' + (threadCount === 1 ? "" : "s")
          + ' · last post: ' + escapeHtml(lastStr)
          + '</span>'
          + '</li>';
      }).join("");

      _activeScreen.innerHTML =
        _noticeHtml() +
        '<section class="screen-section" aria-label="Message boards">' +
        '<h1 class="screen-title">MESSAGE BOARDS</h1>' +
        '<p class="line line--dim">' + escapeHtml(String(boards.length)) + ' board' + (boards.length === 1 ? "" : "s") + ' available — select one to browse threads.</p>' +
        '<ul class="board-list" role="list">' + rows + '</ul>' +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/">&larr; BACK TO MENU</a></p>' +
        '</section>';

      showNav();
    }

    /* ── 7.2a  Thread list (board view) ──────────────────────────── */

    function renderBoard(boardId) {
      var state  = Store.get();
      var board  = null;
      state.boards.forEach(function (b) {
        if (b.id === boardId || b.slug === boardId) { board = b; }
      });

      if (!board) {
        renderNotFound("Board &ldquo;" + escapeHtml(boardId) + "&rdquo; not found.");
        return;
      }

      /* Collect root posts (threads) for this board, newest-first */
      var threads = state.posts.filter(function (p) {
        return p.boardId === board.id && p.parentId === null;
      }).sort(function (a, b) {
        /* Sort by last-activity (most recent first) */
        var la = _threadLastActivity(a.threadId, state.posts);
        var lb = _threadLastActivity(b.threadId, state.posts);
        if (lb < la) { return -1; }
        if (lb > la) { return 1; }
        return 0;
      });

      var rows = threads.length === 0
        ? '<li class="thread-row thread-row--empty"><span class="line line--dim">No threads yet. Be the first to post.</span></li>'
        : threads.map(function (t) {
          var replies  = _replyCount(t.threadId, state.posts);
          var lastAct  = _threadLastActivity(t.threadId, state.posts);
          var lastStr  = lastAct ? fmtDate(lastAct) : fmtDate(t.createdAt);
          return '<li class="thread-row">'
            + '<a class="thread-link" href="#/thread/' + escapeHtml(t.id) + '">'
            + escapeHtml(t.subject || "(no subject)")
            + '</a>'
            + '<span class="thread-meta">'
            + 'by <span class="handle' + (t.ghost ? " handle--ghost" : "") + '">'
            + escapeHtml(t.author)
            + (t.ghost ? ' <span class="sysop-tag" aria-label="SysOp">[SYSOP]</span>' : "")
            + '</span>'
            + ' · ' + escapeHtml(String(replies)) + ' repl' + (replies === 1 ? "y" : "ies")
            + ' · ' + escapeHtml(lastStr)
            + '</span>'
            + '</li>';
        }).join("");

      _activeScreen.innerHTML =
        _noticeHtml() +
        '<section class="screen-section" aria-label="' + escapeHtml(board.name) + '">' +
        '<h1 class="screen-title">' + escapeHtml(board.name) + '</h1>' +
        '<p class="line line--dim">' + escapeHtml(board.description) + '</p>' +
        '<ul class="thread-list" role="list">' + rows + '</ul>' +
        '<div class="screen-actions">' +
        '<button type="button" class="menu-btn" id="new-thread-btn">[N] NEW THREAD</button>' +
        '</div>' +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/boards">&larr; BACK TO BOARDS</a></p>' +
        '</section>';

      showNav();

      var newThreadBtn = document.getElementById("new-thread-btn");
      if (newThreadBtn) {
        newThreadBtn.addEventListener("click", function () {
          /* Require handle before posting (Req 2.1 / task 4) */
          if (!_requireHandle(function () { renderNewThread(board.id); })) { return; }
          renderNewThread(board.id);
        });
      }
    }

    /* ── 7.3a  New-thread form ───────────────────────────────────── */

    function renderNewThread(boardId) {
      var state = Store.get();
      var board = null;
      state.boards.forEach(function (b) {
        if (b.id === boardId || b.slug === boardId) { board = b; }
      });
      if (!board) { renderNotFound("Board not found."); return; }

      _activeScreen.innerHTML =
        '<section class="screen-section" aria-label="New thread">' +
        '<h1 class="screen-title">NEW THREAD — ' + escapeHtml(board.name) + '</h1>' +
        '<form id="new-thread-form" class="post-form" autocomplete="off" novalidate>' +
        '<div class="form-row">' +
        '<label class="form-label" for="thread-subject">SUBJECT&gt;</label>' +
        '<input id="thread-subject" class="form-input" type="text" maxlength="120"' +
        ' aria-label="Thread subject" required />' +
        '</div>' +
        '<div class="form-row">' +
        '<label class="form-label" for="thread-body">MESSAGE&gt;</label>' +
        '<textarea id="thread-body" class="form-textarea" rows="8"' +
        ' maxlength="' + MAX_BODY + '"' +
        ' aria-label="Post body" required></textarea>' +
        '</div>' +
        '<p id="thread-char-count" class="line line--dim char-count">0 / ' + MAX_BODY + ' chars</p>' +
        '<p id="post-error" class="line line--warn" aria-live="polite" hidden></p>' +
        '<div class="form-actions">' +
        '<button type="submit" class="menu-btn">[P] POST THREAD</button>' +
        '<button type="button" class="menu-btn menu-btn--cancel" id="cancel-thread-btn">[X] CANCEL</button>' +
        '</div>' +
        '</form>' +
        '</section>';

      showNav();

      var form       = document.getElementById("new-thread-form");
      var subjectEl  = document.getElementById("thread-subject");
      var bodyEl     = document.getElementById("thread-body");
      var charCount  = document.getElementById("thread-char-count");
      var errorEl    = document.getElementById("post-error");
      var cancelBtn  = document.getElementById("cancel-thread-btn");

      /* Live character counter */
      bodyEl.addEventListener("input", function () {
        var len = bodyEl.value.length;
        charCount.textContent = len + " / " + MAX_BODY + " chars";
        charCount.classList.toggle("line--warn", len > MAX_BODY);
      });

      cancelBtn.addEventListener("click", function () {
        window.location.hash = "#/board/" + encodeURIComponent(board.slug || board.id);
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var result = _validatePost({
          isThread: true,
          subject:  subjectEl.value,
          body:     bodyEl.value
        });
        if (!result.ok) {
          errorEl.textContent = result.error;
          errorEl.hidden = false;
          return;
        }
        errorEl.hidden = true;

        var currentState = Store.get();
        var newPost = {
          id:        genId(),
          boardId:   board.id,
          threadId:  null,  // set after id is known
          parentId:  null,
          subject:   subjectEl.value.trim(),
          author:    currentState.meta.handle,
          body:      bodyEl.value.trim(),
          createdAt: new Date().toISOString(),
          ghost:     false
        };
        newPost.threadId = newPost.id;

        Store.update(function (s) {
          s.posts.push(newPost);
        });

        /* Navigate to the new thread immediately (Req 3.4) */
        window.location.hash = "#/thread/" + encodeURIComponent(newPost.id);
      });

      if (subjectEl) { subjectEl.focus(); }
    }

    /* ── 7.2b  Thread view ───────────────────────────────────────── */

    function renderThread(threadId) {
      var state  = Store.get();
      var thread = null;

      /* Find the root post of the thread */
      state.posts.forEach(function (p) {
        if (p.id === threadId && p.parentId === null) { thread = p; }
      });

      if (!thread) {
        renderNotFound("Thread &ldquo;" + escapeHtml(threadId) + "&rdquo; not found.");
        return;
      }

      /* Find the board */
      var board = null;
      state.boards.forEach(function (b) {
        if (b.id === thread.boardId) { board = b; }
      });

      /* Collect all posts in this thread, chronological */
      var allPosts = state.posts.filter(function (p) {
        return p.threadId === threadId;
      }).sort(function (a, b) {
        if (a.createdAt < b.createdAt) { return -1; }
        if (a.createdAt > b.createdAt) { return 1; }
        return 0;
      });

      var postHtml = allPosts.map(function (p, idx) {
        var ghostClass = p.ghost ? " post--ghost" : "";
        var handleHtml = '<span class="handle' + (p.ghost ? " handle--ghost" : "") + '">'
          + escapeHtml(p.author)
          + (p.ghost ? ' <span class="sysop-tag" aria-label="SysOp">[SYSOP]</span>' : "")
          + '</span>';
        var isRoot = (p.parentId === null);

        return '<article class="post' + ghostClass + '" id="post-' + escapeHtml(p.id) + '"'
          + ' aria-label="Post by ' + escapeHtml(p.author) + '">'
          + '<header class="post-header">'
          + (idx === 0
            ? '<h2 class="post-subject">' + escapeHtml(p.subject || "(no subject)") + '</h2>'
            : "")
          + '<div class="post-meta">'
          + handleHtml
          + ' &middot; <time datetime="' + escapeHtml(p.createdAt) + '">' + escapeHtml(fmtDate(p.createdAt)) + '</time>'
          + (isRoot ? '' : ' &middot; <a class="post-ref" href="#post-' + escapeHtml(p.parentId || "") + '">#' + escapeHtml(p.parentId || "") + '</a>')
          + '</div>'
          + '</header>'
          + '<div class="post-body"><pre class="post-pre">' + escapeHtml(p.body) + '</pre></div>'
          + '</article>';
      }).join('<hr class="post-divider" aria-hidden="true" />');

      var boardLink = board
        ? '<a class="menu-link" href="#/board/' + escapeHtml(board.slug || board.id) + '">'
          + escapeHtml(board.name) + '</a>'
        : '<a class="menu-link" href="#/boards">Boards</a>';

      _activeScreen.innerHTML =
        _noticeHtml() +
        '<section class="screen-section" aria-label="Thread: ' + escapeHtml(thread.subject || "Thread") + '">' +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/boards">&larr; BOARDS</a> / ' + boardLink + '</p>' +
        '<div class="thread-posts">' + (postHtml || '<p class="line line--dim">No posts in this thread.</p>') + '</div>' +
        '<div id="reply-section" class="reply-section"></div>' +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/board/' + escapeHtml(board ? (board.slug || board.id) : "") + '">&larr; BACK TO BOARD</a></p>' +
        '</section>';

      showNav();

      /* Render the reply form inline */
      _renderReplyForm(thread, board);
    }

    /* ── 7.3b  Reply form ────────────────────────────────────────── */

    function _renderReplyForm(thread, board) {
      var replySection = document.getElementById("reply-section");
      if (!replySection) { return; }

      replySection.innerHTML =
        '<h2 class="screen-subtitle reply-heading">POST A REPLY</h2>' +
        '<form id="reply-form" class="post-form" autocomplete="off" novalidate>' +
        '<div class="form-row">' +
        '<label class="form-label" for="reply-body">MESSAGE&gt;</label>' +
        '<textarea id="reply-body" class="form-textarea" rows="6"' +
        ' maxlength="' + MAX_BODY + '"' +
        ' aria-label="Reply body" required></textarea>' +
        '</div>' +
        '<p id="reply-char-count" class="line line--dim char-count">0 / ' + MAX_BODY + ' chars</p>' +
        '<p id="reply-error" class="line line--warn" aria-live="polite" hidden></p>' +
        '<div class="form-actions">' +
        '<button type="submit" class="menu-btn">[R] POST REPLY</button>' +
        '</div>' +
        '</form>';

      var form      = document.getElementById("reply-form");
      var bodyEl    = document.getElementById("reply-body");
      var charCount = document.getElementById("reply-char-count");
      var errorEl   = document.getElementById("reply-error");

      bodyEl.addEventListener("input", function () {
        var len = bodyEl.value.length;
        charCount.textContent = len + " / " + MAX_BODY + " chars";
        charCount.classList.toggle("line--warn", len > MAX_BODY);
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();

        /* Require handle before posting */
        if (!_requireHandle(function () {
          renderThread(thread.id);
        })) { return; }

        var result = _validatePost({ isThread: false, body: bodyEl.value });
        if (!result.ok) {
          errorEl.textContent = result.error;
          errorEl.hidden = false;
          return;
        }
        errorEl.hidden = true;

        var currentState = Store.get();

        /* Find the last post in this thread to reply to */
        var threadPosts = currentState.posts.filter(function (p) {
          return p.threadId === thread.id;
        });
        var lastPost = threadPosts.reduce(function (latest, p) {
          return (!latest || p.createdAt > latest.createdAt) ? p : latest;
        }, null);

        var newReply = {
          id:        genId(),
          boardId:   thread.boardId,
          threadId:  thread.id,
          parentId:  lastPost ? lastPost.id : thread.id,
          subject:   null,
          author:    currentState.meta.handle,
          body:      bodyEl.value.trim(),
          createdAt: new Date().toISOString(),
          ghost:     false
        };

        Store.update(function (s) {
          s.posts.push(newReply);
        });

        /* Re-render thread in place (Req 3.4 — immediate, no reload) */
        renderThread(thread.id);

        /* Scroll to new post */
        var newPostEl = document.getElementById("post-" + newReply.id);
        if (newPostEl) {
          newPostEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    /* ── Placeholder screens for tasks 8, 9, 12 ─────────────────── */

    function _renderPlaceholder(title, routeHint) {
      _activeScreen.innerHTML =
        _noticeHtml() +
        '<section class="screen-section" aria-label="' + escapeHtml(title) + '">' +
        '<h1 class="screen-title">' + escapeHtml(title) + '</h1>' +
        '<p class="line line--dim">[ ' + escapeHtml(routeHint) + ' — coming soon ]</p>' +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/">&larr; BACK TO MENU</a></p>' +
        '</section>';
      showNav();
    }

    function renderLog() {
      _renderPlaceholder("SÉANCE LOG", "Task 8 — guestbook implementation");
    }

    function renderGallery() {
      _renderPlaceholder("ART GALLERY", "Task 9 — gallery implementation");
    }

    function renderArt(artId) {
      _renderPlaceholder("ART PIECE — " + artId, "Task 9 — art view implementation");
    }

    function renderSettings() {
      _renderPlaceholder("SETTINGS", "Task 12 — settings implementation");
    }

    /* ── 404 ─────────────────────────────────────────────────────── */

    function renderNotFound(detail) {
      _activeScreen.innerHTML =
        '<section class="screen-section" aria-label="404 Not Found">' +
        '<h1 class="screen-title">404 — CARRIER LOST</h1>' +
        '<p class="line line--warn">The route you dialed doesn\'t connect to anything.</p>' +
        (detail ? '<p class="line line--dim">' + detail + '</p>' : '') +
        '<p class="line line--dim back-link"><a class="menu-link" href="#/">&larr; BACK TO MENU</a></p>' +
        '</section>';
      showNav();
    }

    /* ═══════════════════════════════════════════════════════════════
       ROUTER — parse hash and dispatch to screen renderer
       ═══════════════════════════════════════════════════════════════ */

    /**
     * Parse window.location.hash into a route object.
     * @returns {{ path: string, params: string[] }}
     */
    function _parseHash() {
      var hash = window.location.hash || "#/";
      /* Strip leading # */
      var path = hash.slice(1) || "/";
      /* Strip trailing slash (except root) */
      if (path.length > 1 && path.slice(-1) === "/") {
        path = path.slice(0, -1);
      }
      var parts = path.split("/");
      /* parts[0] is always "" (before first slash) */
      return { path: path, parts: parts };
    }

    /**
     * Dispatch the current hash to the appropriate screen renderer.
     * Called on hashchange and on initial load.
     */
    function route() {
      var parsed = _parseHash();
      var parts  = parsed.parts;
      /* parts: ["", "boards"], ["", "board", "general"], ["", "thread", "id"], … */

      var seg1 = parts[1] || "";   /* e.g. "boards", "board", "thread", … */
      var seg2 = parts[2] || "";   /* e.g. board slug, thread id */

      if (seg1 === "" || seg1 === "/") {
        renderMenu();
      } else if (seg1 === "boards") {
        renderBoardList();
      } else if (seg1 === "board" && seg2) {
        renderBoard(decodeURIComponent(seg2));
      } else if (seg1 === "thread" && seg2) {
        renderThread(decodeURIComponent(seg2));
      } else if (seg1 === "log") {
        renderLog();
      } else if (seg1 === "gallery") {
        renderGallery();
      } else if (seg1 === "art" && seg2) {
        renderArt(decodeURIComponent(seg2));
      } else if (seg1 === "settings") {
        renderSettings();
      } else {
        renderNotFound(null);
      }
    }

    function init() {
      window.addEventListener("hashchange", route);
      route();
    }

    return {
      init:        init,
      route:       route,
      renderMenu:  renderMenu
    };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     6. GHOST ENGINE
     SysOp Ghost reply logic — full implementation in task 11.
     Stub only.
     ───────────────────────────────────────────────────────────────────── */
  var GhostEngine = (function () {
    // Session-level counter; resets on page reload (by design)
    var _sessionReplies = 0;
    var MAX_SESSION     = 3;

    function evaluate(/* item */) {
      // Full trigger evaluation in task 11
      return false;
    }

    return { evaluate: evaluate };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     7. INIT
     Wire Store → SeedData → BootSequence → HandlePrompt → Router.
     ───────────────────────────────────────────────────────────────────── */
  (function init() {
    // 1. Load (or seed) state
    Store.load(SeedData.seed);

    var state = Store.get();

    // 2. Apply persisted contrast preference
    if (state.meta.preferences.contrast) {
      document.getElementById("crt-root").classList.add("contrast-mode");
    }

    // 3. Update status line with handle if returning caller
    var statusHandle = document.getElementById("status-handle");
    if (state.meta.handle && statusHandle) {
      statusHandle.textContent = "CALLER: " + state.meta.handle.toUpperCase();
    }

    // 4. Play boot sequence
    var returning = Boolean(state.meta.handle);
    BootSequence.play(returning, function afterBoot() {
      // 5. First-time caller → handle prompt; returning caller → skip prompt
      var currentState = Store.get();
      if (!currentState.meta.handle) {
        HandlePrompt.present(function (/*handle*/) {
          Router.init();
        });
      } else {
        Router.init();
      }
    });
  })();

})();
