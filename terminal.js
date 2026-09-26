/* terminal.js — the site as a shell.
   A small zsh-flavoured terminal that reads the page it lives on: every figure
   it prints comes from the DOM (the ledger, the receipts, the shipped cards),
   so it can never disagree with the page. Debug replays (sims.js) open in their
   own tab with a status line, so running one never wipes the shell.
   Exposes window.deckTerminal.debug(key) for the ledger's Debug buttons. */
(function () {
  "use strict";
  var doc = document;
  var term = doc.querySelector("[data-term]");
  if (!term) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;

  var shell = term.querySelector('[data-screen="shell"]');
  var replayScreen = term.querySelector('[data-screen="replay"]');
  var tabs = term.querySelector("[data-tabs]");
  var shellTab = term.querySelector('[data-tab="shell"]');
  var statusEl = term.querySelector("[data-status]");
  var input = doc.getElementById("term-input");
  var inputLine = input.closest(".t-input-line");
  var render = inputLine.querySelector(".t-render");
  var promptPath = inputLine.querySelector(".t-path");

  /* ======================================================================
     Page data — always read live from the DOM
     ====================================================================== */
  function text(sel, fallback) {
    var el = doc.querySelector(sel);
    return el ? el.textContent.trim() : fallback;
  }
  function prs() {
    return Array.prototype.map.call(doc.querySelectorAll("#ledger-body [data-pr]"), function (li) {
      var key = li.getAttribute("data-pr");
      var a = li.querySelector(".col-title a"), d = li.querySelector(".col-date"), w = li.querySelector(".col-why");
      return {
        key: key,
        repo: key.split("#")[0],
        num: key.split("#")[1],
        title: a ? a.textContent.trim() : key,
        url: a ? a.href : "https://github.com/" + key.replace("#", "/pull/"),
        date: d ? d.textContent.trim() : "",
        note: w ? w.textContent.trim() : "",
        hl: li.hasAttribute("data-hl")
      };
    });
  }
  function byRepo() {
    var m = {};
    prs().forEach(function (p) { (m[p.repo] = m[p.repo] || []).push(p); });
    return m;
  }
  function mergedTotal() {
    var el = doc.querySelector("[data-merged-count]");
    var baked = el ? parseInt(el.getAttribute("data-countup-target") || el.textContent, 10) || 0 : 0;
    return Math.max(baked, prs().length);
  }
  function short(repo) { return repo.split("/")[1]; }
  // How to name a PR in an example: the component in its title ("journalctl"
  // for "journalctl: make the read path…") when that finds exactly this PR,
  // otherwise its number. A bare number means nothing to a visitor.
  function exampleDebug() {
    var p = prs().filter(function (x) { return x.hl; })[0] || prs()[0];
    if (!p) return "debug";
    var m = p.title.match(/^([a-z][\w.-]*):/i);
    var hit = m && findPr(m[1]);
    return "debug " + (hit && hit.key === p.key ? m[1] : p.num);
  }
  function findPr(q) {
    q = q.toLowerCase().replace(/^#/, "");
    var all = prs(), i;
    for (i = 0; i < all.length; i++) if (all[i].num === q) return all[i];
    for (i = 0; i < all.length; i++) if (all[i].key.toLowerCase().indexOf(q) !== -1) return all[i];
    for (i = 0; i < all.length; i++) if (all[i].title.toLowerCase().indexOf(q) !== -1) return all[i];
    return null;
  }

  var SECTIONS = [
    ["work", "mcp-persist case study"], ["mlrouter", "the LLM gateway"], ["shipped", "other packages"],
    ["ledger", "every merged PR"], ["runixos", "the microkernel"], ["foundations", "the groundwork before it"],
    ["about", "what I'm doing now"], ["console", "this terminal"], ["contact", "how to reach me"],
    ["colophon", "how the site is built"]
  ];

  /* ======================================================================
     Output
     A line is built from parts: a string, or {t, c} for a styled span,
     {t, cmd} for a clickable command, {t, href} for a link.
     ====================================================================== */
  function span(p) {
    if (typeof p === "string") return doc.createTextNode(p);
    var el;
    if (p.cmd || p.go) {
      el = doc.createElement("button");
      el.type = "button";
      el.className = "t-cmd";
      el.setAttribute(p.go ? "data-go" : "data-run", p.go || p.cmd);
    } else if (p.href) {
      el = doc.createElement("a");
      el.href = p.href;
      if (!/^mailto:|^#/.test(p.href)) { el.target = "_blank"; el.rel = "noopener"; }
      el.className = "t-link";
    } else {
      el = doc.createElement("span");
    }
    if (p.c) el.className += (el.className ? " " : "") + p.c;
    el.textContent = p.t;
    return el;
  }
  function line(screen, parts, cls) {
    var div = doc.createElement("div");
    div.className = "t-line" + (cls ? " " + cls : "");
    (Array.isArray(parts) ? parts : [parts]).forEach(function (p) { div.appendChild(span(p)); });
    if (screen === shell) shell.insertBefore(div, inputLine); else screen.appendChild(div);
    screen.scrollTop = screen.scrollHeight;
    return div;
  }
  function say(parts, cls) { return line(shell, parts, cls); }
  function blank(screen) { line(screen || shell, " ", "t-gap"); }
  function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }

  // sims.js line markup: "# " note, "!" fail, "+" pass, "*" accent, and the
  // same three inline as [[!text]], [[+text]], [[*text]].
  var MARK = { "!": "t-err", "+": "t-ok", "*": "t-acc" };
  function simParts(s) {
    if (s.indexOf("# ") === 0) return { parts: [s], cls: "t-dim" };
    var cls = MARK[s.charAt(0)];
    if (cls) return { parts: [{ t: s.slice(1), c: cls }] };
    var parts = [], re = /\[\[([!+*])([\s\S]*?)\]\](?!\])/g, last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      parts.push({ t: m[2], c: MARK[m[1]] });
      last = re.lastIndex;
    }
    if (last < s.length) parts.push(s.slice(last));
    return { parts: parts.length ? parts : [" "] };
  }

  /* ======================================================================
     Prompt, cursor and autosuggestion
     ====================================================================== */
  var cwd = "~";
  var history = [];
  var hIdx = 0, hDraft = "";

  function candidates() {
    var c = history.slice().reverse();
    Object.keys(COMMANDS).forEach(function (n) { if (!COMMANDS[n].hidden) c.push(n); });
    prs().forEach(function (p) { c.push("debug " + p.num); });
    Object.keys(byRepo()).forEach(function (r) { c.push("merged " + short(r)); });
    SECTIONS.forEach(function (s) { c.push("cd " + s[0]); });
    return c;
  }
  function suggestion(v) {
    if (!v) return "";
    var lv = v.toLowerCase(), c = candidates();
    for (var i = 0; i < c.length; i++) {
      if (c[i].length > v.length && c[i].toLowerCase().indexOf(lv) === 0) return c[i];
    }
    return "";
  }

  function draw() {
    var v = input.value;
    var pos = input.selectionStart == null ? v.length : input.selectionStart;
    var sug = pos === v.length ? suggestion(v) : "";
    render.textContent = "";
    render.appendChild(doc.createTextNode(v.slice(0, pos)));
    var cur = doc.createElement("span");
    cur.className = "t-cursor";
    cur.textContent = v.charAt(pos) || (sug ? sug.charAt(v.length) : "") || " ";
    render.appendChild(cur);
    if (pos < v.length) render.appendChild(doc.createTextNode(v.slice(pos + 1)));
    else if (sug.length > v.length + 1) {
      var g = doc.createElement("span");
      g.className = "t-ghost";
      g.textContent = sug.slice(v.length + 1);
      render.appendChild(g);
    }
    if (sug && pos === v.length) cur.classList.add("on-ghost");
    render.setAttribute("data-suggest", sug);
  }
  function setValue(v) {
    input.value = v;
    input.setSelectionRange(v.length, v.length);
    draw();
  }
  function setCwd(p) {
    cwd = p;
    promptPath.textContent = p;
  }
  function promptParts(cmd) {
    return [{ t: cwd, c: "t-path" }, { t: " ❯ ", c: "t-char" }, cmd];
  }

  ["input", "keyup", "click", "select", "focus", "blur"].forEach(function (ev) {
    input.addEventListener(ev, function () {
      term.classList.toggle("is-focused", doc.activeElement === input);
      draw();
    });
  });
  // Clicking the screen focuses the prompt, unless the click was on something
  // interactive or the reader is selecting text to copy.
  shell.addEventListener("click", function (e) {
    var run = e.target.closest("[data-run]");
    if (run) { exec(run.getAttribute("data-run"), true); return; }
    if (e.target.closest("a, button")) return;
    if (String(window.getSelection()) !== "") return;
    input.focus({ preventScroll: true });
  });
  replayScreen.addEventListener("click", function (e) {
    if (e.target.closest("[data-go]")) { showTab("shell"); return; }
    var run = e.target.closest("[data-run]");
    if (run) { showTab("shell"); exec(run.getAttribute("data-run"), true); }
  });

  input.addEventListener("keydown", function (e) {
    var v = input.value;
    var atEnd = input.selectionStart === v.length;
    if (e.key === "Enter") {
      e.preventDefault();
      exec(v, false);
    } else if ((e.key === "ArrowRight" || e.key === "End") && atEnd && suggestion(v)) {
      e.preventDefault();
      setValue(suggestion(v));
    } else if (e.key === "Tab") {
      e.preventDefault();
      completeTab(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hIdx === history.length) hDraft = v;
      if (hIdx > 0) { hIdx--; setValue(history[hIdx]); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hIdx < history.length) { hIdx++; setValue(hIdx === history.length ? hDraft : history[hIdx]); }
    } else if (e.key.toLowerCase() === "l" && e.ctrlKey) {
      e.preventDefault();
      clearShell();
    } else if (e.key.toLowerCase() === "c" && e.ctrlKey && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      say(promptParts(v + "^C"));
      setValue("");
    } else if (e.key.toLowerCase() === "u" && e.ctrlKey) {
      e.preventDefault();
      setValue("");
    }
  });

  function completeTab(v) {
    var lv = v.toLowerCase();
    var hits = candidates().filter(function (c, i, all) {
      return c.toLowerCase().indexOf(lv) === 0 && all.indexOf(c) === i;
    });
    if (!v || !hits.length) return;
    if (hits.length === 1) { setValue(hits[0] + (COMMANDS[hits[0]] && COMMANDS[hits[0]].arg ? " " : "")); return; }
    // Extend to the longest shared prefix, then list what's left, zsh style.
    var pre = hits[0];
    hits.forEach(function (h) { while (h.toLowerCase().indexOf(pre.toLowerCase()) !== 0) pre = pre.slice(0, -1); });
    if (pre.length > v.length) { setValue(pre); return; }
    say(promptParts(v));
    var row = [];
    hits.slice(0, 24).forEach(function (h) { row.push({ t: h, cmd: h }, "   "); });
    if (hits.length > 24) row.push({ t: "+" + (hits.length - 24) + " more", c: "t-dim" });
    say(row, "t-wrap");
  }

  /* ======================================================================
     Commands
     ====================================================================== */
  var COMMANDS = {
    help: { desc: "what you can type here", run: function () {
      var rows = [
        ["whoami", "who I am, on one screen"],
        ["merged", "merges by repository · merged <repo> lists them"],
        [exampleDebug(), "replay a fix from the ledger"],
        ["log", "latest merges, newest first"],
        ["projects", "packages I maintain"],
        ["ls", "sections of this page · cd <name> jumps there"],
        ["skills", "languages and tools"],
        ["contact", "email, GitHub, LinkedIn"]
      ];
      rows.forEach(function (r) {
        say(["  ", { t: r[0], cmd: r[0] }, pad("", 18 - r[0].length), { t: r[1], c: "t-dim" }]);
      });
      blank();
      say({ t: "Tab completes · → accepts a suggestion · ↑↓ history · Ctrl+L clears", c: "t-dim" });
    } },

    whoami: { desc: "who I am", run: function () {
      var repos = byRepo(), names = Object.keys(repos).sort(function (a, b) { return repos[b].length - repos[a].length; });
      var top = names.slice(0, 3).map(function (r) { return short(r) + " " + repos[r].length; }).join(", ");
      var ver = text("[data-bake='version']", "");
      say({ t: "Armaan Sandhu", c: "t-strong" });
      say({ t: "Computer science at WPI · BS/MS '29 · Worcester, MA", c: "t-dim" });
      blank();
      say([{ t: "upstream  ", c: "t-dim" }, { t: String(mergedTotal()), c: "t-acc" }, " merged PRs across " + names.length + " repositories (" + top + ")"]);
      say([{ t: "shipping  ", c: "t-dim" }, { t: "mcp-persist", cmd: "cd work" }, " · " + text("[data-downloads]", "18,000+") + " downloads" + (ver ? " · v" + ver : "")]);
      say([{ t: "building  ", c: "t-dim" }, { t: "mlrouter", cmd: "cd mlrouter" }, " · multi-model LLM gateway · ", { t: "mlrouter.com", href: "https://mlrouter.com" }]);
      say([{ t: "open to   ", c: "t-dim" }, text(".hero-availability b", "Summer 2027") + " software engineering internships"]);
      say([{ t: "reach me  ", c: "t-dim" }, { t: "asandhu@wpi.edu", href: "mailto:asandhu@wpi.edu" }]);
    } },

    merged: { desc: "merges by repository", arg: true, run: function (args) {
      var repos = byRepo();
      var names = Object.keys(repos).sort(function (a, b) { return repos[b].length - repos[a].length || a.localeCompare(b); });
      if (args) {
        var q = args.toLowerCase();
        var hit = names.filter(function (r) { return r.toLowerCase().indexOf(q) !== -1; })[0];
        if (!hit) {
          say([{ t: "merged: no repository matches “" + args + "”", c: "t-err" }]);
          say(["repositories: "].concat(names.map(function (r, i) { return [{ t: short(r), cmd: "merged " + short(r) }, i < names.length - 1 ? ", " : ""]; }).reduce(function (a, b) { return a.concat(b); }, [])));
          return;
        }
        say([{ t: hit, c: "t-strong" }, { t: "  " + repos[hit].length + " merged", c: "t-dim" }]);
        repos[hit].forEach(function (p) {
          say([{ t: "#" + p.num, cmd: "debug " + p.num, c: "t-num" }, pad("", 7 - p.num.length), { t: p.date + "  ", c: "t-dim" }, { t: p.title, href: p.url }], "t-row");
        });
        blank();
        say({ t: "Click a number to replay that fix.", c: "t-dim" });
        return;
      }
      var max = repos[names[0]].length, width = Math.max.apply(null, names.map(function (n) { return n.length; }));
      names.forEach(function (r) {
        var n = repos[r].length;
        say([{ t: r, cmd: "merged " + short(r) }, pad("", width + 2 - r.length), { t: pad(String(n), 4), c: "t-num" },
             { t: new Array(Math.max(1, Math.round(n / max * 24)) + 1).join("█"), c: "t-bars" }], "t-row");
      });
      blank();
      say([{ t: mergedTotal() + " merged across " + names.length + " repositories. ", c: "t-dim" }, { t: "Pick one to list its PRs.", c: "t-dim" }]);
    } },

    debug: { desc: "replay a fix", arg: true, run: function (args) {
      if (!args) {
        say(["usage: debug <pr number, repo or keyword>"]);
        say({ t: "Highlights:", c: "t-dim" });
        prs().filter(function (p) { return p.hl; }).forEach(function (p) {
          say(["  ", { t: p.num, cmd: "debug " + p.num, c: "t-num" }, pad("", 8 - p.num.length), { t: pad(short(p.repo), 11), c: "t-dim" }, p.title], "t-row");
        });
        return;
      }
      var p = findPr(args);
      if (!p) {
        say({ t: "debug: no merged PR matches “" + args + "”", c: "t-err" });
        say(["try ", { t: "merged", cmd: "merged" }, " to browse them, or ", { t: "debug", cmd: "debug" }, " for highlights"]);
        return;
      }
      say([{ t: "opening replay for " + p.key + " in a new tab", c: "t-dim" }]);
      startReplay(p);
    } },

    log: { desc: "latest merges", run: function () {
      prs().slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10).forEach(function (p) {
        var id = short(p.repo) + "#" + p.num;
        say([{ t: p.date + "  ", c: "t-dim" }, { t: id, cmd: "debug " + p.num, c: "t-num" }, pad("", 20 - id.length), { t: p.title, href: p.url }], "t-row");
      });
      blank();
      say([{ t: "The full list: ", c: "t-dim" }, { t: "cd ledger", cmd: "cd ledger" }]);
    } },

    projects: { desc: "packages I maintain", run: function () {
      var ver = text("[data-bake='version']", "");
      say([{ t: "mcp-persist", cmd: "cd work" }, pad("", 5), pad(text("[data-downloads]", "18,000+") + " downloads", 20), { t: (ver ? "v" + ver + " · " : "") + "durable event stores for MCP", c: "t-dim" }], "t-row");
      say([{ t: "mlrouter", cmd: "cd mlrouter" }, pad("", 8), pad("live", 20), { t: "multi-model LLM gateway", c: "t-dim" }], "t-row");
      doc.querySelectorAll(".ship-card").forEach(function (c) {
        var name = c.querySelector("h3"), v = c.querySelector(".ship-top .chip"), d = c.querySelector(".ship-desc");
        if (!name) return;
        var desc = d ? d.textContent.trim().split(/\.\s/)[0] : "";
        if (desc.length > 58) desc = desc.slice(0, 57) + "…";
        var nm = name.textContent.trim();
        say([{ t: nm, cmd: "cd shipped" }, pad("", 16 - nm.length), pad(v ? v.textContent.trim() : "", 20), { t: desc, c: "t-dim" }], "t-row");
      });
    } },

    ls: { desc: "sections of this page", run: function () {
      SECTIONS.forEach(function (s) {
        say([{ t: s[0] + "/", cmd: "cd " + s[0], c: "t-path" }, pad("", 13 - s[0].length), { t: s[1], c: "t-dim" }], "t-row");
      });
    } },

    cd: { desc: "jump to a section", arg: true, run: function (args) {
      var a = (args || "~").toLowerCase().replace(/^~\/?/, "").replace(/\/$/, "");
      if (a === "" || a === ".." || a === "top" || a === "home") {
        setCwd("~");
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        return;
      }
      if (a === "terminal") a = "console";
      var hit = SECTIONS.filter(function (s) { return s[0] === a; })[0] ||
                SECTIONS.filter(function (s) { return s[0].indexOf(a) === 0; })[0];
      var el = hit && doc.getElementById(hit[0]);
      if (!el) {
        say({ t: "cd: no such section: " + args, c: "t-err" });
        say(["try ", { t: "ls", cmd: "ls" }]);
        return;
      }
      setCwd("~/" + hit[0]);
      if (hit[0] !== "console") el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    } },

    skills: { desc: "languages and tools", run: function () {
      [["languages", "C, C++, Rust, Zig, Python, Java, x86 assembly, JavaScript"],
       ["systems", "Linux userspace, kernels, runtimes, browser engines, AI tooling"],
       ["tools", "Git, GDB, Valgrind, perf, sanitizers, fuzzers, Meson, Cargo"]].forEach(function (r) {
        say([{ t: pad(r[0], 11), c: "t-dim" }, r[1]]);
      });
    } },

    contact: { desc: "how to reach me", run: function () {
      say([{ t: "email     ", c: "t-dim" }, { t: "asandhu@wpi.edu", href: "mailto:asandhu@wpi.edu" }]);
      say([{ t: "github    ", c: "t-dim" }, { t: "github.com/Ar-maan05", href: "https://github.com/Ar-maan05" }]);
      say([{ t: "linkedin  ", c: "t-dim" }, { t: "linkedin.com/in/asandhu05", href: "https://www.linkedin.com/in/asandhu05" }]);
      say([{ t: "resume    ", c: "t-dim" }, { t: "Resume.pdf", href: "Resume.pdf" }]);
    } },

    history: { desc: "commands you've run", run: function () {
      history.forEach(function (h, i) { say([{ t: pad(String(i + 1), 5), c: "t-dim" }, { t: h, cmd: h }]); });
    } },

    clear: { desc: "clear the screen", run: function () { clearShell(); } },
    pwd: { hidden: true, run: function () { say(cwd.replace("~", "/home/armaan")); } },
    echo: { hidden: true, run: function (args) { say(args || " "); } },
    about: { hidden: true, alias: "whoami" },
    "git log": { hidden: true, alias: "log" },
    "ls projects": { hidden: true, alias: "projects" },
    "sudo hire-me": { hidden: true, alias: "whoami" }
  };

  function clearShell() {
    while (shell.firstChild && shell.firstChild !== inputLine) shell.removeChild(shell.firstChild);
  }

  // Levenshtein distance, for "did you mean".
  function dist(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) d[i] = [i];
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  function exec(raw, fromClick) {
    var cmdline = raw.trim();
    say(promptParts(cmdline), "t-echo");
    setValue("");
    if (!cmdline) return;
    if (history[history.length - 1] !== cmdline) history.push(cmdline);
    hIdx = history.length;
    if (fromClick && fine) input.focus({ preventScroll: true });

    var lower = cmdline.toLowerCase(), name = null, args = "";
    // Two-word commands first ("git log"), then the first word.
    Object.keys(COMMANDS).forEach(function (k) { if (k.indexOf(" ") !== -1 && lower === k) name = k; });
    if (!name) {
      var sp = cmdline.search(/\s/);
      name = (sp === -1 ? cmdline : cmdline.slice(0, sp)).toLowerCase();
      args = sp === -1 ? "" : cmdline.slice(sp + 1).trim();
    }
    var c = COMMANDS[name];
    if (c && c.alias) c = COMMANDS[c.alias];
    if (!c) {
      say({ t: "zsh: command not found: " + name, c: "t-err" });
      var best = Object.keys(COMMANDS).filter(function (k) { return !COMMANDS[k].hidden; })
        .map(function (k) { return [k, dist(name, k)]; })
        .sort(function (a, b) { return a[1] - b[1]; })[0];
      if (best && best[1] <= 2) say(["did you mean ", { t: best[0], cmd: best[0] }, "?"]);
      else say(["type ", { t: "help", cmd: "help" }, " to see what's here"]);
      return;
    }
    c.run(args);
    shell.scrollTop = shell.scrollHeight;
  }

  /* ======================================================================
     Tabs and the status line
     ====================================================================== */
  var replayTab = null, replayClose = null;

  function showTab(which) {
    var isShell = which === "shell";
    shell.hidden = !isShell;
    replayScreen.hidden = isShell;
    shellTab.setAttribute("aria-selected", String(isShell));
    shellTab.tabIndex = isShell ? 0 : -1;
    if (replayTab) { replayTab.setAttribute("aria-selected", String(!isShell)); replayTab.tabIndex = isShell ? -1 : 0; }
    term.setAttribute("data-mode", isShell ? "shell" : "replay");
    drawStatus();
    if (isShell && fine) input.focus({ preventScroll: true });
    (isShell ? shell : replayScreen).scrollTop = 1e9;
  }
  shellTab.addEventListener("click", function () { showTab("shell"); });
  tabs.addEventListener("keydown", function (e) {
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && replayTab) {
      e.preventDefault();
      var toReplay = doc.activeElement === shellTab;
      showTab(toReplay ? "replay" : "shell");
      (toReplay ? replayTab : shellTab).focus();
    }
  });

  function ensureReplayTab(p) {
    if (!replayTab) {
      var wrap = doc.createElement("div");
      wrap.className = "t-tabwrap";
      wrap.setAttribute("role", "presentation");
      replayTab = doc.createElement("button");
      replayTab.type = "button";
      replayTab.className = "t-tab";
      replayTab.id = "t-tab-replay";
      replayTab.setAttribute("role", "tab");
      replayTab.setAttribute("aria-controls", replayScreen.id);
      replayTab.addEventListener("click", function () { showTab("replay"); });
      replayClose = doc.createElement("button");
      replayClose.type = "button";
      replayClose.className = "t-tab-close";
      replayClose.setAttribute("aria-label", "Close replay");
      replayClose.textContent = "×";
      replayClose.addEventListener("click", function () {
        stopReplay();
        wrap.remove();
        replayTab = null;
        showTab("shell");
      });
      wrap.appendChild(replayTab);
      wrap.appendChild(replayClose);
      tabs.appendChild(wrap);
      replayScreen.setAttribute("aria-labelledby", replayTab.id);
    }
    replayTab.innerHTML = '<span class="t-tab-kind">replay</span> ';
    replayTab.appendChild(doc.createTextNode(short(p.repo) + "#" + p.num));
  }

  function drawStatus() {
    statusEl.textContent = "";
    var left = doc.createElement("span"), mid = doc.createElement("span"), right = doc.createElement("span");
    left.className = "ts-left"; mid.className = "ts-mid"; right.className = "ts-right";
    if (term.getAttribute("data-mode") === "replay" && R) {
      left.appendChild(span({ t: R.done ? "done" : R.paused ? "paused" : "replaying", c: "ts-mode" + (R.done ? " is-done" : "") }));
      var bar = doc.createElement("span");
      bar.className = "ts-steps";
      bar.setAttribute("aria-hidden", "true");
      for (var i = 0; i < R.steps.length; i++) {
        var seg = doc.createElement("i");
        if (i < R.i || R.done) seg.className = "is-done";
        else if (i === R.i) seg.className = "is-now";
        bar.appendChild(seg);
      }
      mid.appendChild(bar);
      mid.appendChild(span({ t: "step " + Math.min(R.i + 1, R.steps.length) + " of " + R.steps.length, c: "ts-count" }));
      right.appendChild(ctl(R.done ? "Replay" : R.paused ? "Resume" : "Pause", R.done ? restartReplay : togglePause));
      if (!R.done) right.appendChild(ctl("Skip", skipReplay));
      right.appendChild(span({ t: "PR ↗", href: R.p.url, c: "ts-btn" }));
    } else {
      left.appendChild(span({ t: "zsh", c: "ts-mode" }));
      mid.appendChild(span({ t: "Tab completes · → accepts · ↑↓ history", c: "ts-hint" }));
      var repos = Object.keys(byRepo()).length;
      right.appendChild(span({ t: mergedTotal() + " merged · " + repos + " repos", c: "ts-hint" }));
    }
    statusEl.appendChild(left); statusEl.appendChild(mid); statusEl.appendChild(right);
  }
  function ctl(label, fn) {
    var b = doc.createElement("button");
    b.type = "button";
    b.className = "ts-btn";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  }

  /* ======================================================================
     Replays
     ====================================================================== */
  var R = null;   // { p, steps, i, paused, done, timer, typing }

  function stepsFor(p) {
    var s = window.DECK_SIMS && window.DECK_SIMS[p.key];
    if (s) return s;
    // A merge the pipeline added after the replays were written: show what is
    // known for certain rather than inventing a reproduction.
    return [
      { c: "gh pr view " + p.num + " --repo " + p.repo + " --json title,state,mergedAt", o: [
        "title:  " + p.title, "+state:  MERGED" + (p.date ? "  " + p.date : "") ] },
      { c: "# no scripted replay for this one yet; the diff is one click away", o: [ "*" + p.url ] }
    ];
  }

  function startReplay(p) {
    stopReplay();
    R = { p: p, steps: stepsFor(p), i: 0, paused: false, done: false, timer: null };
    ensureReplayTab(p);
    replayScreen.textContent = "";
    line(replayScreen, [{ t: "# " + p.key + (p.date ? " · merged " + p.date : ""), c: "t-dim" }]);
    line(replayScreen, [{ t: "# ", c: "t-dim" }, { t: p.title, href: p.url }]);
    if (p.note) line(replayScreen, { t: "# " + p.note, c: "t-dim" }, "t-note");
    blank(replayScreen);
    showTab("replay");
    later(runStep, 350);
  }
  function later(fn, ms) {
    clearTimeout(R.timer);
    R.timer = setTimeout(fn, reduce ? 0 : ms);
  }
  function replayPrompt(st) {
    return st.p ? [{ t: st.p + " ", c: "t-path" }] : [{ t: "~/" + short(R.p.repo), c: "t-path" }, { t: " ❯ ", c: "t-char" }];
  }
  function runStep() {
    if (!R || R.paused) return;
    if (R.i >= R.steps.length) { finishReplay(); return; }
    var st = R.steps[R.i];
    var ln = line(replayScreen, replayPrompt(st));
    var typed = doc.createElement("span"), cur = doc.createElement("span");
    cur.className = "t-cursor";
    cur.textContent = " ";
    ln.appendChild(typed); ln.appendChild(cur);
    var k = 0;
    (function type() {
      if (!R || R.paused) { R && (R.resume = type); return; }
      if (k < st.c.length) {
        typed.textContent += st.c.charAt(k++);
        // Human-ish rhythm: quick runs, a beat after spaces.
        later(type, st.c.charAt(k - 1) === " " ? 70 : 18 + Math.random() * 26);
        return;
      }
      cur.remove();
      var j = 0, outs = st.o || [];
      (function print() {
        if (!R || R.paused) { R && (R.resume = print); return; }
        if (j < outs.length) {
          var sp = simParts(outs[j++]);
          line(replayScreen, sp.parts, sp.cls);
          later(print, 120);
          return;
        }
        R.i++;
        drawStatus();
        later(runStep, outs.length ? 650 : 250);
      })();
    })();
    drawStatus();
  }
  function finishReplay() {
    if (!R) return;
    R.done = true;
    blank(replayScreen);
    line(replayScreen, [{ t: "replay finished · ", c: "t-dim" }, { t: "view the PR", href: R.p.url }, { t: " · ", c: "t-dim" }, { t: "back to the shell", go: "shell" }]);
    drawStatus();
  }
  function togglePause() {
    if (!R || R.done) return;
    R.paused = !R.paused;
    if (!R.paused) { var fn = R.resume || runStep; R.resume = null; fn(); }
    drawStatus();
  }
  // Skip prints the rest of the replay at once.
  function skipReplay() {
    if (!R || R.done) return;
    clearTimeout(R.timer);
    var last = replayScreen.lastElementChild;
    if (last && last.querySelector(".t-cursor")) last.remove();
    for (; R.i < R.steps.length; R.i++) {
      var st = R.steps[R.i];
      line(replayScreen, replayPrompt(st).concat([st.c]));
      (st.o || []).forEach(function (o) { var sp = simParts(o); line(replayScreen, sp.parts, sp.cls); });
    }
    R.paused = false;
    finishReplay();
  }
  function restartReplay() { if (R) startReplay(R.p); }
  function stopReplay() { if (R) { clearTimeout(R.timer); R = null; } }

  /* ======================================================================
     Boot
     ====================================================================== */
  function motd() {
    var ex = exampleDebug();
    var repos = Object.keys(byRepo()).length;
    say([{ t: "This shell reads the page it lives on: ", c: "t-dim" }, mergedTotal() + " merged PRs across " + repos + " repositories."]);
    say(["Try ", { t: "help", cmd: "help" }, ", ", { t: "merged", cmd: "merged" }, ", or ",
         { t: ex, cmd: ex }, "."]);
    blank();
  }
  shell.querySelectorAll("[data-static]").forEach(function (n) { n.remove(); });
  motd();
  showTab("shell");
  draw();
  // The ledger may grow after activity.json lands; keep the counts honest.
  doc.addEventListener("deck:activity", drawStatus);

  window.deckTerminal = {
    debug: function (key) {
      var p = prs().filter(function (x) { return x.key === key; })[0];
      if (!p) return;
      term.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      say(promptParts("debug " + p.num), "t-echo");
      say([{ t: "opening replay for " + p.key + " in a new tab", c: "t-dim" }]);
      startReplay(p);
    }
  };
})();
