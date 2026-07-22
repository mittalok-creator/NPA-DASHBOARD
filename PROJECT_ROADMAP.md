# UPGB OTS Intelligence Platform — Project Roadmap

This file is the single source of truth for project status. It is updated at
the end of every milestone. Read this first in any new session.

Last updated: 2026-07-22

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
Admin exports/saves MASTER_DATABASE.xlsx (or the daily CBS CSV export)
        │  Admin logs in with GitHub (Device Flow — no password, no Azure)
        ▼
   Admin browser: upload file via Settings → validate + preview
        │  on "Publish"
        ▼
  GitHub Actions workflow commits versioned JSON to the repo
  (e.g. /data/vNN.json + /data/latest.json), using a repo secret
  the browser never sees
        │  GitHub Pages serves it as a static asset
        ▼
   Viewers' browsers fetch /data/latest.json (cached, lazy-loaded,
   virtualized tables) — no login required for Viewers
```

**Architecture pivot (2026-07-21): dropped Microsoft/Azure entirely.**
The original plan (Microsoft Login + Microsoft Graph auto-pull from OneDrive
+ an Azure Function broker) hit a wall during Milestone 2 setup: your
personal Microsoft account has no Entra ID directory of its own, the free
Microsoft 365 Developer Program sandbox route did not qualify this account,
and the Azure Free Account signup was where we paused. Rather than force
through more Azure friction, we agreed to swap out every Microsoft-dependent
piece:

- **Admin login** → **GitHub OAuth (Device Flow)** instead of Microsoft
  Login. You already have a fully-working GitHub account with zero
  tenant/directory issues (it's the same account this repo lives in).
  Device Flow needs only a public Client ID — no client secret, no backend,
  nothing to expose in a static site.
- **Getting the data in** → keep the app's existing "Settings → Upload
  Data" button (already built, already tested in M1) instead of an
  automatic Microsoft Graph pull from OneDrive. You save/export
  `MASTER_DATABASE.xlsx` (or the daily CBS CSV) and upload it yourself when
  you're ready to publish — same manual step as today, nothing new to learn.
- **Publish** → a **GitHub Actions workflow**, triggered by the
  Admin-logged-in browser, does the actual commit of the new versioned data
  file using a repository secret. This replaces the Azure Function broker
  decision from earlier — same safety property (the privileged credential
  never touches the browser), zero external cloud provider, everything
  stays inside GitHub, which you already use successfully.

Net effect: **no Azure, no Microsoft Graph, no OneDrive dependency
anywhere in the build.** Validation, versioning, rollback, Reports,
Analytics, and every other requirement are unaffected by this change.

---

## 3. Milestones

Each milestone ships as a fully working, tested increment. Nothing moves to
"Next" until the current one is confirmed working by you.

| # | Milestone | Status |
|---|---|---|
| M0 | Roadmap, audit, architecture decisions | ✅ Done |
| M1 | Modularize the codebase (split HTML/CSS/JS into files, no functional change, still deployable on GitHub Pages) | ✅ Done — verified in-browser (see checklist below) |
| M2 | GitHub Login for Admin (OAuth Device Flow), Viewer stays login-free | ✅ Done — verified live end-to-end on the deployed site |
| M3 | ~~Microsoft Graph OneDrive read~~ — superseded. Data entry stays the existing Settings → Upload Excel/CSV button, now gated behind Admin login | ⬜ Not started |
| M4 | Data import & validation: merge the daily HO NPA export + the Customer Master (Address/Aadhar/PAN) by Customer ID, remap HO's raw column names to the app's schema, auto-read the "as on" date from the filename (editable), multi-region support (Region+Branch filter, dynamic title), then validate (duplicates, blanks, bad dates, missing columns, wrong types) with a report UI | ✅ Done — verified against real Head Office files (see notes below) |
| M5 | Publish + Versioning + Rollback | ✅ Done, on its **second design** — first shipped as a direct GitHub Git Data API commit, then replaced same-day by a real Postgres backend once GitHub's per-file size ceiling became a real problem for genuine bank-wide uploads (see notes below) |
| M6 | Data-layer refactor: stop baking data into HTML, fetch published JSON at runtime | ✅ Done (as part of M5, see notes below) — lazy loading/virtualization for 20k+ rows still not done |
| M7 | Fast search (Account No., Customer, Branch, CIF, Mobile, Status) | ⬜ Not started |
| M8 | New modules: Reports, Analytics, Settings, Admin Panel (status/history/logs/rollback UI), Logs, Backup | ⬜ Not started |
| M9 | UI/UX overhaul to the target premium enterprise look (Fluent/Notion/Linear/Raycast/Apple/Material 3 inspired), dark + light | ⬜ Not started |
| M10 | Hardening: performance test at 20k+ rows, cross-browser check, accessibility pass, plain-English admin guide | ⬜ Not started |

**Completed**: M0 (audit + architecture decision), M1 (modularization),
M2 (GitHub Login for Admin — live end-to-end test passed), M4 (data import,
Customer Master merge, multi-region, validation — verified against real
Head Office files), M5 + M6 (real one-click publish + version history,
now backed by a real Postgres database via the same Vercel project used
for GitHub sign-in — **not yet live, needs Postgres storage enabled on
Vercel first**, see notes below).
**Current milestone**: none — ready to start M7 (fast search) or M9 (UI/UX
overhaul), whichever you want next.
(M3 is superseded, see Section 2.)

### M5 + M6 completion notes (2026-07-22) — real one-click Publish

Until now, "Update Data → Apply" only updated the data in the Admin's own
browser session — nothing became live for other viewers unless someone
manually downloaded a regenerated file and got it committed. That gap is
what caused the Rinkesh Meena stale-data incident earlier this same day.
This milestone closes it for good.

- **Data-layer split (M6)**: the NPA dataset no longer lives inline in
  `index.html`. It's now `data/latest.json`, fetched by `js/app.js` at
  page load (`fetch('data/latest.json?t='+Date.now())`, cache-busted via
  timestamp since this is live banking data). `index.html` dropped from
  ~4.5 MB to ~315 KB. A `#dataLoadingOverlay` (spinner) shows during the
  fetch, underneath the splash/PIN screen, and hides once data is ready.
  History snapshots live in `data/history/<date>-<timestamp>.json`, with
  `data/history/index.json` as the manifest (date, row count, regions,
  publishedAt, publishedBy, isRollback) driving the Version History list.
- **New file `js/publish.js`**: commits straight to the live repo using
  GitHub's **Git Data API** (get ref → get commit for tree sha → create
  blob(s) → create tree → create commit → update `refs/heads/main`) via
  the Admin's own GitHub OAuth token — no new permission grant needed,
  since the Device Flow login was already requesting `repo` scope from
  the start (`relay/api/device-start.js`). Only the final ref-update step
  actually changes what's live; anything that fails before that leaves
  production completely untouched (orphaned blobs/trees/commits are just
  garbage-collected by GitHub). Old history files that age out past 60
  entries are actually deleted from the tree (`sha:null` on that path),
  not just dropped from the index, so `data/history/` doesn't grow
  unbounded across months of daily publishes.
- **Publish review + confirm UI**: a new "⬆ Publish to Live Site" button
  in the Update Data modal (enabled after Apply, same gate as the
  existing data-backup download) opens a review panel — as-on date,
  total accounts, all regions in the dataset, which region(s) this
  upload touched, how many stale accounts were removed, who's publishing
  — with an explicit **Confirm & Publish** step before anything is
  actually committed. This was a deliberate choice, not an oversight:
  since the Admin's token can push straight to the live dashboard the
  moment Publish is clicked, a silent one-click commit was judged too
  risky for a banking data tool — one stray click should never be able
  to push bad data live without a review screen in between.
- **Version History + Rollback**: a collapsible "Version History"
  section (same modal) lists every past publish from
  `data/history/index.json`, each with a "Rollback to this" button.
  Rollback fetches that version's historical JSON, shows the same kind
  of review/confirm screen, then **publishes the old content again as a
  new commit** — never a destructive git history rewrite — so the
  rollback itself is fully audited in the same version history.
- **`downloadUpdatedApp()` repurposed**: the old "Download Updated App
  (.html)" button (which relied on the now-removed inline `#ots-data`
  tag and would have silently produced a broken file) is now "⬇ Download
  Data Backup (.json)" — a plain JSON export of the currently-applied
  data, kept as a manual safety net independent of GitHub.
- **Known limit, logged rather than silently ignored**: GitHub's Git
  Data API blob endpoint is comfortable for a single region's daily file
  (~4 MB) but a genuine single upload covering the *entire* bank
  (283k+ accounts, ~80-100 MB as JSON) would sit right at or over
  practical request-size limits. Not solved here since the real
  day-to-day workflow is per-region daily files — revisit (e.g.
  gzip-compress before base64 encoding) only if a true full-bank single
  upload actually becomes routine.
- **Testing**: the real GitHub commit flow can't be driven by an
  automated headless test (Device Flow login needs a human to approve
  the code on github.com), so the Git Data API call sequence, tree
  construction, and review/rollback UI were verified with Playwright
  against a **mocked** `api.github.com` — confirmed the exact right
  6-call sequence, correct tree paths, correct commit messages, and
  correct button/state transitions for both a normal publish and a
  rollback. **The actual first real end-to-end Publish click still
  needs to be done by you** — only your browser holds your real GitHub
  token.

### Bug fix: multi-sheet bank-wide workbooks only read the first sheet (2026-07-22)

You reported that a genuine 55 MB bank-wide `.xlsb` export either failed
outright ("doesn't match the daily HO export layout, and no sheet named
'NPA' was found either") or silently only picked up your own region.
Root cause, confirmed in code: `handleFileUpload()` read
**`wb.Sheets[wb.SheetNames[0]]`** — only ever the *first* sheet in the
workbook. Every daily file tested so far (single-region, or a combined
multi-region CSV/sheet with one Region column) happens to keep everything
on one sheet, so this never surfaced. But the true bank-wide `.xlsb`
export is laid out as **one sheet per region** (region name as the sheet
tab). Reading only sheet 0 meant: if your own region's tab happened to be
first, only that region got processed and every other region silently
vanished; if a non-matching tab (e.g. a summary/cover sheet) was first,
the whole file was rejected outright.

Fixed: every sheet in the workbook is now scanned; whichever ones match
the HO header signature are each mapped independently (using that
sheet's own header for column lookup, not a shared/assumed column order)
and the results are merged. Sheets that don't match (summary/cover
sheets, a legacy `Field Reference` sheet, etc.) are silently skipped, not
treated as a failure, as long as at least one sheet matches. The upload
status now says "(N sheets combined)" when more than one sheet
contributed, so it's visible that all regions were actually picked up.
CSV uploads are unaffected (always single-sheet by nature).

**Verified with synthetic multi-sheet `.xlsx` files** (the real 55 MB
file couldn't be sent directly — file-attachment size limit on this side
is 30 MB): (1) three region-named sheets (Hathras/Aligarh/Agra) — all 3
regions and all 4 accounts correctly combined; (2) a non-matching
"Summary" sheet placed *first*, exactly reproducing the reported failure
— correctly skipped, both real region sheets behind it still picked up
successfully. Existing single-sheet real-data upload (14,000-row Hathras
file) and the full publish flow both re-verified unaffected.

### Architecture pivot: real backend + Postgres, replacing the GitHub-commit publish pipeline (2026-07-22)

Right after the multi-sheet fix, you asked to move off using GitHub commits
as the data store entirely, since you're planning to add more tabs/modules
with their own Excel files going forward — every one of those would have
compounded the same problems (GitHub's per-file size ceiling, growing repo
history, the Git Data API's blob/tree/commit dance). A real backend removes
all of that at once and makes each future module mostly "define its schema
+ upload/parse/publish flow," reusing everything else.

- **Backend**: extended the *same* Vercel project already used for the
  GitHub OAuth relay (`relay/`, deployed at `npa-dashboard.vercel.app`) —
  no new account. Added a Postgres database (via Vercel's Storage tab,
  which now provisions through **Neon** — `@vercel/postgres` is
  deprecated, so this uses `@neondatabase/serverless` directly, per
  Neon's own migration guidance).
- **Schema**: one table, `npa_versions` (id, data JSONB, as_on_date,
  row_count, regions, published_at, published_by, is_rollback,
  is_current). Exactly one row has `is_current = true` at a time — that's
  what Viewers see. A rollback is just a normal publish whose content is
  copied from an older row — never a destructive rewrite — so it shows up
  in history like any other publish, and old rows are never mutated.
- **New API routes** (`relay/api/`): `GET /api/data-latest` (public,
  gzip-compressed response), `GET /api/data-history` (public, lightweight
  metadata list), `POST /api/publish` and `POST /api/data-rollback`
  (Admin-only). Admin-ness is verified **server-side** now — the route
  calls `api.github.com/user` with the Bearer token the browser sends and
  checks the real login is `mittalok-creator`, rather than trusting a
  client-supplied claim. This is a genuine security improvement over the
  GitHub-commit design, where "admin-ness" was enforced only by whatever
  permissions the token itself carried.
- **Size limit fix, the actual trigger for this pivot**: Vercel Serverless
  Functions cap request bodies at a few MB regardless of backend choice.
  The browser now **gzip-compresses** the JSON payload
  (`CompressionStream('gzip')`) before POSTing to `/api/publish`
  (`Content-Encoding: gzip`), and the server does the same in reverse for
  `/api/data-latest` — verified end-to-end that a browser-produced gzip
  blob is byte-compatible with Node's `zlib.gunzipSync` and vice versa.
  This buys real headroom (5-10x smaller on the wire) for realistic
  per-region uploads; a genuine single-shot *entire-bank* upload could
  still be tight even compressed — logged as a known limit, not solved
  speculatively, since the real day-to-day workflow is per-region files.
- **Client changes**: `js/publish.js` rewritten to call the new API
  instead of GitHub's Git Data API — much simpler, since rollback is now
  a single server-side call (`POST /api/data-rollback` with just a
  version id) instead of the old fetch-content-then-republish dance.
  `js/app.js`'s boot sequence now fetches `GET /api/data-latest` first,
  falling back to the static `data/latest.json` snapshot already in the
  repo only if the backend is unreachable (safety net during migration,
  and a soft offline/outage fallback).
- **Testing**: the actual Postgres/Neon queries were verified against a
  **real local Postgres instance** (not just syntax-checked) — schema
  creation, publish (including the is_current flip + 60-entry prune),
  get-current, get-history, and rollback all confirmed behaving exactly
  as designed. The client-side publish/rollback/history UI was verified
  with Playwright against a **mocked** `npa-dashboard.vercel.app`,
  including capturing and gunzipping the actual request body to confirm
  the compressed payload round-trips correctly. **What's not yet
  verified**: the real deployed Neon connection itself (Neon's HTTP wire
  protocol only speaks to Neon's own infrastructure, so a local Postgres
  stand-in can validate the SQL logic but not the live network path) —
  that needs the Postgres storage enabled on Vercel and a real deploy,
  same category of "can't test outside its real environment" as the
  original GitHub Device Flow login.
- **Not done yet**: you still need to enable Postgres storage on the
  `npa-dashboard` Vercel project (Storage tab, a few clicks) before any
  of this goes live — nothing publishes anywhere until that's done. The
  existing `data/latest.json` / `data/history/` files stay in the repo
  as the fallback path described above, not because the git-commit design
  is still in use.

### Bug fix: frontend called the wrong URLs for the new backend (2026-07-22, same day)

Right after you enabled Postgres storage and redeployed, the new routes
returned 404 even on the confirmed latest/current deployment — while the
old `/api/device-start` route kept working fine. Root cause: the new
serverless functions are files named `data-history.js`, `data-latest.js`,
`data-rollback.js` (hyphens, since that's the actual filename), which
Vercel maps to `/api/data-history`, `/api/data-latest`, `/api/data-rollback`
— but `js/publish.js` and `js/app.js`'s boot fetch were calling
`/api/data/history`, `/api/data/latest`, `/api/data/rollback` (slashes,
as if `data` were a subfolder). This slipped past testing because the
Playwright mock tests used the same (wrong) URLs the client code called,
so they matched each other without ever hitting the real deployed routes.

Caught by testing directly against the live backend with `curl` rather
than trusting the mocked tests alone: `/api/publish` and `/api/data-rollback`
(hyphenated, matching the client's one correct guess) returned 405 on a
GET request — proving those specific routes *did* exist and were reachable
— which is what exposed the slash-vs-hyphen mismatch on the others. Fixed
all three URLs in `js/publish.js` / `js/app.js`; re-verified with `curl`
directly against production (`/api/data-history` → `200 []`,
`/api/data-latest` → `404 {"error":"no_data_published_yet"}`, both correct
since nothing has been published yet) and confirmed `/api/publish` and
`/api/data-rollback` correctly reject a missing/invalid token with 401 —
proving the live Neon connection, schema creation, and Admin verification
are all genuinely working end-to-end. **Lesson for future backend work**:
mocked tests validate internal logic consistency, not the real contract
between two independently-written pieces of code — always confirm the
actual deployed URL shape with a real request before considering a new
API integration done.

### Bug fix: real full-bank publish hit Vercel's payload size ceiling (2026-07-22, same day)

Your first real Publish attempt — the actual full bank, 3,61,870 accounts
across all 22 regions — failed with "Failed to fetch." Reproduced directly:
that dataset compresses to ~5.6 MB gzipped, and Vercel's Serverless
Functions reject any request body past ~4.5 MB with `413
FUNCTION_PAYLOAD_TOO_LARGE` (confirmed the exact boundary with `curl`: 4 MB
passes, 4.5 MB is rejected). This is exactly the known limit flagged when
the Postgres backend was first built ("logged as a known limit, not solved
speculatively") — it just became real the first time you actually tried
the full-bank case rather than a single region.

Fixed with **chunked upload**: the browser now always splits the
gzip-compressed payload into 3 MB raw-byte chunks (comfortably under the
~4.5 MB ceiling) and uploads them sequentially to a new
`POST /api/publish-chunk` (tagged by an upload id + chunk index/total via
headers), storing each as base64 text in a temporary `upload_chunks`
table. Once every chunk has arrived, `POST /api/publish-finalize`
reassembles them in order, gunzips, and publishes exactly like the
original single-request `/api/publish` did. Abandoned/incomplete uploads
(client closed the tab mid-upload, etc.) are pruned automatically after 2
hours rather than needing a separate cleanup job. A small upload that fits
in one chunk still goes through the same chunk-then-finalize path — one
upload mechanism instead of two branches to maintain.

**Verified**: found the exact Vercel payload ceiling empirically via
`curl` (4 MB ok, 4.5 MB rejected) rather than guessing a "safe" chunk size;
the chunk-storage/reassembly SQL was verified against a real local
Postgres with a genuinely multi-chunk payload (200,000 rows, 2 real
chunks) — confirmed the reassembled bytes are byte-for-byte identical to
the original compressed data, decompression and row count match, the
per-uploader ownership check correctly rejects a mismatched requester, and
cleanup removes the chunks afterward. The client-side chunking math
(chunk boundaries, shared upload id, sequential indices, progress
messages) was verified with Playwright using a 120,000-row synthetic
payload built from randomized (poorly-compressible) strings to force 3
real chunks rather than collapsing to 1 the way realistic repeated test
data tends to.

### M2 completion notes (2026-07-21)

Added GitHub OAuth **Device Flow** login, restricted to a single
Administrator GitHub account (`mittalok-creator`). No password, no client
secret, nothing Microsoft/Azure involved.

- **New file**: `js/auth.js` — handles the whole GitHub sign-in flow
  (start device code → poll for approval → fetch profile → store
  session) and exposes `window.UPGBAuth` (`isAdmin()`, `getCurrentUser()`,
  `signOut()`, `requireAdmin()`).
- **`index.html`**: added a "Sign in with GitHub" widget to the bottom of
  the sidebar (shows avatar + username + Sign out once logged in), and a
  new modal (`#githubAuthModalOverlay`) that displays the device code and
  a link to `github.com/login/device`.
- **`js/app.js`**: every entry point that used to open the "Update Data"
  modal directly (`settingsBtn`, `settingsBtnNav`, `updateDataBtn`, the
  mobile `[data-open-data]` button) now calls `UPGBAuth.requireAdmin(...)`
  first. Anyone not signed in as the Admin account gets the sign-in
  prompt instead of the upload screen; a non-admin GitHub account gets a
  clear "not the Administrator account" message with no access.
- GitHub OAuth App registered: name "UPGB OTS Intelligence Platform",
  Client ID `Ov23liwGRJMlo4VZSBzn`, Device Flow enabled, no client secret
  generated/used.

**Verified locally (Playwright + Chromium) — everything that doesn't
require reaching GitHub's live servers:**
- [x] Sidebar shows "Sign in with GitHub" when logged out
- [x] Clicking Settings while logged out correctly opens the sign-in
  modal instead of the upload screen (the gate works)
- [x] Cancel closes the sign-in modal cleanly
- [x] Simulating a signed-in Admin session: sidebar switches to
  avatar + `mittalok-creator · Admin` + Sign out; Settings now opens the
  Update Data modal directly (gate correctly bypassed for the real admin)
- [x] Zero JavaScript errors

**Live end-to-end test: PASSED (2026-07-21).** Real-world testing surfaced
one thing local testing couldn't: GitHub's login endpoints reject direct
cross-site `fetch()` from a static site (no CORS on those endpoints). Fixed
by adding a tiny relay — see "Relay for GitHub sign-in" below — after which
the real sign-in flow on `https://npadashboard.alokmittal.net/` worked:
code shown → approved on `github.com/login/device` → returned signed in as
`mittalok-creator · Admin` → Settings unlocked directly.

### Relay for GitHub sign-in (added 2026-07-21)

- **New folder**: `relay/api/device-start.js` and `relay/api/device-poll.js`
  — tiny serverless functions, no client secret (only the public
  `client_id`), that forward the two Device Flow calls server-side and add
  CORS headers for `https://npadashboard.alokmittal.net`. They exist solely
  to route around GitHub's lack of CORS on those endpoints — nothing
  sensitive is held there.
- **Deployed on Vercel** (chosen for one-click "Continue with GitHub"
  sign-up, free tier, no card): project `npa-dashboard` under account
  `alokmittal`, Root Directory set to `relay`. Live URL:
  `https://npa-dashboard.vercel.app`.
- `js/auth.js`'s `RELAY_BASE_URL` points at that URL.
- Also added `.nojekyll` at repo root so GitHub Pages serves files as-is.

**Lesson learned, logged for future milestones**: any direct
`fetch()`/XHR from the static site to `github.com` (not `api.github.com`)
needs to go through this relay, since `github.com`'s login/session
endpoints don't support cross-origin browser requests. `api.github.com`
(used for reading the signed-in user's profile) does support CORS and is
called directly — this was verified working during the same live test.

### M4 completion notes (2026-07-21)

Built the real import pipeline against three actual files from the user
(not synthetic test data): the single-region daily HO export (34,552
rows), the Customer Master they filled in (77,983 rows, 74,815 unique
Customer IDs after dedup), and a multi-region sample CSV (Aligarh/Agra/
Hathras).

- **`js/app.js`**: added `mapHoRowsToNpa()` (replaces the old CSV-only
  `mapDailyCsvToNpa`) — works for both `.csv` and `.xlsx`/`.xlsb` uploads
  carrying the HO's real column names, detected by header signature
  (`detectHoHeader`); falls back to the legacy fixed-position "NPA sheet"
  format if headers don't match. Reads the new `Region` column (schema
  extended to 27 columns, `NPA_COLUMN_COUNT`), computes NPA Date as
  MIN(Account NPA Date, Cust NPA Date), splits `SBA Acc/Balance` into SB
  Account + SB Balance.
- **Customer Master merge**: `buildCustomerMasterMap()` +
  `mergeCustomerDetails()` join by Customer ID, filling Address/Aadhar/PAN.
  `cleanMobile()`/`cleanPan()`/`cleanAadhar()` implement the exact rules
  confirmed against real data (mobile: 10 digits starting 6-9, or 12
  digits with a leading "91" whose last 10 do the same, else "N/A"; PAN:
  `^[A-Z]{5}[0-9]{4}[A-Z]$` else "N/A" — catches real `FORM60`/`FORM61`
  declarations; Aadhar: exactly 12 digits else "N/A"). Verified against a
  real duplicate Customer ID in the master file (same person, two spelling
  variants, same address/mobile/PAN) — merge picked up the right values.
- **Carry-forward, not re-upload**: the Customer Master only needs
  uploading when it actually changes (every 6-8 months). On every other
  daily update, `carryForwardMapFromCurrentData()` reads Address/Aadhar/
  PAN out of the currently-loaded data before the new daily file overwrites
  it, so those fields persist forward automatically. Verified: applied
  once with the master, then re-applied the daily file alone (no master
  re-upload) — Address/Aadhar/PAN were still correct on the second apply.
- **Multi-region**: `Region` flows through the whole stack. Dashboard
  title is dynamic (single region → "UPGB {Region} region NPA Portfolio";
  multiple → "UPGB NPA Portfolio — N regions"). A Region filter appears
  next to the existing Branch filter **only when more than one region is
  present** in the loaded data — stays out of the way for the common
  single-region case. Selecting a region narrows the Branch dropdown to
  that region's branches. Verified with the real multi-region sample:
  3 regions detected, Aligarh's 15 branches correctly isolated when
  selected, stats correctly recomputed per filter.
- **Validation engine**: blocks "Apply Update" on duplicate Account No.,
  blank Branch, blank Customer ID (rows with no Customer ID are excluded
  from the upload entirely — flagged, not silently dropped), missing/
  non-numeric Balance Amount, and unreadable NPA/Sanction dates. Verified
  both ways: the real 34,552-row file passes cleanly; three synthetic
  "broken" files (duplicate account, blank branch, blank customer, bad
  balance) each correctly failed validation and disabled Apply.
- **As-on date**: parsed from the uploaded filename (`npa_as_on_20072026.xlsx`
  → 20-07-2026; `AB_NPA_AC_WISE_20.07.2026.csv` → same) into an editable
  date field the Admin confirms before Apply. Stored on `DATA.asOnDate`,
  shown on the Dashboard's "Data as on" line, and now correctly persisted
  through the download/redeploy cycle (see the bug fix below).
- Also added `.xlsb` to the file input's accepted extensions — the real
  daily export from Head Office turned out to be Excel Binary format, not
  `.xlsx`.

**Verified locally (Playwright + Chromium) against the three real files
plus synthetic bad-data files** — zero console errors throughout, all
scenarios above confirmed with actual output, not assumptions.

**Not yet verified**: the real `.xlsb` file itself wasn't available to test
directly (only confirmed via a screenshot of the user's own upload attempt
on the old code) — the bundled SheetJS build should read it since
`XLSX.read()` detects format from file content, not extension, but the
user should confirm on the real deployed site.

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

## 3a. Post-M4 additions (2026-07-21, ahead of M5-M10)

Built directly on top of M4 in the same session, once real multi-region
data (283,295 accounts, 22 regions bank-wide, not just Hathras) started
flowing through the app:

- **Region Comparison view**: a dedicated "Regions" nav item + page
  (`viewRegions`/`renderRegionsView()`), shown only when the loaded data
  spans more than one region. Table of every region (Accounts, Total O/S,
  Share, High-Risk % = DA3+Loss share), sorted by outstanding; clicking a
  row drills into that region on the main Dashboard. Originally added
  inline on the Dashboard itself, then moved to its own view per request.
- **Animated welcome/splash screen**: gold circular "AM" monogram (ring
  draw-in animation) + "ALOK MITTAL", gating entry with a 4-digit PIN
  (`0000`), unlocking once per browser session. Recreated in SVG/CSS
  (not a static image — the pasted logo wasn't available as an actual
  file). **Note**: this PIN is visible in page source on a static site
  with no backend — it's a branded welcome gate, not real access control,
  consistent with Viewers never needing real login.
- **PWA**: `manifest.webmanifest`, a network-first `sw.js` service worker
  (always prefers fresh network content since NPA data is embedded
  directly in `index.html`; only serves cached content when offline),
  and icon set generated from the bank's official logo (extracted from
  the existing embedded favicon/sidebar logo — 300×300 source) at
  192/512 (regular) and 192/512 (maskable, 72% safe-zone padding) plus
  a 180×180 Apple touch icon, all in `/icons`.
- **Smooth dashboard filter transitions**: switching Region/Branch filters
  (or drilling in from Top Branches/Region Comparison) used to swap the
  Dashboard's entire HTML instantly, reading as an abrupt blank flash
  because every chart-card's entrance animation restarted at once.
  `renderDashboardSmooth()` now dims the panel, swaps content while still
  dimmed, then eases back in — verified via screenshots at t=100/200/600ms.
  **Follow-up fix (same day)**: the first pass still felt like a full page
  reload on the real device — traced to two separate causes stacked on top
  of each other. (1) The dim itself was too strong (`opacity:.28`, 220ms) —
  lightened to `.92`/150ms. (2) The real culprit: every `.chart-card` and
  `.kpi-tile` replays its `riseIn` entrance animation (fade + rise,
  staggered up to 0.3s) on **every** re-render, not just on first paint —
  that "cards flying in from nothing" is what actually reads as a new page
  loading. Fixed with a persistent `.no-card-anim` class added by
  `renderDashboardSmooth()` that disables the entrance animation
  (`animation:none!important`) on filter-driven refreshes, leaving it
  intact only for the very first `renderDashboard()` call on page load.
  Verified via Playwright screenshots at t=100/200/600ms against the real
  283,295-row, 22-region file: fully settled by ~200ms, no dim spike, no
  card fly-in. Shipped as PR #15, live on `npadashboard.alokmittal.net`
  (asset version `20260721b`).
- **App renamed**: "UPGB OTS Intelligence Platform" → **"UPGB Hathras NPA
  Dashboard by Alok Mittal"** (page title, sidebar brand text). PWA install
  name (what shows on a phone's home screen) set separately to **"OTS
  Utility by Alok"** (`short_name` in `manifest.webmanifest` +
  `apple-mobile-web-app-title`), since the full name is too long for a
  home-screen icon label.
- **Region-scoped data replace on Apply (2026-07-22)**: previously, applying
  a new upload did a full wholesale replace of the whole NPA dataset with
  only the rows in that file — correct when the whole bank is uploaded in
  one file (any account missing from the new file, i.e. regularized/closed,
  correctly disappears), but unsafe for a single-region daily upload: it
  would have wiped out every *other* region's data too, not just refreshed
  the one region actually uploaded. `applyNewDataNow()` now scopes the wipe
  to only the region(s) present in the newly uploaded file — old rows for
  those regions are dropped (so regularized/closed accounts vanish, as
  intended), while any region not touched by this upload is carried forward
  untouched from its own last upload. The "Data updated" success message
  now also reports how many accounts from the previous data for that region
  no longer appear. **Verified** with Playwright against the real
  multi-region sample (Aligarh 63 / Agra 17 / Hathras 2 accounts): applied
  the full file, then a reduced Aligarh-only file with 10 accounts removed
  (simulating regularized/closed) — Aligarh correctly dropped to 53 with
  exactly those 10 account numbers gone, Agra and Hathras untouched at 17
  and 2.
- **Bug found + fixed: stale legacy seed data was never actually being
  published (2026-07-22)**. You reported that after applying a new
  update, "Rinkesh Kumar Meena" still topped the ₹10 Lakh+ list even
  though that account was long since regularized/closed and absent from
  your new file. Root cause: the live, committed `index.html` had never
  actually been refreshed with any of your real daily uploads — "Update
  Data → Apply" only updates the data in your browser's own memory for
  that session; the actual publish step (downloading the regenerated app
  and getting it committed to the repo) had never happened, so every
  fresh visit kept loading the **original 13,817-row seed dataset** baked
  in since before M1 — real historical Hathras data from months ago, but
  stale, with no `Region` field at all (pre-dates the 27-column schema).
  Two things were fixed:
  1. `applyNewDataNow()` now also unconditionally drops any old NPA row
     with a blank/missing Region on every apply (a real HO daily export
     always carries a Region column, so blank region is unambiguously
     dead pre-migration data that a region-scoped upload could otherwise
     never touch or refresh).
  2. Manually applied your real `npa.xlsx` (14,000 Hathras rows, as-on
     22-07-2026) through the actual import pipeline via Playwright,
     confirmed Address/Aadhar/PAN correctly carried forward by Customer
     ID from the old seed data before it was purged (proving that old
     data was genuinely real historical KYC info, not throwaway demo
     data), then spliced the resulting clean data JSON into the current
     `index.html` and committed it — **this is the first time the live
     site has ever carried real production data** instead of the
     original seed dataset. Verified end-to-end: fresh splash → PIN →
     dashboard shows 14,000 accounts / ₹128.82 Cr, ₹10 Lakh+ slab now
     correctly topped by Prem Bihari Chatarji (₹16.77L), zero trace of
     Rinkesh Meena anywhere, zero console errors.
  **Until M5 (real publish pipeline) is built, every real data update
  still needs this same manual "send the file, get it applied + spliced
  into `index.html` + committed" cycle — Update Data → Apply in the
  browser alone does not make new data live for anyone else.**

---

## 4. Backlog (bugs / improvements / future ideas)

### Bugs
- **Fixed (2026-07-21)**: `downloadUpdatedApp()` captured `document.documentElement.outerHTML`
  without ever updating the `#ots-data` script tag's text — so the "Download
  Updated App" button silently shipped the *original* embedded data every
  time, regardless of what was applied in the session. Fixed by writing
  `JSON.stringify({npa, oldots, asOnDate})` into that element right before
  serializing. Verified: downloaded file now contains the actual applied
  row count and as-on date.

### Improvements
- (none logged)

### Future ideas
- The daily HO NPA file carries several fields the app doesn't use yet:
  ROI, SMA Status, Security Value, Secured/Unsecured O/S split, Due Date,
  Demand Amount, Turnover. Good raw material for the future Reports /
  Analytics modules (M8) — no need to source anything extra, it's already
  arriving daily.

### Real-world data schema audit (2026-07-21)

You uploaded a real Head Office daily export (`npa_as_on_20072026.xlsx`,
34,552 NPA accounts, 55 branches, Hathras region only — larger than the
13,817 baked into the current `index.html`, meaning that embedded snapshot
was stale; M6 replaces it with fetched data anyway). Full comparison
against every field `js/app.js` actually reads is in the delivered
workbook `UPGB_Field_Reference_and_Customer_Master_Template.xlsx` (not
committed to the repo — it's a reference document for you, not app data).
Key findings, for whoever builds M4:

- **19 of the app's 26 internal fields come straight from the daily HO
  file**, just under different column names (e.g. `Sol`→branch code,
  `Category`→asset class, `Account No`→account number). A full old-name →
  new-name mapping table is in that workbook's "Field Reference" sheet.
- **NPA Date = MIN(`Account NPA Date`, `Cust NPA Date`)** from the HO file
  — not a direct column, a computed value.
- **`SBA Acc/Balance`** in the HO file is one combined text field (e.g.
  `151710101006588 -> 0`, or `-` if none) — needs splitting into SB
  Account + SB Balance during import.
- **`HELPER`** (format `custId:slotNumber`, slots 1-4) is 100%
  app-generated — groups a customer's multiple NPA loans for the combined
  OTS calculator. Never source this from any file.
- **Only 3 fields are genuinely missing from the daily file**: Address,
  Aadhar No., PAN. These come from a separate **Customer Master** file
  (~80,000 rows, all customers bank-wide, refreshed every 6-8 months),
  joined by Customer ID. Blank template with exactly these columns
  (Customer ID, Name, Address, Mobile, Aadhar, PAN) was delivered to the
  user directly.
- Several HO columns exist but nothing in the current code reads them
  (Provision Amount, Multiple Loan flag, Account Opening Date, Uncharged
  Interest Total, System sub-classification) — safe to ignore for M4
  unless a future milestone needs them.
- **As-on date**: the HO filename itself embeds it
  (`npa_as_on_20072026` = 20-07-2026). M4 should auto-parse this from the
  uploaded filename and show it to the Admin as an editable/confirmable
  field, rather than requiring manual entry every time — addresses the
  user's "you'll ask me every time" expectation with less daily friction.
  Dashboard should display this as-on date prominently (already has a
  "Report Date" field in the current UI — reuse that).

---

## 5. External configuration log

Tracks every setup step done outside this repo (Azure, Microsoft Graph,
GitHub settings, etc.) so nothing is forgotten or duplicated.

- 2026-07-21: Custom domain chosen for the live site:
  **`npadashboard.alokmittal.net`** (DNS: CNAME record on Squarespace,
  `NPADASHBOARD` → `mittalok-creator.github.io`). Repo now carries a
  `CNAME` file with this domain so GitHub Pages serves it. GitHub Pages
  source branch is currently `claude/upgb-ots-platform-setup-14ehm0`
  (pending — will move to `main` once M1 work is merged). **Final live URL:
  `https://npadashboard.alokmittal.net/`** — this is the exact address
  registered anywhere a redirect/callback URL is needed.
- 2026-07-21: **Abandoned** the Azure AD app registration attempt for
  `alokmittal2016@outlook.com` after repeated blockers: (1) browser/tenant
  routing kept misdirecting sign-in into unrelated tenants ("UPGB",
  "Microsoft Services") — resolved each time via incognito + full session
  logout, but recurring; (2) the account does not have its own Entra ID
  directory; (3) free Microsoft 365 Developer Program sandbox — account
  did not qualify; (4) Azure Free Account signup — paused before
  completion (needs card + phone verification) when we decided to pivot
  away from Azure entirely instead. **Decision: drop Microsoft/Azure/Graph
  from the architecture** (see Section 2) in favor of GitHub OAuth Device
  Flow for Admin login and a GitHub Actions workflow for Publish. No Azure
  resource was left half-configured — nothing to clean up there.
- 2026-07-21: GitHub OAuth App registered at
  `https://github.com/settings/developers` for `mittalok-creator`:
  name "UPGB OTS Intelligence Platform", Homepage/Callback URL
  `https://npadashboard.alokmittal.net/`, Device Flow **enabled**, Client ID
  `Ov23liwGRJMlo4VZSBzn` (public identifier, safe to keep in source). No
  client secret was generated or is used.
- 2026-07-21: Merged PR #1 (`claude/upgb-ots-platform-setup-14ehm0` →
  `main`) — M0, M1, M2 first landed on `main`. **Done**: GitHub Pages
  Source confirmed set to "Deploy from a branch" → `main` → `/ (root)`,
  Custom domain `npadashboard.alokmittal.net` shows "DNS check successful".
- 2026-07-21: GitHub Pages initially 404'd on the custom domain after
  enabling it — fixed by adding `.nojekyll` (PR #2, merged) and waiting
  out first-deploy propagation (a couple of minutes). Confirmed live
  afterward.
- 2026-07-21: Vercel account created at `https://vercel.com` via
  "Continue with GitHub" (team name/slug: `alokmittal`, Hobby/free plan,
  no card). Project `npa-dashboard` imported from this repo with **Root
  Directory set to `relay`** — deploys only `relay/api/*.js`, not the main
  site. Production URL: `https://npa-dashboard.vercel.app`. This exists
  solely to relay the two GitHub Device Flow calls around a CORS
  restriction (see Section 3, M2 notes) — it holds no secret.
- 2026-07-21: PR #2 (`.nojekyll` + relay code, pointing at a placeholder
  relay URL) and PR #3 (corrected the URL to the real deployed
  `https://npa-dashboard.vercel.app`) both merged to `main`. **M2 fully
  verified live**: real GitHub sign-in on `https://npadashboard.alokmittal.net/`
  works end-to-end.
