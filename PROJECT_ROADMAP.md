# UPGB OTS Intelligence Platform — Project Roadmap

This file is the single source of truth for project status. It is updated at
the end of every milestone. Read this first in any new session.

Last updated: 2026-07-23

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
  (Admin-only). **`POST /api/publish` was superseded the same day** by the
  chunked upload flow (`POST /api/publish-chunk` + `POST
  /api/publish-finalize`, see further down) once a genuine full-bank
  upload exceeded Vercel's payload ceiling even after gzip; the file was
  removed entirely rather than left as unused/misleading dead code.
  Admin-ness is verified **server-side** now — the route
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

### Bug fix: CORS preflight blocked the chunked upload's custom headers (2026-07-22, same day)

The chunked upload shipped above still failed with a generic "Failed to
fetch" on your first retry. Root cause: `publish-chunk.js` reads
`X-Upload-Id`/`X-Chunk-Index`/`X-Total-Chunks` request headers, but
`cors.js`'s `Access-Control-Allow-Headers` never listed them — a browser's
CORS preflight silently rejects the actual request if a custom header
isn't explicitly allowed, which is invisible to `curl` (it doesn't enforce
CORS at all) and to the earlier Playwright tests (mocked responses bypass
real CORS enforcement entirely). Added the three headers to the allow-list
and confirmed via a real `OPTIONS` preflight request that the corrected
header list is actually being served.

### Audit pass + one more real bug: Neon's own 64MiB query limit (2026-07-22, same day)

Asked to audit the backend code before the next retry. Found and fixed:
a dead, superseded `relay/api/publish.js` (still carrying the old 4.5MB
single-request ceiling, removed entirely rather than left as misleading
unused code), and a stale code comment still describing the old
GitHub-commit design. Also fixed `js/publish.js` silently discarding the
server's `detail` field on error, showing only a generic code like
"finalize_failed" — needed to actually diagnose the next failure rather
than guess.

That diagnostic fix immediately paid off: your next retry (the real
full-bank file, 3,61,870 accounts / 22 regions, needing 7 upload chunks)
failed with a fully visible error this time — **`request is too large (max
is 67108864 bytes)`**, a **Neon-specific 64 MiB limit on the query itself**,
completely different from Vercel's ~4.5MB request-body ceiling the chunked
upload already solved. Root cause: `publishVersion()` was decompressing
the reassembled chunks back to the full raw JSON (~87MB for the real file)
and embedding that directly in the `INSERT` as a JSONB parameter — the
chunking fix solved getting data *into* the function, but not this second,
separate ceiling on the query *out* to the database.

Fixed by never decompressing before storage: `npa_versions.data` (JSONB)
was replaced with `data_gzip_b64` (TEXT) — the *already-compressed* bytes
from chunk reassembly, base64-encoded, stored as-is. For the real file
this is ~20MB base64, comfortably under Neon's 64MB limit. Knock-on
simplifications: `/api/data-latest` no longer re-compresses on every
request (the stored bytes already are gzip, just decode-and-send);
rollback no longer decompresses/re-parses the blob at all (`row_count` and
`regions` were already recorded as separate plain columns when the version
was first published, so rollback is a pure metadata + blob copy).

**Verified before shipping**, having been burned by shipping-then-finding-out
four times in one day already: (1) the schema migration specifically —
simulated the *actual* production table (already created with the old
`data JSONB` column) and confirmed the new code correctly adds
`data_gzip_b64` and drops the old column. This caught a real bug in the
first draft of the migration: `CREATE TABLE IF NOT EXISTS` does **not**
add new columns to an already-existing table, so the first version of this
fix would have silently failed to create `data_gzip_b64` at all, causing a
fifth failure. (2) A full publish → rollback cycle against a real local
Postgres using a 361,870-row payload of genuinely randomized (poorly
compressible) data sized to match the real failure (87MB raw, 15MB gzip,
20MB base64) — confirmed the large version publishes correctly, decompresses
back to the exact original row count, and that rolling back to it
afterward reproduces the exact original bytes with zero decompression
needed in the rollback path itself.

### Branch-wise NPA % (2026-07-22, same day)

You asked to show NPA % (NPA outstanding ÷ total advance) per branch, and
per Regional Office, prominently — placed next to the amounts that already
exist rather than as a whole new dedicated section.

- **New "Branch-wise Total Advance" upload** in the Update Data modal
  (collapsible, matching the existing Customer Master upload's pattern).
  Applies immediately on upload (no separate Apply step, since there's no
  account-data risk, only a stale NPA% until re-uploaded) and goes live to
  every viewer the next time Publish is clicked.
- **Reads your real Daily NPA Projection workbook directly** — you sent a
  sample and asked for "Sol ID and Advance" from its "Daily Follow-up
  Sheet". That sheet's actual layout: a header row with plain "Sol ID"/
  "Branch Name" columns, but the Advance column's own header cell just says
  generic "AMT" — its real label ("Advances 31-03-2026") lives in a merged
  cell 1-3 rows above, and the date in it changes every time the file is
  refreshed. The parser checks the header row first (for a plain manually-
  filled fallback template) then falls back to scanning the few rows above
  it for a cell matching `/^advances?\b/i`, so the exact date never needs
  to match anything. Also auto-detects the "Daily Follow-up Sheet" by name
  when the full multi-sheet workbook is uploaded as-is (the same one also
  contains "GAP", "NPA LIST", and "Holiday List" sheets — skipped).
- **Matches branches by Sol ID, not name.** The real file's branch names
  ("M.G.Hathras") don't match the existing NPA data's own branch names
  ("MURSAN GATE") — confirmed by testing with your actual file. Sol ID is
  already a column in the daily NPA data (`C.SOL_ID`) and is the one
  reliable join key across differently-formatted HO reports, so
  `computeDashboardStats()` now also tracks each branch's Sol ID
  (`branchMap`'s per-branch value gained a `solId` field), and the advance
  map is keyed by Sol ID.
- **Units**: advances are entered/read in ₹ Lakhs (matching how UPGB's own
  reports already state them) and converted to plain rupees internally to
  match the NPA data's units — verified against your real file: summed all
  55 real branch advances (145,145.86 Lakhs = ₹1,451.46 Cr) against the
  live book's real total NPA (₹128.82 Cr) → 8.9% aggregate NPA ratio, a
  realistic figure for context, and exactly what the shipped feature
  computes and displays.
- **Display**: the existing "Total Outstanding" hero KPI card now carries a
  colored NPA % badge (green &lt;5%, amber 5-10%, red &ge;10% — illustrative
  bands, not a claim of official RBI thresholds) showing whichever
  region/branch is currently filtered — Regional Office by default, or a
  single branch's own ratio once one is picked from the filter, since the
  same underlying `branchMap` already reflects that filter. The existing
  "Top Branches by Exposure" list gained the same big, color-coded % on
  each row. Only aggregates over branches that actually have an uploaded
  advance figure, so an incomplete advance file never silently understates
  the ratio by dividing by a smaller, partial total.

**Verified end-to-end against your real uploaded workbook** (not a
synthetic test file): 56 Sol ID/Advance rows parsed correctly, the
Regional Office aggregate computed to 8.9% (matching the manual sanity
check above), individual branch badges ranged sensibly from 9.8% to 21.2%,
and filtering the Dashboard down to a single real branch (MURSAN GATE)
correctly showed that branch's own specific ratio (3.8%) rather than the
regional aggregate. Checked in both themes and at a mobile viewport, where
the branch rows reflow into a stacked layout (label + big % on top, bar
below, detail stats below that) rather than cramming a 4-column row into a
narrow screen.

### One-time direct publish of real branch advance data (2026-07-22, same day)

You uploaded your real `Daily_NPA_Projection_5033856.xlsx` and asked for the
Sol ID + Advance columns from its "Daily Follow-up Sheet" to populate the
feature above. After it shipped, you said "But ye show to hua nhi" — turned
out you hadn't tried the Upload UI yet, and asked me to just publish the
data directly myself instead: "Maine abhi nhi ki. Abhi tum bhi push kr do
ise data se."

- Since data now lives as a plain committed file (`data/latest.json`, per
  the architecture-reversal above) rather than a separate database, I had
  direct repo write access to do this without needing your GitHub sign-in.
- Re-ran the exact same parsing logic from `buildBranchAdvanceMap()` in
  `js/app.js`, in Python, against your real file, to avoid any
  drift between "what the button would have done" and what got published:
  56 Sol ID → Advance (₹ Lakhs → rupees) pairs extracted.
- Verified the local `data/latest.json` was byte-for-byte identical to the
  live site's served copy first, so this one-time direct edit couldn't
  clobber anything else that may have changed on the live site meanwhile.
- Merged the 56 advances into `data/latest.json`, and replicated the exact
  side effects the real Publish button produces so Version History/Rollback
  stays consistent: a new full-content snapshot at
  `data/history/2026-07-22-1784739013210.json`, plus a matching entry
  prepended to `data/history/index.json` (`publishedBy:
  "mittalok-creator"`, `isRollback: false`).
- This was a **one-time bootstrap only**, done because this was the first
  time this data existed anywhere. Going forward, you'll upload your daily
  Daily NPA Projection file yourself through the Update Data modal's
  "Branch-wise Total Advance" section, same as any other daily update — no
  further direct-git-publish action is expected or planned.

### Reordered nav: Search moved from 2nd to last position (2026-07-23, same day)

- In both the desktop sidebar and the mobile bottom nav, **Search &
  Settlement** moved from the 2nd slot to the last (6th) slot. New order in
  both: Dashboard, Bank Dashboard, Daily PNPA, KCC Overdue, Daily NPA
  Projection, Search & Settlement. Pure reorder — no tab added, removed, or
  renamed, and `switchView()`/the click-wiring are generic over
  `data-view`, so nothing else needed to change.
- Verified in the browser at both a 390px mobile viewport and a 1440px
  desktop viewport that the new order renders correctly and each tab still
  switches views.

### Mobile bottom nav: moved Quick Search/Update Data/Theme to a top utility bar (2026-07-23, same day)

You sent a phone screenshot showing the bottom tab bar crammed with 9 items
(6 real tabs — Dashboard/Search/Bank/PNPA/Overdue/Projection — plus 3 utility
buttons — Quick Search/Update Data/Theme toggle) all squeezed to the same
tiny size, labels barely readable. Asked what to do before touching
anything; recommended separating navigation destinations from utility
actions, and you picked that option.

- The 3 utility buttons are no longer in `#bottomTabs` — they now live in a
  new fixed top bar (`#mobileUtilBar`, mobile-only, hidden on desktop where
  the existing sidebar already has its own copies of these same buttons).
  Reused the exact same element IDs/attributes (`cmdkBtnNavMobile`,
  `data-open-data`, `themeToggleBtnMobile`) so no JS wiring changed at all
  — only where the markup lives moved.
- `#bottomTabs` now holds only the 6 real view tabs, each getting a bigger
  effective share of the bar's width since there are 3 fewer items —
  labels are legible again instead of getting squashed.
- `#mainCol` gained matching top padding so page content doesn't slide
  under the new fixed top bar; the top bar carries the `no-print` class so
  it (like the bottom bar) disappears in Print/PDF output.
- Verified at a 390px mobile viewport in both dark and light theme: top bar
  renders correctly, theme toggle still flips the icon and site theme,
  Quick Search still opens the command palette, Update Data still opens
  the GitHub sign-in/upload modal — all exactly as before, just relocated.
  Confirmed the desktop sidebar layout (≥900px) is completely unaffected.

### Daily NPA Projection: Undo, Print/Export PDF, Export to Excel + GAP color bug fix (2026-07-23, same day)

- **Bug found and fixed**: GAP was being colored with the same rule as
  Recovery (positive=green, negative=red) — but checking every one of the
  55 rows against your reference photo again showed GAP's colors are the
  *opposite* of a plain sign reading: a positive GAP (shortfall against
  commitment) is bad → red, a negative GAP (commitment met/exceeded) is
  good → green. Fixed with a dedicated `dpGapClass()` used only on GAP;
  confirmed on all 55 rows this now matches the photo exactly (37 red,
  15 green, 3 neutral). Recovery and the raw editable cells (Morning/
  Evening NPA, Commitment, Eve. Commitment) are back to plain/uncolored,
  matching the reference image — they were never supposed to be tinted.
- **Undo button**: protects against an accidental "Clear All Fields" tap
  (or any bad edit/paste). Every real change to a cell — typing, pasting,
  or Clear All — is snapshotted before it happens, up to the last 20
  actions, so a mis-tap can always be walked back. Undo is disabled
  (greyed out) once there's nothing left to undo. Like every other edit,
  it still needs Publish to go live for everyone else, and Undo only
  works before that Publish — once published, that data is live.
- **Print / Export to PDF**: a Print button opens the browser's print
  dialog pre-formatted to fit the whole 55-branch sheet on a single A4
  landscape page — all app menus/navigation are hidden, input boxes and
  dropdowns print as plain text (no borders/boxes), and the GAP red/green
  shading is preserved in the printout. Choosing "Save as PDF" in that
  same dialog is how you get a PDF — that's the standard way any browser
  turns a print job into a PDF, so no separate PDF button was needed.
- **Export to Excel**: one tap downloads a real `.xlsx` with the title,
  date, summary totals, and all 55 rows (including computed Recovery/GAP
  values) with sensible column widths. One honest limitation: the free
  Excel-writing library this app uses can't write cell background colors
  into a `.xlsx` file (that's a paid-tier feature upstream), so the
  red/green GAP shading does **not** carry into the Excel file — only the
  numbers do. Use Print/PDF instead when you need the colors on paper or
  in a PDF.

### Daily NPA Projection: added a "Clear All Fields" button (2026-07-23, same day)

- New button above the grid resets every editable field (Morning/Evening
  NPA, Commitment, Eve. Commitment, Follow-up, Remarks) to blank across
  all 55 branches in one tap — Sol ID/Branch are untouched since they're
  fixed reference columns. Confirm-gated (this is a same-day sheet edited
  several times — a stray tap shouldn't be able to silently wipe out
  figures already typed in that morning). Marks the change pending like
  any other edit, so it still needs Publish to go live for everyone else.

### Daily NPA Projection: redesigned as a live calculator, Follow-up By + summary strip (2026-07-23, same day)

You shared a photo of a reference sheet ("NPA COMMITMENT GAP DATA") and
asked for the grid to look/work like that: frozen header, a totals strip,
a Follow-up-By column with a name dropdown, and — the key behavioral
change — "real time calculator ki tarah kaam kare, koi push nahi" (should
work like a real-time calculator, no publish needed).

- **Recovery and GAP are no longer stored data — they're computed live**:
  Recovery = Morning NPA − Evening NPA, GAP = Commitment − Recovery.
  Confirmed against the reference photo row-by-row (all 55 branches'
  Recovery/GAP matched exactly) before trusting the formula. Editing
  Morning NPA, Evening NPA, or Commitment now instantly recalculates that
  row's Recovery/GAP and the summary strip — no publish/save step needed
  to see the math, matching "real time calculator" literally. Sol ID and
  Branch are fixed reference columns (read-only), same reasoning as
  before.
- Added a **live summary strip** above the grid: Morning NPA & Evening
  NPA (as ₹ Cr), Total Commitment, Recovery, Net GAP, Eve. Commitment,
  Projected Recovery (= Recovery + Eve. Commitment) — every figure a
  straight sum/derivation over the current grid, recalculated on every
  edit or paste. Cross-checked against the reference photo's own totals
  (68.88 / 46.22 / 22.66 / 6.00 / 52.22) before shipping.
- Added a **Follow-up By** column — a dropdown per branch (Alok, Deepak,
  Dharmendra, Himanshu, Meenu, Rajeev) — and a **Remarks (if any)**
  column, both editable and paste-able like the rest of the grid; a
  paste into Follow-up matches the pasted text against the 6 names
  (case-insensitive) rather than accepting arbitrary text, so an errant
  paste can't silently set an invalid assignee.
- **Frozen header**: the column header row now stays visible while
  scrolling the grid (sticky positioning), matching the reference
  sheet's frozen-panes behavior.
- Paste distribution now targets only the *editable* columns in order
  (skipping the read-only/computed ones), so a paste naturally lines up
  with Morning NPA → Evening NPA → Commitment → Eve. Commitment →
  Follow-up → Remarks regardless of how the source Excel sheet orders
  its own (now-unnecessary) Recovery/GAP columns.
- Re-seeded `data/daily-npa-projection.json` from the reference photo's
  own 23-Jul-26 snapshot (55 branches, Follow-up assignments as shown) —
  a small ~0.03 rounding drift in the reconstructed totals vs. the
  photo's is expected and inherent to seeding from a 2-decimal screenshot
  rather than the underlying full-precision file; every individual row's
  Recovery/GAP matches the photo exactly.

### New "Daily NPA Projection" tab: plain editable grid, paste straight from Excel (2026-07-23, same day)

You uploaded `Daily_NPA_Projection.xlsx` (9 columns: Sol ID, Branch Name,
Morning NPA, Morning Commitment, Evening NPA, Recovery, GAP, Evening
Commitment, Proposed Reduction — one row per branch) and explicitly asked
for **no fancy dashboard**, just a clean editable table where you can type
directly or paste a whole column/row copied straight from Excel, sortable
on every column, positive/negative shown in color — since this sheet gets
updated several times a day (morning figures, then evening figures).

- Every cell is a plain `<input>`, not a read-only display — click and
  type, exactly like a spreadsheet cell.
- **Paste support**: copying a block of cells in Excel and pasting into
  the top-left target cell here distributes the values across the grid
  (tab-separated → columns, newline-separated → rows), instead of
  dumping raw tab/newline characters into one cell — the same behavior
  Excel/Google Sheets give you.
- Every one of the 9 columns is sortable (click the header, same
  sort-arrow convention as the rest of the app).
- Numeric cells color themselves live as you type or paste: green for
  positive, red for negative — a plain, literal reading of the sign, not
  a domain judgment about which columns are "good" when positive vs
  negative (GAP and Recovery, for instance, have opposite good/bad
  directions) since guessing that wrong on a live tracking sheet used
  multiple times a day would be worse than not color-coding at all.
- No file-upload button for this one, unlike every other tab — edits
  happen directly in the browser and simply ride along in the next
  Publish (Settings → Update Data → Publish), same `extraFiles`
  mechanism as PNPA/KCC Overdue/Bank PDF. A refresh with unpublished
  edits pending asks for confirmation first, so a stray tap can't
  silently discard in-progress typing.
- Seeded `data/daily-npa-projection.json` with today's real 55-branch
  file (one Sol ID with no matching NPA rows, same as the other
  branch-level files this session, isn't in the set).

### Standing rule: dates always DD-MM-YYYY, never locale-dependent (2026-07-23, same day)

You asked that date format always be DD-MM-YYYY, everywhere. Audited
every date display in the app — almost everything already went through
`fmtDate()` (which always produces DD-MM-YYYY), with one real exception:

- **Bug found + fixed**: the Version History list's "published ..."
  timestamp used `new Date(v.publishedAt).toLocaleString('en-IN')` —
  locale-dependent, and in practice renders as `D/M/YYYY, h:mm:ss am/pm`
  (slashes, not dashes, and not guaranteed consistent across
  browsers/devices). Added `fmtDateTime(d)`, which always formats the
  date part via `fmtDate()` and only uses `toLocaleTimeString` for the
  time-of-day (no date-format ambiguity there), and switched Version
  History to it.
- Documented this as a standing rule in a new `CLAUDE.md` (project root)
  so it's remembered automatically in future sessions — including the
  one legitimate exception: native `<input type="date">`/`type="month"`
  elements, whose `value` attribute is required by the HTML spec to be
  `YYYY-MM-DD`/`YYYY-MM` (that's wire format, not display, and the
  on-screen picker rendering itself is native browser UI outside JS's
  control).

### Main Dashboard: Branch Advance template extended with NPA March/June, same corner treatment (2026-07-23, same day)

You re-uploaded the Branch Advance template, hand-modified with two new
columns (NPA MARCH 26, NPA JUNE 26, ₹ Lakhs) filled in for all 55 Hathras
branches, and asked to set up the template properly and incorporate it
into the (Hathras) Dashboard.

- `buildBranchAdvanceMap()` now returns `{adv, branchName, npaMar26,
  npaJun26}` per Sol ID instead of a bare rupee number — both existing
  consumers (the top-10-branches NPA% and the aggregate NPA% badge) were
  updated to read `.adv`. March/June columns are optional (matched by
  prefix, "npamarch"/"npajune", so next year's "MARCH 27" header still
  matches) — a plain advance-only file still works exactly as before.
- Added the same March/June + colored-gap treatment just built for the
  Bank Dashboard to the main Dashboard's "Total Outstanding" hero card,
  scoped to whatever's currently in view (Regional Office or a single
  filtered branch) — using `s.branchMap`, which already respects the
  branch filter. Same partial-upload safeguard as the existing NPA%
  aggregation: only compares against branches that actually have a Mar/Jun
  figure uploaded.
- `downloadBranchAdvTemplate()` and the upload section's description now
  reflect the extended 5-column shape.
- Re-shipped `data/latest.json`'s `branchAdvances` from your real file:
  55 branches (one stale Sol ID with no matching NPA rows dropped, per
  the existing full-replace behavior). Cross-checked the aggregate
  against the Bank Dashboard's own Hathras region row — Regional-Office
  gap works out to ▼₹0.61 Cr since March and ▼₹0.66 Cr since June,
  consistent with the whole-bank PDF's own figures.

### Bank Dashboard: added a colored gap line under each Mar/Jun corner figure (2026-07-23, same day)

Immediately after confirming the March/June corner layout looked right,
you asked for a gap line under each of them too — current vs March under
Mar, current vs June under Jun, both with the same green/red
better-or-worse convention already used everywhere else.

- Mar's gap reuses the report's own `netReductionOverMar26` field
  directly (no re-derivation, avoids rounding drift); Jun's gap is
  computed fresh as `remainingNpaAsOnDate − npaJun26`, since the source
  PDF has no equivalent field for June.
- Same sign convention as the rest of the tab: negative/reduced → green
  ▼, positive/increased → red ▲.
- Restructured the corner markup into two small grouped blocks (Mar
  value+gap, Jun value+gap) instead of 4 flat lines, so the mobile layout
  (which lays the two months out side-by-side once the badge goes static)
  keeps each month's figure and its gap together instead of interleaving.

### Bank Dashboard: replaced the Target/March tab-toggle with always-visible March + June figures (2026-07-23, same day)

You pointed at the empty space on the right side of the hero cards
(below the NPA% badge) and asked for March and June figures to go there
directly, instead of the tab that had to be clicked to switch between
"vs Target" and "Since March".

- Removed the `bank-tab-row` tab switcher (`bankInfoTab`/`setBankInfoTab`)
  entirely. The "vs Target" line at the bottom of each card is now always
  shown (it's the more actionable of the two, so it stays put; "Since
  March" as a computed delta is gone).
- Added a new small stat pair in the previously-empty top-right corner of
  each of the 3 hero cards (Whole Bank, CO Moradabad, Hathras): **Mar**
  and **Jun** — the report's own fixed baseline columns (`npaMar26`/
  `npaJun26`), shown as plain figures side by side with the current value,
  no click needed to compare. `heroKpiCard()` gained a `corner` slot for
  this (defaults to empty, so PNPA/KCC Overdue's cards are unaffected).
- Handles mobile the same way the existing badge does: the corner stats
  drop out of absolute positioning and lay out as a plain flex row once
  the badge itself goes static.

### New "KCC Overdue" tab: Hathras-only, 3 schemes, rich filters (2026-07-23, same day)

You uploaded `KCC_OVERDUE_22072026.xlsx` — a Hathras-only, already-
classified-NPA export limited to exactly 3 schemes (KCC/CC004,
KCC Animal Husbandry/CC043, OD-023 Tatkal) — and asked for a new tab
designed like the Dashboard, with heavy filtering: F.Y.-wise, Cust NPA
Date (month-wise or between two custom dates), and scheme-wise, plus the
usual daily-upload-via-Settings flow.

- **New, fourth independent dataset** (`data/kcc-overdue.json`), separate
  from `data/latest.json`, `data/bank-npa.json`, and `data/pnpa.json`.
  Unlike PNPA, this source file is already Hathras-scoped (verified: all
  9,744 rows were `Region=HATHRAS`) — the parser still defensively drops
  any stray non-Hathras row in case a future export widens scope, but no
  active whole-bank filtering was needed this time.
- Only the 3 named scheme codes are kept; there's no "Other" catch-all
  bucket here (unlike PNPA's 4th bucket) — anything else is simply
  dropped, since Alok only asked for these 3.
- **Bug fix, found while building this**: `toDate()` had no case for a
  native JS `Date` object — when SheetJS parses a file with
  `cellDates:true` (which every client-side upload here uses), date cells
  arrive as real `Date` instances, not Excel serial numbers or strings.
  `toDate()` silently returned `null` for those, meaning **Review Date on
  the PNPA tab has likely been coming back blank for real browser
  uploads** even though the one-off Python-regenerated data looked fine.
  Fixed by adding a `v instanceof Date` branch; benefits both this new tab
  (Cust NPA Date filtering depends on it working) and PNPA retroactively.
- **F.Y. column quirk**: the source cell's actual text is `"MAR-27"`
  (with literal double-quote characters baked into the string) — almost
  certainly HO's own guard against Excel auto-parsing "MAR-27" as a date.
  Stripped before display/filtering/dropdown-population.
- Filters, all combinable: **Branch/Regional Office** dropdown (same
  pattern just built for PNPA, on top); **F.Y.** dropdown (today's data:
  MAR-27, MAR-28); **Cust NPA Date**, switchable between a month picker
  and a from/to custom date-range picker via a small tab toggle. All
  filters apply live to both the 3 scheme hero cards' totals and the
  branch-wise summary beneath them (matching the "blocks reflect the
  filter" behavior just fixed on PNPA).
- Account drill-down list (tap any branch row): Account No, Name, O/S,
  CADU, Limit, Cust NPA Date, F.Y., Category, SMA Status — sortable,
  reusing the same generic list-modal component as the other tabs.
- New upload section in Update Data (separate file input, same
  immediate-apply + Publish `extraFiles` pattern as PNPA/Bank PDF).
- Published today's real file: 9,744 accounts as on 22-07-2026 — KCC
  8,738 (₹219.07 Cr, 55 branches), KCC-AH 884 (₹10.81 Cr, 48 branches),
  OD-023 122 (₹1.13 Cr, 20 branches).

### Daily PNPA: dropdown moved above the bucket blocks, blocks now scope to the selected branch (2026-07-23, same day)

Two follow-up asks: put the Branch dropdown on top, and make the
KCC/KCC-AH/Limit Review/Other blocks actually reflect the selected
branch's numbers instead of always showing the whole region.

- The Branch/Regional Office `<select>` now renders above the 4 bucket
  cards instead of below them.
- The bucket cards now total whichever rows are in scope: all of
  Hathras by default ("Regional Office"), or just the selected branch's
  own rows once one is picked — e.g. picking "MATHURA CITY" changes KCC's
  card from the whole region's 53 accounts down to just that branch's 2.
  The branch-wise table beneath keeps behaving the same way it already
  did (narrowing to the selected branch).

### Daily PNPA: Branch/Regional Office dropdown filter, matching the main Dashboard (2026-07-23, same day)

You asked for a branch/regional-office filter on Daily PNPA "like
dashboard" — the free-text branch search box is replaced with the same
`<select>` pattern the main Dashboard uses: "Regional Office" (= all
branches) plus every distinct branch, built from the whole PNPA dataset
(all 4 buckets combined, 37 distinct Hathras branches today), reusing the
same `.dash-toolbar` styling.

- Unlike the old text search (which reset every time you switched bucket
  tabs), the branch selection now **persists** across KCC/KCC-AH/Limit
  Review/Other — pick a branch once and flip through all four buckets for
  that same branch.
- Selecting a branch narrows the branch-wise summary table to just that
  branch (still within whichever bucket tab is active); "Regional Office"
  shows every branch, same as before.

### Daily PNPA: KCC bucket narrowed to reason "KCC-Disbrsmnt-36" only (2026-07-23, same day)

You asked for KCC's O/S to only count accounts flagged with the
"KCC-Disbrsmnt-36" reason — noticing that the CC004 scheme bucket was
pulling in a few accounts flagged for other reasons instead.

- `pnpaBucketOfRow()` now requires **both** `scheme === 'CC004'` **and**
  `Reason` containing "KCC-Disbrsmnt-36" for an account to land in KCC;
  a CC004 account with any other reason (found: 3 "CUSTLEVEL" accounts in
  today's data) now falls through to the Other bucket instead.
- With today's data: KCC 56→53 accounts (₹213.84L→₹198.02L), Other
  35→38 accounts (₹41.16L→₹56.99L) — same 104 total, nothing dropped,
  just re-routed to the bucket that actually matches its reason.

### Daily PNPA: "Limit Review" split into its own bucket (2026-07-23, same day)

You asked to pull Limit Review out as its own category, and drop those
accounts from KCC's summary rather than leaving them mixed in.

- Added a 4th bucket, **Limit Review**, ahead of the scheme-based split:
  any account whose Reason includes "Limit Review" is routed there
  regardless of scheme code (`CC004`/`CC043`/anything else). KCC, KCC-AH
  and Other now only ever show accounts that are *not* already called out
  for a limit review — no account is double-counted across buckets.
- With today's 104-row Hathras dataset: KCC dropped from 59→56 accounts,
  Other from 45→35, and the new Limit Review bucket picked up all 13
  (3 previously counted under KCC, 10 under Other).
- Removed the "type Limit Review into search" special-case added minutes
  earlier — now that it's a dedicated tab, that shortcut was redundant;
  the search box goes back to plain branch-name filtering.

### Daily PNPA: real "Reason" field (not the always-blank Remarks), Limit Review search (2026-07-23, same day)

You asked to separate Limit/Review out further and let search pull up
accounts by branch, KCC vs non-KCC, and by "Limit Review" — and pointed
out a leftover `*` in the list, which turned out to be the ★ "Hathras"
badge from a stale/cached screenshot (already removed in the previous
update, confirmed with you, no further action needed there).

- Discovered the source file's actual **"Remarks"** column is essentially
  always `"-"` (no real content) — the genuinely useful why-is-this-
  flagged text lives in the **"Reasons"** column instead (e.g.
  `"LAANPA,LimReview"`, `"No Credit for 90Days,TurnOver"`). Swapped the
  account list's last column from the always-blank Remarks to this real
  Reasons text, relabeled **"Reason"**.
- `LimReview` is spelled out as **"Limit Review"** (the one code you
  specifically called out); every other code is shown as-is rather than
  guess-translated, since I'm not confident of every internal code's exact
  banking meaning and didn't want to mislabel one.
- The branch search box now also recognizes "Limit Review" / "LimReview"
  as a special filter — typing it narrows the branch-wise summary (in
  whichever bucket tab, KCC or non-KCC, is active) down to only branches
  with at least one Limit-Review-flagged account, alongside its existing
  plain branch-name search.
- Re-shipped today's data with the Reason field: of the 104 Hathras rows,
  13 accounts carry a "Limit Review" flag.

### Daily PNPA: rescoped to Hathras-only, zero-balance dropped, added Limit/Review Date/Remarks (2026-07-23, same day)

Right after shipping the whole-bank version, you clarified: "i need daily
pnpa only for hathras region and remove 0 balance accounts. seprate the
limit review remark and give the list and summary" — so the tab now
matches this app's core Hathras-only identity instead of the whole-bank
scope the source file happens to come in.

- `parsePnpaRows()` now hard-filters to `Region === 'HATHRAS'` and drops
  any row with a ₹0 Balance Amount (an SMA flag on an already-cleared
  account isn't actionable) — this applies to every future upload too,
  not just today's data.
- Re-extracted today's real file with this filter: 28,860 whole-bank rows
  → **104 Hathras rows** (59 KCC, 45 Other, 0 KCC-AH — all 6 of Hathras's
  KCC-AH rows had already regularized to ₹0 and were dropped).
- Since every row is now Hathras by construction, removed the now-
  redundant "Hathras: X A/C" sub-line, the region column, and the
  Hathras-highlight styling from the branch table — one less thing
  competing for attention when the whole tab is Hathras already.
- Added three more fields end-to-end (parser → `data/pnpa.json` → account
  drill-down list): **Limit**, **Review Date** (converted from the Excel
  serial date to `DD-MM-YYYY`, same helper as the rest of the app), and
  **Remarks** — all sortable, alongside the existing Account/Name/O/S/CADU
  columns.
- The tab structure already gave you both a **summary** (branch-wise
  totals, KCC/KCC-AH/Other) and a **list** (the account-level drill-down
  per branch) — that split stays, just scoped to Hathras and enriched
  with the 3 new columns.

### New "Daily PNPA" tab: whole-bank potential-NPA watch, branch-wise by scheme bucket (2026-07-23, same day)

You uploaded `UPGB_Daily_PNPA_23.07.2026.xlsb` — a separate, whole-bank
"Daily PNPA" (potential/early-warning NPA) export, same 35-column HO layout
as the daily NPA file but covering all 65 regions and ~3,345 branches, not
Hathras-only — and asked for a new tab: branch-wise totals split into
KCC (scheme CC004), KCC Animal Husbandry (scheme CC043) and everything
else, sorted highest O/S first, with a tap-through account list per branch
showing Account No, Name, O/S and CADU.

- **New tab, new data file** (`data/pnpa.json`), separate from both
  `data/latest.json` (Hathras daily NPA) and `data/bank-npa.json` (bank PDF
  MIS) — this is a third, independent dataset, because unlike the daily
  NPA file (which HO already hands you pre-scoped to Hathras), this PNPA
  export is genuinely whole-bank, so merging it into `DATA.npa` would have
  silently polluted the Hathras-only book with 28,000+ other regions'
  accounts. Only the 7 fields this tab actually needs (region, branch,
  scheme code, account no, name, O/S, CADU) are kept per row, not the full
  35-column layout, to keep the whole-bank file a reasonable size
  (~2.6 MB for ~28,860 accounts, vs. several times that with all 35
  columns).
- Parsing happens entirely client-side (same SheetJS library already used
  for the daily NPA upload, which already read `.xlsb` correctly) via a
  new, separate upload section and file input in Update Data, so it can
  never be confused with the existing daily-NPA/Customer-Master/Branch
  Advance uploads' column detection.
- Tab UI: three clickable summary cards (KCC / KCC-AH / Other), each
  showing total O/S, account count, branch count, and Hathras's own
  contribution within that bucket; tapping a card switches the branch
  table below it. The table is branch-wise, highest O/S first, with a
  live text filter (branch or region name) and Hathras branches
  highlighted, reusing the same highlight styling as the Bank Dashboard's
  region table. Tapping a branch row opens the existing sortable list
  modal (same component used for account drill-downs elsewhere) showing
  every account in that branch/bucket — Account No, Name, O/S, CADU.
- Uploading applies immediately (like the Bank PDF) and ships in the same
  commit as the next Publish, via `js/publish.js`'s existing `extraFiles`
  mechanism.
- Published today's real file: 28,860 accounts as on 23-07-2026 — 5,751 in
  KCC (₹54.48 Cr), 383 in KCC-AH (₹4.21 Cr), 22,726 in Other (₹89.27 Cr).

### Bank Dashboard: Target/March consolidated into tabs on every card (2026-07-23, same day)

You asked for the Target-progress and Since-March positions to show right
inside the hero cards via tabs, instead of as separate always-visible
sections — and for the same treatment on all three Circle cards too, not
just the hero row.

- Removed the standalone "Target Progress" and "Since March 2026"
  chart-card sections entirely.
- Added a small "vs Target — 07-22" / "Since March 2026" tab switcher
  above the hero row. Whichever tab is active now shows as one extra
  colored line (green = ahead/reduced, red = behind/increased) at the
  bottom of **every** card that has this comparison — the 3 hero cards
  (Whole Bank, CO Moradabad, Hathras) and all 3 Circle cards (Gorakhpur,
  Lucknow, Moradabad), so switching the tab once updates all six places
  together.
- Verified both tab states render correctly on all six cards, in both
  themes and on mobile (tab pills wrap cleanly).

### Bank Dashboard: pie charts, a bar chart, and history capture for a future sparkline (2026-07-23, same day)

You asked whether pie charts, a bar chart, or a sparkline could be added.
Sparklines need a time series — today's data is a single snapshot (plus
one March baseline point) — so per our discussion, that part isn't built
yet, but the underlying capture needed for it starts today.

- **NPA Share by Circle** (donut): Gorakhpur/Lucknow/Moradabad's share of
  the whole bank's NPA book, with a legend showing amount and %. The 3
  colors are a new categorical assignment (identity, not severity) — run
  through the `dataviz` skill's palette validator against both this app's
  actual dark and light card surfaces before shipping: the dark theme's
  own `--accent-2` (bright cyan, tuned for text) failed the validator's
  lightness-band check as a solid *fill* color, so the Lucknow slice uses
  a deliberately deeper cyan (`#0EA5C4` — coincidentally the same hex the
  light theme already uses for `--accent-2`) instead; Moradabad reuses the
  existing `--seal-d` token. All three checks (lightness band, CVD
  separation, contrast) pass on both themes.
- **Hathras — Asset Classification Mix** (donut): reuses the existing,
  already-validated 5-step RBI IRAC severity ramp (`--sev-1..5`) from the
  Hathras-only Dashboard's own account-level data — clearly labeled that
  this level of detail only exists for Hathras, since the bank-wide PDF
  itself has no per-region asset-classification breakdown for the other
  64 regions.
- **Top 10 Worst NPA % Regions** (bar chart): reuses the existing
  `barRows()` component and severity-color logic already used elsewhere on
  this tab, marking Hathras with a ★ if it ever appears in the worst 10.
- **History capture for a future sparkline**: every Publish that includes
  a freshly-uploaded bank PDF now also writes a dated snapshot to
  `data/bank-history/<date>-<timestamp>.json` plus an entry in a new
  `data/bank-history/index.json` (capped at 120 entries), mirroring the
  main NPA dataset's own history mechanism — best-effort, so a failure
  here can never block the main data from publishing. Once a few weeks of
  daily uploads have accumulated, a trend sparkline becomes buildable from
  this without needing to touch the parsing or publish code again.
- Verified all three charts in both themes and on mobile.

### Bank Dashboard: Total Advance shown in the hero cards (2026-07-23, same day)

You asked for the Total Advance figure to also show in the NPA hero cards
themselves, small size, space not a concern.

- Added a small muted second line under the branch/region count on all
  three hero cards (Whole Bank, CO Moradabad, Hathras) — "Total Advance:
  ₹&lt;amount&gt; Cr" — using the same `totalAdv` field already parsed from
  the PDF, no new data needed.

### Bank Dashboard: added Since-March and vs-Target filters to the region table (2026-07-23, same day)

You asked for the all-regions table to be filterable by "regions above/
below March" and "regions above/below target" — quickly narrowing down to
just the regions that got worse since March, or that are behind this
month's target, without having to scan all 65 rows.

- Two new filter dropdowns next to the existing Circle filter: **Since
  March** (Increased since March / Reduced since March) using the same
  `netReductionOverMar26` figure the "Since March 2026" section already
  computes, and **vs Target** (Behind Target / Ahead of Target) using
  `gapFromTarget`. All three filters combine (e.g. "CO Moradabad" +
  "Reduced since March" together).
- The section subtitle now shows a live count — "worst first · Hathras
  highlighted · 18 of 65 regions shown" — so it's clear when a filter has
  narrowed the list.
- Verified the split is exhaustive both ways: 8 regions increased since
  March + 57 reduced = 65 (all accounted for); 60 behind target + 5 ahead
  = 65. Checked the combined-filter case and mobile layout (three
  dropdowns stack full-width).

### Bank Dashboard: added a "Since March 2026" comparison (2026-07-23, same day)

You asked for March's figures to show too, with a comparison — the source
PDF already carries "NPA MAR-26 (Post Audit)" and "% With Adv. Mar-26" per
region (columns F/G), plus a ready-made "Net Reduction over Mar-26" (column
S), so no new parsing was needed, only surfacing what was already captured.

- New "Since March 2026" section (same chip layout as Target Progress)
  shows Whole Bank / CO Moradabad / Hathras: March's post-audit NPA figure
  and %, this month's current figure and %, and the reduction (or
  increase) between them — green when reduced, red when it grew.
- The all-regions table gained two columns, "NPA Mar-26" and "Since
  Mar-26", so the financial-year-to-date trend is visible per region too,
  not just at the three highlighted levels.
- Verified against the real PDF's figures: Hathras's Mar-26 NPA was
  ₹128.95 Cr (9.02%), now ₹128.39 Cr (8.98%) — a ₹0.56 Cr reduction,
  matching the source file's own "Net Reduction over Mar-26" column
  exactly (both circle and bank totals cross-checked the same way).

### New "Bank Dashboard" tab: whole-bank NPA MIS, all 65 regions, Hathras/CO Moradabad highlighted (2026-07-23, same day)

You uploaded UPGB's daily whole-bank "Dashboard of NPA" PDF (65 regions
across 3 Circles: CO Gorakhpur, CO Lucknow, CO Moradabad) and asked for a
brand new, separate tab — as good as or better than the existing Dashboard
— highlighting our own region (Hathras) against the whole bank, and
against "hamara camp" (confirmed to mean CO Moradabad, the Circle Hathras
reports into).

- **New "Bank Dashboard" nav tab** (sideNav + mobile bottom tabs, bank/
  landmark icon), completely separate from the existing Hathras-only
  Dashboard/Search views — a different dataset (region-level MIS figures,
  not individual accounts) gets its own `data/bank-npa.json` file and its
  own render path (`renderBankDashboard()`), reusing the established
  design system (hero-kpi-card, insight-strip, badge-pill, dash-table)
  rather than inventing new visual language.
- **3-level comparison**: hero row shows Whole Bank / CO Moradabad ("Our
  Circle") / Hathras ("Our Region") side by side, each with its own NPA%
  severity badge. An auto-computed insight sentence states exactly how
  many points better or worse Hathras's ratio is than its Circle and the
  Bank, plus its rank out of all 65 regions. A Target Progress section
  shows all three levels' gap against this month's reduction target
  (green "ahead", red "behind"). Three Circle cards let you compare
  Gorakhpur/Lucknow/Moradabad directly, with Moradabad marked "OUR
  CIRCLE". A full sortable-by-filter table of all 65 regions (worst NPA%
  first) has Hathras's row specially highlighted with a gold "★ Ours" tag
  and every other CO Moradabad region subtly tinted, with a dropdown to
  narrow the table to just one Circle.
- **Client-side PDF parsing (no server involved)**: the PDF has no real
  table structure, only positioned text — pdf.js (vendored locally as
  `js/vendor/pdf.min.js`/`pdf.worker.min.js`, same pattern as SheetJS)
  extracts each page's text with x/y coordinates, then rows are
  reconstructed by clustering items whose y-coordinates land within a
  small tolerance of each other (tuned against the real file — genuine
  data rows cluster within ~1-2pt, comfortably inside the ~9pt gap between
  separate rows) and reading left-to-right by x. A region row is exactly
  "S.No, Region name, 18 numbers"; a "Sub Total CO &lt;name&gt;" row closes
  out that Circle's regions; "Total UPGB" is the bank-wide grand total.
- **New upload section** in the Update Data modal ("Bank-wide NPA
  Dashboard (PDF)"), applying immediately like the Branch Advance upload,
  and bundled into the very next Admin Publish — `js/publish.js`'s
  `publishData()` gained an optional `extraFiles` parameter so
  `data/bank-npa.json` commits in the exact same commit as the daily NPA
  data, without a second publish step. The Publish review panel shows a
  green confirmation line when bank data is staged to go out.
- **Verified against the real uploaded PDF, not a synthetic fixture**:
  parsed all 65 regions + 3 Circle subtotals + the grand total correctly;
  cross-checked the sum of all 65 regions' branch counts (4,330) and total
  advances (₹90,178.76 Cr) against the PDF's own printed grand total
  (4,330 branches, ₹90,178.72 Cr — the 0.04 Cr gap is pure rounding from
  each region already being pre-rounded to 2 decimals in the source, not a
  parsing error) before ever touching the UI. Uploaded the real PDF
  through the actual Update Data modal (not a mock) and confirmed the
  parsed data appears correctly on the Bank Dashboard tab and the Publish
  review panel. Checked both themes and mobile (hero cards stack to one
  column, the region filter dropdown goes full-width, the wide table
  scrolls horizontally like the existing account table already does).
- Today's real data (as on 22-07-2026) ships live in `data/bank-npa.json`
  as part of this same change — the tab has real figures from day one,
  not a placeholder.

### OTS locks now sync to every device immediately, no Admin Publish needed (2026-07-23, same day)

You reported: locked an OTS amount on your phone, searched again there and
saw "Already Told ₹1,70,000" correctly — but the same account on a
different browser/device didn't show it. Root cause: locking only ever
updated in-memory state in that one browser tab; it only reached other
viewers once the Admin manually clicked Publish. You clarified that's not
workable, since **only you have Publish/push access — the staff who'd
actually be locking OTS amounts in the field don't**, so this specific
action needs to sync on its own, without anyone needing to sign in to
GitHub.

- **New relay endpoint** `relay/api/lock-ots.js` (deployed alongside the
  existing GitHub-sign-in relay on the same Vercel project) lets ANY
  visitor — no login — lock or unlock an OTS amount for one account. It
  writes straight to a new, small, separate file, **`data/locked-ots.json`**
  (kept apart from the main `data/latest.json` publish flow so this never
  touches or risks the bulk NPA dataset), via the GitHub Contents API,
  using a repo-scoped token that lives only server-side as a Vercel
  environment variable — never sent to the browser. Handles the rare
  case of two people locking different accounts at almost the same moment
  (a 409 "someone else wrote first" conflict) by re-fetching and retrying,
  up to 3 attempts, so neither person's change is silently lost.
- **`toggleFreeze()`** (in `js/app.js`) now calls this endpoint the moment
  anyone locks/unlocks an OTS amount, in addition to updating local state
  as before. A small `.syncing`/`.sync-err` state on the freeze button
  shows if the sync failed (e.g. no internet) so it's clear the lock only
  took effect on that one device.
- **Every page load** now also fetches `data/locked-ots.json` and merges
  it into `DATA.lockedOts` — this is the live, always-current source,
  taking priority over whatever was baked into the last Admin Publish.
- **A background check every 45 seconds** (paused while the tab isn't
  visible, to avoid pointless calls) picks up locks/unlocks made on other
  devices without needing a manual refresh or reload — updates the
  account detail page's freeze button/input live if that account happens
  to be open, and refreshes the search results view's "Already Told"
  badges.
- **Verified end-to-end**: a lock written directly to
  `data/locked-ots.json` (standing in for "another device just did this
  via the relay") shows up on a completely fresh page load — both the
  search card's badge and the detail page's freeze button — without ever
  touching the freeze button on that browser. Also verified the real
  45-second background poll picks up both a new lock AND a later unlock
  on an already-open tab, and unit-tested the relay's lock/unlock/
  conflict-retry/invalid-input logic directly (mocking GitHub's API,
  since this environment can't reach a real deployed function).
- **Requires one-time external setup before it works live** — see the
  External Configuration Log below. Until that's done, locking still works
  per-device exactly as before (just doesn't sync) — nothing regresses.

### Search result cards now show "Already Told" when an OTS amount is locked (2026-07-23, same day)

You asked: whenever an OTS amount is locked/frozen for an account, that
should be visible to anyone using the app, not just inside that account's
own detail page — and specifically, the search result card (the summary
card shown before you open an account) should carry some "already told"
style language for it. You also asked for the actual locked amount to be
shown on the card, not just in a hover tooltip.

- Locked OTS data (`DATA.lockedOts`) was already synced to every viewer as
  part of the published data (since the earlier "Locked OTS amounts now
  persist for every viewer" work) — what was missing was surfacing it at
  the search-result-card level, where it's most useful (you can see it
  before even opening the account).
- `renderResults()` now checks `frozen[acctNo]` per card and, when locked,
  shows a gold "🔒 Already Told · ₹&lt;amount&gt;" badge next to the asset
  classification badge — same brass/gold visual language already used for
  the freeze button elsewhere in the app, so it reads as "this OTS is
  settled" at a glance.
- Verified in both themes: badge only appears on cards with a locked OTS,
  shows the correct amount, and unlocked cards render unchanged.

### Bug fix: P&L Impact colors went washed-out after the light-theme chrome flip (2026-07-23, same day)

You spotted the "Total P&L Impact" figure on the account detail page's
aggregate panel rendering in near-invisible white after the chrome-flip
fix above — you asked to keep it showing its positive/negative color like
before.

- Root cause: `.agg-stat.impact .av.pos`/`.av.neg` (and the matching
  `.side-rail .rail-value.pos`/`.neg`) use hardcoded pastel green/red
  (`#5fe0a3`/`#ff8a80`) tuned to pop on the old dark aggregate-panel
  background. The chrome-flip fix moved that panel's background to near-
  white but didn't touch these two pos/neg color rules specifically (only
  the plain, non-colored `.av` text), so the pastel colors — nearly
  invisible against white — were the actual bug.
- Added light-theme overrides using the same `--pos`/`--neg` tokens
  already used for P&L coloring everywhere else on the page (dark green
  `#0C8049` / red `#D1362C`), so it now reads exactly like every other
  positive/negative figure in the app.
- Verified both signs render correctly (green for a savings/positive
  impact, red for negative) and confirmed dark theme's original pastel
  colors are byte-for-byte unchanged.

### Light theme chrome flip: side nav, header, bottom tabs, aggregate rail and table headers now go fully light (2026-07-23)

You sent a screenshot of the Search page in light theme showing the top
header bar still solid black, and said "Light theme ko pura hi light karo,
usmein kuch bhi dark na ho" (make the light theme completely light —
nothing in it should stay dark).

- **Root cause**: an earlier design decision (from the original color-theme
  redesign) deliberately kept the app's "chrome" — side nav, bottom tabs,
  top header/search bar, the account-detail aggregate totals rail, and the
  Dashboard/loan-comparison table header rows — permanently dark in both
  themes, the same way apps like Linear/Stripe keep a dark sidebar
  regardless of the content theme. That was a deliberate choice at the
  time, but you now want light theme to be light everywhere, no exceptions.
- Two separate layers had to be fixed, not one: the `--chrome-*`/`--head-*`
  CSS custom properties (color tokens), **and** a later "console pass" set
  of rules further down the stylesheet that had hardcoded flat dark colors
  directly (`background:rgba(9,9,15,.97)` etc.) bypassing those variables
  entirely — flipping only the variables left the header/aggregate-rail
  still black, since the hardcoded rule was winning the cascade. Found this
  by inspecting the actual computed background in a real browser rather
  than assuming the variable-based fix was sufficient.
- Added a full light-theme override set: `#sideNav`/`#bottomTabs`/mobile
  signature strip/header/`.detail-head`/`#aggBar`/`.side-rail` all move to
  a bright glass surface; nav hover/active states, icon buttons, the search
  box, mode pills, and the Dashboard/loan-table header rows all get
  matching light-appropriate colors instead of white-on-white or
  invisible-on-white treatments.
- Dark theme was not touched — verified pixel-for-pixel same before/after
  via screenshot comparison (Dashboard and the account-detail page).
- Verified in light theme via screenshot: Dashboard, Search landing,
  account detail (header/aggregate rail/side-rail/loan table), Update Data
  modal, and mobile viewport (bottom tabs + signature strip) — no dark
  surface remains anywhere.

### Publish review now also shows new accounts added, not just removed (2026-07-23)

You pointed out the Publish confirm dialog only showed "X account(s) removed
as regularized/closed" (in red) and asked to also show new additions
prominently, same style.

- `applyNewDataNow()` now also computes `newAddedCount` (accounts in the
  freshly uploaded file that weren't in the previous data) alongside the
  existing `staleRemovedCount`, using the same account-set-diff approach.
- The Update Data modal's status line and the Publish review panel both now
  show a green "N new account(s) added." line next to the existing red
  "N account(s) removed as regularized/closed." line — new `.pr-good` CSS
  class (green, matching the existing `.pr-warn` red) added alongside it.
- Verified with a two-round upload test (day-1 fixture with 3 accounts →
  day-2 fixture removing one and adding a different one, same session):
  both counts computed correctly (1 removed, 1 added) and rendered in the
  right colors in the actual Publish review panel via a screenshot.

### Dashboard redesign: enterprise fintech visual language (2026-07-22, same day)

You asked for a "world's best banking analytics dashboard" redesign — a full
brief (Stripe/Linear/Ramp/Mercury/Bloomberg-inspired glassmorphism, exact
color/type/spacing tokens, animated KPIs, a 16-artifact deliverable format
per page) built on React/Next.js/Tailwind/shadcn/Framer Motion/Recharts. You
confirmed (via the scope question I asked first) that the live app should
stay on its current stack — plain HTML/CSS/JS, no build step, same GitHub
Pages deployment — with the redesign expressed *within* that stack instead
of a parallel React rebuild. This entry covers the Dashboard page only, per
your "start with the Dashboard page only" instruction; the other ~24 pages
in the brief (Branch Comparison, Recovery Analytics, Legal Cases, GIS Branch
Map, etc.) don't exist in this app yet and weren't attempted.

- **New color tokens**, adapted from the brief's exact hex spec but corrected
  for real contrast: the brief's Primary Blue `#245BFF` and Success Green
  `#22C55E` are calibrated for *light* backgrounds and fail WCAG AA as text
  against a dark background (3.62:1) or as small text against white
  (2.28:1) respectively — computed contrast for every pairing before
  choosing final values, same discipline as the earlier full theme redesign
  this session. Landed on: dark theme uses Royal Blue `#3A7BFF` as the
  primary text/icon accent (4.92:1 on the dark background) with Primary Blue
  `#245BFF` as the darker gradient partner; light theme deepens to `#1B4FE0`
  (6.48:1 on white). Accent Cyan `#36D7FF` (brief-exact) is the secondary/
  decorative accent in dark theme (11.11:1) but is cyan-only-as-decoration
  in light theme (pure cyan is 1.70:1 on white, unusable as text) — found
  and fixed three existing small-text spots that were using it as light-mode
  text color (`.publish-review-summary b`, a version-history button hover,
  a template-download link hover), moved to the properly-tuned `--accent`.
  Status colors (green/amber/red) also needed light-theme-only deepening
  for the same reason. Deliberately left the P&L green/red polarity's
  *meaning* and the 5-step asset-severity ramp untouched — same reasoning as
  the last redesign.
- **New hero KPI row**: four floating glass cards above the existing charts
  — Total Outstanding, Total Accounts, High-Risk Exposure (DA3+Loss share),
  Average Ticket Size — each with a tinted icon, a large 38px tabular-number
  count-up animation on render (reusing the existing `animateNumber` helper,
  which already respects `prefers-reduced-motion`), and hover elevation.
  Answers "what happened" at a glance before any chart needs reading.
- **New "Recovery focus" insight strip**: a single computed callout
  answering "what should happen next" — always the real largest concentration
  of *actionable* aged exposure (excludes the "not yet eligible" bucket),
  computed fresh from the actual loaded data on every render, never a
  fabricated or hardcoded insight. Clicking it opens the same account-list
  drill-down the ageing bars already use.
- **Donut center labels**: both existing donut charts (KCC/Non-KCC split,
  Amount Slab) now show the total outstanding in the center of the ring — a
  standard premium-dashboard pattern (Stripe/Mercury) that was missing
  before (ring + side legend only).
- **New `--radius-xl` (24px)** token for the hero cards, matching the
  brief's explicit corner-radius spec, layered on top of the existing
  `--radius-lg`/`--radius-md`/`--radius-sm` scale rather than replacing it.
- Hand-drawn Lucide-style icons (rounded caps, 2px stroke — matching the
  icon convention already used everywhere else in this app) for the hero
  cards and insight strip; no icon library dependency added.
- Left the rest of the Dashboard (Asset Classification Mix, NPA Ageing,
  Top Branches, Customer-Wise KPIs, the full sortable All Accounts table)
  functionally and structurally as-is — only inheriting the refreshed
  color/spacing tokens — since those are dense functional data views where
  Bloomberg/TradingView-style density is the right call, not a place to
  bolt on decoration for its own sake.

**Verified** with Playwright: full-page screenshots in both themes at
desktop (1440px) and mobile (390px) widths, confirmed the hero KPI count-up
values compute correctly from real data, and caught + fixed a mobile layout
bug where the insight strip's "View list" link wrapped into an awkward gap
instead of sitting cleanly under the description text.

### Full color theme redesign: "Sapphire & Emerald" (2026-07-22, same day)

Replaced the app's single violet/indigo accent (used since M1) with a new
two-hue identity, in both dark and light theme:
- **Sapphire blue** (`--accent`/`--gold` family) as the primary accent —
  dark theme `#4C8DFF`, light theme `#2F5FE0` (deeper, since the same
  brightness reads pastel on a pale background rather than a near-black one).
- **Emerald** (`--accent-2`) as the secondary accent (gauge ring, active nav
  indicator, sortable-column highlight) — dark `#17B897`, light `#0C9F70`.
- **Ceremonial gold** (`--seal` family, used for the OTS freeze/lock icon and
  the splash screen's "AM" monogram — a different, unrelated color role) was
  refreshed to a richer antique gold (`#D4A544`/`#EDCF8C`/`#B3812A`) that
  pairs better with the new blue/emerald pair than it did with the old violet.
- Retinted the near-black dark-theme surfaces (page background, cards, header
  gradient) from a violet-black undertone to a blue-slate one, and gave the
  light theme's page background the same subtle cool retint, so the accent
  change reads as a coherent new identity rather than a color swapped onto an
  unchanged backdrop.
- **Deliberately left untouched**: the P&L green/red polarity colors and the
  5-step asset-severity ramp (Substandard → Loss, driving the colored badges
  and Asset Classification Mix bars) — these are functional data
  classification colors tied to real RBI IRAC categories, not decorative
  theme choices, and restyling them risks confusing a user who's learned to
  read those colors at a glance.
- Found and fixed two small pre-existing bugs while auditing every accent
  color reference for this change: a stale hardcoded `.view-title` gradient
  color in the light theme (`#5343C4`, left over from an earlier revision
  that had already moved `--gold-d` on without updating this one hardcoded
  spot) and a similarly-stale comment referencing colors from two redesigns
  ago.

**Verified**: computed WCAG contrast ratios for every new accent-on-background
pairing before shipping (all ≥ 4.4:1 except the pre-existing, unchanged
tradeoff of white button-label text sitting across a light-to-dark gradient,
which was already below AA before this change and isn't meaningfully worse
now); Playwright screenshots across Dashboard, Search, and the account Detail
view, in both themes, confirmed the new palette reads as cohesive and legible
throughout, not just in isolated variable definitions.

### Locked OTS amounts now persist for every viewer, across data updates (2026-07-22, same day)

Previously, freezing (locking) a settlement amount on an account was purely a
per-browser-session scratch value — `otsAmounts`/`frozen` lived only in memory,
were never part of the published `data/latest.json`, and were wiped completely
every time `applyNewDataNow()` ran (i.e. every daily data update). So a
negotiated OTS figure you locked in while working an account would vanish the
next time you uploaded the daily file, and nobody else viewing the dashboard
would ever have seen it in the first place.

Added a persisted `DATA.lockedOts` (acctNo → amount), separate from the
existing per-session `otsAmounts`/`frozen` (which still exist, for amounts
still being worked out and not yet locked):
- **Freezing** an amount now also writes it into `DATA.lockedOts`;
  **unfreezing** removes it from there.
- **`applyNewDataNow()`** no longer wipes locked amounts — it carries them
  forward, matched by account number, and drops only the ones whose account
  no longer exists in the new file (same rule already used for the NPA rows
  themselves when an account is regularized/closed).
- **Publishing** now includes `lockedOts` in the data sent to
  `js/publish.js` (part of `data/latest.json`), so once you hit Publish, every
  viewer who loads the dashboard sees that account's OTS input pre-filled and
  disabled automatically — no action needed on their end. Rollback carries
  whatever `lockedOts` existed in that historical version, since rollback
  just re-publishes the old file's full content as-is.
- Only the Admin can actually make a lock visible to others (Publish is
  Admin-only); a regular viewer can still freeze an amount for their own
  session's calculation, same as before, it just doesn't propagate anywhere
  without a Publish.

**Verified** with Playwright: (1) crafted a `data/latest.json` response with
a `lockedOts` entry and confirmed a completely fresh page load shows that
account's OTS input pre-filled and disabled, with zero action taken by that
viewer; (2) confirmed clicking the freeze icon on that pre-locked input
unlocks it (re-enables editing); (3) confirmed freezing a fresh amount and
navigating away and back within the same session keeps it locked.

### Manual refresh button on the Dashboard (2026-07-22, same day)

Added a small circular refresh icon next to the Dashboard title (`#refreshDataBtn`,
reuses the same icon already used for "Data" in the mobile bottom nav, for visual
consistency). Every viewer — not just the Admin — sees it. Clicking it does a full
page reload rather than just re-fetching `data/latest.json`, so it also picks up
any newly published app-shell code, not only new data. This is safe and always
gets whatever is actually live: `sw.js`'s service worker is network-first (tries
the network before ever falling back to its cache), so a reload is never served a
stale cached copy while there's a real connection. This closes a real gap for
anyone who keeps the PWA open for a while (installed to a phone's home screen, no
visible browser reload button) and has no other way to know new data has been
published without fully closing and reopening the app.

### Bug fix: "Crafted by Alok Mittal" signature overlapping the OTS totals bar on mobile (2026-07-22, same day)

You reported the account detail view's bottom "Total OTS/Net O/S/P&L/Sacrifice/Impact"
summary bar had the mobile signature text rendered on top of the "Total Net
O/S" figure, making it unreadable — happened on a real device, in both
themes. Root cause, confirmed by reproducing it locally and inspecting the
actual DOM ancestry (not just the CSS on paper): `#app` (the top-level app
wrapper) has its own `z-index:1` (needed so it paints above the decorative
`#bgFx` background layer, `z-index:0`) — this makes `#app` a stacking
context, which traps every z-index *inside* it (including `#detailPane`'s
`z-index:95`) so those values only ever compete against each other, never
against elements *outside* `#app`. The `.mobile-sig` div happened to live
as a sibling of `#app` (outside it) rather than inside it, so its much
lower `z-index:89` was still being compared directly against `#app`'s own
`z-index:1` in the root stacking context — and 89 beats 1, so the signature
painted over the *entire* `#app` subtree, detail pane included, regardless
of the detail pane's own (internally much higher) z-index. `#bottomTabs`
happens to already live inside `#app`, which is why it correctly stayed
hidden behind the detail pane and only `.mobile-sig` showed the bug.

Fixed by moving the `.mobile-sig` div to be a child of `#app` (right after
`#bottomTabs`, still outside `#shell`) instead of a body-level sibling —
now it's trapped in the same stacking context as `#bottomTabs` and
`#detailPane`, so the detail pane's higher z-index correctly wins and
covers it when open, while it still renders above ordinary page content on
every other view exactly as before. No CSS change was needed, only the
DOM position of that one div. **Verified** by reproducing the exact bug
first (real Cust ID 700180058, both themes, matching your screenshot
precisely — signature overlapping the totals bar) via Playwright at a
mobile viewport, then confirming it was gone after the fix, and re-checked
the Dashboard/Search views in both themes to confirm the signature still
renders correctly there.

### UI cleanup + mobile legibility + premium palette + data-load resilience (2026-07-22, same day)

Three smaller fixes shipped together once the backend crisis above was resolved:

- **Removed redundant Update Data/Settings icons from the Search view's own
  header.** They called the exact same `openUpdateModalAsAdmin()` handler as
  the sidebar's `settingsBtnNav` (already visible on every view, dedicated
  entry point) — duplicating it in the Search header's `.head-icons` block
  served no purpose. Hidden via `display:none` rather than deleted, in case a
  future view-specific action needs that slot back.
- **Mobile legibility bug**: reported as "dark mode looks great on mobile,
  but light mode shows almost nothing." Root cause, confirmed by comparing
  real-device screenshots against `getComputedStyle()` output (ruling out a
  simple color-variable bug — computed text color was identical in both
  themes): `header.app-head`/`.detail-head`, `#bottomTabs` (mobile bottom
  nav), and `.mobile-sig` all relied on a translucent `rgba(...)` background
  plus `backdrop-filter: blur()+saturate()` to *look* dark, by blurring
  whatever page content scrolled underneath. That's fragile in light theme
  (the content behind is pale, so the blurred chrome reads pale too) and
  across devices with inconsistent `backdrop-filter` support. Fixed by
  making all three chrome surfaces a near-opaque `rgba(9,9,15,.9-.97)` in
  both themes — legibility no longer depends on blur working or on the
  content behind being dark.
- **Light theme redesigned for a richer, less "feeka" (washed-out) feel**
  (also requested this same round): pastel-strength accent/status colors
  that read fine against the near-black dark theme looked weak against a
  pale background. Deepened `--bg` (`#F4F3F8`→`#EEF0F6`, more presence for
  card-elevation contrast), `--accent`/`--gold` (`#6A57E8`→`#5B3DF0`, richer
  indigo), `--accent-2` (`#0FA895`→`#0C9488`, deeper jewel-tone teal), and
  the status colors `--green`/`--amber`/`--red` (and matching `--pos`/`--neg`
  and all `-soft` variants, recalculated to match) to more saturated
  jewel-tones; slightly increased card shadow opacities for more visible
  elevation. Verified via Playwright screenshots at a real mobile viewport
  (390×844) in both themes, before/after.
- **Data-load resilience**: unrelated to the above, you separately hit
  "Could not load NPA data. Check your internet connection and reload the
  page." on a real device. Checked the live backend directly at that
  moment — `/api/data-latest` was serving correctly (200, real 3,61,870-row
  data, CORS preflight correct) — so this was a transient blip (e.g. phone
  switching networks), not a real outage, but the app had no resilience for
  that at all: one failed request on both the backend and the static
  fallback and it gave up immediately. Added: (1) one automatic silent
  retry 2 seconds after the first failure, so a brief connectivity blip
  never surfaces an error at all; (2) if that also fails, a **Retry**
  button on the error screen instead of forcing a full page reload.
  Verified with Playwright by deliberately blocking both the backend and
  the static fallback routes — confirms the retry button appears, and that
  clicking it (after unblocking) successfully recovers and loads the
  dashboard.

### Architecture reversal: dropped the Postgres backend, back to direct GitHub-commit publishing; removed multi-region support (2026-07-22)

After the Postgres backend (M5+M6, further down this doc) was fully working
end-to-end — chunked upload, CORS fixed, Neon's 64MB limit fixed, a real
361,870-row publish confirmed live — you decided to reverse course: drop the
Postgres/Neon backend entirely and go back to committing `data/latest.json`
straight into this repo via GitHub's Git Data API (the original M5+M6
design, before the pivot). Multi-region support (Region filter, Region
Comparison view, per-region-sheet upload merging, region-scoped data wipe on
apply) was removed at the same time, since the real day-to-day use is a
single admin (Hathras) publishing a single-region file.

- **Removed**: `relay/lib/db.js`, `relay/lib/cors.js`, `relay/lib/verify-admin.js`,
  and the API routes `relay/api/data-latest.js`, `data-history.js`,
  `data-rollback.js`, `publish-chunk.js`, `publish-finalize.js`. The
  `@neondatabase/serverless` dependency was dropped from `relay/package.json`
  (now dependency-free). The GitHub OAuth Device Flow relay (`device-start.js`,
  `device-poll.js`) is **untouched** — that's a separate concern (GitHub's
  device-code endpoints don't support CORS from a static site) and has
  nothing to do with Postgres.
- **`js/publish.js` rewritten** back to the pre-pivot design: commits
  `data/latest.json` directly via the Git Data API (get ref → get base tree
  → create data blob → create/update `data/history/index.json` blob →
  create tree → create commit → update `refs/heads/main`), using the
  Admin's own already-`repo`-scoped OAuth token — no server-side database,
  no admin-verification endpoint (the token itself is the authorization, same
  trust model as before the Postgres detour). Rollback fetches the old
  version's file content via the Contents API and republishes it as a new
  commit (never a destructive history rewrite), same as the original design.
  History entries are capped at 60, with evicted files actually deleted from
  the tree (`sha:null`), not just dropped from the index.
- **`js/app.js`'s boot sequence** simplified back to a single
  `fetch('data/latest.json?t='+Date.now())` — no backend URL, no fallback
  chain. The auto-retry-then-Retry-button resilience added earlier this same
  day (previous entry above) was kept, since a plain static-file fetch can
  still hit a transient mobile-network blip.
- **Multi-region UI removed**: Region filter dropdown, "Regions" nav item,
  and the Region Comparison view are gone from `index.html`/`js/app.js`
  (`populateRegionFilter`, `updateRegionsNavVisibility`, `renderRegionsView`,
  `drillRegion`, `drillRegionFromRegionsView`, and the `regionMap`/`allRegions`
  tracking inside `computeDashboardStats` all removed). Upload handling
  reverted to single-sheet-only (`wb.Sheets[wb.SheetNames[0]]`) — the
  per-sheet-per-region scanning added for the bank-wide `.xlsb` case (M5+M6
  notes further down) no longer applies now that uploads are always a single
  region's own file. `applyNewDataNow()` reverted to a plain full-replace
  (new file's rows fully replace the old ones; any account missing from the
  new file is treated as regularized/closed) instead of the region-scoped
  partial wipe.
  **Note**: the `Region` column itself (column 26 of the 27-column schema)
  was deliberately **kept** in the data model — `mapHoRowsToNpa()` still
  reads and stores it, and the CSV template still has a `Region` column,
  since the real HO daily file always carries one and stripping it would
  touch far more code (column indices, CSV template, validation) for no
  actual benefit now that nothing reads it for filtering. It's simply unused
  by the UI.
- **Verified**: full syntax check on both changed JS files; a real headless
  Chromium smoke test confirmed the dashboard renders correctly with no
  region UI present and zero console errors; a Playwright test against a
  **mocked** `api.github.com` (real device-flow login can't be automated,
  same limitation as the original M5+M6 build) exercised the complete cycle
  — upload → apply (confirmed full-replace correctly drops a removed
  account and keeps others) → publish → a second publish → Version History
  list (correctly shows both versions, newest first, no rollback button on
  the current one) → rollback to the older version → re-publish — all 8
  GitHub API calls fired in the right sequence each time, with zero errors.
- **Not yet done**: the Postgres/Neon storage provisioned on the
  `npa-dashboard` Vercel project (via the Storage tab) is now unused. It
  costs nothing extra on the free tier and does no harm left as-is, but if
  you want to remove it: Vercel dashboard → `npa-dashboard` project →
  Storage tab → the Neon database → Settings → Disconnect/Delete. Not done
  automatically since deleting a provisioned resource is exactly the kind of
  action that should be your call, not an automatic side effect of a code
  change.

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

- 2026-07-23: **PENDING — needs Alok to do this before OTS lock sync works
  live.** The new `relay/api/lock-ots.js` endpoint needs a GitHub token with
  write access to this repo, set as a Vercel environment variable (never
  exposed to the browser). Steps:
  1. Go to `https://github.com/settings/personal-access-tokens/new`
     (fine-grained token).
  2. Name it something like "NPA Dashboard - Lock OTS relay". Pick an
     expiration (1 year is fine — this roadmap will need a note to renew
     it before it expires, whatever you choose).
  3. Under "Repository access", choose "Only select repositories" →
     `mittalok-creator/NPA-DASHBOARD`.
  4. Under "Permissions" → "Repository permissions" → set **Contents** to
     **Read and write**. Leave everything else as No access.
  5. Click "Generate token" and copy it (starts with `github_pat_`) —
     GitHub only shows it once.
  6. Go to `https://vercel.com/` → the `npa-dashboard` project → Settings →
     Environment Variables.
  7. Add a new variable: Name = `LOCK_OTS_GITHUB_TOKEN`, Value = the token
     you copied, Environment = Production (tick Preview too if you want it
     to work on preview deployments as well).
  8. Save, then trigger a redeploy of the `npa-dashboard` project (Vercel
     → Deployments → the latest one → "..." menu → Redeploy) — environment
     variable changes only take effect on a fresh deployment, not
     retroactively on one already running.
  9. Verify: lock an OTS amount on any account, wait a few seconds, then
     open the same account in a different browser/incognito window (or
     ask someone else to check) — it should show "Already Told" there too
     without anyone signing in.
  Until this is done, locking still works exactly as before on that one
  device — it just won't sync anywhere else yet, same as before this
  feature existed. No other part of the app is affected either way.
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
