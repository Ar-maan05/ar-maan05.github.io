# ar-maan05.github.io

The personal site of Armaan Sandhu. A static, hand-built portfolio that leads
with verifiable open source work. Concept: **Proof of Work**, an engineering
ledger where every claim carries a receipt.

Live at <https://ar-maan05.github.io>.

## What it is

Vanilla HTML, CSS, and a small amount of JavaScript. No framework and no build
step for the pages themselves. The design system lives in CSS custom properties
(`styles.css`), type is self-hosted IBM Plex (latin subset, `fonts/`), and the
interactive kill-switch demo (`demo.js`) simulates the MCP SSE resume protocol
with real semantics.

```
index.html      single page: hero, case study, ledger, foundations, about, contact
404.html        same shell, served by GitHub Pages
styles.css      tokens, type system, components, motion
script.js       nav, hero load sequence, reveals, live-data hydration (< 6KB)
demo.js         kill-switch simulation, monotonic IDs + Last-Event-ID replay (< 6KB)
fonts/          IBM Plex Sans (variable), Serif 400, Mono 400/500, latin subset
data/           curated.json (input) + activity.json + stats.json (generated)
scripts/        build-data.mjs, the zero-dependency data builder
```

## Data pipeline

Live PR states and the download total are committed to the repo as static JSON,
so nothing on the page calls a third-party API at view time. A daily GitHub
Action keeps them fresh.

```
.github/workflows/data.yml  (cron 06:00 UTC, workflow_dispatch, push)
        │
        ▼
scripts/build-data.mjs  ──>  GitHub API (PR states)  +  pepy (downloads)
        │
        ▼
data/activity.json  +  data/stats.json   ──>  git commit if changed
        │
        ▼
script.js hydrates the baked HTML on load (states, recent activity, counter)
```

`data/curated.json` lists merged upstream work only. Open pull requests flow
into the "Recent activity" table automatically with live states, so they never
need hand-listing. Every state shown on the page comes from `activity.json`; the
baked HTML carries last-known-good values so the page is correct with JavaScript
disabled. If any fetch fails, the builder leaves the previous JSON untouched and
exits zero.

Run the builder locally (a token raises the rate limit but is optional):

```bash
GITHUB_TOKEN="$(gh auth token)" node scripts/build-data.mjs
```

## Run locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Performance budget

- Transfer excluding fonts under 120KB; fonts are 4 woff2 latin subsets with
  `font-display: swap`, and the variable Sans file is preloaded for the LCP.
- Zero icon fonts. The handful of icons are inline Lucide SVG in one sprite.
- Total JavaScript under 12KB unminified, split between `script.js` and `demo.js`.
- Zero layout shift from the counter or from data hydration.

## License

Code is MIT. Resume content is personal.
