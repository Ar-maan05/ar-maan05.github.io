/* depth.js — 3D layer for the deck.
   1. Inertial smooth scroll (wheel, keys, in-page anchors) on top of native
      scroll, so the scrollbar, find-in-page and touch keep working.
   2. A fixed 3D "merge graph" behind the page: main runs into the screen,
      branches fork, spiral around it and merge back. Scroll flies the camera
      down the trunk; the pointer steers it.
   3. Scroll-driven depth: sections swing up out of the page as they enter,
      the hero recedes as you leave it.
   Zero dependencies. Reduced motion gets the original static deck and native
   scroll; nothing in script.js / demo.js / fx.js depends on this file. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement, win = window;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;
  var raf = win.requestAnimationFrame.bind(win);

  if (reduce) return;              // the original static deck, untouched
  root.classList.add("depth-on");

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function maxY() { return root.scrollHeight - win.innerHeight; }

  /* ======================================================================
     1. Smooth scroll
     ====================================================================== */
  var S = { target: win.scrollY, cur: win.scrollY, mode: null, lastSet: null, tween: null };
  root.classList.add("depth-smooth");   // CSS drops scroll-behavior:smooth

  function stopSmooth() { S.mode = null; S.tween = null; S.lastSet = null; }

  // Let nested scrollers (terminal, ledger, demo log) keep their own wheel.
  function nestedCanScroll(el, dy) {
    for (; el && el.nodeType === 1 && el !== doc.body && el !== root; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      var oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      if (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
    }
    return false;
  }

  win.addEventListener("wheel", function (e) {
    if (e.ctrlKey || e.defaultPrevented) return;                 // pinch-zoom
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;           // sideways
    if (nestedCanScroll(e.target, e.deltaY)) return;
    var d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? win.innerHeight : 1);
    e.preventDefault();
    if (S.mode !== "lerp") { S.target = S.cur = win.scrollY; }
    S.mode = "lerp"; S.tween = null;
    S.target = clamp(S.target + d, 0, maxY());
    kick();
  }, { passive: false });

  function tweenTo(y) {
    y = clamp(y, 0, maxY());
    var from = win.scrollY, dist = Math.abs(y - from);
    if (dist < 1) return;
    S.mode = "tween";
    S.tween = { from: from, to: y, t0: performance.now(), dur: clamp(420 + dist * 0.28, 520, 1500) };
    kick();
  }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // In-page anchors glide instead of jumping.
  doc.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains("skip-link")) return;
    var id = a.getAttribute("href").slice(1);
    var el = id ? doc.getElementById(id) : null;
    if (!el) return;
    e.preventDefault();
    var navH = (doc.querySelector(".nav") || {}).offsetHeight || 0;
    var top = id === "top" ? 0 : el.getBoundingClientRect().top + win.scrollY - navH - 16;
    tweenTo(top);
    if (history.pushState) history.pushState(null, "", "#" + id);
  });

  // Keyboard paging glides too, unless focus is in a field.
  win.addEventListener("keydown", function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    var t = doc.activeElement, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (tag === "BUTTON" && (e.key === " " || e.key === "Enter")) return;
    var vh = win.innerHeight * 0.85, base = S.mode ? (S.tween ? S.tween.to : S.target) : win.scrollY, d = null;
    switch (e.key) {
      case "PageDown": d = vh; break;
      case "PageUp": d = -vh; break;
      case " ": d = e.shiftKey ? -vh : vh; break;
      case "ArrowDown": d = 110; break;
      case "ArrowUp": d = -110; break;
      case "Home": tweenTo(0); e.preventDefault(); return;
      case "End": tweenTo(maxY()); e.preventDefault(); return;
    }
    if (d === null || e.shiftKey && e.key !== " ") return;
    if (nestedCanScroll(t, d)) return;
    e.preventDefault();
    tweenTo(base + d);
  });

  function stepScroll(now, dt) {
    if (!S.mode) return;
    // Someone else moved the page (scrollbar drag, find-in-page): yield.
    if (S.lastSet !== null && Math.abs(win.scrollY - S.lastSet) > 3) { stopSmooth(); return; }
    var y;
    if (S.mode === "tween") {
      var tw = S.tween, p = clamp((now - tw.t0) / tw.dur, 0, 1);
      y = tw.from + (tw.to - tw.from) * easeInOut(p);
      if (p >= 1) { win.scrollTo(0, tw.to); stopSmooth(); return; }
    } else {
      var k = 1 - Math.pow(1 - 0.085, dt / 16.67);
      S.cur += (S.target - S.cur) * k;
      if (Math.abs(S.target - S.cur) < 0.4) { S.cur = S.target; }
      y = S.cur;
      if (S.cur === S.target) { win.scrollTo(0, y); stopSmooth(); return; }
    }
    win.scrollTo(0, y);
    S.lastSet = win.scrollY;
  }

  /* ======================================================================
     2. The merge graph
     ====================================================================== */
  var canvas = doc.createElement("canvas");
  canvas.className = "depth-canvas";
  canvas.setAttribute("aria-hidden", "true");
  doc.body.insertBefore(canvas, doc.body.firstChild);
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, dpr = 1, F = 1;
  var L = 7200;                    // world length of main
  var trunk = [], branches = [], packets = [];
  var cam = { x: 0, y: 0, tx: 0, ty: 0, z: 0 };
  var PAL;

  function syncPalette() {
    var light = root.getAttribute("data-theme") === "light";
    PAL = light
      ? { v: [110, 62, 214], t: [12, 156, 139], fill: "#FBFBF9", boost: 1.25, glow: 0.35 }
      : { v: [163, 113, 247], t: [53, 224, 203], fill: "#0A0C12", boost: 1, glow: 0.9 };
  }
  syncPalette();
  new MutationObserver(syncPalette).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  // Seeded RNG so the graph is the same shape on every visit.
  var seed = 20260505;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

  function build() {
    trunk = []; branches = []; packets = [];
    for (var z = 0; z >= -L; z -= 70) trunk.push({ x: 0, y: 0, z: z, r: 1 });
    var n = W < 700 ? 16 : 26;
    for (var i = 0; i < n; i++) {
      var z0 = -(i / n) * (L - 900) - rnd() * 260 + 200;
      var len = 520 + rnd() * 900;
      var rad = 150 + rnd() * 320;
      var th = rnd() * Math.PI * 2;
      var twist = (rnd() - 0.5) * 2.4;
      var pts = [], steps = Math.max(6, Math.round(len / 75));
      for (var s = 0; s <= steps; s++) {
        var t = s / steps;
        var R = rad * (smooth(0, 0.28, t) - smooth(0.72, 1, t));   // fork out, run, merge back
        var a = th + twist * t;
        pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, z: z0 - len * t, r: s === 0 || s === steps ? 2 : 0.8 });
      }
      branches.push({ pts: pts, teal: rnd() < 0.3 });
    }
    // Packets ride branches toward their merge, and main away from the camera.
    for (var p = 0; p < branches.length * 2; p++) packets.push({ b: p % branches.length, s: rnd(), v: 0.05 + rnd() * 0.08 });
    for (var q = 0; q < 10; q++) packets.push({ b: -1, s: rnd(), v: 0.004 + rnd() * 0.004 });
  }

  function size() {
    dpr = Math.min(win.devicePixelRatio || 1, 1.75);
    W = win.innerWidth; H = win.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    F = Math.max(W, H) * 0.62;
    if (!trunk.length || (W < 700) !== (branches.length === 16)) { seed = 20260505; build(); }
  }

  var rot = 0, cs = 1, sn = 0, cx = 0, cy = 0, OX = 0, OY = 0;
  // World → screen. Returns false when the point is behind or too far.
  function proj(p, o) {
    var x = p.x * cs - p.y * sn, y = p.x * sn + p.y * cs;
    var zr = cam.z - p.z;
    if (zr < 12) return false;
    var k = F / zr;
    o.x = cx + (x - cam.x - OX) * k;
    o.y = cy + (y - cam.y - OY) * k;
    o.k = k;
    o.a = smooth(3600, 1100, zr) * smooth(30, 260, zr);
    return o.a > 0.01;
  }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a.toFixed(3) + ")"; }

  var A = { x: 0, y: 0, k: 0, a: 0 }, B = { x: 0, y: 0, k: 0, a: 0 };
  function drawLine(pts, col, wMul, aMul) {
    for (var i = 0; i < pts.length - 1; i++) {
      if (!proj(pts[i], A) || !proj(pts[i + 1], B)) continue;
      var a = Math.min(A.a, B.a) * aMul * PAL.boost;
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = clamp((A.k + B.k) * 0.5 * wMul, 0.35, 3.2);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
  }
  function drawNodes(pts, col, aMul) {
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!proj(p, A)) continue;
      var r = clamp(A.k * 5.5 * p.r, 0.8, 11);
      var a = A.a * aMul * PAL.boost;
      ctx.beginPath(); ctx.arc(A.x, A.y, r, 0, 6.2832);
      if (r > 2.2) {                     // near commits read as git-graph rings
        ctx.fillStyle = PAL.fill; ctx.fill();
        ctx.lineWidth = clamp(r * 0.32, 1, 3);
        ctx.strokeStyle = rgba(col, a); ctx.stroke();
        if (p.r > 1) { ctx.beginPath(); ctx.arc(A.x, A.y, r * 0.45, 0, 6.2832); ctx.fillStyle = rgba(col, a); ctx.fill(); }
      } else { ctx.fillStyle = rgba(col, a); ctx.fill(); }
    }
  }
  function along(pts, s, o) {
    var f = s * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    var p = pts[i], q = pts[i + 1];
    o.x = p.x + (q.x - p.x) * t; o.y = p.y + (q.y - p.y) * t; o.z = p.z + (q.z - p.z) * t;
    return o;
  }

  var P0 = { x: 0, y: 0, z: 0 }, P1 = { x: 0, y: 0, z: 0 };
  function draw(dt, scrollY) {
    ctx.clearRect(0, 0, W, H);
    // Off-axis camera: main enters from the lower right and recedes toward
    // a vanishing point just right of centre, so the graph reads in depth.
    var wide = W > 860;
    cx = W * (wide ? 0.58 : 0.5); cy = H * 0.38;
    var ox = wide ? -340 : -160, oy = -230;
    var my = Math.max(1, maxY());
    cam.z = 520 - (scrollY / my) * (L - 1400);
    OX = ox; OY = oy;
    cam.x += (cam.tx - cam.x) * 0.05; cam.y += (cam.ty - cam.y) * 0.05;
    rot += dt * 0.00005; rot = rot % 6.2832;
    var r = rot + scrollY * 0.00022;
    cs = Math.cos(r); sn = Math.sin(r);

    ctx.lineCap = "round";
    for (var b = 0; b < branches.length; b++) {
      var br = branches[b], col = br.teal ? PAL.t : PAL.v;
      drawLine(br.pts, col, 1.6, 0.55);
    }
    drawLine(trunk, PAL.v, 3, 0.8);
    for (b = 0; b < branches.length; b++) drawNodes(branches[b].pts, branches[b].teal ? PAL.t : PAL.v, 0.9);
    drawNodes(trunk, PAL.v, 1);

    // Packets: short bright streaks along the edges.
    for (var i = 0; i < packets.length; i++) {
      var pk = packets[i], pts = pk.b < 0 ? trunk : branches[pk.b].pts;
      pk.s += pk.v * dt / 1000; if (pk.s > 1) pk.s -= 1;
      along(pts, pk.s, P0); along(pts, Math.max(0, pk.s - (pk.b < 0 ? 0.004 : 0.06)), P1);
      if (!proj(P0, A) || !proj(P1, B)) continue;
      var c = pk.b >= 0 && branches[pk.b].teal ? PAL.t : PAL.v;
      var g = ctx.createLinearGradient(B.x, B.y, A.x, A.y);
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(1, rgba(c, Math.min(1, A.a * 1.2 * PAL.boost)));
      ctx.strokeStyle = g; ctx.lineWidth = clamp(A.k * 4, 1, 4.5);
      ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(A.x, A.y); ctx.stroke();
      var hr = clamp(A.k * 3, 1, 4);     // halo + head; cheaper than shadowBlur
      ctx.beginPath(); ctx.arc(A.x, A.y, hr * 2.6, 0, 6.2832);
      ctx.fillStyle = rgba(c, A.a * 0.18 * PAL.glow); ctx.fill();
      ctx.beginPath(); ctx.arc(A.x, A.y, hr, 0, 6.2832);
      ctx.fillStyle = rgba(c, Math.min(1, A.a * 1.4)); ctx.fill();
    }
  }

  if (fine) {
    win.addEventListener("pointermove", function (e) {
      cam.tx = (e.clientX / W - 0.5) * 140;
      cam.ty = (e.clientY / H - 0.5) * 100;
    }, { passive: true });
  }

  /* ======================================================================
     3. Scroll-driven depth on the page itself
     ====================================================================== */
  var hero = doc.querySelector(".hero");
  var heroShell = hero && hero.querySelector(".hero-shell");
  var panels = Array.prototype.map.call(doc.querySelectorAll("main > section:not(.hero)"), function (sec) {
    return { sec: sec, el: sec.querySelector(":scope > .shell"), last: "" };
  }).filter(function (p) { return p.el; });
  var heroLast = "";

  function set(el, tf, op, cache) {
    var key = tf + "|" + op;
    if (key === cache) return cache;
    el.style.transform = tf;
    el.style.opacity = op;
    return key;
  }

  function layout() {
    var vh = win.innerHeight;
    var y = win.scrollY;
    if (heroShell) {
      var h = clamp(y / (hero.offsetHeight * 0.85), 0, 1);
      heroLast = set(heroShell, h < 0.001 ? "none" :
        "perspective(1300px) translate3d(0," + (h * 60).toFixed(1) + "px," + (-h * 260).toFixed(1) + "px) rotateX(" + (h * 12).toFixed(2) + "deg)",
        h < 0.001 ? "" : (1 - h * 0.85).toFixed(3), heroLast);
    }
    var mobile = W < 700;
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i], r = p.sec.getBoundingClientRect();
      if (r.top > vh * 1.1 || r.bottom < -vh * 0.1) continue;
      var e = 1 - Math.pow(1 - clamp((vh - r.top) / (vh * 0.6), 0, 1), 3);   // entering
      var x = clamp((vh * 0.3 - r.bottom) / (vh * 0.45), 0, 1);             // leaving
      var tf, op;
      if (e >= 0.999 && x <= 0.001) { tf = "none"; op = ""; }
      else {
        var rx = (1 - e) * (mobile ? 9 : 16) - x * 10;
        var tz = -(1 - e) * (mobile ? 90 : 200) - x * 160;
        var ty = (1 - e) * 70;
        tf = "perspective(1400px) translate3d(0," + ty.toFixed(1) + "px," + tz.toFixed(1) + "px) rotateX(" + rx.toFixed(2) + "deg)";
        op = ((0.15 + 0.85 * e) * (1 - x * 0.7)).toFixed(3);
      }
      p.last = set(p.el, tf, op, p.last);
    }
    // Backdrop stays vivid in the hero and settles behind reading sections.
    canvas.style.opacity = (1 - 0.5 * clamp(y / (vh * 0.9), 0, 1)).toFixed(3);
  }

  /* ======================================================================
     Loop
     ====================================================================== */
  var running = false, last = 0;
  function frame(now) {
    if (!running) return;
    var dt = Math.min(64, now - (last || now)); last = now;
    stepScroll(now, dt);
    draw(dt, win.scrollY);
    layout();
    raf(frame);
  }
  function kick() { if (!running && !doc.hidden) { running = true; last = 0; raf(frame); } }
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) running = false; else kick(); });
  win.addEventListener("resize", function () { size(); layout(); });
  size(); layout(); kick();
})();
