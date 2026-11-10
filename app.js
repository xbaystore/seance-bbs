/* Séance BBS — placeholder shell.
   This file grows into the full app (Store, SeedData, BootSequence,
   Router/Screens, GhostEngine) following .kiro/specs/seance-bbs/tasks.md.
   For now it only plays the boot placeholder transcript. */
(function () {
  "use strict";

  var LINES = [
    { text: "ATDT 555-0199", delay: 400 },
    { text: "DIALING SÉANCE BBS...", delay: 900 },
    { text: "CONNECT 14400", delay: 1000 },
    { text: "The board awakens soon.", delay: 700, final: true }
  ];

  var transcript = document.getElementById("transcript");
  var reduceMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function printLine(line) {
    var span = document.createElement("span");
    span.className = line.final ? "line final" : "line";
    span.textContent = line.text;
    transcript.appendChild(span);
  }

  if (reduceMotion) {
    LINES.forEach(printLine);
    return;
  }

  var elapsed = 0;
  LINES.forEach(function (line) {
    elapsed += line.delay;
    window.setTimeout(function () {
      printLine(line);
    }, elapsed);
  });
})();
