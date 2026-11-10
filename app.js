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

    var SEED_POSTS = [
      t1, t1r1, t1r2, t1ghost,
      t2, t2r1, t2r2,
      t3, t3r1,
      t4, t4r1, t4ghost,
      t5, t5r1
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
     Minimal placeholder boot — full typewriter implementation in task 4.
     Respects prefers-reduced-motion.
     ───────────────────────────────────────────────────────────────────── */
  var BootSequence = (function () {

    var BOOT_SCRIPT = [
      { text: "ATDT 555-0199",                       cls: "line--dim",    delay: 400  },
      { text: "DIALING SÉANCE BBS...",               cls: "",             delay: 900  },
      { text: "~ screech ~ hiss ~ carrier ~",        cls: "line--noise",  delay: 1200 },
      { text: "CARRIER 14400",                       cls: "line--dim",    delay: 600  },
      { text: "PROTOCOL: LAP-M ERROR CORRECT",       cls: "line--dim",    delay: 500  },
      { text: "CONNECT 14400",                       cls: "line--bright", delay: 800  },
      { text: "",                                    cls: "line--gap",    delay: 400  },
      { text: "████████████████████████████████████",cls: "line--banner", delay: 300  },
      { text: "   S É A N C E   B B S   v 1 . 0   ", cls: "line--banner", delay: 300  },
      { text: "████████████████████████████████████",cls: "line--banner", delay: 300  },
      { text: "",                                    cls: "line--gap",    delay: 300  },
      { text: "NODE 1 OPEN — WELCOME, CALLER.",      cls: "",             delay: 600  }
    ];

    var BOOT_SCRIPT_SHORT = [
      { text: "ATDT 555-0199",         cls: "line--dim",    delay: 200  },
      { text: "REDIALING SÉANCE BBS...",cls: "",            delay: 400  },
      { text: "CONNECT 14400",         cls: "line--bright", delay: 500  },
      { text: "WELCOME BACK.",         cls: "",             delay: 300  }
    ];

    var transcript = document.getElementById("transcript");
    var skipBtn    = document.getElementById("skip-btn");
    var _timers    = [];
    var _done      = false;

    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function appendLine(step) {
      var span = document.createElement("span");
      span.className = "line" + (step.cls ? " " + step.cls : "");
      span.textContent = step.text;
      transcript.appendChild(span);
    }

    function clearTimers() {
      _timers.forEach(function (t) { clearTimeout(t); });
      _timers = [];
    }

    function finish(onDone) {
      if (_done) { return; }
      _done = true;
      clearTimers();
      if (skipBtn) { skipBtn.hidden = true; }
      if (typeof onDone === "function") { onDone(); }
    }

    /**
     * Play the boot sequence.
     * @param {boolean} returning   — true if the caller has a stored handle
     * @param {Function} onDone     — called when sequence completes or is skipped
     */
    function play(returning, onDone) {
      var script = returning ? BOOT_SCRIPT_SHORT : BOOT_SCRIPT;

      // Show skip button
      if (skipBtn) {
        skipBtn.hidden = false;
        skipBtn.addEventListener("click", function () { finish(onDone); }, { once: true });
      }

      // Keyboard skip
      function onKey() {
        document.removeEventListener("keydown", onKey);
        finish(onDone);
      }
      document.addEventListener("keydown", onKey);

      if (reduceMotion) {
        // Static transcript — print everything instantly
        script.forEach(appendLine);
        finish(onDone);
        return;
      }

      var elapsed = 0;
      script.forEach(function (step, idx) {
        elapsed += step.delay;
        var t = window.setTimeout(function () {
          appendLine(step);
          if (idx === script.length - 1) {
            finish(onDone);
          }
        }, elapsed);
        _timers.push(t);
      });
    }

    return { play: play };
  })();

  /* ─────────────────────────────────────────────────────────────────────
     5. ROUTER / SCREENS
     Hash router and screen renderers — full implementation in task 6+.
     Placeholder: shows the main menu stub after boot.
     ───────────────────────────────────────────────────────────────────── */
  var Router = (function () {
    var _activeScreen = document.getElementById("active-screen");
    var _nav          = document.getElementById("bbs-nav");
    var _cursor       = document.getElementById("cursor");

    function showNav() {
      if (_nav) { _nav.hidden = false; }
    }

    function hideNav() {
      if (_nav) { _nav.hidden = true; }
    }

    /**
     * Render a placeholder menu stub so the app has a visible landing
     * state after boot (tasks 6+ replace this with full screens).
     */
    function renderMenuStub() {
      var state = Store.get();
      var handle = state.meta.handle
        ? escapeHtml(state.meta.handle)
        : "(no handle set)";

      var warnings = "";
      if (state.meta.storageDenied) {
        warnings += '<p class="transcript line--warn">'
          + "⚠ TAPE DRIVE OFFLINE — this session won\'t be remembered.</p>";
      }
      if (state.meta.restoredFromBackup) {
        warnings += '<p class="transcript line--warn">'
          + "⚠ State restored from backup tapes.</p>";
      }

      _activeScreen.innerHTML =
        warnings +
        '<p class="screen-title">MAIN MENU</p>' +
        '<p class="screen-subtitle">Caller: ' + handle + '</p>' +
        '<p class="screen-subtitle">Full menu navigation arrives in task 6.</p>';
      showNav();
    }

    function route() {
      renderMenuStub();
    }

    function init() {
      window.addEventListener("hashchange", route);
      route();
    }

    return { init: init, renderMenuStub: renderMenuStub };
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
     Wire Store → SeedData → BootSequence → Router.
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

    // 4. Play boot sequence, then hand off to Router
    var returning = Boolean(state.meta.handle);
    BootSequence.play(returning, function () {
      Router.init();
    });
  })();

})();
