# UPGB OTS Intelligence Platform — Project Roadmap

This file is the single source of truth for project status. It is updated at
the end of every milestone. Read this first in any new session.

Last updated: 2026-07-21

---

## 1. What exists today (audited 2026-07-21)

- **Repo**: `mittalok-creator/npa-dashboard`, single branch of real work so far
  is the file below (plus this roadmap).
- **App**: `ALOK_UPGB_OTS_CALCULATOR.html` — one self-contained HTML file
  (~5.9 MB) with:
  - Inline `<style>` (all CSS in the page)
  - Inline `<script>` with the app logic
  - The full **SheetJS (xlsx) library**, minified, pasted inline — this is
    what lets the "Settings" button parse an uploaded Excel file in-browser
  - The **entire NPA master dataset baked in as a JSON literal** (this is why
    the file is ~5.9 MB and one single line is ~3.9 million characters) —
    today, "updating data" means regenerating this whole file and
    re-uploading it
  - Base64-embedded fonts/icons (self-contained, no external requests)
  - Two views: **Dashboard** (branch filters, donut charts, asset-mix /
    slabs / top-accounts tables) and **Search** (the OTS Calculator /
    settlement screen)
  - A theme toggle (dark/light) persisted to `localStorage`
- **Not present yet**: Microsoft Login, Microsoft Graph/OneDrive integration,
  publish/versioning/rollback, validation engine, Reports, Analytics,
  Settings-as-a-module, Admin Panel, Logs, Backup, automated search index.

This matches what you described: a working app that must be *extended*, not
rewritten. Every milestone below builds on the existing Dashboard/Search
code rather than replacing it.

---

## 2. Target architecture (why it must change)

Today, data enters the app by baking it into the HTML at "build" time by
hand. That does not scale to a daily Excel-update workflow with 20,000+ rows,
and it means every data update requires re-shipping a multi-megabyte file.

The target flow decouples the **app shell** (HTML/CSS/JS, rarely changes)
from the **data** (changes daily):

```
OneDrive (MASTER_DATABASE.xlsx)
        │  Microsoft Graph API (read-only, Admin's Microsoft login)
        ▼
   Admin browser: validate + preview
        │  on "Publish"
        ▼
  Versioned JSON published to the repo (e.g. /data/vNN.json + /data/latest.json)
        │  GitHub Pages serves it as a static asset
        ▼
   Viewers' browsers fetch /data/latest.json (cached, lazy-loaded,
   virtualized tables) — no Microsoft login required for Viewers
```

**Open decision — how "Publish" safely writes to GitHub**: GitHub Pages has
no server of its own, so the browser needs *some* credential to commit the
new data file. This is a security-sensitive choice for a banking app and
needs your sign-off before Milestone 5 is built. Options are presented to
you in chat the same turn this file is added.

---

## 3. Milestones

Each milestone ships as a fully working, tested increment. Nothing moves to
"Next" until the current one is confirmed working by you.

| # | Milestone | Status |
|---|---|---|
| M0 | Roadmap, audit, architecture decisions | ✅ In progress (this session) |
| M1 | Modularize the codebase (split HTML/CSS/JS into files, no functional change, still deployable on GitHub Pages) | ⬜ Not started |
| M2 | Microsoft Login for Admin (Azure AD app registration + MSAL.js), Viewer stays login-free | ⬜ Not started |
| M3 | Microsoft Graph: read `MASTER_DATABASE.xlsx` from OneDrive into the app | ⬜ Not started |
| M4 | Validation engine (duplicates, blanks, bad dates, missing columns, wrong types) + validation report UI | ⬜ Not started |
| M5 | Publish + Versioning + Rollback (depends on the architecture decision above) | ⬜ Not started |
| M6 | Data-layer refactor: stop baking data into HTML, fetch published JSON at runtime, add lazy loading / virtualization / caching for 20k+ rows | ⬜ Not started |
| M7 | Fast search (Account No., Customer, Branch, CIF, Mobile, Status) | ⬜ Not started |
| M8 | New modules: Reports, Analytics, Settings, Admin Panel (status/history/logs/rollback UI), Logs, Backup | ⬜ Not started |
| M9 | UI/UX overhaul to the target premium enterprise look (Fluent/Notion/Linear/Raycast/Apple/Material 3 inspired), dark + light | ⬜ Not started |
| M10 | Hardening: performance test at 20k+ rows, cross-browser check, accessibility pass, plain-English admin guide | ⬜ Not started |

**Completed**: None yet (M0 in progress).
**Current milestone**: M0 — Roadmap + architecture decision.
**Next milestone**: M1 — Modularize the codebase.
**Estimated effort**: sizes are relative (this is AI-assisted dev, not a
human-hours estimate) — M1/M2/M7 are Small, M3/M4/M9/M10 are Medium, M5/M6/M8
are Large because they touch security, data integrity, or many screens at
once. Each milestone will get a concrete checklist when it starts.

---

## 4. Backlog (bugs / improvements / future ideas)

_Nothing logged yet — this section fills in as we find things._

### Bugs
- (none logged)

### Improvements
- (none logged)

### Future ideas
- (none logged)

---

## 5. External configuration log

Tracks every setup step done outside this repo (Azure, Microsoft Graph,
GitHub settings, etc.) so nothing is forgotten or duplicated.

- (none yet)
