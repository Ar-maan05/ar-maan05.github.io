/* Core script: nav, scroll reveals, diff tab switcher, and same-origin hydration
   of the live receipts (stats.json + activity.json + diffs.json).
   Never renders an error string; never drops below baked floors. */
(function () {
  "use strict";
  var doc = document;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var activityData = null;

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
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var isArch = en.target.classList.contains("arch");
          var thresh = isArch ? 0.4 : 0.15;
          if (en.intersectionRatio >= thresh) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        }
      });
    }, { threshold: [0.15, 0.4] });
    revealTargets.forEach(function (s) { io.observe(s); });
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
    activityData = a;
    /* hydrate baked curated states from live data */
    if (Array.isArray(a.curated)) {
      var merged = 0;
      a.curated.forEach(function (c) {
        if (c.state === "merged") merged++;
        var cell = doc.querySelector('[data-pr="' + c.repo + "#" + c.number + '"] .col-state');
        if (cell && c.state) { cell.textContent = ""; cell.appendChild(chip(c.state)); }
      });
      var mc = doc.querySelector("[data-merged-count]");
      if (mc) {
        // The baked value is the floor; live data may only raise it (§6.1).
        var floor = parseInt(mc.textContent, 10) || 0;
        if (merged > floor) mc.textContent = String(merged);
      }
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

    // Terminal cursor: a fake block cursor that mirrors the hidden input. It sits
    // right after the echoed text so it moves as you type, and it blinks only when
    // idle (a short pause after the last keystroke), like a real terminal caret.
    var termEcho = doc.getElementById("term-echo");
    var promptLineEl = termInput.parentElement;
    var idleTimer = null;
    function cursorTyping() {
      if (!promptLineEl) return;
      promptLineEl.classList.add("typing");          // solid while keys are flying
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        promptLineEl.classList.remove("typing");     // resume blink when idle
      }, 600);
    }
    function cursorReset() {
      if (idleTimer) clearTimeout(idleTimer);
      if (termEcho) termEcho.textContent = "";
      if (promptLineEl) promptLineEl.classList.remove("typing");
    }
    termInput.addEventListener("input", function () {
      if (termEcho) termEcho.textContent = termInput.value;   // echo follows input
      cursorTyping();
    });

    function findPrKey(term) {
      term = term.toLowerCase().trim();
      var keys = [
        "python/cpython#150328",
        "lance-format/lance#6934",
        "lancedb/lancedb#3444",
        "lancedb/lancedb#3459",
        "lightpanda-io/browser#2537",
        "lightpanda-io/browser#2635",
        "BerriAI/litellm#29493",
        "BerriAI/litellm#29483",
        "BerriAI/litellm#30020"
      ];
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toLowerCase().indexOf(term) !== -1) {
          return keys[i];
        }
      }
      return null;
    }

    function triggerStatusError() {
      var termStatus = doc.querySelector(".terminal-status");
      var statusText = termStatus ? termStatus.querySelector(".status-text") : null;
      if (!termStatus || !statusText) return;
      termStatus.className = "terminal-status error";
      statusText.textContent = "CMD ERROR";
      setTimeout(function () {
        if (termStatus.classList.contains("error")) {
          termStatus.className = "terminal-status";
          statusText.textContent = "CONNECTED";
        }
      }, 1500);
    }

    var cmdHistory = [];
    var historyIdx = -1;
    var tempInput = "";
    var COMMANDS = ["help", "about", "skills", "merged", "downloads", "debug", "clear", "git log", "uptime", "ls projects", "contact", "sudo hire-me"];

    termInput.addEventListener("keydown", function (e) {
      cursorTyping();                                          // any key keeps it solid
      if (e.key === "Tab") {
        e.preventDefault();
        var val = termInput.value.trim().toLowerCase();
        if (val) {
          if (val.indexOf("debug ") === 0) {
            var sub = val.slice(6).trim();
            var prs = ["cpython", "lance", "lancedb", "browser", "lightpanda", "litellm", "150328", "6934", "3444", "3459", "2537", "2635", "29493", "29483", "30020"];
            var prMatches = prs.filter(function (p) {
              return p.indexOf(sub) === 0;
            });
            if (prMatches.length === 1) {
              termInput.value = "debug " + prMatches[0];
              if (termEcho) termEcho.textContent = termInput.value;
            } else if (prMatches.length > 1) {
              var matchLine = doc.createElement("div");
              matchLine.className = "term-line";
              matchLine.innerHTML = prMatches.map(function(p) { return "debug " + p; }).join("   ");
              var inputLine = termInput.parentElement;
              termBody.insertBefore(matchLine, inputLine);
              termBody.scrollTop = termBody.scrollHeight;
            }
          } else {
            var matches = COMMANDS.filter(function (c) {
              return c.indexOf(val) === 0;
            });
            if (matches.length === 1) {
              termInput.value = matches[0];
              if (termEcho) termEcho.textContent = termInput.value;
            } else if (matches.length > 1) {
              var matchLine = doc.createElement("div");
              matchLine.className = "term-line";
              matchLine.innerHTML = matches.join("   ");
              var inputLine = termInput.parentElement;
              termBody.insertBefore(matchLine, inputLine);
              termBody.scrollTop = termBody.scrollHeight;
            }
          }
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (historyIdx === cmdHistory.length) {
          tempInput = termInput.value;
        }
        if (historyIdx > 0) {
          historyIdx--;
          termInput.value = cmdHistory[historyIdx];
          if (termEcho) termEcho.textContent = termInput.value;
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIdx < cmdHistory.length - 1) {
          historyIdx++;
          termInput.value = cmdHistory[historyIdx];
          if (termEcho) termEcho.textContent = termInput.value;
        } else if (historyIdx === cmdHistory.length - 1) {
          historyIdx++;
          termInput.value = tempInput;
          if (termEcho) termEcho.textContent = termInput.value;
        }
      } else if (e.key === "Enter") {
        var cmd = termInput.value.trim().toLowerCase();
        termInput.value = "";
        cursorReset();   // clear the echo and let the cursor blink at an empty prompt

        // Output prompt and original command
        var promptLine = doc.createElement("div");
        promptLine.className = "term-line";
        promptLine.innerHTML = '<span class="term-prompt">asandhu@wpi:~$</span> ' + escHtml(cmd);
        
        // Insert before prompt line
        var inputLine = termInput.parentElement;
        termBody.insertBefore(promptLine, inputLine);

        if (cmd) {
          if (cmdHistory.length === 0 || cmdHistory[cmdHistory.length - 1] !== cmd) {
            cmdHistory.push(cmd);
          }
          historyIdx = cmdHistory.length;
          var response = "";
          if (cmd === "debug") {
            response = "Usage: <span class=\"text-merge\">debug &lt;repo_name or pr_number&gt;</span>\n" +
                       "Example: <span class=\"text-merge\">debug cpython</span>  or  <span class=\"text-merge\">debug 30020</span>";
          } else if (cmd.indexOf("debug ") === 0) {
            var query = cmd.slice(6).trim();
            var prKey = findPrKey(query);
            if (prKey) {
              setTimeout(function () {
                runSimulation(prKey);
              }, 100);
              response = null;
            } else {
              response = "No matching pull request found for '" + escHtml(query) + "'. Type <span class=\"text-merge\">merged</span> to see a list.";
              triggerStatusError();
            }
          } else {
            switch (cmd) {
              case "help":
                response = "Available commands:\n" +
                           "  <span class=\"text-merge\">about</span>       Print brief bio / background\n" +
                           "  <span class=\"text-merge\">skills</span>      Display core technical stack\n" +
                           "  <span class=\"text-merge\">merged</span>      View statistics on upstream contributions\n" +
                           "  <span class=\"text-merge\">downloads</span>   Show total downloads of mcp-persist\n" +
                           "  <span class=\"text-merge\">debug</span>       Run debugging simulation for a PR (e.g. debug cpython)\n" +
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
                var mergedPRs = [];
                
                // 1. Try parsing from the DOM first (covers curated ledger and recent activity)
                var rows = doc.querySelectorAll("#ledger-body tr, #recent-body tr");
                rows.forEach(function (row) {
                  var stateCell = row.querySelector(".col-state");
                  var isMerged = stateCell && stateCell.textContent.trim().toLowerCase() === "merged";
                  if (isMerged) {
                    var repoCell = row.querySelector(".col-repo");
                    var titleCell = row.querySelector(".col-title a");
                    var repo = repoCell ? repoCell.textContent.trim() : "";
                    var title = titleCell ? titleCell.textContent.trim() : "";
                    var prNum = "";
                    
                    var dataPr = row.getAttribute("data-pr");
                    if (dataPr && dataPr.indexOf("#") !== -1) {
                      prNum = dataPr.split("#")[1];
                    } else if (titleCell) {
                      var href = titleCell.getAttribute("href") || "";
                      var match = href.match(/\/pull\/(\d+)/);
                      if (match) prNum = match[1];
                    }
                    
                    if (repo && prNum && title) {
                      var exists = mergedPRs.some(function (p) {
                        return p.repo === repo && p.pr === prNum;
                      });
                      if (!exists) {
                        mergedPRs.push({ repo: repo, pr: prNum, title: title });
                      }
                    }
                  }
                });

                // 2. If DOM is not yet populated/accessible, check activityData
                if (mergedPRs.length === 0 && activityData) {
                  if (Array.isArray(activityData.curated)) {
                    activityData.curated.forEach(function (c) {
                      if (c.state === "merged") {
                        mergedPRs.push({ repo: c.repo, pr: c.number, title: c.title });
                      }
                    });
                  }
                  if (Array.isArray(activityData.recent)) {
                    activityData.recent.forEach(function (r) {
                      if (r.state === "merged") {
                        mergedPRs.push({ repo: r.repo, pr: r.number, title: r.title });
                      }
                    });
                  }
                }

                // 3. Fallback to the complete actual list of merged PRs if all else fails
                if (mergedPRs.length === 0) {
                  mergedPRs = [
                    { repo: "python/cpython", pr: "150328", title: "gh-150311: Fix minor issues in configure.ac for the CYGWIN port" },
                    { repo: "lance-format/lance", pr: "6934", title: "feat(rust): support datafusion expressions for merge insert predicates" },
                    { repo: "lancedb/lancedb", pr: "3444", title: "feat(rust): support datafusion expressions for merge insert predicates" },
                    { repo: "lancedb/lancedb", pr: "3459", title: "fix(python): run AsyncTable.search embeddings on a dedicated executor" },
                    { repo: "lightpanda-io/browser", pr: "2537", title: "feat(webapi): implement W3C File API" },
                    { repo: "lightpanda-io/browser", pr: "2635", title: "Implement input type=file support (FileList, input.files/value, DOM.setFileInputFiles)" },
                    { repo: "BerriAI/litellm", pr: "29493", title: "feat(proxy): add disable_budget_reservation general setting" },
                    { repo: "BerriAI/litellm", pr: "29483", title: "fix(proxy): don't enforce budgets on model-discovery / info routes" },
                    { repo: "BerriAI/litellm", pr: "30020", title: "fix(proxy): release max_parallel_requests slot when a stream is cancelled mid-flight" }
                  ];
                }

                response = "Upstream merged pull requests:\n";
                mergedPRs.forEach(function (pr) {
                  response += " - <span class=\"text-merge\">" + escHtml(pr.repo) + "#" + pr.pr + "</span>: " + escHtml(pr.title) + "\n";
                });
                response = response.trim();
                break;
              case "downloads":
                var bakedDl = doc.querySelector("[data-downloads]");
                var dlText = bakedDl ? bakedDl.textContent : "8,000+";
                response = "mcp-persist downloads total on PyPI: <span class=\"text-merge\">" + dlText + "</span>";
                break;
              case "git log":
                // Decorative log that mirrors the real ledger (§17.9B). Hashes are
                // hardcoded plausible hex; * and hash render in merge, message in ink.
                response = "<span class=\"text-merge\">* a3f9c2e</span> (HEAD → main) feat(webapi): implement W3C File API\n" +
                           "<span class=\"text-merge\">* 71bd44a</span> fix(python): run AsyncTable.search on dedicated executor\n" +
                           "<span class=\"text-merge\">* c8e1f03</span> feat(rust): support datafusion expressions\n" +
                           "<span class=\"text-merge\">* 2d8a991</span> gh-150311: Fix minor issues in configure.ac";
                break;
              case "uptime":
                // Pulls the live download figure from the data-bake span when present.
                var upDl = doc.querySelector("[data-downloads]");
                var upText = upDl ? upDl.textContent.trim() : "8,000+";
                response = "up " + escHtml(upText) + " PyPI installations · 8 upstream merges · 0 regrets";
                break;
              case "ls projects":
                // Live download + version values, so this listing never goes stale
                // or drops below the baked floor (§17.9B, Verification Mandate).
                var lsDl = doc.querySelector("[data-downloads]");
                var lsDlText = lsDl ? lsDl.textContent.trim() : "8,000+";
                var lsVer = doc.querySelector("[data-bake='version']");
                var lsVerText = lsVer ? "v" + lsVer.textContent.trim() : "v1.8.x";
                response = "drwxr-xr-x  mcp-persist/       " + escHtml(lsDlText) + " downloads · MIT · " + escHtml(lsVerText) + "\n" +
                           "drwxr-xr-x  cpython/           merged upstream\n" +
                           "drwxr-xr-x  lancedb/           2 PRs merged\n" +
                           "drwxr-xr-x  lightpanda/        2 PRs merged · Zig\n" +
                           "drwxr-xr-x  litellm/           2 PRs merged";
                break;
              case "contact":
                response = "email    asandhu@wpi.edu\n" +
                           "github   github.com/Ar-maan05\n" +
                           "linkedin linkedin.com/in/asandhu05";
                break;
              case "sudo hire-me":
                response = "[sudo] password for recruiter: ••••••••\n" +
                           "Permission granted. → asandhu@wpi.edu";
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
                triggerStatusError();
            }
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
  var isSimulating = false;
  function runSimulation(simKey) {
    if (isSimulating) return;
    isSimulating = true;

    var consoleSection = doc.getElementById("console");
    if (consoleSection) {
      consoleSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (!termInput || !termBody) {
      isSimulating = false;
      return;
    }

    termInput.blur();
    termInput.disabled = true;
    var inputLine = termInput.parentElement;
    if (inputLine) inputLine.style.display = "none";

    while (termBody.firstChild && termBody.firstChild !== inputLine) {
      termBody.removeChild(termBody.firstChild);
    }

    var termTitle = doc.querySelector(".terminal-title");
    if (termTitle) termTitle.textContent = "asandhu@wpi: ~ [Debugging: " + simKey.split("#")[0] + "]";

    var termStatus = doc.querySelector(".terminal-status");
    var statusText = termStatus ? termStatus.querySelector(".status-text") : null;
    if (termStatus && statusText) {
      termStatus.className = "terminal-status debugging";
      statusText.textContent = "DEBUGGING";
    }

    function printLine(html, className) {
      var div = doc.createElement("div");
      div.className = className || "term-line";
      div.innerHTML = html;
      termBody.insertBefore(div, inputLine);
      termBody.scrollTop = termBody.scrollHeight;
    }

    function typeCommand(promptText, cmdText, callback) {
      var div = doc.createElement("div");
      div.className = "term-line prompt-line typing";
      div.innerHTML = '<span class="term-prompt">' + promptText + '</span> <span class="term-render"><span class="term-echo"></span><span class="term-cursor">█</span></span>';
      termBody.insertBefore(div, inputLine);
      termBody.scrollTop = termBody.scrollHeight;

      var echo = div.querySelector(".term-echo");
      var idx = 0;
      function step() {
        if (idx < cmdText.length) {
          echo.textContent += cmdText.charAt(idx);
          idx++;
          termBody.scrollTop = termBody.scrollHeight;
          setTimeout(step, 45);
        } else {
          div.classList.remove("typing");
          var cursor = div.querySelector(".term-cursor");
          if (cursor) cursor.remove();
          setTimeout(callback, 500);
        }
      }
      step();
    }

    function finishSim() {
      setTimeout(function() {
        if (inputLine) inputLine.style.display = "";
        termInput.disabled = false;
        termInput.focus();
        termBody.scrollTop = termBody.scrollHeight;
        isSimulating = false;
        var termTitle = doc.querySelector(".terminal-title");
        if (termTitle) termTitle.textContent = "asandhu@wpi: ~";
        var termStatus = doc.querySelector(".terminal-status");
        var statusText = termStatus ? termStatus.querySelector(".status-text") : null;
        if (termStatus && statusText) {
          termStatus.className = "terminal-status";
          statusText.textContent = "CONNECTED";
        }
      }, 600);
    }

    if (simKey === "BerriAI/litellm#30020") {
      typeCommand("asandhu@wpi:~$", "gdb python3", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Copyright (C) 2023 Free Software Foundation, Inc.");
        printLine("Reading symbols from python3...");
        
        setTimeout(function() {
          typeCommand("(gdb)", "run litellm_proxy.py --port 8000", function() {
            printLine("Starting program: /usr/bin/python3 litellm_proxy.py");
            printLine("Proxy running on port 8000...");
            printLine("[New Thread 0x7fffef7fe700 (LWP 40221)]");
            
            setTimeout(function() {
              printLine("<br><span class=\"text-merge\">-- SIMULATING CONCURRENT CLIENTS & LEAKS --</span>");
              printLine("[Client 1] GET /v1/models (concurrency: 1)");
              printLine("[Client 2] GET /v1/chat/completions (concurrency: 2) -> Stream Opened");
              printLine("[Client 2] cancelled stream mid-flight");
              printLine("[Client 3] GET /v1/chat/completions (concurrency: 3) -> Stream Opened");
              printLine("[Client 3] cancelled stream mid-flight");
              printLine("[Client 4] GET /v1/chat/completions (concurrency: 4) -> Stream Opened");
              printLine("[Client 4] cancelled stream mid-flight");
              printLine("[Client 5] GET /v1/chat/completions (concurrency: 5) -> Stream Opened");
              printLine("[Client 5] cancelled stream mid-flight");
              printLine("<span class=\"text-danger\">Warning: max_parallel_requests (5) reached. Blocking new queries.</span>");
              printLine("[Client 6] GET /v1/models -> <span class=\"text-danger\">429 Too Many Requests (Transient Leak!)</span>");
              
              setTimeout(function() {
                typeCommand("(gdb)", "bt", function() {
                  printLine("#0  litellm.proxy.proxy_server.max_parallel_requests_check()");
                  printLine("#1  litellm.proxy.proxy_server.request_handler()");
                  printLine("#2  fastapi.routing.APIRoute.solve_dependencies()");
                  printLine("#3  starlette.routing.Route.handle()");
                  printLine("#4  <span class=\"text-merge\">[Active connections: 0, Stranded request slots: 4]</span>");
                  
                  setTimeout(function() {
                    typeCommand("(gdb)", "print active_request_locks", function() {
                      printLine("$1 = { \"key_user_402\": 4 }  <span class=\"text-danger\">(4 active locks stranded on 0 connections)</span>");
                      
                      setTimeout(function() {
                        typeCommand("(gdb)", "quit", function() {
                          printLine("[Inferior 1 (process 40221) exited normally]");
                          printLine("<span class=\"text-merge\">Bug diagnosed: Concurrency slot leak in stream cancellation handlers.</span>");
                          printLine("Resolution merged in PR #30020.");
                          finishSim();
                        });
                      }, 1000);
                    });
                  }, 1000);
                });
              }, 1200);
            }, 1000);
          });
        }, 800);
      });
    } else if (simKey === "python/cpython#150328") {
      typeCommand("asandhu@wpi:~$", "gdb python3", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from python3...");
        setTimeout(function() {
          typeCommand("(gdb)", "break configure.c:120", function() {
            printLine("Breakpoint 1 at 0x180328: file configure.c, line 120.");
            setTimeout(function() {
              typeCommand("(gdb)", "run -m test test_configure", function() {
                printLine("Starting program: /usr/bin/python3 -m test test_configure");
                printLine("[Thread debugging using libthread_db enabled]");
                printLine("<br>Breakpoint 1, configure_casing_check () at configure.c:120");
                printLine("120\t    if (strcmp(ac_sys_system, \"CYGWIN\") == 0) {");
                setTimeout(function() {
                  typeCommand("(gdb)", "print ac_sys_system", function() {
                    printLine("$1 = 0x7fffffffe120 \"CYGWIN\" <span class=\"text-merge\">(Casing case-sensitivity resolved!)</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("test_configure passed.");
                        printLine("[Inferior 1 (process 40230) exited normally]");
                        printLine("Verification complete: Cygwin configure.ac patches validated.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "lance-format/lance#6934") {
      typeCommand("asandhu@wpi:~$", "rust-gdb target/debug/deps/merge_insert", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from target/debug/deps/merge_insert...");
        setTimeout(function() {
          typeCommand("(gdb)", "break lance::format::merge_insert::plan_predicate", function() {
            printLine("Breakpoint 1 at 0x27abcf: file src/format/merge_insert.rs, line 84.");
            setTimeout(function() {
              typeCommand("(gdb)", "run", function() {
                printLine("Starting program: target/debug/deps/merge_insert");
                printLine("<br>Breakpoint 1, lance::format::merge_insert::plan_predicate (expr=...) at src/format/merge_insert.rs:84");
                printLine("84\t    match expr {");
                setTimeout(function() {
                  typeCommand("(gdb)", "print expr", function() {
                    printLine("$1 = Expr::BinaryExpr { left: Column(\"id\"), op: Eq, right: Literal(42) }");
                    printLine("<span class=\"text-merge\">DataFusion logical expression matched directly in query planner!</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("test result: ok. 3 passed; 0 failed");
                        printLine("[Inferior 1 (process 40244) exited normally]");
                        printLine("Verification complete: DataFusion expressions verified in merge-insert.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "lancedb/lancedb#3444") {
      typeCommand("asandhu@wpi:~$", "rust-gdb target/debug/deps/lancedb_core", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from target/debug/deps/lancedb_core...");
        setTimeout(function() {
          typeCommand("(gdb)", "break connection::tests::test_merge_insert_datafusion", function() {
            printLine("Breakpoint 1 at 0x12bcdf: file src/connection.rs, line 312.");
            setTimeout(function() {
              typeCommand("(gdb)", "run", function() {
                printLine("Starting program: target/debug/deps/lancedb_core");
                printLine("<br>Breakpoint 1, connection::tests::test_merge_insert_datafusion () at src/connection.rs:312");
                printLine("312\t    let query = conn.table(\"my_table\").merge_insert(predicate);");
                setTimeout(function() {
                  typeCommand("(gdb)", "print query.merge_insert_predicate", function() {
                    printLine("$1 = Some(Expr::And(Column(\"status\"), Literal(\"active\")))");
                    printLine("<span class=\"text-merge\">DataFusion logical filter loaded into Rust query payload!</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("test result: ok. 1 passed; 0 failed");
                        printLine("[Inferior 1 (process 40250) exited normally]");
                        printLine("Verification complete: Rust LanceDB connection merge insert expression verified.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "lancedb/lancedb#3459") {
      typeCommand("asandhu@wpi:~$", "gdb python3", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from python3...");
        setTimeout(function() {
          typeCommand("(gdb)", "run -m pytest tests/test_embeddings.py", function() {
            printLine("Starting program: /usr/bin/python3 -m pytest tests/test_embeddings.py");
            printLine("[Thread debugging using libthread_db enabled]");
            printLine("Simulating blocking python calls in event loop...");
            printLine("<span class=\"text-danger\">Stall check triggered: Event loop check interval > 500ms...</span>");
            setTimeout(function() {
              printLine("<br>-- SENDING SIGINT (CTRL-C) TO INSPECT THREADS --");
              printLine("Program received signal SIGINT, Interrupt.");
              setTimeout(function() {
                typeCommand("(gdb)", "thread apply all bt", function() {
                  printLine("<br><b>Thread 1 (Main Loop Thread):</b>");
                  printLine("#0  0x00007ffff7bc8459 in select () at ../sysdeps/unix/syscall-template.S:120");
                  printLine("#1  asyncio.base_events.BaseEventLoop._run_once (self=...)");
                  printLine("    <span class=\"text-merge\">-> Event loop thread is idle/waiting (not blocked!)</span>");
                  printLine("<br><b>Thread 2 (lancedb-embedding executor):</b>");
                  printLine("#0  blocking_embedding_call_in_python (model=...) at embeddings.py:42");
                  printLine("#1  concurrent.futures.thread._worker (executor=...) at thread.py:58");
                  printLine("    <span class=\"text-merge\">-> Dedicated executor thread is running the blocking work!</span>");
                  setTimeout(function() {
                    typeCommand("(gdb)", "quit", function() {
                      printLine("Quit anyway? (y or n) [answered Y]");
                      printLine("[Inferior 1 (process 40260) exited normally]");
                      printLine("Verification complete: Embedding queries moved to dedicated executor.");
                      finishSim();
                    });
                  }, 1200);
                });
              }, 1000);
            }, 1000);
          });
        }, 800);
      });
    } else if (simKey === "lightpanda-io/browser#2537") {
      typeCommand("asandhu@wpi:~$", "gdb zig-out/bin/test", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from zig-out/bin/test...");
        setTimeout(function() {
          typeCommand("(gdb)", "break webapi.File.init", function() {
            printLine("Breakpoint 1 at 0x937ef: file src/webapi/File.zig, line 48.");
            setTimeout(function() {
              typeCommand("(gdb)", "run", function() {
                printLine("Starting program: zig-out/bin/test");
                printLine("<br>Breakpoint 1, webapi.File.init (name=...) at src/webapi/File.zig:48");
                printLine("48\t    self.name = try allocator.dupe(u8, name);");
                setTimeout(function() {
                  typeCommand("(gdb)", "print self.name", function() {
                    printLine("$1 = { .ptr = 0x7fffffffe020 \"avatar.png\", .len = 10 } <span class=\"text-merge\">(Allocated in Zig runtime)</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("All 4 tests passed.");
                        printLine("[Inferior 1 (process 40270) exited normally]");
                        printLine("Verification complete: Zig W3C File API interface validated.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "lightpanda-io/browser#2635") {
      typeCommand("asandhu@wpi:~$", "gdb zig-out/bin/test", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from zig-out/bin/test...");
        setTimeout(function() {
          typeCommand("(gdb)", "break dom.HTMLInputElement.setFileInputFiles", function() {
            printLine("Breakpoint 1 at 0x92635: file src/dom/HTMLInputElement.zig, line 214.");
            setTimeout(function() {
              typeCommand("(gdb)", "run", function() {
                printLine("Starting program: zig-out/bin/test");
                printLine("<br>Breakpoint 1, dom.HTMLInputElement.setFileInputFiles (self=..., files=...) at src/dom/HTMLInputElement.zig:214");
                printLine("214\t    self.files = try FileList.init(allocator, files);");
                setTimeout(function() {
                  typeCommand("(gdb)", "print files.len", function() {
                    printLine("$1 = 2 <span class=\"text-merge\">(CDP command setFileInputFiles mapped files array correctly)</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("All 3 tests passed.");
                        printLine("[Inferior 1 (process 40280) exited normally]");
                        printLine("Verification complete: Headless browser form file upload support verified.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "BerriAI/litellm#29493") {
      typeCommand("asandhu@wpi:~$", "gdb python3", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from python3...");
        setTimeout(function() {
          typeCommand("(gdb)", "break litellm.proxy.proxy_server.check_budget", function() {
            printLine("Breakpoint 1 at 0x39493: file proxy_server.py, line 580.");
            setTimeout(function() {
              typeCommand("(gdb)", "run litellm_proxy.py --port 8000", function() {
                printLine("Starting program: /usr/bin/python3 litellm_proxy.py");
                printLine("Proxy running on port 8000...");
                printLine("<br>Breakpoint 1, check_budget (key=...) at proxy_server.py:580");
                printLine("580\t    if disable_budget_reservation:");
                setTimeout(function() {
                  typeCommand("(gdb)", "print disable_budget_reservation", function() {
                    printLine("$1 = True <span class=\"text-merge\">(Optimistic reservation bypass active)</span>");
                    setTimeout(function() {
                      typeCommand("(gdb)", "continue", function() {
                        printLine("Continuing.");
                        printLine("[Client 1] GET /v1/chat/completions (status: 200 OK)");
                        printLine("Verification complete: disable_budget_reservation setting verified.");
                        finishSim();
                      });
                    }, 1000);
                  });
                }, 1000);
              });
            }, 800);
          });
        }, 800);
      });
    } else if (simKey === "BerriAI/litellm#29483") {
      typeCommand("asandhu@wpi:~$", "gdb python3", function() {
        printLine("GNU gdb (GDB) 14.1");
        printLine("Reading symbols from python3...");
        setTimeout(function() {
          typeCommand("(gdb)", "break litellm.proxy.proxy_server.enforce_budget", function() {
            printLine("Breakpoint 1 at 0x29483: file proxy_server.py, line 542.");
            setTimeout(function() {
              typeCommand("(gdb)", "run litellm_proxy.py --port 8000", function() {
                printLine("Starting program: /usr/bin/python3 litellm_proxy.py");
                printLine("Proxy running on port 8000...");
                printLine("<br>-- SENDING REQUEST TO '/v1/models' --");
                printLine("[Client] GET /v1/models");
                setTimeout(function() {
                  printLine("Request resolved. <span class=\"text-merge\">(enforce_budget breakpoint NOT hit - route correctly bypassed!)</span>");
                  setTimeout(function() {
                    typeCommand("(gdb)", "quit", function() {
                      printLine("[Inferior 1 (process 40290) exited normally]");
                      printLine("Verification complete: Telemetry and info routes bypass budget checks.");
                      finishSim();
                    });
                  }, 1000);
                }, 1200);
              });
            }, 800);
          });
        }, 800);
      });
    } else {
      typeCommand("asandhu@wpi:~$", "echo 'Verifying " + escHtml(simKey) + "'", function() {
        printLine("Verifying " + escHtml(simKey) + "...");
        printLine("Status: <span class=\"text-merge\">Merged</span>");
        printLine("All checks passed.");
        finishSim();
      });
    }
  }

  var ledgerTable = doc.getElementById("ledger-table");
  if (ledgerTable) {
    ledgerTable.addEventListener("click", function (e) {
      var btn = e.target.closest(".btn-verify");
      if (!btn) return;
      var tr = btn.closest("tr");
      if (!tr) return;
      var prKey = tr.getAttribute("data-pr");
      if (prKey) {
        runSimulation(prKey);
      }
    });
  }
  }
})();
