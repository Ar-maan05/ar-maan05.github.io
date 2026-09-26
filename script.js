/* Core script: nav, scroll reveals, diff tab switcher, and same-origin hydration
   of the live receipts (stats.json + activity.json + diffs.json).
   Never renders an error string; never drops below baked floors. */
(function () {
  "use strict";
  var doc = document;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  // ---- Ledger: repo filters, search and paging over every merged PR --------
  // The list is baked in full (no-JS readers see everything). With JS it opens
  // on the highlights; the chips are built from the rows themselves, so a repo
  // the pipeline appends later gets its own chip without touching this file.
  var ledgerList = doc.getElementById("ledger-body");
  var ledgerCtl = doc.querySelector("[data-ledger-controls]");
  var ledgerRender = function () {};
  if (ledgerList && ledgerCtl) {
    var LEDGER_PAGE = 8;
    var REPO_LABEL = { "lightpanda-io/browser": "lightpanda", "lance-format/lance": "lance" };
    var chipWrap = ledgerCtl.querySelector("[data-ledger-filters]");
    var ledgerQ = doc.getElementById("ledger-q");
    var ledgerStatus = doc.getElementById("ledger-status");
    var ledgerMore = doc.getElementById("ledger-more");
    var lf = { filter: "highlights", q: "", shown: LEDGER_PAGE };
    ledgerCtl.hidden = false;

    var prItems = function () { return Array.prototype.slice.call(ledgerList.querySelectorAll(".pr")); };
    var prMatches = function (li) {
      if (lf.filter === "highlights" && !lf.q && !li.hasAttribute("data-hl")) return false;
      if (lf.filter !== "highlights" && lf.filter !== "all" && li.getAttribute("data-repo") !== lf.filter) return false;
      return !lf.q || li.textContent.toLowerCase().indexOf(lf.q) !== -1;
    };

    var buildChips = function () {
      var counts = {}, all = prItems(), hl = 0;
      all.forEach(function (li) {
        var r = li.getAttribute("data-repo");
        counts[r] = (counts[r] || 0) + 1;
        if (li.hasAttribute("data-hl")) hl++;
      });
      var defs = [{ id: "highlights", label: "Highlights", n: hl }, { id: "all", label: "All", n: all.length }];
      Object.keys(counts)
        .sort(function (x, y) { return counts[y] - counts[x] || x.localeCompare(y); })
        .forEach(function (r) { defs.push({ id: r, label: REPO_LABEL[r] || r.split("/")[1], n: counts[r] }); });
      chipWrap.innerHTML = "";
      defs.forEach(function (d) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "lf-chip";
        b.setAttribute("data-filter", d.id);
        if (d.id.indexOf("/") !== -1) b.title = d.id;
        b.innerHTML = escHtml(d.label) + ' <span class="lf-n">' + d.n + "</span>";
        chipWrap.appendChild(b);
      });
    };

    ledgerRender = function () {
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

  // Theme Toggle
  var themeToggle = doc.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var current = doc.documentElement.getAttribute("data-theme") || "light";
      var next = current === "dark" ? "light" : "dark";
      doc.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (e) {}
    });
  }


  // Scroll progress bar (§17.2) — passive listener, CSS hides it under reduced motion
  var bar = doc.querySelector(".scroll-bar");
  if (bar) {
    window.addEventListener("scroll", function () {
      var p = window.scrollY / (doc.body.scrollHeight - window.innerHeight);
      bar.style.transform = "scaleX(" + Math.min(p, 1) + ")";
    }, { passive: true });
  }

  // Hero entrance is pure CSS (§10.1); no JS needed for it.
  // Scroll reveals (§10.3)
  var revealTargets = doc.querySelectorAll("main > section:not(.hero), .arch");
  if ("IntersectionObserver" in window && !reduce) {
    // Sections reveal once their top clears the bottom 15% of the viewport.
    // A ratio threshold would never fire for sections taller than ~6
    // viewports (the stacked ledger on phones), leaving them invisible.
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: "0px 0px -15% 0px" });
    var archIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.intersectionRatio >= 0.4) {
          en.target.classList.add("in");
          archIo.unobserve(en.target);
        }
      });
    }, { threshold: [0.4] });
    revealTargets.forEach(function (s) {
      (s.classList.contains("arch") ? archIo : io).observe(s);
    });
  } else {
    revealTargets.forEach(function (s) { s.classList.add("in"); });
  }

  // Global cursor-aware ambient layer (§18.3)
  if (window.matchMedia('(pointer: fine)').matches && !reduce) {
    var raf = null;
    window.addEventListener('pointermove', function (e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        doc.body.style.setProperty('--cx', e.clientX + 'px');
        doc.body.style.setProperty('--cy', e.clientY + 'px');
        raf = null;
      });
    }, { passive: true });
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

  function fmt(n) { return n.toLocaleString("en-US"); }

  // Downloads counter (§7.7, §10.2)
  var FLOOR = 8000;
  function setDownloads(text) {
    doc.querySelectorAll("[data-downloads]").forEach(function (el) { el.textContent = text; });
  }
  function animateDownloads(target) {
    var els = doc.querySelectorAll("[data-downloads]");
    if (reduce || !els.length) { setDownloads(fmt(target) + "+"); return; }
    var start = performance.now(), dur = 900;
    function tick(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(2, -10 * p);          /* easeOutExpo */
      var val = Math.round(FLOOR + (target - FLOOR) * (p >= 1 ? 1 : eased));
      setDownloads(fmt(val) + "+");
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Raise a baked integer readout to a live value, never lower it (§6.1).
  // data-countup-target is the authority when set, since textContent can be a
  // mid-tween value while fx.js is animating; writing it back keeps a running
  // count-up heading for the new figure. Returns the value now on screen.
  function raiseCount(el, live) {
    var floor = parseInt(el.getAttribute("data-countup-target") || el.textContent, 10) || 0;
    var shown = Math.max(floor, live);
    if (el.hasAttribute("data-countup")) el.setAttribute("data-countup-target", String(shown));
    el.textContent = String(shown);
    return shown;
  }

  // Diff tab switcher (§7.1 v1.1) — keyboard nav, aria-selected, 120ms cross-fade
  var tablist = doc.querySelector(".diff-tablist");
  var tabs = tablist ? Array.from(tablist.querySelectorAll(".diff-tab")) : [];
  var diffsLoaded = {};   // cache populated by diffs.json

  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderDiffBody(bodyEl, lines) {
    bodyEl.innerHTML = "";
    (lines || []).forEach(function (line, index) {
      var span = doc.createElement("span");
      var type = line.type || "ctx";
      span.className = "diff-line" + (type === "add" ? " add" : type === "del" ? " del" : "");
      span.setAttribute("data-anim", "");
      span.style.setProperty("--d", (index * 70) + "ms");
      var g = doc.createElement("span");
      g.className = "g";
      g.setAttribute("aria-hidden", "true");
      g.textContent = type === "add" ? "+" : type === "del" ? "-" : " ";
      var c = doc.createElement("span");
      c.className = "c";
      // truncate at 52 chars per spec
      var text = (line.text || "");
      c.textContent = text.length > 52 ? text.slice(0, 52) + "\u2026" : text;
      span.appendChild(g);
      span.appendChild(c);
      bodyEl.appendChild(span);
    });
  }

  function populatePanel(tab) {
    /* Fill a non-default panel from the diffsLoaded cache. Safe to call any
       number of times; idempotent once dataset.populated is set. */
    var repo = tab.dataset.repo;
    var panelId = tab.getAttribute("aria-controls");
    if (!repo || !panelId || !diffsLoaded[repo]) return;
    var panel = doc.getElementById(panelId);
    if (!panel) return;
    var bodyId = "dbody-" + tab.id.replace("dtab-", "");
    var bodyEl = doc.getElementById(bodyId);
    if (!bodyEl || bodyEl.dataset.populated) return;   // already done or no slot
    renderDiffBody(bodyEl, diffsLoaded[repo].lines);
    var head = panel.querySelector(".diff-repo");
    if (head) head.innerHTML = "<b>" + escHtml(repo) + "</b> &middot; #" + diffsLoaded[repo].pr;
    panel.href = diffsLoaded[repo].url || panel.href;
    bodyEl.dataset.populated = "1";
  }

  function switchTab(tab) {
    if (!tab) return;
    var panelId = tab.getAttribute("aria-controls");
    var panel = doc.getElementById(panelId);
    if (!panel) return;

    // Deactivate all
    tabs.forEach(function (t) {
      t.setAttribute("aria-selected", "false");
      t.setAttribute("tabindex", "-1");
    });
    doc.querySelectorAll("[role='tabpanel'].diff").forEach(function (p) {
      p.hidden = true;
    });

    // Activate selected
    tab.setAttribute("aria-selected", "true");
    tab.setAttribute("tabindex", "0");
    panel.hidden = false;

    // Try to fill the panel first (so elements exist in the DOM with their data-anim attributes)
    populatePanel(tab);

    // Replay the staggered rise animation on every switch
    panel.querySelectorAll("[data-anim]").forEach(function (el) {
      el.style.animation = "none";
    });
    void panel.offsetWidth; // single reflow flushes all at once
    panel.querySelectorAll("[data-anim]").forEach(function (el) {
      el.style.animation = "";
    });
  }

  if (tabs.length) {
    // Set initial tabindex
    tabs.forEach(function (t, i) {
      t.setAttribute("tabindex", i === 0 ? "0" : "-1");
    });

    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () { switchTab(tab); });
    });

    // Arrow-key navigation per ARIA tablist pattern
    tablist.addEventListener("keydown", function (e) {
      var idx = tabs.indexOf(doc.activeElement);
      if (idx === -1) return;
      var next;
      if (e.key === "ArrowRight") next = tabs[(idx + 1) % tabs.length];
      else if (e.key === "ArrowLeft") next = tabs[(idx - 1 + tabs.length) % tabs.length];
      else if (e.key === "Home") next = tabs[0];
      else if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); next.focus(); switchTab(next); }
    });
  }

  // Load stats.json: downloads + version
  getJSON("data/stats.json").then(function (s) {
    if (!s) return;
    if (typeof s.downloads === "number") {
      var live = Math.max(FLOOR, s.downloads);
      if (live > FLOOR) animateDownloads(live);
    }
    // Hydrate version data-bake spans
    if (s.version) {
      doc.querySelectorAll("[data-bake='version']").forEach(function (el) {
        el.textContent = s.version;
      });
    }
    // Total merged upstream PRs: the proofbar receipt and the hero merge-log
    // header. The baked/derived value is a floor; live data may only raise it
    // (§6.1), so a stale JSON can never shrink the number on screen.
    if (typeof s.merged_prs === "number") {
      doc.querySelectorAll("[data-merged-count], [data-mf-count]").forEach(function (el) {
        raiseCount(el, s.merged_prs);
      });
    }
    // Distinct repositories merged into (ledger telemetry tile).
    if (typeof s.repos_merged === "number") {
      doc.querySelectorAll("[data-repos-count]").forEach(function (el) {
        raiseCount(el, s.repos_merged);
      });
    }
    // Per-repo receipt counts ("Merged: systemd ×2"). Same floor rule; the ×
    // wrapper is dropped when a repo only has one merged PR.
    if (s.repo_merged) {
      doc.querySelectorAll("[data-repo-merged]").forEach(function (el) {
        var n = s.repo_merged[el.getAttribute("data-repo-merged")];
        if (typeof n !== "number") return;
        var shown = raiseCount(el, n);
        var wrap = el.closest("[data-repo-mult]");
        if (wrap) wrap.hidden = shown < 2;
      });
    }
  });

  // Load diffs.json: populate non-default hero diff panels
  getJSON("data/diffs.json").then(function (d) {
    if (!d || !d.diffs) return;
    Object.keys(d.diffs).forEach(function (repo) {
      diffsLoaded[repo] = d.diffs[repo];
    });
    // If the user already switched to a non-default tab before this fetch
    // completed, retroactively fill it now.
    tabs.forEach(function (tab) {
      if (tab.getAttribute("aria-selected") === "true") {
        populatePanel(tab);
      }
    });
  });

  // Ledger hydration + recent activity (§7.4, §11)
  function chip(state) {
    var cls = state === "merged" ? "chip-merged" : state === "open" ? "chip-open" : "chip-closed";
    var span = doc.createElement("span");
    span.className = "chip " + cls;
    span.textContent = state;
    return span;
  }

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
    // The baked value is the floor; live data may only raise it (§6.1).
    var mc = doc.querySelector("[data-merged-count]");
    if (mc) raiseCount(mc, ledgerList.querySelectorAll("[data-pr]").length);
    /* Tell the motion layer the ledger changed so the hero merge log picks up
       these merges. fx.js also builds once on its own load, so it does not
       matter whether this fetch lands before or after fx.js runs. */
    doc.dispatchEvent(new CustomEvent("deck:activity"));
  });

  // Ledger Debug buttons open a replay in the terminal (terminal.js).
  if (ledgerList) {
    ledgerList.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-verify");
      var row = btn && btn.closest("[data-pr]");
      if (row && window.deckTerminal) window.deckTerminal.debug(row.getAttribute("data-pr"));
    });
  }
})();
