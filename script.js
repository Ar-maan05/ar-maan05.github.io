/* Core script: mobile nav, the ledger (Highlights / All, search, paging), and
   same-origin hydration from data/stats.json and data/activity.json.
   Never renders an error string; never lowers a baked number. */
(function () {
  "use strict";
  var doc = document;

  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Mobile nav
  var toggle = doc.getElementById("nav-toggle");
  var links = doc.getElementById("nav-links");
  if (toggle && links) {
    var setOpen = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      links.setAttribute("data-open", String(open));
    };
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    // Touch: a tap anywhere outside the open menu closes it.
    doc.addEventListener("click", function (e) {
      if (toggle.getAttribute("aria-expanded") === "true" &&
          !links.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
  }

  // ---- Ledger: Highlights / All, search and paging over every merged PR ----
  // The list is baked in full (no-JS readers see everything). With JS it opens
  // on the highlights.
  var ledgerList = doc.getElementById("ledger-body");
  var ledgerCtl = doc.querySelector("[data-ledger-controls]");
  if (ledgerList && ledgerCtl) {
    var LEDGER_PAGE = 8;
    var chipWrap = ledgerCtl.querySelector("[data-ledger-filters]");
    var ledgerQ = doc.getElementById("ledger-q");
    var ledgerStatus = doc.getElementById("ledger-status");
    var ledgerMore = doc.getElementById("ledger-more");
    var lf = { filter: "highlights", q: "", shown: LEDGER_PAGE };
    ledgerCtl.hidden = false;

    var prItems = function () { return Array.prototype.slice.call(ledgerList.querySelectorAll(".pr")); };
    var prMatches = function (li) {
      if (lf.filter === "highlights" && !lf.q && !li.hasAttribute("data-hl")) return false;
      return !lf.q || li.textContent.toLowerCase().indexOf(lf.q) !== -1;
    };

    var buildChips = function () {
      var all = prItems(), hl = 0;
      all.forEach(function (li) { if (li.hasAttribute("data-hl")) hl++; });
      var defs = [{ id: "highlights", label: "Highlights", n: hl }, { id: "all", label: "All", n: all.length }];
      chipWrap.innerHTML = "";
      defs.forEach(function (d) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "lf-chip";
        b.setAttribute("data-filter", d.id);
        b.innerHTML = escHtml(d.label) + ' <span class="lf-n">' + d.n + "</span>";
        chipWrap.appendChild(b);
      });
    };

    var ledgerRender = function () {
      var hits = prItems().filter(prMatches);
      prItems().forEach(function (li) { li.hidden = true; });
      hits.forEach(function (li, i) { li.hidden = i >= lf.shown; });
      var visible = Math.min(hits.length, lf.shown);
      chipWrap.querySelectorAll(".lf-chip").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-filter") === lf.filter));
      });
      if (ledgerStatus) {
        ledgerStatus.textContent = hits.length
          ? "Showing " + visible + " of " + hits.length + (lf.q ? " matching “" + lf.q + "”" : "")
          : "No merged pull requests match “" + lf.q + "”. Try a repo name, a function, or a word like crash.";
      }
      var rest = hits.length - visible;
      ledgerMore.hidden = rest <= 0;
      ledgerMore.textContent = "Show " + Math.min(rest, LEDGER_PAGE) + " more";
    };

    chipWrap.addEventListener("click", function (e) {
      var b = e.target.closest(".lf-chip");
      if (!b) return;
      lf.filter = b.getAttribute("data-filter");
      lf.shown = LEDGER_PAGE;
      ledgerRender();
    });
    if (ledgerQ) ledgerQ.addEventListener("input", function () {
      lf.q = ledgerQ.value.trim().toLowerCase();
      // Searching the highlights alone would hide most answers: widen to all.
      if (lf.q && lf.filter === "highlights") lf.filter = "all";
      lf.shown = LEDGER_PAGE;
      ledgerRender();
    });
    ledgerMore.addEventListener("click", function () {
      var firstNew = lf.shown;
      lf.shown += LEDGER_PAGE;
      ledgerRender();
      // Move focus to the first revealed row so keyboard users keep their place.
      var next = prItems().filter(prMatches)[firstNew];
      var link = next && next.querySelector(".col-title a");
      if (link) link.focus({ preventScroll: true });
    });
    ledgerList.addEventListener("ledger:changed", function () { buildChips(); ledgerRender(); });

    buildChips();
    ledgerRender();
  }

  // Same-origin fetch with timeout
  function getJSON(url) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 6000);
    return fetch(url, { signal: ctrl.signal, cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (d) { clearTimeout(t); return d; })
      .catch(function () { clearTimeout(t); return null; });
  }

  // Raise a baked integer readout to a live value, never lower it.
  function raiseCount(el, live) {
    var shown = Math.max(parseInt(el.textContent, 10) || 0, live);
    el.textContent = String(shown);
    return shown;
  }

  // stats.json: downloads, version, merged and repository counts
  var FLOOR = 8000;   // never show fewer downloads than this
  getJSON("data/stats.json").then(function (s) {
    if (!s) return;
    if (typeof s.downloads === "number" && s.downloads > FLOOR) {
      var dl = s.downloads.toLocaleString("en-US") + "+";
      doc.querySelectorAll("[data-downloads]").forEach(function (el) { el.textContent = dl; });
    }
    if (s.version) {
      doc.querySelectorAll("[data-bake='version']").forEach(function (el) { el.textContent = s.version; });
    }
    if (typeof s.merged_prs === "number") {
      doc.querySelectorAll("[data-merged-count], [data-mf-count]").forEach(function (el) { raiseCount(el, s.merged_prs); });
    }
    if (typeof s.repos_merged === "number") {
      doc.querySelectorAll("[data-repos-count]").forEach(function (el) { raiseCount(el, s.repos_merged); });
    }
  });

  // Merges the pipeline found that the baked ledger doesn't list yet (and any
  // curated entry added since the HTML was last baked) are inserted in date
  // order, with a generic Debug replay, so the ledger never goes stale.
  function ledgerRow(p) {
    var li = doc.createElement("li");
    li.className = "pr";
    li.setAttribute("data-pr", p.repo + "#" + p.number);
    li.setAttribute("data-repo", p.repo);
    if (p.highlight) li.setAttribute("data-hl", "");
    li.innerHTML =
      '<p class="pr-meta"><span class="col-repo">' + escHtml(p.repo) + '</span>' +
      '<span class="col-date">' + escHtml((p.merged_at || "").slice(0, 10)) + '</span></p>' +
      '<h3 class="col-title"><a href="' + escHtml(p.url) + '" target="_blank" rel="noopener">' +
      escHtml(p.title || p.repo + " #" + p.number) + '</a></h3>' +
      (p.note ? '<p class="col-why">' + escHtml(p.note) + '</p>' : "") +
      '<button class="btn-verify" type="button" aria-label="Debug ' + escHtml(p.repo + "#" + p.number) + '">Debug</button>';
    return li;
  }

  getJSON("data/activity.json").then(function (a) {
    if (!a || !ledgerList) return;
    var added = 0;
    ["curated", "extra"].forEach(function (k) {
      (a[k] || []).forEach(function (p) {
        if (p.state !== "merged") return;
        var key = p.repo + "#" + p.number;
        if (ledgerList.querySelector('[data-pr="' + key.replace(/"/g, "") + '"]')) return;
        var row = ledgerRow(p), when = p.merged_at || "";
        var before = Array.prototype.find.call(ledgerList.children, function (li) {
          var d = li.querySelector(".col-date");
          return d && d.textContent < when.slice(0, 10);
        });
        ledgerList.insertBefore(row, before || null);
        added++;
      });
    });
    if (added) ledgerList.dispatchEvent(new CustomEvent("ledger:changed"));
    var mc = doc.querySelector("[data-merged-count]");
    if (mc) raiseCount(mc, ledgerList.querySelectorAll("[data-pr]").length);
    // fx.js and terminal.js recount from the ledger when this fires.
    doc.dispatchEvent(new CustomEvent("deck:activity"));
  });

  // Debug buttons open a replay in the terminal (terminal.js).
  function debugOn(list, attr) {
    if (!list) return;
    list.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-verify");
      var row = btn && btn.closest("[" + attr + "]");
      if (row && window.deckTerminal) window.deckTerminal.debug(row.getAttribute(attr));
    });
  }
  debugOn(ledgerList, "data-pr");
  debugOn(doc.getElementById("advisory-body"), "data-advisory");
})();
