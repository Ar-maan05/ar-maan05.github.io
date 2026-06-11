#!/usr/bin/env node
/* Build-time data for the Proof of Work site (§11 v1.1).
 * Fetches live PR states from GitHub, pepy download total, PyPI version,
 * and hero PR diffs. Writes:
 *   data/activity.json
 *   data/stats.json     (downloads, downloads_display, version)
 *   data/diffs.json     (hero diff lines for the 4-tab switcher)
 * Also rewrites every data-bake span/attribute in index.html so the static HTML
 * is never more than a day stale even with JS disabled.
 *
 * Resilience contract: any fetch failure leaves the previous JSON untouched
 * and the process exits 0. The site must always have last-known-good data.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const AUTHOR = "Ar-maan05";
const OWN_REPOS = ["Ar-maan05/mcp-persist"]; // exclude from recent activity
const FLOOR = 8000;

// Hero diff tabs: which PRs to fetch diffs for (§7.1)
const HERO_DIFF_PRS = [
  { repo: "lightpanda-io/browser", pr: 2537, url: "https://github.com/lightpanda-io/browser/pull/2537" },
  { repo: "python/cpython",        pr: 150328, url: "https://github.com/python/cpython/pull/150328" },
  { repo: "BerriAI/litellm",       pr: 29483, url: "https://github.com/BerriAI/litellm/pull/29483" },
  { repo: "lance-format/lance",    pr: 6934, url: "https://github.com/lance-format/lance/pull/6934" },
];

// Line truncation limit per spec §7.1
const LINE_MAX = 52;

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const ghHeaders = {
  "Accept": "application/vnd.github+json",
  "User-Agent": "ar-maan05-site-builder",
  ...(token ? { "Authorization": `Bearer ${token}` } : {}),
};

async function ghJSON(path) {
  const res = await fetch(`https://api.github.com/${path}`, { headers: ghHeaders });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status}`);
  return res.json();
}

function repoFromUrl(u) {
  return u.replace(/^https:\/\/api\.github\.com\/repos\//, "");
}

function stateOf(merged_at, state) {
  if (merged_at) return "merged";
  return state === "open" ? "open" : "closed";
}

function truncLine(text) {
  return text.length > LINE_MAX ? text.slice(0, LINE_MAX) + "\u2026" : text;
}

async function buildActivity() {
  const curatedCfg = JSON.parse(readFileSync(join(DATA, "curated.json"), "utf8")).curated;

  // Confirm each curated PR's live state directly (source of truth, never hardcoded).
  const curated = [];
  for (const c of curatedCfg) {
    const pr = await ghJSON(`repos/${c.repo}/pulls/${c.number}`);
    curated.push({
      repo: c.repo,
      number: c.number,
      title: (pr.title || "").trim(),
      state: pr.merged_at ? "merged" : pr.state,
      merged_at: pr.merged_at,
      url: pr.html_url,
      note: c.note,
    });
  }

  // Recent activity: author's most-recently-updated PRs, excluding own package
  // repos and anything already curated. Show only open or merged (no rejections).
  const curatedKeys = new Set(curatedCfg.map((c) => `${c.repo}#${c.number}`));
  const search = await ghJSON(
    `search/issues?q=author:${AUTHOR}+type:pr&sort=updated&per_page=50`
  );
  const recent = [];
  for (const it of search.items || []) {
    const repo = repoFromUrl(it.repository_url);
    const key = `${repo}#${it.number}`;
    if (OWN_REPOS.includes(repo) || curatedKeys.has(key)) continue;
    const merged_at = it.pull_request ? it.pull_request.merged_at : null;
    const state = stateOf(merged_at, it.state);
    if (state !== "merged") continue; // only showcase merged PRs
    recent.push({
      repo,
      number: it.number,
      title: (it.title || "").trim(),
      state,
      url: it.html_url,
      updated_at: it.updated_at,
      merged_at,
    });
    if (recent.length >= 6) break;
  }

  return { generated: new Date().toISOString(), curated, recent };
}

function parseBadge(svg) {
  // Take the last <text> value in the badge (the download figure), e.g. "8k".
  const texts = [...svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1].trim());
  const raw = texts[texts.length - 1] || "";
  const m = raw.match(/^([\d.]+)\s*([kKmM]?)/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "k") n *= 1000;
  else if (unit === "m") n *= 1000000;
  return Math.round(n);
}

async function buildStats() {
  // Downloads from pepy badge
  const badgeRes = await fetch("https://static.pepy.tech/badge/mcp-persist", {
    headers: { "User-Agent": "ar-maan05-site-builder" },
  });
  if (!badgeRes.ok) throw new Error(`pepy -> ${badgeRes.status}`);
  const parsed = parseBadge(await badgeRes.text());
  const downloads = Math.max(FLOOR, parsed || 0); // never below the floor

  // Round DOWN to nearest hundred for display (e.g. 7,900+)
  const floor100 = Math.floor(downloads / 100) * 100;
  const downloads_display = floor100.toLocaleString("en-US") + "+";

  // Version from PyPI JSON API
  let version = null;
  try {
    const pypiRes = await fetch("https://pypi.org/pypi/mcp-persist/json", {
      headers: { "User-Agent": "ar-maan05-site-builder" },
    });
    if (pypiRes.ok) {
      const pypiData = await pypiRes.json();
      version = pypiData?.info?.version || null;
    }
  } catch (_) { /* keep null; will fall back to baked value */ }

  return {
    downloads,
    downloads_display,
    ...(version ? { version } : {}),
    generated: new Date().toISOString(),
  };
}

async function buildDiffs() {
  // Load existing diffs.json if it exists (merged diffs never change; cache them).
  let existing = {};
  const diffsPath = join(DATA, "diffs.json");
  if (existsSync(diffsPath)) {
    try {
      existing = JSON.parse(readFileSync(diffsPath, "utf8")).diffs || {};
    } catch (_) { existing = {}; }
  }

  const diffs = {};
  for (const { repo, pr, url } of HERO_DIFF_PRS) {
    // Skip if already cached (merged diffs are immutable)
    if (existing[repo] && existing[repo].pr === pr) {
      diffs[repo] = existing[repo];
      console.log(`  cached diff: ${repo}#${pr}`);
      continue;
    }

    try {
      const diffUrl = `https://github.com/${repo}/pull/${pr}.diff`;
      const res = await fetch(diffUrl, { headers: { "User-Agent": "ar-maan05-site-builder" } });
      if (!res.ok) throw new Error(`diff ${diffUrl} -> ${res.status}`);
      const raw = await res.text();

      // Select 6-9 contiguous meaningful added lines, truncated to LINE_MAX chars
      const allLines = raw.split("\n");
      const lines = [];
      let inHunk = false;
      let addCount = 0;

      for (const line of allLines) {
        if (line.startsWith("@@")) { inHunk = true; continue; }
        if (!inHunk) continue;
        if (line.startsWith("+") && !line.startsWith("+++")) {
          const text = truncLine(line.slice(1));
          lines.push({ type: "add", text });
          addCount++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          // Include one del line only if it helps the story and we haven't collected enough adds
          if (addCount < 4) {
            const text = truncLine(line.slice(1));
            lines.push({ type: "del", text });
          }
        }
        if (lines.length >= 9) break;
      }

      // Fetch PR title for the panel header
      let title = `${repo} #${pr}`;
      try {
        const prData = await ghJSON(`repos/${repo}/pulls/${pr}`);
        title = (prData.title || title).trim();
        if (title.length > 50) title = title.slice(0, 50) + "\u2026";
      } catch (_) { /* keep fallback */ }

      diffs[repo] = { pr, url, title, lines };
      console.log(`  fetched diff: ${repo}#${pr} (${lines.length} lines)`);
    } catch (err) {
      console.warn(`  skip diff ${repo}#${pr}: ${err.message}`);
      // Keep existing cached value if available
      if (existing[repo]) diffs[repo] = existing[repo];
    }
  }

  return { generated: new Date().toISOString(), diffs };
}

/** Rewrite all data-bake spans and meta attributes in index.html */
function bakHTML(stats) {
  const htmlPath = join(ROOT, "index.html");
  if (!existsSync(htmlPath)) return;
  let html = readFileSync(htmlPath, "utf8");
  let changed = false;

  // Rewrite data-bake="downloads" spans — match content between the tags
  if (stats.downloads_display) {
    const dl = stats.downloads_display;
    html = html.replace(
      /(<[^>]+data-bake="downloads"[^>]*>)[^<]*(<\/[^>]+>)/g,
      (_, open, close) => { changed = true; return open + dl + close; }
    );
    // Also rewrite meta description attribute value containing the old display count
    html = html.replace(
      /(content="[^"]*mcp-persist \()[\d,k]+\+( downloads[^"]*")/g,
      (_, before, after) => { changed = true; return before + dl + after; }
    );
  }

  // Rewrite data-bake="version" spans
  if (stats.version) {
    html = html.replace(
      /(<[^>]+data-bake="version"[^>]*>)[^<]*(<\/[^>]+>)/g,
      (_, open, close) => { changed = true; return open + stats.version + close; }
    );
  }

  if (changed) {
    writeFileSync(htmlPath, html, "utf8");
    console.log("rewrote index.html data-bake values");
  } else {
    console.log("index.html data-bake: no changes needed");
  }
}

function writeIfPossible(name, producer) {
  return producer()
    .then((obj) => {
      writeFileSync(join(DATA, name), JSON.stringify(obj, null, 2) + "\n");
      console.log(`wrote data/${name}`);
      return obj;
    })
    .catch((err) => {
      console.warn(`skip data/${name}: ${err.message}` + (existsSync(join(DATA, name)) ? " (kept previous)" : " (no previous file)"));
      return null;
    });
}

const activityP = writeIfPossible("activity.json", buildActivity);
const statsP = writeIfPossible("stats.json", buildStats);
const diffsP = writeIfPossible("diffs.json", buildDiffs);

// After stats are written, bake the HTML
const statsObj = await statsP;
if (statsObj) bakHTML(statsObj);

await activityP;
await diffsP;
process.exit(0);
