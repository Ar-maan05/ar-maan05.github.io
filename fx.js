/* fx.js — derives the ledger counts and the hero merge log from the ledger
   rows, including merges script.js appends from activity.json.
   Zero dependencies. */
(function () {
  "use strict";
  var doc = document;

  /* ======================================================================
     1. Ledger telemetry — derive real counts from the ledger rows
     ====================================================================== */
  (function ledgerStats() {
    var wrap = doc.querySelector("[data-ledger-stats]");
    if (!wrap) return;
    function raise(el, live) {
      if (!el || !live) return;
      el.textContent = String(Math.max(parseInt(el.textContent, 10) || 0, live));
    }
    function run() {
      // The ledger lists merged PRs only, including the ones script.js
      // appends from activity.json, so a new repo counts here straight away.
      var rows = doc.querySelectorAll("#ledger-body [data-pr]");
      if (!rows.length) return;
      var repos = {}, merged = rows.length;
      rows.forEach(function (tr) {
        var repo = tr.querySelector(".col-repo");
        if (repo) repos[repo.textContent.trim()] = 1;
      });
      var nums = wrap.querySelectorAll(".num");
      // [0] merged upstream, [1] repos. The baked value is GitHub's own count,
      // so the page may only ever raise it.
      raise(nums[0], merged);
      raise(nums[1], Object.keys(repos).length);
    }
    run();
    doc.addEventListener("deck:activity", run);
  })();

  /* ======================================================================
     2. Hero merge log.
     Rebuilds from every row in the ledger, including the merges script.js
     appends from activity.json, so a fresh
     upstream merge shows up here the same day it lands.
     ====================================================================== */
  (function mergeFeed() {
    var track = doc.querySelector("[data-mergefeed]");
    if (!track) return;
    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // The ledger is newest first, so document order is the feed order.
    // Keyed by repo#number so a PR can't appear twice.
    function collect() {
      var items = [], seen = {};
      ["#ledger-body [data-pr]"].forEach(function (sel) {
        doc.querySelectorAll(sel).forEach(function (tr) {
          var repoEl = tr.querySelector(".col-repo");
          var a = tr.querySelector(".col-title a");
          if (!repoEl || !a) return;
          var dp = tr.getAttribute("data-pr") || "";
          var repo = repoEl.textContent.trim();
          var num = dp.indexOf("#") > -1 ? dp.split("#")[1] : "";
          var key = repo + "#" + num;
          if (num && seen[key]) return;
          seen[key] = true;
          items.push({ repo: repo, num: num, title: a.textContent.trim(), url: a.href });
        });
      });
      return items;
    }

    function render() {
      var items = collect();
      if (!items.length) return;
      track.innerHTML = items.map(function (it) {
        return '<li><a class="mf-row" href="' + esc(it.url) + '" target="_blank" rel="noopener">' +
          '<span class="mf-dot" aria-hidden="true"></span>' +
          '<span class="mf-repo">' + esc(it.repo) + '</span>' +
          (it.num ? '<span class="mf-num">#' + esc(it.num) + '</span>' : "") +
          '<span class="mf-msg">' + esc(it.title) + '</span></a></li>';
      }).join("");
      // Keep the authoritative baked GitHub count if it exceeds the sample.
      var count = doc.querySelector("[data-mf-count]");
      if (count) count.textContent = String(Math.max(parseInt(count.textContent, 10) || 0, items.length));
    }

    render();
    // script.js fires this once activity.json has hydrated the tables; the fetch
    // may land either side of this file's own load, so rebuild on both paths.
    doc.addEventListener("deck:activity", render);
  })();
})();
