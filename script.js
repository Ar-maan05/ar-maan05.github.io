// Global error debugger: displays any load-time errors directly in the UI
window.onerror = function(message, source, lineno, colno, error) {
  const statusEl = document.getElementById("github-status");
  if (statusEl) {
    statusEl.innerHTML = `<span style="color: #ff6b6b; font-family: monospace;">[JS Error] ${message} at line ${lineno}</span>`;
    statusEl.style.display = "block";
  }
  return false;
};

// Footer year
const footerYear = document.getElementById("footerYear");
if (footerYear) {
  footerYear.textContent = new Date().getFullYear();
}

// Mobile nav toggle
const nav = document.querySelector(".nav");
const menuToggle = document.getElementById("menuToggle");
if (menuToggle && nav) {
  menuToggle.addEventListener("click", function() {
    const open = nav.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(open));
  });
}

// Close mobile nav when a link is clicked
document.querySelectorAll(".nav-link").forEach(function(link) {
  link.addEventListener("click", function() {
    if (nav && nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }
    }
  });
});

// Scroll-spy: highlight nav link for the section in view
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".nav-link[data-nav]");

if (typeof IntersectionObserver !== "undefined") {
  const spy = new IntersectionObserver(
    function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach(function(link) {
            link.classList.toggle("nav-link--active", link.dataset.nav === id);
          });
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
  );
  sections.forEach(function(s) { spy.observe(s); });
}

// Reveal-on-scroll: add .reveal to anything that should animate in
const revealTargets = document.querySelectorAll(
  ".hero-card, .panel, .project-card, .toolkit-card, .interest-card, .contact-form, .quick-stats"
);
revealTargets.forEach(function(el) { el.classList.add("reveal"); });

let revealObserver = null;
if (typeof IntersectionObserver !== "undefined") {
  revealObserver = new IntersectionObserver(
    function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  revealTargets.forEach(function(el) { revealObserver.observe(el); });
} else {
  // If IntersectionObserver is not supported, reveal immediately
  revealTargets.forEach(function(el) { el.classList.add("is-visible"); });
}

// Contact form — client-side placeholder.
const form = document.getElementById("contactForm");
const status = document.getElementById("formStatus");
if (form) {
  form.addEventListener("submit", function(e) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email || !data.message) {
      if (status) {
        status.textContent = "Please fill in all fields.";
        status.dataset.state = "error";
      }
      return;
    }
    if (status) {
      status.textContent = "[Stub] Message captured locally. Wire up a real handler.";
      status.dataset.state = "success";
    }
    form.reset();
  });
}

// GitHub PR feed — fetch authored PRs and render a status-badged card per PR.
const GITHUB_USER = "Ar-maan05";
const GITHUB_QUERY = "author:" + GITHUB_USER + " type:pr";
const GITHUB_CACHE_KEY = "gh-prs:" + GITHUB_QUERY;
const GITHUB_MAX = 9;
const GITHUB_SKIP_REPOS = new Set([
  (GITHUB_USER + "/mcp-persist").toLowerCase()
]);

// Fetch helper with timeout
async function fetchWithTimeout(resource, options) {
  const timeout = (options && options.timeout) || 6000;
  const controller = new AbortController();
  const id = setTimeout(function() { controller.abort(); }, timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Safe sessionStorage helper functions
function safeGetSessionStorage(key) {
  try {
    return typeof window !== "undefined" && window.sessionStorage ? sessionStorage.getItem(key) : null;
  } catch (e) {
    console.warn("sessionStorage is not accessible:", e);
    return null;
  }
}

function safeSetSessionStorage(key, value) {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.setItem(key, value);
    }
  } catch (e) {
    console.warn("Failed to write to sessionStorage:", e);
  }
}

function safeRemoveSessionStorage(key) {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      sessionStorage.removeItem(key);
    }
  } catch (e) {
    console.warn("Failed to remove from sessionStorage:", e);
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function renderGitHubPRs(items) {
  const statusEl = document.getElementById("github-status");
  const grid = document.getElementById("github-grid");
  if (!grid) return;

  if (!Array.isArray(items)) {
    if (statusEl) {
      statusEl.textContent = "Could not load GitHub activity right now.";
      statusEl.style.display = "block";
    }
    return;
  }

  const variants = ["primary", "secondary", "tertiary"];
  const prs = items
    .filter(function(pr) {
      if (!pr || !pr.repository_url || typeof pr.repository_url !== "string") return false;
      const repoName = pr.repository_url.replace("https://api.github.com/repos/", "");
      return !GITHUB_SKIP_REPOS.has(repoName.toLowerCase());
    })
    .slice(0, GITHUB_MAX);

  if (prs.length === 0) {
    if (statusEl) {
      statusEl.textContent = "No public pull requests yet.";
      statusEl.style.display = "block";
    }
    return;
  }
  if (statusEl) statusEl.style.display = "none";

  // Clear existing items in case of re-render
  grid.innerHTML = "";

  prs.forEach(function(pr, i) {
    if (!pr) return;
    const repo = pr.repository_url.replace("https://api.github.com/repos/", "");
    const variant = variants[i % variants.length];

    const isMerged = pr.pull_request && pr.pull_request.merged_at != null;
    const isOpen = pr.state === "open";
    const statusLabel = isMerged ? "Merged" : isOpen ? "Open" : "Closed";
    const statusColor = isMerged ? "secondary" : isOpen ? "primary" : "tertiary";
    const statusIcon = isMerged ? "merge" : isOpen ? "call_merge" : "close";

    const dateVal = isMerged ? pr.pull_request.merged_at : pr.updated_at;
    const date = new Date(dateVal);
    const dateStr = !isNaN(date.getTime())
      ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : "Recent";

    const card = document.createElement("article");
    card.className = "glass-panel project-card project-card--" + variant;
    card.innerHTML = `
      <div class="project-card-glow" aria-hidden="true"></div>
      <header class="project-card-header">
        <div class="project-icon">
          <span class="material-symbols-outlined">${statusIcon}</span>
        </div>
        <span class="label-mono muted gh-card-date">${dateStr}</span>
      </header>
      <p class="label-mono muted gh-repo">${escapeHtml(repo)}</p>
      <h3 class="project-title">${escapeHtml(pr.title)}</h3>
      <div class="tag-cloud gh-card-tags">
        <span class="tech-tag tech-tag--${statusColor}">${statusLabel}</span>
      </div>
      <a href="${encodeURI(pr.html_url || '#')}" target="_blank" rel="noopener noreferrer" class="btn btn--ghost btn--sm gh-card-link">
        View PR
        <span class="material-symbols-outlined">arrow_outward</span>
      </a>
    `;
    grid.appendChild(card);
  });

  // Reveal-animate the cards that were added after initial page load.
  grid.querySelectorAll(".project-card").forEach(function(el) {
    el.classList.add("reveal");
    if (revealObserver) {
      revealObserver.observe(el);
    } else {
      el.classList.add("is-visible");
    }
  });
}

async function loadGitHubPRs() {
  const statusEl = document.getElementById("github-status");
  if (!document.getElementById("github-grid")) return;

  const cached = safeGetSessionStorage(GITHUB_CACHE_KEY);
  if (cached) {
    try {
      renderGitHubPRs(JSON.parse(cached));
      return;
    } catch (e) {
      safeRemoveSessionStorage(GITHUB_CACHE_KEY);
    }
  }

  try {
    const res = await fetchWithTimeout(
      "https://api.github.com/search/issues?q=" + encodeURIComponent(GITHUB_QUERY) + "&sort=updated&per_page=12",
      { 
        headers: { Accept: "application/vnd.github+json" },
        timeout: 6000
      }
    );
    if (!res.ok) throw new Error("GitHub API " + res.status);

    const data = await res.json();
    const items = data.items || [];
    safeSetSessionStorage(GITHUB_CACHE_KEY, JSON.stringify(items));
    renderGitHubPRs(items);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = "Could not load GitHub activity right now.";
    }
    console.error("Error loading GitHub PRs:", err);
  }
}

loadGitHubPRs();