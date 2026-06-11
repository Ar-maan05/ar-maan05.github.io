/* Kill-switch demo (7.6): a faithful sim of the MCP SSE resume protocol
   (monotonic IDs, Last-Event-ID reconnect, ranged replay). DOM + CSS only. */
(function () {
  "use strict";
  var mount = document.querySelector("[data-demo]");
  if (!mount) return;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TYPES = ["tool_call", "resource_read", "progress", "log_message", "sampling"];
  var GAP = 6, TICK = 900;

  mount.innerHTML =
    '<div class="demo" role="group" aria-label="Kill-switch demo: SSE resume">' +
      '<div class="demo-controls">' +
        '<div class="store-toggle" role="group" aria-label="Event store">' +
          '<button type="button" data-store="memory" aria-pressed="true">store: in-memory</button>' +
          '<button type="button" data-store="persist" aria-pressed="false">store: mcp-persist</button>' +
        '</div>' +
        '<button type="button" class="demo-action" data-variant="kill">Kill the server</button>' +
      '</div>' +
      '<div class="demo-flow"><span class="flow-label" data-flow-label>events</span><div class="flow-track" data-track></div></div>' +
      '<div class="demo-panes">' +
        '<div class="demo-pane" data-pane="server"><h4>Server</h4><div class="log" data-log="server"></div></div>' +
        '<div class="demo-pane" data-pane="client"><h4>Client</h4><div class="log" data-log="client"></div><div class="log-line cursor" data-cursor>Last-Event-ID: none</div></div>' +
      '</div>' +
      '<p class="sr-only" aria-live="polite" data-live></p>' +
      '<div class="demo-caption meta"><span>A faithful simulation of the resume protocol. The production implementation is the package itself.</span>' +
        '<a class="receipt" href="https://github.com/Ar-maan05/mcp-persist" target="_blank" rel="noopener">GitHub <svg class="icon" aria-hidden="true"><use href="#i-arrow-up-right"/></svg></a>' +
        '<a class="receipt" href="https://pypi.org/project/mcp-persist/" target="_blank" rel="noopener">PyPI <svg class="icon" aria-hidden="true"><use href="#i-arrow-up-right"/></svg></a>' +
      '</div>' +
    '</div>';

  var $ = function (s) { return mount.querySelector(s); };
  var serverPane = $('[data-pane="server"]');
  var serverLog = $('[data-log="server"]'), clientLog = $('[data-log="client"]');
  var cursor = $("[data-cursor]"), track = $("[data-track]"), flowLabel = $("[data-flow-label]");
  var live = $("[data-live]"), action = $(".demo-action");
  var storeBtns = mount.querySelectorAll(".store-toggle button");

  var store = "memory", phase = "idle";   // idle | killed | replaying
  var serverId = 11, clientId = 11, emitTimer = null, visible = false;

  function logLine(box, text, cls) {
    var d = document.createElement("div");
    d.className = "log-line" + (cls ? " " + cls : "");
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 8) box.removeChild(box.firstChild);
    return d;
  }
  function announce(text) { live.textContent = text; }
  function setCursor(id) { cursor.textContent = "Last-Event-ID: " + id; }
  function setAction(variant, label) { action.dataset.variant = variant; action.textContent = label; }

  function chip(id, replay) {
    var c = document.createElement("span");
    c.className = "ev-chip" + (replay ? " replay" : "");
    c.textContent = "#" + id;
    track.appendChild(c);
    if (reduce) { c.style.left = "40%"; setTimeout(function () { c.remove(); }, 260); return; }
    var span = Math.max(40, track.clientWidth - 44);
    c.style.transform = "translateX(0)";
    requestAnimationFrame(function () {
      c.style.transition = "transform " + (replay ? 240 : 620) + "ms linear, opacity 200ms ease";
      c.style.transform = "translateX(" + span + "px)";
      setTimeout(function () { c.style.opacity = "0"; }, replay ? 180 : 480);
    });
    c.addEventListener("transitionend", function (e) { if (e.propertyName === "opacity") c.remove(); });
  }

  function emitLive() {
    serverId += 1; clientId = serverId;
    var type = TYPES[serverId % TYPES.length];
    logLine(serverLog, "emit  event #" + serverId + " · " + type);
    logLine(clientLog, "recv  event #" + serverId + " · " + type);
    setCursor(clientId);
    chip(serverId, false);
  }

  function clearEmit() { if (emitTimer) { clearInterval(emitTimer); emitTimer = null; } }
  function maybeRun() {
    if (phase === "idle" && visible && !document.hidden) {
      if (!emitTimer) emitTimer = setInterval(emitLive, TICK);
    } else { clearEmit(); }
  }

  function kill() {
    clearEmit();
    phase = "killed";
    serverPane.classList.add("dead");
    logLine(serverLog, "process exited (SIGKILL)", "bad");
    logLine(clientLog, "connection lost · retrying with Last-Event-ID: " + clientId, "retry");
    announce("Connection lost. Retrying with Last-Event-ID " + clientId + ".");
    setAction("restart", "Restart server");
  }

  function replayThen(from, to, done) {
    flowLabel.textContent = "EventStore";
    var id = from;
    (function step() {
      if (!visible || document.hidden) { setTimeout(step, 120); return; }   // pause off-screen
      if (id > to) { flowLabel.textContent = "events"; done(); return; }
      clientId = id;
      logLine(clientLog, "replay event #" + id + " · from EventStore", "good");
      setCursor(clientId);
      chip(id, true);
      id += 1;
      setTimeout(step, 90);
    })();
  }

  function restart() {
    serverPane.classList.remove("dead");
    var lostFrom = clientId + 1, lostTo = clientId + GAP;
    serverId = lostTo;   // server clock advanced while down
    logLine(serverLog, "process restarted · store=" + (store === "persist" ? "mcp-persist" : "in-memory"));

    if (store === "memory") {
      logLine(clientLog, "events " + lostFrom + " to " + lostTo + " were lost. The stream is broken.", "bad");
      logLine(clientLog, "gap: #" + lostFrom + " … #" + lostTo, "gap");
      announce("Events " + lostFrom + " to " + lostTo + " were lost. The stream is broken. Now flip the store and try again.");
      phase = "idle";
      setAction("kill", "Kill the server");
      maybeRun();
    } else {
      phase = "replaying";
      action.disabled = true;
      replayThen(lostFrom, lostTo, function () {
        logLine(clientLog, "replayed events " + lostFrom + " to " + lostTo + " from the EventStore. Stream resumed.", "good");
        announce("Replayed events " + lostFrom + " to " + lostTo + " from the EventStore. Stream resumed.");
        action.disabled = false;
        phase = "idle";
        setAction("kill", "Kill the server");
        maybeRun();
      });
    }
  }

  action.addEventListener("click", function () {
    if (phase === "idle") kill();
    else if (phase === "killed") restart();
  });

  storeBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      store = b.dataset.store;
      storeBtns.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
    });
  });

  // pause off-screen / hidden tab (7.6)
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (ents) {
      visible = ents[0].isIntersecting; maybeRun();
    }, { threshold: 0.2 }).observe(mount);
  } else { visible = true; maybeRun(); }
  document.addEventListener("visibilitychange", maybeRun);
})();
