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
  }

  // Theme Toggle
  var themeToggle = doc.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var current = doc.documentElement.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var next = current === "dark" ? "light" : "dark";
      doc.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }


  // Hero entrance is pure CSS (§10.1); no JS needed for it.
  // Scroll reveals (§10.3)
  var revealTargets = doc.querySelectorAll("main > section:not(.hero)");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(function (s) { io.observe(s); });
  } else {
    revealTargets.forEach(function (s) { s.classList.add("in"); });
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

  getJSON("data/activity.json").then(function (a) {
    if (!a) return;
    /* hydrate baked curated states from live data */
    if (Array.isArray(a.curated)) {
      var merged = 0;
      a.curated.forEach(function (c) {
        if (c.state === "merged") merged++;
        var cell = doc.querySelector('[data-pr="' + c.repo + "#" + c.number + '"] .col-state');
        if (cell && c.state) { cell.textContent = ""; cell.appendChild(chip(c.state)); }
      });
      var mc = doc.querySelector("[data-merged-count]");
      if (mc && merged >= 8) mc.textContent = String(merged);
    }
    /* append recent activity */
    var body = doc.getElementById("recent-body");
    var wrap = doc.getElementById("recent-activity");
    if (body && wrap && Array.isArray(a.recent) && a.recent.length) {
      a.recent.slice(0, 6).forEach(function (r) {
        var tr = doc.createElement("tr");
        var s = doc.createElement("td"); s.className = "col-state"; s.appendChild(chip(r.state || "open"));
        var repo = doc.createElement("td"); repo.className = "col-repo"; repo.textContent = r.repo;
        var title = doc.createElement("td"); title.className = "col-title";
        var link = doc.createElement("a");
        link.href = r.url; link.target = "_blank"; link.rel = "noopener";
        link.textContent = r.title || (r.repo + " #" + r.number);
        title.appendChild(link);
        var date = doc.createElement("td"); date.className = "col-date";
        date.textContent = (r.updated_at || r.merged_at || "").slice(0, 10);
        tr.appendChild(s); tr.appendChild(repo); tr.appendChild(title); tr.appendChild(date);
        body.appendChild(tr);
      });
      wrap.hidden = false;
    }
  });

  // 1. Spotlight border glow cards
  var glowCards = doc.querySelectorAll(".glow-card");
  if (glowCards.length && !reduce) {
    doc.addEventListener("mousemove", function (e) {
      glowCards.forEach(function (card) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty("--mx", x + "px");
        card.style.setProperty("--my", y + "px");
      });
    });
  }

  // 2. Command Palette (Cmd+K)
  var cmdk = doc.getElementById("cmdk");
  var cmdkTrigger = doc.getElementById("cmdk-trigger");
  var cmdkInput = doc.getElementById("cmdk-input");
  var cmdkResults = doc.getElementById("cmdk-results");
  var cmdkBackdrop = cmdk ? cmdk.querySelector(".cmdk-backdrop") : null;

  var cmdkItems = [
    { name: "Jump to: Hero Section", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "top"; } },
    { name: "Jump to: Case Study (mcp-persist)", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "work"; } },
    { name: "Jump to: Merged PR Ledger", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "ledger"; } },
    { name: "Jump to: Foundations / Systems", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "foundations"; } },
    { name: "Jump to: Now / About", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "about"; } },
    { name: "Jump to: Contact / Links", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "contact"; } },
    { name: "Jump to: Interactive Terminal", category: "Navigation", icon: "arrow-right", action: function() { window.location.hash = "console"; } },
    { name: "Action: Toggle Light/Dark Mode", category: "Actions", icon: "sun", action: function() { 
      var toggleBtn = doc.getElementById("theme-toggle");
      if (toggleBtn) toggleBtn.click();
    } },
    { name: "Action: Download Resume PDF", category: "Actions", icon: "download", action: function() { 
      var link = doc.createElement("a");
      link.href = "Resume.pdf";
      link.target = "_blank";
      link.click();
    } },
    { name: "Action: Email Armaan", category: "Actions", icon: "mail", action: function() { window.location.href = "mailto:asandhu@wpi.edu"; } }
  ];

  var cmdkSelectedIdx = 0;
  var cmdkFiltered = [];

  function renderCmdkItems() {
    if (!cmdkResults) return;
    cmdkResults.innerHTML = "";
    var query = (cmdkInput ? cmdkInput.value : "").toLowerCase().trim();
    
    cmdkFiltered = cmdkItems.filter(function (item) {
      return item.name.toLowerCase().indexOf(query) !== -1 || item.category.toLowerCase().indexOf(query) !== -1;
    });

    if (cmdkFiltered.length === 0) {
      var noResults = doc.createElement("div");
      noResults.style.padding = "20px";
      noResults.style.color = "var(--ink-muted)";
      noResults.style.textAlign = "center";
      noResults.style.fontSize = "14px";
      noResults.textContent = "No commands found matching \"" + query + "\"";
      cmdkResults.appendChild(noResults);
      return;
    }

    if (cmdkSelectedIdx >= cmdkFiltered.length) {
      cmdkSelectedIdx = 0;
    }

    cmdkFiltered.forEach(function (item, idx) {
      var div = doc.createElement("div");
      div.className = "cmdk-item";
      div.setAttribute("data-selected", String(idx === cmdkSelectedIdx));
      
      var left = doc.createElement("div");
      left.className = "cmdk-item-left";
      
      // select svg based on category / action
      var svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "icon");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.75");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      
      var path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      if (item.icon === "download") {
        path.setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3");
      } else if (item.icon === "mail") {
        path.setAttribute("d", "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6");
      } else if (item.icon === "sun") {
        path.setAttribute("d", "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0");
      } else {
        path.setAttribute("d", "M5 12h14M12 5l7 7-7 7");
      }
      svg.appendChild(path);
      
      var text = doc.createElement("span");
      text.textContent = item.name;
      
      left.appendChild(svg);
      left.appendChild(text);
      
      var badge = doc.createElement("span");
      badge.className = "cmdk-item-badge";
      badge.textContent = item.category;
      
      div.appendChild(left);
      div.appendChild(badge);
      
      div.addEventListener("click", function () {
        executeCmdkItem(item);
      });

      cmdkResults.appendChild(div);
    });
  }

  function executeCmdkItem(item) {
    if (!item) return;
    closeCmdk();
    item.action();
  }

  function openCmdk() {
    if (!cmdk) return;
    cmdk.showModal();
    cmdkSelectedIdx = 0;
    if (cmdkInput) {
      cmdkInput.value = "";
      cmdkInput.focus();
    }
    renderCmdkItems();
  }

  function closeCmdk() {
    if (!cmdk) return;
    cmdk.close();
  }

  if (cmdkTrigger) {
    cmdkTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      openCmdk();
    });
  }
  if (cmdkBackdrop) {
    cmdkBackdrop.addEventListener("click", closeCmdk);
  }
  if (cmdk) {
    cmdk.addEventListener("close", function () {
      if (cmdkInput) cmdkInput.value = "";
    });
  }

  if (cmdkInput) {
    cmdkInput.addEventListener("input", function () {
      cmdkSelectedIdx = 0;
      renderCmdkItems();
    });
    
    cmdkInput.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        cmdkSelectedIdx = (cmdkSelectedIdx + 1) % cmdkFiltered.length;
        renderCmdkItems();
        var selectedEl = cmdkResults.querySelector('[data-selected="true"]');
        if (selectedEl) selectedEl.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        cmdkSelectedIdx = (cmdkSelectedIdx - 1 + cmdkFiltered.length) % cmdkFiltered.length;
        renderCmdkItems();
        var selectedEl = cmdkResults.querySelector('[data-selected="true"]');
        if (selectedEl) selectedEl.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (cmdkFiltered[cmdkSelectedIdx]) {
          executeCmdkItem(cmdkFiltered[cmdkSelectedIdx]);
        }
      }
    });
  }

  doc.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (cmdk && cmdk.open) {
        closeCmdk();
      } else {
        openCmdk();
      }
    }
  });


  // 3. Interactive CLI Terminal Console
  var termInput = doc.getElementById("term-input");
  var termBody = doc.getElementById("term-body");

  if (termInput && termBody) {
    // Keep focus inside terminal when clicking anywhere in terminal body
    var terminalBox = doc.querySelector(".terminal-box");
    if (terminalBox) {
      terminalBox.addEventListener("click", function () {
        termInput.focus();
      });
    }

    termInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var cmd = termInput.value.trim().toLowerCase();
        termInput.value = "";
        
        // Output prompt and original command
        var promptLine = doc.createElement("div");
        promptLine.className = "term-line";
        promptLine.innerHTML = '<span class="term-prompt">asandhu@wpi:~$</span> ' + escHtml(cmd);
        
        // Insert before prompt line
        var inputLine = termInput.parentElement;
        termBody.insertBefore(promptLine, inputLine);

        if (cmd) {
          var response = "";
          switch (cmd) {
            case "help":
              response = "Available commands:\n" +
                         "  <span class=\"text-merge\">about</span>       Print brief bio / background\n" +
                         "  <span class=\"text-merge\">skills</span>      Display core technical stack\n" +
                         "  <span class=\"text-merge\">merged</span>      View statistics on upstream contributions\n" +
                         "  <span class=\"text-merge\">downloads</span>   Show total downloads of mcp-persist\n" +
                         "  <span class=\"text-merge\">clear</span>       Clear the screen";
              break;
            case "about":
              response = "Armaan Sandhu · CS @ WPI\n" +
                         "Sophomore student developing open-source AI infrastructure.\n" +
                         "Wrote and maintained mcp-persist. WPI systems tutor and peer advisor.";
              break;
            case "skills":
              response = "<span class=\"text-merge\">[LANGUAGES]</span>\n" +
                         "  Java, Python, C / C++, Rust, Zig, x86 ASM, JavaScript, HTML / CSS\n\n" +
                         "<span class=\"text-merge\">[CONCEPTS & DOMAINS]</span>\n" +
                         "  Systems Programming, Language Runtimes, AI Agents & Tooling,\n" +
                         "  Browser Engines, Machine Organization & Assembly, Object-Oriented Design,\n" +
                         "  Linear Algebra, Applied Probability, Open Source\n\n" +
                         "<span class=\"text-merge\">[TOOLS & DEVOPS]</span>\n" +
                         "  Git, GDB, Linux, Bash, Valgrind, IntelliJ IDEA, VS Code";
              break;
            case "merged":
              response = "Contributions accepted upstream in reference implementations:\n" +
                         " - <span class=\"text-merge\">python/cpython</span> : configure.ac CYGWIN port bugfix\n" +
                         " - <span class=\"text-merge\">lancedb/lancedb</span> : DataFusion predicates and async executors\n" +
                         " - <span class=\"text-merge\">BerriAI/litellm proxy</span> : budget reservation and route discovery\n" +
                         " - <span class=\"text-merge\">lightpanda-io/browser</span> : W3C File API surface in Zig";
              break;
            case "downloads":
              var bakedDl = doc.querySelector("[data-downloads]");
              var dlText = bakedDl ? bakedDl.textContent : "8,000+";
              response = "mcp-persist downloads total on PyPI: <span class=\"text-merge\">" + dlText + "</span>";
              break;
            case "clear":
              // Clear everything except the prompt line
              while (termBody.firstChild && termBody.firstChild !== inputLine) {
                termBody.removeChild(termBody.firstChild);
              }
              response = null;
              break;
            default:
              response = "Command not found: '" + escHtml(cmd) + "'. Type <span class=\"text-merge\">help</span> to see options.";
          }

          if (response !== null) {
            var respLine = doc.createElement("div");
            respLine.className = "term-line";
            respLine.innerHTML = response;
            termBody.insertBefore(respLine, inputLine);
          }
        }

        // Scroll to bottom
        termBody.scrollTop = termBody.scrollHeight;
      }
    });
  }
})();
