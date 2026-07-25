/* fx.js — v2 overhaul motion layer for the Mission Control deck.
   Zero dependencies. Everything degrades: reduced-motion and coarse pointers
   get a calm, static deck; the data pipeline and core interactivity in
   script.js / demo.js are never touched. */
(function () {
  "use strict";
  var doc = document;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;
  var raf = window.requestAnimationFrame.bind(window);

  /* ======================================================================
     1. Hero data-stream canvas — packets flowing across the deck
     ====================================================================== */
  (function heroCanvas() {
    var canvas = doc.getElementById("fx-canvas");
    var stage = canvas && canvas.parentElement;
    if (!canvas || !stage || reduce) return;

    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0, particles = [], running = false, ticking = false;

    // Palette adapts to the theme so packets stay legible on either stage.
    var PAL = { v: [163, 113, 247], t: [53, 224, 203], boost: 1 };
    function syncPalette() {
      var light = doc.documentElement.getAttribute("data-theme") === "light";
      PAL = light
        ? { v: [124, 77, 255], t: [12, 156, 139], boost: 1.9 }
        : { v: [163, 113, 247], t: [53, 224, 203], boost: 1 };
    }
    syncPalette();
    new MutationObserver(syncPalette).observe(doc.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function size() {
      W = stage.clientWidth;
      H = stage.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function build() {
      // Density scales with area but stays bounded for performance.
      var count = Math.min(70, Math.round((W * H) / 22000));
      particles = [];
      for (var i = 0; i < count; i++) particles.push(spawn(true));
    }

    function spawn(anywhere) {
      var bright = Math.random() < 0.16;
      return {
        x: anywhere ? Math.random() * W : -20,
        y: Math.random() * H,
        v: 0.25 + Math.random() * 1.5,
        r: bright ? 1.8 + Math.random() * 1.4 : 0.7 + Math.random() * 1.1,
        len: bright ? 26 + Math.random() * 46 : 8 + Math.random() * 22,
        a: 0.12 + Math.random() * (bright ? 0.55 : 0.3),
        teal: Math.random() < 0.28,
        bright: bright
      };
    }

    function frame() {
      if (!running) { ticking = false; return; }
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.v;
        if (p.x - p.len > W) { particles[i] = spawn(false); continue; }
        var col = p.teal ? PAL.t : PAL.v;
        var a = Math.min(1, p.a * PAL.boost);
        // trailing streak
        var grad = ctx.createLinearGradient(p.x - p.len, p.y, p.x, p.y);
        grad.addColorStop(0, "rgba(" + col[0] + "," + col[1] + "," + col[2] + ",0)");
        grad.addColorStop(1, "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + a + ")");
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x - p.len, p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        // head glow
        if (p.bright) {
          ctx.beginPath();
          ctx.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + Math.min(1, a + 0.2) + ")";
          ctx.shadowColor = "rgba(" + col[0] + "," + col[1] + "," + col[2] + ",0.9)";
          ctx.shadowBlur = 8;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      raf(frame);
    }

    function start() { if (!running) { running = true; if (!ticking) { ticking = true; raf(frame); } } }
    function stop() { running = false; }

    size();
    var ro = window.ResizeObserver ? new ResizeObserver(size) : null;
    if (ro) ro.observe(stage); else window.addEventListener("resize", size);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ents) {
        if (ents[0].isIntersecting && !doc.hidden) start(); else stop();
      }, { threshold: 0.02 }).observe(stage);
    } else { start(); }
    doc.addEventListener("visibilitychange", function () {
      if (doc.hidden) stop(); else if (isOnscreen(stage)) start();
    });
    function isOnscreen(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }
  })();

  /* ======================================================================
     2. Magnetic controls — pull toward the cursor
     ====================================================================== */
  if (fine && !reduce) {
    var magnets = Array.prototype.slice.call(doc.querySelectorAll("[data-magnetic]"));
    magnets.forEach(function (el) {
      var pending = false, mx = 0, my = 0;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        mx = (e.clientX - (r.left + r.width / 2)) * 0.3;
        my = (e.clientY - (r.top + r.height / 2)) * 0.4;
        if (!pending) { pending = true; raf(function () {
          el.style.transform = "translate(" + mx + "px," + my + "px)";
          pending = false;
        }); }
      });
      el.addEventListener("pointerleave", function () {
        el.style.transform = "";
      });
    });
  }

  /* ======================================================================
     3. 3D tilt — panels lean toward the cursor
     ====================================================================== */
  if (fine && !reduce) {
    var tilts = Array.prototype.slice.call(doc.querySelectorAll("[data-tilt]"));
    tilts.forEach(function (el) {
      var pending = false, rx = 0, ry = 0;
      var MAX = 5;
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        ry = px * MAX * 2;
        rx = -py * MAX * 2;
        if (!pending) { pending = true; raf(function () {
          el.style.setProperty("--rx", rx.toFixed(2) + "deg");
          el.style.setProperty("--ry", ry.toFixed(2) + "deg");
          pending = false;
        }); }
      });
      el.addEventListener("pointerleave", function () {
        el.style.setProperty("--rx", "0deg");
        el.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ======================================================================
     4. Channel-rail scrollspy
     ====================================================================== */
  (function scrollspy() {
    var nodes = Array.prototype.slice.call(doc.querySelectorAll(".deck-rail .rail-node"));
    if (!nodes.length) return;
    var map = {};
    nodes.forEach(function (n) { map[n.getAttribute("data-rail")] = n; });
    var ids = Object.keys(map).filter(function (k) { return k !== "top"; });
    var pending = false;
    function update() {
      pending = false;
      var line = window.scrollY + window.innerHeight * 0.34;
      var current = "top";
      if (window.scrollY > 40) {
        for (var i = 0; i < ids.length; i++) {
          var sec = doc.getElementById(ids[i]);
          if (sec && sec.offsetTop <= line) current = ids[i];
        }
      }
      nodes.forEach(function (n) {
        n.classList.toggle("active", n.getAttribute("data-rail") === current);
      });
    }
    window.addEventListener("scroll", function () {
      if (!pending) { pending = true; raf(update); }
    }, { passive: true });
    update();
  })();

  /* ======================================================================
     5. Count-up numerals on first reveal
     ====================================================================== */
  (function countUp() {
    var els = Array.prototype.slice.call(doc.querySelectorAll("[data-countup]"));
    if (!els.length) return;
    // The target is re-read every frame from data-countup-target so live
    // hydration (script.js, stats.json) landing mid-animation raises the
    // figure instead of being overwritten by the tail of the tween.
    function targetOf(el) {
      var attr = parseInt(el.getAttribute("data-countup-target") || "", 10);
      if (attr) return attr;
      return parseInt((el.textContent || "").replace(/[^0-9]/g, ""), 10);
    }
    function run(el) {
      var target = targetOf(el);
      if (!target || reduce) return;
      el.setAttribute("data-countup-target", String(target));
      var start = performance.now(), dur = 1100;
      function tick(now) {
        target = targetOf(el);
        var p = Math.min(1, (now - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) raf(tick);
      }
      raf(tick);
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) { run(en.target); io.unobserve(en.target); }
        });
      }, { threshold: 0.6 });
      els.forEach(function (el) { io.observe(el); });
    }
  })();

  /* ======================================================================
     6. Deploy ticker — rebuild from the ledger, then loop seamlessly
     ====================================================================== */
  (function ticker() {
    var track = doc.querySelector("[data-ticker]");
    if (!track) return;
    // Prefer live repo names from the ledger so the readout never goes stale.
    var repos = [];
    doc.querySelectorAll("#ledger-body .col-repo").forEach(function (c) {
      var name = c.textContent.trim();
      if (name && repos.indexOf(name) === -1) repos.push(name);
    });
    if (repos.length) {
      track.innerHTML = "";
      repos.forEach(function (name) {
        var s = doc.createElement("span");
        s.className = "ticker-item";
        s.innerHTML = '<i>merged</i>' + name;
        track.appendChild(s);
      });
    }
    // Duplicate the set so the -50% keyframe loops with no visible seam.
    if (!reduce) track.innerHTML += track.innerHTML;
  })();

  /* ======================================================================
     7. Ledger telemetry — derive real counts from the ledger rows
     ====================================================================== */
  (function ledgerStats() {
    var wrap = doc.querySelector("[data-ledger-stats]");
    if (!wrap) return;
    function raise(el, live) {
      if (!el || !live) return;
      // data-countup-target when present: textContent may be a mid-tween value
      // rather than the authoritative baked figure.
      var floor = parseInt(el.getAttribute("data-countup-target") || el.textContent, 10) || 0;
      var shown = Math.max(floor, live);
      if (el.hasAttribute("data-countup")) el.setAttribute("data-countup-target", String(shown));
      el.textContent = String(shown);
    }
    function run() {
      // Curated ledger plus the recent merges script.js appends, so a merge in a
      // repo the ledger has never listed still counts here.
      var rows = doc.querySelectorAll("#ledger-body tr, #recent-body tr");
      if (!rows.length) return;
      var repos = {}, merged = 0;
      rows.forEach(function (tr) {
        var st = tr.querySelector(".col-state");
        var repo = tr.querySelector(".col-repo");
        if (st && st.textContent.trim().toLowerCase() === "merged") merged++;
        if (repo) repos[repo.textContent.trim()] = 1;
      });
      var nums = wrap.querySelectorAll(".num");
      // [0] merged upstream, [1] repos. The baked value is the authoritative
      // GitHub floor; these tables are a subset, so only ever raise it.
      raise(nums[0], merged);
      raise(nums[1], Object.keys(repos).length);
    }
    run();
    doc.addEventListener("deck:activity", run);
  })();

  /* ======================================================================
     8. Terminal: clickable command chips + a boot sequence on first reveal.
     Drives the existing terminal in script.js by dispatching a real Enter.
     ====================================================================== */
  (function terminalFx() {
    var input = doc.getElementById("term-input");
    var body = doc.getElementById("term-body");
    if (!input || !body) return;

    function runCmd(cmd) {
      var box = doc.querySelector(".terminal-box");
      if (box) box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      input.focus();
      input.value = cmd;
      var echo = doc.getElementById("term-echo");
      if (echo) echo.textContent = cmd;
      // script.js listens for a real keydown on the input and reads its value.
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    doc.querySelectorAll(".term-chip").forEach(function (b) {
      b.addEventListener("click", function () { runCmd(b.getAttribute("data-cmd")); });
    });

    // Boot log: dim lines that fade in above the banner, once, on first view.
    if (reduce) return;
    var banner = body.querySelector(".term-banner");
    if (!banner) return;
    var booted = false;
    // The merge figure comes off the live receipt count, not a literal. Read at
    // boot time (first view of the console), by which point stats.json has
    // usually hydrated it.
    function bootLines() {
      var el = doc.querySelector("[data-merged-count]");
      var n = el
        ? parseInt(el.getAttribute("data-countup-target") || el.textContent, 10) || 0
        : 0;
      return [
        "mounting /dev/wpi",
        "loading module mcp-persist.ko",
        "syncing upstream ledger" + (n ? " · " + n + " merged" : ""),
        "link established · latency 0ms"
      ];
    }
    function boot() {
      if (booted) return; booted = true;
      var lines = bootLines();
      lines.forEach(function (txt, i) {
        setTimeout(function () {
          var d = doc.createElement("div");
          d.className = "term-line boot";
          d.style.opacity = "0";
          d.style.transition = "opacity 220ms ease";
          d.innerHTML = '[<span class="ok"> ok </span>] ' + txt;
          body.insertBefore(d, banner);
          requestAnimationFrame(function () { d.style.opacity = "1"; });
        }, i * 260);
      });
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { boot(); io.disconnect(); } });
      }, { threshold: 0.35 });
      io.observe(doc.getElementById("console"));
    } else { boot(); }
  })();

  /* ======================================================================
     9. Hero merge log — the streaming centerpiece.
     Rebuilds from every merged row on the page: the curated ledger plus the
     recent-activity rows script.js appends from activity.json, so a fresh
     upstream merge shows up here the same day it lands. Then duplicates the
     track so the vertical scroll loops with no seam.
     ====================================================================== */
  (function mergeFeed() {
    var track = doc.querySelector("[data-mergefeed]");
    if (!track) return;
    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // Recent activity first — it is the freshest — then the curated ledger.
    // Keyed by repo#number so a PR listed in both places appears once.
    function collect() {
      var items = [], seen = {};
      // Two passes, not one selector list: querySelectorAll returns document
      // order, which would bury the fresh rows below the ledger.
      ["#recent-body tr", "#ledger-body tr"].forEach(function (sel) {
        doc.querySelectorAll(sel).forEach(function (tr) {
          var st = tr.querySelector(".col-state");
          if (!st || st.textContent.trim().toLowerCase() !== "merged") return;
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
      if (count) {
        // Read the count-up target when present: textContent may be a mid-tween
        // value rather than the authoritative baked figure.
        var floor = parseInt(count.getAttribute("data-countup-target") || count.textContent, 10) || 0;
        var shown = Math.max(floor, items.length);
        count.textContent = String(shown);
        if (count.hasAttribute("data-countup")) count.setAttribute("data-countup-target", String(shown));
      }
      // The CSS duration is tuned for the baked set; scale it with the row count
      // so the scroll keeps the same pace as the feed grows (42s / 18 rows).
      track.style.animationDuration = (items.length * 2.33).toFixed(1) + "s";
      // Duplicate the set so the -50% keyframe loops seamlessly.
      if (!reduce) track.innerHTML += track.innerHTML;
    }

    render();
    // script.js fires this once activity.json has hydrated the tables; the fetch
    // may land either side of this file's own load, so rebuild on both paths.
    doc.addEventListener("deck:activity", render);
  })();
})();
