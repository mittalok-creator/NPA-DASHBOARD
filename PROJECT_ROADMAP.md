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

**Decision (2026-07-21): Azure Function as broker.** A small serverless Azure
Function will hold the GitHub write credential server-side. Flow for
Publish: Admin logs in with Microsoft (M2) → Admin's browser calls the
Azure Function with their Microsoft ID token → Function verifies it's really
the Admin → Function calls Microsoft Graph to read the Excel from OneDrive →
Function (or the browser, after the Function hands back verified data) runs
validation → on confirmed publish, the Function commits the new versioned
JSON to the GitHub repo using a repo-scoped token stored only in Azure
Function's application settings (never sent to the browser). This needs an
Azure subscription and one Function App (consumption/free tier is enough at
this data size) — full click-by-click setup steps will be provided when we
reach Milestone 5, and logged in Section 5 below as they're completed.

---

## 3. Milestones

Each milestone ships as a fully working, tested increment. Nothing moves to
"Next" until the current one is confirmed working by you.

| # | Milestone | Status |
|---|---|---|
| M0 | Roadmap, audit, architecture decisions | ✅ Done — publish architecture decided: Azure Function broker |
| M1 | Modularize the codebase (split HTML/CSS/JS into files, no functional change, still deployable on GitHub Pages) | ✅ Done — verified in-browser (see checklist below) |
| M2 | Microsoft Login for Admin (Azure AD app registration + MSAL.js), Viewer stays login-free | ⬜ Not started |
| M3 | Microsoft Graph: read `MASTER_DATABASE.xlsx` from OneDrive into the app | ⬜ Not started |
| M4 | Validation engine (duplicates, blanks, bad dates, missing columns, wrong types) + validation report UI | ⬜ Not started |
| M5 | Publish + Versioning + Rollback (depends on the architecture decision above) | ⬜ Not started |
| M6 | Data-layer refactor: stop baking data into HTML, fetch published JSON at runtime, add lazy loading / virtualization / caching for 20k+ rows | ⬜ Not started |
| M7 | Fast search (Account No., Customer, Branch, CIF, Mobile, Status) | ⬜ Not started |
| M8 | New modules: Reports, Analytics, Settings, Admin Panel (status/history/logs/rollback UI), Logs, Backup | ⬜ Not started |
| M9 | UI/UX overhaul to the target premium enterprise look (Fluent/Notion/Linear/Raycast/Apple/Material 3 inspired), dark + light | ⬜ Not started |
| M10 | Hardening: performance test at 20k+ rows, cross-browser check, accessibility pass, plain-English admin guide | ⬜ Not started |

**Completed**: M0 (audit + architecture decision), M1 (modularization).
**Current milestone**: M2 — Microsoft Login for Admin.
**Next milestone**: M3 — Microsoft Graph: read the Excel from OneDrive.

### M1 completion notes (2026-07-21)

`ALOK_UPGB_OTS_CALCULATOR.html` (5.9 MB, everything inline) was split into:

- `index.html` — page shell + markup (still contains the inline NPA data
  JSON for now; that goes away in M6)
- `css/styles.css` — all styling, unchanged, concatenated in original order
- `js/vendor/xlsx.full.min.js` — the third-party SheetJS library, unchanged
- `js/app.js` — all app logic (dashboard, search/calculator, theme, Excel
  upload), unchanged

The original single file was removed from the repo (still fully recoverable
from git history — commit before this one — nothing is lost). No line of
CSS/JS logic was rewritten; this was a pure "cut into files" operation.

**Verified in a real browser (Playwright + Chromium) before removing the
original file:**
- [x] Page loads with zero console errors
- [x] Dashboard renders real data (13,817 accounts, ₹128.85 Cr, KCC/Non-KCC
  split, slabs, asset-mix — matched the original)
- [x] Nav switch to Search & Settlement works
- [x] Account-number search returns the correct borrower (tested account
  `150130100001068` → GOPAL OILS MILLS PACHON, correct O/S and P&L figures)
- [x] Theme toggle (dark → light) works, same as before
- [x] Settings modal (Update Data / Excel upload / "Download Updated App")
  opens and renders correctly

### Note for later milestones

The Settings modal's current "Update Data" flow lets you upload a new
Excel/CSV and then **download a regenerated single HTML file** to
re-upload by hand — that is today's whole publish mechanism, and it is
what M4 (validation) / M5 (publish+versioning) / M6 (data-layer refactor)
replace with the OneDrive → Graph → Admin login → validate → publish flow
you asked for. Nothing about this flow was touched in M1.
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

- 2026-07-21: Decided Publish will be brokered by an Azure Function (holds
  the GitHub write credential; verifies the Admin's Microsoft login before
  acting). Azure subscription + Function App creation is still **pending**
  — will be set up before Milestone 5, with full instructions provided then.
- 2026-07-21: Custom domain chosen for the live site:
  **`npadashboard.alokmittal.net`** (DNS: CNAME record on Squarespace,
  `NPADASHBOARD` → `mittalok-creator.github.io`). Repo now carries a
  `CNAME` file with this domain so GitHub Pages serves it. GitHub Pages
  source branch is currently `claude/upgb-ots-platform-setup-14ehm0`
  (pending — will move to `main` once M1 work is merged). This domain is
  the exact Redirect URI that will be registered in Azure AD for
  Microsoft Login (M2) — **final URL: `https://npadashboard.alokmittal.net/`**.
  DNS/HTTPS activation on GitHub's side can take minutes to a few hours.
