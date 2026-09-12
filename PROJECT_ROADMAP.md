# UPGB OTS Intelligence Platform — Project Roadmap

This file is the single source of truth for project status. It is updated at
the end of every milestone. Read this first in any new session.

Last updated: 2026-09-01

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

### Follow-up: loan table's sticky "Particulars" column was still forcing itself wide on mobile (2026-09-12, same day)

Alok's own screenshot after the header/waterfall fix above showed the real problem was mostly this, not the header: the sticky first column of the loan comparison table (`.lt-label`) had no width cap anywhere, so it auto-sized to fit its single widest cell -- specifically the UCI row's label, which embeds two live dates ("UCI @ 8.5% (24-09-2023 to 12-09-2026)", ~38 characters) -- and that dragged the *entire* column that wide on every row, pushing the actual per-account figures mostly off-screen and needing horizontal scroll just to see them.

Fixed mobile-only: each label cell's raw text is now wrapped in its own `<span class="lt-label-text">` (it was a bare text node next to the row icon before, which CSS can't target for truncation), and `.loan-table .lt-label` gets a `max-width:112px` cap under `max-width:859px` -- the icon badge stays fixed-size (`flex-shrink:0`, unchanged), only the label text truncates with an ellipsis when it doesn't fit. Desktop/tablet is untouched, where the extra column width was never actually a problem.

### Mobile Loan Detail: shorter header, "Where The Dues Go" dropped from the phone dock (2026-09-12, same day)

Two follow-up complaints on the Loan Detail screen, from screenshots of a real account (VIJAY KUMAR S/O SARNAM..., WAZIDPUR, Cust ID 710243262) on a phone: the sticky top header (back button, borrower name/branch/Cust ID, 3 share icons) was eating too much vertical space, leaving too little room for the actual loan table below it; separately, on the fixed bottom aggregate dock, "Where The Dues Go" (already collapsed-by-default on mobile since 2026-08-14) was asked to be dropped from mobile entirely rather than just collapsed.

Fixed both with mobile-only (`max-width:859px`) CSS, leaving desktop/tablet untouched: `.detail-head` padding trimmed (`18px 18px 22px` → `10px 14px 12px`), the back/share icon buttons shrunk (36px → 30px), and the name/branch text sized down slightly -- the header row is visibly shorter, so the loan table starts higher on screen. `#aggBar .agg-wf` (the "Where The Dues Go" waterfall block, header included) is now `display:none` on mobile instead of merely collapsed.

### New: real offline support -- "Download for Offline", works with no signal (2026-09-12)

Alok asked for a way to save the whole database locally so the app keeps working with no internet, and goes back to normal online behaviour whenever a connection is back. The app already had a service worker (`sw.js`) doing network-first-with-cache-fallback for every request, but that mechanism was silently broken for the one request that actually matters: `data/latest.json` is always fetched with a `?t=<timestamp>` cache-buster that's a different URL on every single load (see `loadNpaData()`), so the existing `caches.match(event.request)` fallback could never find a match offline -- the very first fetch attempt of a brand new session always has a `?t=` value that was never cached before, cache miss guaranteed, every time.

Fixed with a dedicated branch in the fetch handler for `data/latest.json`: cache reads/writes now key on the URL's *path alone* (`url.pathname`), ignoring the ever-changing query string, so every load overwrites the same single entry instead of missing on read or piling up a new dead entry on every write (the exact bug `POLLED_ENDPOINTS` already exists to avoid for other endpoints -- this one just needs the opposite treatment, a fallback that actually works, instead of no caching at all). That single cached copy lives in its own never-versioned `DATA_CACHE_NAME` cache, separate from the shell's own `CACHE_NAME` -- `CACHE_NAME` changes (and everything under the old name gets deleted) on every deploy in this project, and a user who happened to update the app while offline would otherwise lose their only offline copy at the exact moment the new service worker took over.

On the page side: a new "Download for Offline" button (Settings menu, and the mobile utility bar) re-fetches `data/latest.json` right now and confirms what got saved ("✔ Saved for offline use — data as on 09-09-2026, 13,700 accounts"), for anyone who wants to be sure they're covered right before heading somewhere with no signal -- though in practice every normal page load already refreshes this cache silently, since it goes through the exact same fetch. `online`/`offline` browser events now show a toast ("You are offline — showing your last saved data." / "Back online.") since the service worker's cache fallback is otherwise invisible to the page -- a fetch served from cache resolves exactly like a real network one, so without this a viewer would have no way to tell they're looking at saved data rather than live.

One bug caught in testing: clicking "Download for Offline" *while already offline* reported success, because the service worker's own cache-fallback made the fetch resolve normally even though nothing new was actually saved -- `fetchJson()` alone can't distinguish "fresh from network" from "served from the existing cache." Fixed by checking `navigator.onLine` before attempting the fetch at all, rather than trusting its result. Verified end-to-end with Playwright's network simulation: a page loaded once online, then reloaded fully offline, still shows the complete real dashboard (branch list, live figures, everything) sourced from the cached data; the offline/back-online toasts fire correctly; and Download for Offline gives an honest answer in both states.

### Follow-up: Lok Adalat becomes a proper admin-uploadable dataset (2026-09-11, same day)

The throwaway version below was hardcoded straight into `js/app.js`. Alok asked for it to become a real Settings feature instead -- "database update karne k liye", i.e. so he can re-upload a fresh file himself whenever the list changes, rather than asking for a code change each time.

New "Lok Adalat — Token Already Received" section in Settings -> Update Data, right after Special Note, matching the same upload pattern as Branch Advance/Branch Contacts: a file drop (`#lokAdalatUploadDrop`/`#lokAdalatFileInput`, .xlsx/.csv), a blank-template download (Date, Account No., OTS Amount, Token Amount, Remark), and a status line. `buildLokAdalatMap()` matches accounts by Account No. (not Sol ID, since this tracks specific borrowers already in the NPA book) and combines multiple rows for the same account -- Token Amount sums across them (part-payments on different dates), while OTS Amount/Remark/Date each take whichever row comes last in the file. Every upload fully replaces `DATA.lokAdalat` outright ("jo last database upload hoga wahi accounts show hon" -- Alok's own framing), same as Branch Advance/Branch Contacts already do, and now genuinely lives in `DATA` and the publish payload like `specialNotes` does, instead of being baked into the JS bundle -- gone the moment Alok stops re-uploading it, no code change needed either way.

The banner message itself also changed: Account No. is dropped from the text ("account no hata dena chaho to because wahi ac to open hai" -- the account is already the one on screen), and Date + Remark are now included alongside OTS/Token Amount, e.g. "Token ₹35,000 already received on 10-09-2026 — Second tranche". Verified end-to-end: uploading a test file with two rows for the same account (different dates, different remarks) correctly summed the Token Amount and kept the later row's date/remark, and the banner rendered exactly that combined line with no account number, through the real search -> open-detail flow against this environment's live dataset.

### TEMPORARY: Lok Adalat (12-09-2026) token-already-received banner (2026-09-11)

Alok uploaded `Lok_Adalat_12092026.xlsx` -- a day-by-day log of proposed-OTS accounts where token money has already been collected ahead of the 12-09-2026 Lok Adalat -- and asked for a banner on Loan Detail: whenever one of these Account Nos. is opened, show that token (and OTS Amount, if fixed) has already been received, so counter staff don't collect it twice. Framed explicitly as throwaway ("baad main main ye sab hata dunga").

Data came from the file's "Data" sheet (166 dated rows; the "Summary" sheet's own rollup was cross-checked and found stale/broken -- its OTS/Token columns show `#REF!` for every row and its "Lakhs" totals don't reconcile with a fresh sum of "Data", so "Data" is the trustworthy source). Aggregated to 160 accounts -- 5 had two rows for part-payments on different dates and were summed into one Token total (OTS Amount taken from whichever row had it, since it only gets fixed once); one row with neither amount was dropped. Baked directly into `js/app.js` as a flat `LOK_ADALAT_TOKEN_RECEIVED` array + `LOK_ADALAT_MAP` lookup -- unlike `DATA.specialNotes`, this is NOT admin-editable UI and NOT part of the publish pipeline, so it's live for every viewer the moment this ships, no Publish step needed, and just as easy for Alok to delete outright later (the constant, the new banner block in `drawDetailBody()`, `#lokAdalatBanner` in index.html, and its CSS).

Reused the exact "collect across every linked account on this borrower" pattern already built for the Special Note banner, but blue (`var(--accent)`) rather than red/brass -- this is good news (money already in), not a warning or a hold. Since a borrower can now show up to three stacked banners (Not Eligible, Special Note, Lok Adalat), `positionSpecialNoteBanner()` became a general `positionBanners()` that walks all three in order. First version measured a banner's `getBoundingClientRect().bottom` immediately after moving it, which is safe for two banners but wrong for three: `.special-note-banner`/`.lok-adalat-banner` animate `top` (`transition: top .2s`), so reading the rect right after the move caught the *pre-transition* position, throwing off whichever banner stacked below it. Fixed by accumulating a running offset from each shown banner's own `offsetHeight` instead (size isn't animated, so it's accurate regardless of an in-flight `top` transition) -- caught by an explicit 3-banner Playwright test before it ever shipped. Verified end-to-end against the real dataset in this environment: searching Account No. 150281010000028 (linked to a second account under the same borrower) correctly shows "A/c 150281010000028: Token ₹20,000 already received", attributed to the right account of the two, and an account with no Lok Adalat match shows no banner.

### New: self-expiring temporary PIN for short-term guest access (2026-09-10, same day)

Alok wants to give 4-5 people access for about 3 days without handing out his own permanent PIN, and asked what that would take. The app's login (`js/splash.js`) checks a single hardcoded 4-digit `CORRECT_PIN` client-side (no per-user accounts) -- so the plan that needed no ongoing effort from him was a second PIN that stops validating on its own past a fixed date, rather than one he'd have to remember to go disable.

`isValidPin()` now accepts either the permanent PIN or `TEMP_PIN = '0000'`, the latter only while `new Date() < TEMP_PIN_EXPIRES` (`2026-09-14T00:00:00`, i.e. valid through end of day 13-09-2026 local time) -- past that instant `'0000'` just falls through to the normal "Incorrect PIN" rejection, no code change or redeploy needed to revoke it. Worth keeping in mind for next time: this only gates *new* unlock attempts -- `unlock()` still writes `sessionStorage.setItem('upgb-splash-unlocked', '1')`, so anyone who unlocked with '0000' and simply leaves that browser tab open past the expiry stays in for that session; it's a soft guest-window, not a hard per-second cutoff. Verified via Playwright with the browser's own `Date` overridden: '0000' unlocks on 10-09-2026, is correctly rejected once simulated past 13-09-2026, and the permanent PIN is unaffected either way.

### Visual: Utility Hub cards get an embossed/3D treatment (2026-09-10, same day)

Alok asked how the Utility Hub could look better and, after seeing a mockup (published as an Artifact), asked for it live. The mockup itself used PassSheet's own green/Spectral palette since that's the "Utility tool" look most recently top of mind -- but the Utility Hub grid is actual main-app markup styled by `css/styles.css`, which runs a completely different design system (navy/electric-blue "fintech" theme, Manrope typeface, its own `--shadow`/`--shadow-lg` elevation tokens). Shipping the mockup's literal palette into the main dashboard shell would have clashed with every other page in the app, so the embossed *concept* (raised cards, per-tool icon colors, hover lift) was rebuilt using this app's own existing tokens instead: `.utility-card` now sits on `var(--shadow-sm)` at rest and `var(--shadow)` on hover (reusing the app's already-tuned dark/light elevation values) plus a subtle inset top rim (new `--emboss-rim` token, defined per theme) for the raised/embossed edge, and lifts on hover/back down on press.

Five icon-badge colors, one per tool, so cards are scannable at a glance instead of all sharing one identical tint: PassSheet keeps the app's own primary accent (blue), Telephone Directory the secondary accent (cyan) -- new `--accent-2-soft` added for its badge fill -- and NPA Region Summary/Daily PNPA Summary/HBR Report get three new decorative hues (`--tool-violet`, `--tool-teal`, `--tool-terracotta`) chosen to sit alongside the accent pair without overlapping the app's `--green`/`--amber`/`--red` status ramp, which already means asset-quality state elsewhere in this same app -- a violet or teal tool badge can't be misread as a status pill the way a green or amber one could. A small arrow icon fades in on hover, top-right of each card, echoing the mockup. All five tokens declared in both the dark (default `:root`) and light (`:root[data-theme="light"]`) blocks, matching this file's own established two-block theming, not the Artifact-style three-way pattern used by the tool iframes. Verified via Playwright in both themes: correct per-tool icon colors, hover-lift and arrow-reveal both fire, and card clicks still route to the right tool unaffected by the added markup.

### Rename: "Utility" is now "Utility Hub"; PassSheet gets a "(HMSTRP)" tag (2026-09-10, same day)

Two small requests. The "Utility" nav item, its section label, the Utility page's own `<h1>`, and every child tool's "Back to Utility" link are now "Utility Hub" throughout `index.html` (sidebar nav, bottom tab nav, page header, and all six back-links) -- purely a label change, `data-view="utility"` and `UTILITY_CHILD_VIEWS` are untouched so nothing else needed updating. Separately, "PassSheet" now carries a small "(HMSTRP)" tag next to its name in three places: the Utility Hub card, the PassSheet page's own `<h1>`, and the standalone tool's own topbar brand name (`tools/passsheet.html`) -- a `<small>` element (browsers render it at ~80% size already) with reduced opacity, so it reads as a subordinate tag rather than part of the name itself.

### Follow-up: HBR Report's Account filter now shows the account number too (2026-09-10, same day)

Alok pointed out he often remembers an account's number, not its name ("kabhi kabhi name yaad nahi hota account no yaad rahta hai"), so the Account-wise Detail dropdown now labels every option as `<account number> — <description>` (e.g. "15181213 — NO LIEN (OTS)") instead of the description alone, and sorts by that number instead of alphabetically by name.

The "account number" shown is the branch-neutral part of the GL code -- new-style rows are `[4-digit SOL][00 filler][5-digit GL head][3-digit scheme]`, so `canonicalAccountCode()` strips the SOL prefix and the "00" filler, leaving GL-head+scheme (`92700015181213` → `15181213`, matching the exact number Alok referenced); old-style rows are `[5-digit old SOL][scheme code]` with no GL head embedded, so only the 5-digit prefix is stripped. The dropdown's underlying `value` (used for the lookup) is unchanged -- only the visible label and sort order changed. Verified the real report's "NO LIEN (OTS)" option now reads exactly "15181213 — NO LIEN (OTS)" and still renders the correct 55-branch table when selected.

### New: HBR Report added to Utility (2026-09-10, same day)

Alok uploaded a real core-banking "BM Balancing Report" PDF (GL Sub Head 15181, whole Hathras region, 09-09-2026) and asked for a new "HBR Report" utility: branch-wise view, Excel export, and an account picker where selecting one account shows its balance at every one of the 55 operational SOL IDs in rupees.

This report's own format is a legacy fixed-width text export (not a spreadsheet), so `tools/hbr-report.html` reads the PDF entirely client-side via pdf.js -- the same text-reconstruction technique already proven in `tools/passsheet.html` (group text fragments by Y-position, sort by X, rebuild each printed line). Each detail line looks like `<account no> <description> <debit amt> <credit amt>` with no separator between the account number and the description, so rows are recognised by shape: the first token is a purely alphanumeric string of 10+ characters containing a digit (excludes scheme-subtotal lines like `15181 CRPNT 1 0 45,020.00`, the `Total:` lines, page banners, and footer URLs, all of which are either shorter or contain punctuation), and the line's last two whitespace-separated tokens must both look like amounts.

The trickiest part: this single report mixes **two different SOL ID eras** for the same 57 branches. Older GL heads (interest accrual, subsidy, cash adjustment) are prefixed with the 5-digit **old** Sol ID (15010-16160, matching `BRANCH_LIST`'s first column); newer customer-facing GL heads (DD, OTS, AEPS, GST) are prefixed with the 4-digit **new** Sol ID (9269-9325, the second column) -- both prefixes appear side by side in the same file. `resolveSol()` tries a 5-digit old-Sol-ID match when a line starts with "15"/"16", or a 4-digit new-Sol-ID match when it starts with "92"/"93", and reports everything back in the new/canonical Sol ID. A handful of "70xxx"-prefixed Head-Office-level parking/suspense accounts don't belong to any branch at all -- these, plus R O Hathras (9269) and Hathras Service Branch (9283) (excluded from the branch list for the same "not operational" reason as the Daily PNPA Summary tool), are rolled into one "Head Office / Unassigned" row so every rupee in the report still lands somewhere and the Grand Total always reconciles.

Two tabs: **Branch-wise Summary** lists every operational branch (zero-filled from the same `BRANCH_LIST` copy used elsewhere) with Debit, Credit, and Net Balance (Credit − Debit) columns, sortable/copyable like its siblings, plus Export to Excel. **Account-wise Detail** has a dropdown of every distinct account description found in the file (e.g. "NO LIEN (OTS)", "AEPS - OFFUS PAYABLE") -- selecting one shows that single account's Debit/Credit/Net at all 55 branches, zero-filled, with its own Export to Excel.

Verified against Alok's real file down to the paisa: the parser extracted exactly 708 entries, matching the report's own printed "708" account count, and the summed Debit (₹4,51,878.31) and Credit (₹3,42,64,047.47) totals matched the report's own Grand Total line exactly. New `utility-card` + `data-view="hbrreport"` section, added to `UTILITY_CHILD_VIEWS`, and `#viewHbrReport`'s own `.tool-frame-wrap` auto-height override, following the same pattern as every other Utility tool. Full Utility-hub integration (card → iframe → upload → back navigation) verified via Playwright.

### Follow-up: Telephone Directory gets SOL ID, WhatsApp link, Branch Manager filter, names in caps (2026-09-10, same day)

Four more requests on the same tool, all same day.

1. **SOL ID column**, added first. The staff sheet only carries branch *names*, not SOL IDs, so each record's SOL ID is resolved at load time against the same `[newSolId, branchName]` pairs as `js/app.js`'s own `BRANCH_LIST` (copied in as `SOL_BRANCH_LIST`, same reasoning as the PNPA Summary tool -- a standalone iframe can't reach that closure-scoped constant). The two sheets don't always spell a branch the same way (`Hathras-Agra Road` vs `Hathras Agra Road`, or a bare `Service Branch` for `Hathras Service Branch`), so branch names are matched through a normalizer (uppercase, hyphens to spaces, collapsed whitespace) with two explicit short-form aliases for the branches that drop the "Hathras" prefix entirely. Verified all 302 staff rows resolve to a real SOL ID with none left blank.
2. **WhatsApp link next to every phone number.** A small green WhatsApp icon opens `https://wa.me/91<number>` in a new tab, right beside the existing `tel:` link. A bare 10-digit number gets `91` prepended for the deep link; the couple of source rows with a stray space or a missing digit are passed through as-is rather than guessed at.
3. **Branch Managers only filter.** A toggle button above the table narrows the list to just Designation = "Branch Manager" (56 of 302), combinable with the search box at the same time (e.g. "Branch Managers only" + "vrindavan" narrows to exactly that branch's manager).
4. **Names in CAPS.** All 302 names are uppercased once when the data loads, so both the on-screen table and anything copied via the column-copy feature stay consistent -- no separate display-only formatting that could drift from what gets copied.

Search now also matches on SOL ID. Verified via Playwright: SOL ID column shows the right value for every branch (e.g. Tuksan's 5 staff all show 9304), WhatsApp link generates the correct `wa.me` URL, the Branch Manager filter correctly narrows to 56 rows (all Branch Manager) and combines correctly with search, every displayed name is fully uppercase, and copying the SOL ID column still gives exactly 302 data-only lines.

### New: Telephone Directory added to Utility (2026-09-10, same day)

Alok supplied the Hathras region staff position sheet (as on Aug 2026) and asked for it to be added to Utility as well, with search.

New `tools/telephone-directory.html`, following the same PassSheet design system as its two siblings, but with one difference in shape: the source data (EC No., Name, Designation, Cadre, Branch, Contact Number) is a staff roster snapshot that doesn't change day to day, so it's baked in directly as a static `STAFF_LIST` array (302 records, extracted from the uploaded `Telephone_Directory_as_on_Aug_26.xlsx`) rather than requiring a file upload each visit -- there's no dropzone or "Load File" step on this tool at all, just a search box and the table.

Search is a single live text box (`#searchInput`, no debounce needed at this row count) that matches across all six columns at once -- typing a branch name, a person's name, a designation, or a phone number all work the same way, with a "Clear" button and a result-count badge ("302 total" or "X of 302") reflecting the current filter. Same sortable-column-headers and data-only copy-column conventions as its siblings; the Contact column's cells are `tel:` links so a tap dials directly on a phone. Same iframe self-sizing pattern (fixed-px `.table-wrap{max-height:520px}`, no `overscroll-behavior:none` on its own html/body) applied proactively from the start, since both were bugs caught and fixed on the earlier two tools this same day.

New `utility-card` + `data-view="telephonedirectory"` section in `index.html`, added to `UTILITY_CHILD_VIEWS` in `js/app.js`, and `#viewTelephoneDirectory`'s own `.tool-frame-wrap` auto-height override in `css/styles.css` (mirroring `#viewRegionSummary`/`#viewPnpaSummary`). Verified via Playwright, both standalone and through the Utility hub's iframe: all 302 rows render with the correct hint text, search by branch/name/phone/EC No. all return the right matches, Clear resets the list, sorting by Name works, the Name column copies as 302 data-only lines, and Back returns cleanly to Utility with its nav item still highlighted.

### Follow-up: Daily PNPA Summary drops two non-operational Sol IDs (2026-09-10, same day)

Alok flagged that 9269 (R O Hathras, the Regional Office itself) and 9283 (Hathras Service Branch) aren't real lending branches and shouldn't appear at all. Both are now excluded at the row-filtering stage in `processWorkbook()` (a `NON_OPERATIONAL_SOL_IDS` list checked right alongside the Region="HATHRAS" filter, before any aggregation), not just left out of the zero-fill step, so they're dropped even if a future file happens to carry stray rows for either. Branch count is now 55 instead of 57; Grand Total is unchanged (₹320.07L / ₹100.95L) since both had zero PNPA accounts in Alok's real file anyway. Verified via Playwright against his real file.

### New: Daily PNPA Summary added to Utility (2026-09-10)

Alok supplied a real whole-bank Daily PNPA export (39,031 rows) and asked for a second Utility tool, "almost like" NPA Region Summary: read it client-side, but this one is Hathras-only and SOL ID-wise rather than region-wise, always lists every Hathras Regional Office branch (even one with a clean day, showing 0 instead of just not appearing), and counts an account as KCC when its Reasons column contains "KCC-Disbrsmnt-36" -- which can arrive alone or comma-separated with other reasons on the same account (e.g. "KCC-Disbrsmnt-36,LimReview").

New `tools/npa-daily-pnpa-summary.html`, built the same way as its sibling: PassSheet's own design system (topbar, dropzone, status-panel with big serif stat numbers, `.btn`/`.badge` components), sortable/copyable columns (data rows only, per the copy-column convention already established), Export to Excel, and the same iframe self-sizing (`window.frameElement.style.height`) without `overscroll-behavior:none` on its own html/body -- the mobile scroll-chaining bug fixed on NPA Region Summary a few minutes earlier was caught before it ever shipped on this one. Unlike its sibling, this tool has no Region-wise/Branch-wise split or region picker at all -- it only ever looks at one region (Hathras), so a single sortable table (SOL ID, Branch Name, KCC, Total) is the whole UI.

Filters the uploaded file to `Region === "HATHRAS"` (case-insensitive), aggregates Balance Amount per SOL ID into `total` (every matched row) and `kcc` (only rows whose Reasons, split on comma and trimmed, include the exact token "KCC-Disbrsmnt-36" -- the file also carries KCC-Disbrsmnt-15/24 variants, deliberately not counted here since Alok named "-36" specifically), then merges in every entry from a `BRANCH_LIST` master array copied from `js/app.js`'s own Branches-panel constant (the standalone iframe has no access to that closure-scoped variable) so a branch absent from the day's file still gets a zero row rather than silently vanishing. New `utility-card` + `data-view="pnpasummary"` section, added to `UTILITY_CHILD_VIEWS`, and `#viewPnpaSummary`'s own `.tool-frame-wrap` auto-height override (mirroring `#viewRegionSummary`'s).

Verified against Alok's real file: 762 Hathras-region rows aggregate into 57 branches (54 with data that day + 3 zero-filled from the master list -- R O Hathras, Hathras Service Branch, and Sahpau all had a clean day), Grand Total ₹320.07L / KCC ₹100.95L match an independent hand-computed check line for line, sorting and copy-column both work correctly, and the Utility hub card/back-button navigation matches the existing pattern. First pass, per Alok's own framing -- more changes expected once he's reviewed it against a live day's numbers.

### Fix: mobile couldn't scroll past the loaded-file panel at all (2026-09-10, same day)

Alok's screenshot showed the tool stuck on mobile right after loading his real file (7.4L accounts, 22 regions) -- the Summary panel's tabs were barely visible at the very bottom of the screen with no way to scroll further, and oddly, the sidebar's "Crafted by Alok Mittal" signature was bleeding through at that spot even though `#sideNav{display:none}` at mobile widths makes that genuinely impossible with the code currently live -- a strong sign his phone was still serving an older cached shell from before some of today's earlier fixes, worth a full close-and-reopen (or clearing site data) regardless of the fix below.

Separately, found and fixed a real bug in `tools/npa-region-summary.html`: its `html,body` carried `overscroll-behavior:none`, copied over from the main app's own defensive fix for the pull-to-refresh issue fixed earlier today. That property doesn't just suppress the pull-to-refresh gesture -- it also blocks *scroll chaining*, the mechanism a touch-drag needs to hand a scroll gesture up to an ancestor once the element under the finger has nothing left of its own to scroll. Since this tool's `<iframe>` is kept sized to exactly match its own content (see the "no more dead space" fix from a few minutes earlier), it has nothing internal to scroll in the first place -- normally the drag should chain straight up to the Utility hub's `#mainCol`, which is where the actual scrolling needs to happen, but `overscroll-behavior:none` was blocking that hand-off. Removed it: this tool doesn't need its own pull-to-refresh guard (it's not a standalone PWA experiencing that gesture), and the main app's own guard on `#mainCol`/`#detailPane`/`html`/`body` (from earlier today) is unaffected and still stops the gesture going any further than that.

### Fix: real whole-bank file (7.4L accounts, 22 regions) got stuck with no scrollbar (2026-09-10, same day)

The "no more dead space" fix shipped a few minutes earlier caused a real regression the moment Alok tried it against an actual whole-bank export (55 Hathras branches, not the 2-3 row test data used to verify it): the page got stuck with the branch table cut off partway down and no way to scroll further.

Root cause was a feedback loop between two heights that both looked independent but weren't. `.table-wrap{max-height:65vh}` sizes the table's own internal scrollbar relative to *the iframe's own viewport height* -- fine as long as that height is fixed, which it always had been until the dead-space fix made `tools/npa-region-summary.html` resize its own `<iframe>` tag to match its content (`window.frameElement.style.height = document.documentElement.scrollHeight`). With a short test table, this settles down after one resize. With 55+ real rows, it doesn't: growing the iframe to fit a first-pass measurement makes `65vh` resolve larger too (vh is relative to whatever the viewport is *right now*, not what it was when JS last measured it), which makes the true content height grow again, but `resizeFrame()` had already run and isn't called on every possible layout change -- so the iframe settles at a height that no longer matches its actual content, and the Utility hub's `.tool-frame-wrap{overflow:hidden}` (kept from the shared PassSheet styling) clips everything past that stale height with no way to reach it.

Fixed by breaking the loop at its source: `.table-wrap`'s `max-height` is now a fixed `480px` instead of `65vh` -- it no longer has any dependency on the iframe's own height, so `resizeFrame()`'s one-time measurement is stable and correct regardless of row count. The table itself still scrolls internally exactly as it always has (just at a fixed cap instead of a viewport-relative one); the outer page's total height now settles once and stays right. Also added a `resizeFrame()` call on the `load` event, catching any late web-font reflow the earlier trigger points might have measured just before. Verified against a synthetic 60-branch file (mirroring the real file's row count): the table-wrap scrolls internally (visible height 478px against 1978px of real content) and the last row is reachable, while the outer iframe settles at a single correct height (1205px) instead of the old near-full-viewport waste or this regression's stuck clip.

### Follow-up: sortable columns, data-only copy, Hathras-first defaults, no more dead space (2026-09-10, same day)

Four more requests on the same tool, all same day.

1. **Sortable columns.** Every column's name in both tables is now clickable -- one tap sorts by it ascending, a second flips to descending (a small ▲/▼ shows next to the active sort column), a third tap on a different column starts that one fresh at ascending. Two independent sort states (Region-wise, Branch-wise) so switching Branch-wise's selected region doesn't reset whatever sort was set there.
2. **Copy now excludes the heading and Grand Total.** Alok pastes a copied column straight into another sheet, where a heading or a total mixed into the data would need deleting by hand every time. `columnCellTexts()` now reads only the `<tbody>` rows, not the header label or the `<tfoot>` row.
3. **Hathras first, by default.** Alok's own region, buried wherever it happened to fall alphabetically among however many regions a whole-bank file has -- now pinned to the top of Region-wise Summary's table by default (an explicit sort click on any column overrides this, same as it would override any other default order), and the Branch-wise Summary's region dropdown now pre-selects Hathras instead of whatever sorted first alphabetically. Both fall back to their original behaviour for a file that has no "Hathras" region at all.
4. **No more dead space below the table.** The Utility hub embeds every tool in a shared `.tool-frame-wrap` sized to near-full viewport height, tuned for PassSheet's own always-tall transaction list -- this tool's actual content is often much shorter (a handful of regions), leaving a lot of visible blank space beneath a short table. Since the iframe is same-origin, `tools/npa-region-summary.html` now resizes its own `<iframe>` tag directly (`window.frameElement.style.height = ...`) to match its real content height on load, on Clear, on tab switch, and on region change, rather than the parent page polling or the two pages needing postMessage plumbing; `#viewRegionSummary`'s own `.tool-frame-wrap` override in `css/styles.css` just gets out of the way (`height:auto`) and lets that inline height show through. PassSheet's own wrapper is untouched.

Export to Excel now reflects whatever sort is currently on screen too (same records, same order, run through the unchanged `buildSheetFromRecords()`). None of this touched the file-reading/aggregation logic itself. Verified via Playwright: Hathras sorts first in Region-wise Summary and is pre-selected in Branch-wise Summary's dropdown on a synthetic multi-region file; clicking a column header sorts correctly in both directions with the right arrow shown; a copied column contains only its data rows; and the embedded iframe now sizes to its actual content instead of the old fixed near-full-viewport height.

### Follow-up: NPA Region Summary restyled to match PassSheet's UI (2026-09-10, same day)

Alok asked for this tool's UI -- buttons and all -- to look "almost the same" as PassSheet's, so the two Utility tools read as one family rather than two different-looking things bolted onto the same hub. Rebuilt `tools/npa-region-summary.html`'s design system as a direct copy of `tools/passsheet.html`'s own tokens/typefaces/components rather than the app's own ivory/navy shipped a few hours earlier: same `--bg/--surface/--accent/--debit/--credit`-etc. variable set and values (light + dark), same Spectral (display) + IBM Plex Sans (body) pairing, same `.btn`/`.btn-primary`/`.btn-ghost` button classes, `.pill`/`.badge`, and a `.site-foot` "Designed & developed by Alok Mittal" footer PassSheet already had and this tool didn't.

Structurally adopted PassSheet's actual layout too, not just its colors: a sticky `.topbar` with a brand mark/name/tagline (replacing the old page `<h1>` + description paragraph), and PassSheet's hero pattern -- a real drag-and-drop `.dropzone` (click-to-browse or drop a file, filename shown in place of the old native file-input chrome) alongside a `.status-panel` showing big serif `.status-num` stat figures (Total Accounts / Regions), matching PassSheet's own Accounts/Transactions stat display exactly. Kept one deliberate difference: unlike PassSheet's auto-parse-on-drop, this tool still needs an explicit "Load File" tap to start reading -- a whole-bank NPA file can take 30-90 seconds, worth a deliberate action rather than starting the moment a file lands on the dropzone. Also added a "Clear" button (PassSheet has one, this tool didn't) that resets the tool back to its empty state without a page reload.

None of this touched the file-reading, column-detection, or Region/Branch/KCC/Slippage aggregation logic, nor the copy-a-column feature shipped a few hours earlier -- only the element IDs' surrounding markup/CSS and the small bit of JS that renders the stat numbers and wires the new dropzone/Clear button. Re-verified via Playwright: region/branch aggregates and every copy-column button still produce the exact same output as before the restyle, drag-and-drop and Clear both work, and the tool renders correctly in both themes.

### New: NPA Region Summary added to Utility (2026-09-10)

Alok supplied a standalone tool he already had -- upload the whole-bank NPA export, get an instant Region-wise and Branch-wise summary (KCC/CC004, Slippage, Total Balance, all in ₹ Lakhs) -- and asked for it folded into the app, restyled to match, with a way to copy any single summary column in one tap for pasting elsewhere.

Folded into Utility the same way PassSheet is: a new `tools/npa-region-summary.html`, embedded via iframe (not merged into this page's own CSS/JS, so its class names can't collide with the app's own) from a new `utility-card` + `data-view="regionsummary"` section, added to `UTILITY_CHILD_VIEWS` so the Utility nav item stays highlighted while looking at it. Unlike PassSheet (kept exactly as supplied, per Alok's original instruction for that tool), this one's head/style/markup were rebuilt from scratch on the app's real light/dark tokens and Manrope/Inter typefaces (loaded from Google Fonts inside the iframe, since it can't inherit the main stylesheet's self-hosted `@font-face`), plus the same `upgb-theme` localStorage-sync script `tools/passsheet.html` already uses, so it tracks the app's theme toggle live. The file's actual logic -- reading the .xlsb/.xlsx/.xls file client-side, finding the SOL/Region/Branch/Scheme/Balance/Reasons columns, aggregating KCC and Slippage per SOL ID and per region -- is untouched.

**Copy-a-column**, the other half of the ask: every column header in both the Region-wise and Branch-wise tables now carries a small copy icon. Tapping it copies that entire column -- its header label, every row's value, and the Grand Total row -- as newline-separated plain text via `navigator.clipboard.writeText()` (falling back to a hidden-textarea `execCommand('copy')` where the Clipboard API isn't available), ready to paste into WhatsApp, Excel, or anywhere else, without hand-selecting a column of table cells. Reads straight from the rendered DOM rather than recomputing from the parsed data, so what gets copied always exactly matches what's on screen and the feature never has to duplicate (or risk drifting from) the existing render/export logic. One shared click-delegated handler covers both tables' columns, keyed off the clicked button's position in its own `<tr>` rather than a hardcoded column list, so it needed no per-column wiring.

Verified via Playwright with a synthetic test workbook: region and branch aggregates match hand-computed totals, every copy button places the exact expected text (header + rows + grand total) on the clipboard, the tool renders correctly in both themes, and the Utility hub / back-button navigation works the same as the existing OneDrive/PassSheet cards.

### Follow-up: Special Note banner no longer dismisses on a stray tap; extra pull-to-refresh guard (2026-09-09, same day)

Alok reported the mobile reload was still happening, and separately asked for the Special Note banner to stop disappearing the moment it's tapped anywhere — a note is important enough that an accidental touch shouldn't hide it for the rest of the visit.

1. **Special Note banner: close button only.** Unlike `#eligibleBanner` (click anywhere to dismiss, unchanged), `#specialNoteBanner`'s close "✕" is now a real `<button>` (`#specialNoteBannerCloseBtn`) and the ONLY thing that dismisses it — clicking the banner's text or icon no longer does anything. The outer `tabindex="0"`/"click to dismiss" wiring was removed from the banner div itself; the button carries its own `aria-label` and focus-visible outline so keyboard/screen-reader users can still close it.
2. **Extra pull-to-refresh guard.** Added `overscroll-behavior:none` to `html` as well as `body` (previously only `body`) — some mobile browser versions key the native pull-to-refresh check off the document's own overscroll chain rather than only the specific dragged element, so this is belt-and-suspenders alongside the `#mainCol`/`#detailPane.open` fix shipped earlier today. Also worth noting for next time this comes up: `sw.js` already calls `skipWaiting()`/`clients.claim()`, so a new version should take over immediately — but the very first reload right after a deploy can still show the previous version on some devices (a well-known one-cycle lag in how browsers check for a new service worker file), so "still seeing the old bug" immediately after a fix ships is worth a second reload before assuming the fix didn't work.

### Fix: dismissing a top banner could trigger a real page reload on mobile (2026-09-09, same day)

Alok noticed dismissing the Special Note/eligibility banner with a single tap sometimes also refreshed the whole page. Root cause: `html,body{overflow:hidden}` already means neither ever scrolls, so the pre-existing `body{overscroll-behavior:none}` was a no-op — a browser only suppresses the native rubber-band/pull-to-refresh gesture on the element actually being dragged, not on an ancestor that was never scrollable. The app's real scrolling happens inside `#mainCol` and `#detailPane.open` (its own separate scroll container), neither of which had `overscroll-behavior` set. Both banners sit at the very top of `#detailPane`, freshly opened at `scrollTop:0` — a tap with even the slight vertical drag a touchscreen tap normally has rubber-banded that container and triggered a real pull-to-refresh reload on top of the banner's own (working) dismiss, on any mobile Chrome/PWA with that gesture enabled. Fixed by adding `overscroll-behavior:none` to `#mainCol` and `#detailPane.open` as well, so the drag is contained where it actually happens. Verified via `getComputedStyle` that both now resolve to `overscroll-behavior-y: none`.

### Special Note banner recoloured to red (2026-09-09, same day, follow-up)

Shipped in brass initially, matching the OTS Calculator's own accent since a Special Note is informational rather than a warning — Alok asked for it in red instead, same reasoning as the existing "Not eligible" banner: it needs to stand out enough that it's never skipped by accident. `.special-note-banner` now uses the same `var(--red)`/`#a13d35` gradient and white text as `.eligible-banner`; everything else (shape, click-to-dismiss, the stacking logic that drops it below the eligibility banner when both apply to the same borrower) is unchanged.

### New: Special Note — Admin can tag any Account No. with a note every viewer sees (2026-09-09, same day)

Alok asked for a way to manually leave a note on a specific account (e.g. a hold, an instruction, a reminder) that shows up for every user, not just Admin, when that account is opened in the OTS Calculator — "jaise not eligible ka prompt show hota hai vaise hi" (the same way the existing "Not eligible" prompt shows), and entered one account at a time rather than via any file upload.

**Admin side (Settings → Update Data → Special Note, new collapsible section, same `<details>` pattern as the other upload sections):** type an Account No. and the borrower's name/branch appear immediately (reusing the same `npaByAcct` index Search already relies on) or a clear "Account not found" warning if it doesn't match current NPA data. Type a note and Save — no file, no separate "Apply" step; it writes straight into a new `DATA.specialNotes` map (keyed by Account No., alongside the existing `DATA.branchAdvances`/`DATA.branchContacts` slow-moving side-datasets) and unlocks Publish immediately, exactly like `handleBranchContactsUpload` already does. A running list below shows every account with a note on file, each with Edit and Remove. Notes stay on an account across daily NPA updates until explicitly removed, and — like every other admin-entered dataset in this app — only go live for everyone else once Publish to Live Site is pressed (added `specialNotes` to `openPublishReview()`'s `dataObj` and to its review-summary item list, so Alok can see how many notes are staged before publishing).

**Viewer side:** `drawDetailBody()` now checks every account linked to the borrower being viewed against `DATA.specialNotes` and shows a fixed banner at the top of the Loan Detail screen if any has one — same shape and click-to-dismiss behaviour as the existing red "Not eligible" banner, but in brass (`--seal`/`--seal-l`/`--seal-d`, the same tokens the OTS Calculator itself runs on) since a note is informational, not a warning. The two banners share the same fixed top-center spot; since they're independent conditions that can both be true for the same borrower, added `positionSpecialNoteBanner()` to measure the "Not eligible" banner's actual rendered height (it varies with how many accounts are listed) and drop the Special Note banner below it rather than hard-coding a second fixed offset that would either overlap or leave a gap. Verified via Playwright: lookup found/not-found states, Save/Remove staging and unstaging Publish, the banner appearing on a real account's Loan Detail screen and disappearing after Remove, both banners stacking with a clean 10px gap and no overlap when synthetically forced on together, and correct rendering in both themes.

### Login screen refined ("Refined Ivory") after showing three mockups first (2026-09-09, same day)

Alok asked to see a few login-screen mockups before committing to anything ("mockups dikhao agar achhe hue to existing ko replace karenge"). Built and published three distinct directions as an Artifact, grounded in the real splash-screen copy/logo/tokens rather than placeholder content: **A. Refined Ivory** (evolves the shipped split-panel layout with tighter type and a brass tie-in to the OTS Calculator's identity), **B. Brass Seal** (bolder, single centered card with the logo set inside a brass circular seal), **C. Minimal Access** (ultra-minimal, phone-unlock-style). Alok picked A.

Shipped into `index.html`/`css/styles.css`'s existing `.splash-*` rules (same markup, no structural change) three refinements:
1. **Brass tie-in.** `.splash-subtitle` ("OTS Calculator") and `.splash-rule` now use the app's theme-independent `--seal`/`--seal-d`/`--seal-l` brass tokens (the same accent the OTS Calculator itself runs on) instead of plain red/ink, with the usual seal-d-on-light / seal-l-on-dark split (`:root:not([data-theme="light"])` override) so it reads correctly in both themes. `.splash-trust-ic` (the "Secure Access" chip icon) picked up the same brass tint.
2. **Header's own texture, reused.** `.splash-hero`'s background now layers in `repeating-linear-gradient(118deg, var(--head-weave) 0 1px, transparent 1px 26px)` — the exact weave texture the app header and `#aggBar` already use — instead of a flat gradient, so the login screen already looks like part of the same app rather than a separate skin.
3. **Circular keypad.** `.splash-key` changed from a rounded-square (fixed padding) to a true circle (`aspect-ratio:1;border-radius:50%`), calmer next to the round PIN cells and round trust-icon above it.

Caught one regression from change 3 before shipping: aspect-ratio ties a key's height to its width, so at the keypad's normal 280px cap each key grew from ~46px tall to ~87px — nearly 100px taller across four rows — which silently broke the phone/short-viewport "fits with no scroll" tuning from an earlier session (verified via Playwright: `.splash-frame` needed scrolling at 360x740, 412x915, and short desktop windows down to 1000x650 that hadn't needed it before). Fixed by capping `.splash-pad{max-width}` tighter inside the existing `@media (max-width:480px)` (190px) and `@media (max-height:760px)` (165px, tighter still since that breakpoint keeps the side-by-side desktop layout rather than phone's stacked one) blocks — brings the circular keypad's footprint back down to roughly its old size. Re-verified with Playwright: no scrolling needed at 360x740, 412x915, 1000x700, or 1000x650; the mockup Artifact's logo badges (which had used `object-fit:cover` in a circular frame, cropping the bank name text at the bottom of the real logo) were also fixed to `object-fit:contain` on a matching white/ivory disc, for consistency, though that never carried over to the live screen (which was already `contain` on a rounded square, unaffected).

### OTS Calculator's background matched to the rest of the app's ivory (2026-09-09, same day)

Alok noticed the OTS Calculator's page background reading as a light bluish-gray rather than the warm ivory every other screen uses, and asked for it back to plain ivory. Measured it directly (`getComputedStyle`) to confirm rather than going by eye: the rest of the app's `--bg` resolves to `#F5F2EA` (warm ivory) in light theme, but `#detailPane` had its own scoped override, `:root[data-theme="light"] #detailPane{--bg:#EDEFF3; ...}` — a distinctly cooler, blue-leaning shade, part of the OTS Calculator's original "brass reskin" (2026-08-14) rather than anything from today's work. Removed that `--bg` override entirely (the rest of the reskin's brass/paper accents — `--accent`, `--gold`, table stripe tints — are untouched, still scoped to `#detailPane` as before); it now simply inherits the same `#F5F2EA` as everywhere else. Verified via computed-style check: `#detailPane`'s background now measures identical to `document.body`'s.

### Critical regression fixed: OTS Calculator content was getting cut off, huge dead scroll area below it (2026-09-09, same day)

Alok reported the OTS Calculator (Loan Detail screen) scrolling way past its real content into empty space, with data hidden/cut off partway down — caused by the screen-switch transition shipped earlier today. Root cause: `.view.active`'s entrance animation was changed from plain `animation:viewIn .34s var(--ease)` to `...both`, so its effect (including the `transform` property, even though the animation's own end keyframe is visually a no-op) stayed "in effect" on the `<section>` indefinitely instead of releasing once the 340ms finished. Per the CSS spec, any element with an animation *currently in effect* on `transform` establishes a new containing block for `position:fixed` descendants — regardless of what that transform's resolved value actually is at any instant, a literal `transform:none` end-keyframe included. `#detailPane` (`position:fixed;inset:0`, meant to cover the full viewport) is nested inside the Search view's markup in `index.html`, so once its ancestor `<section>` permanently carried an "in-effect" transform, `inset:0` silently re-resolved against that section's own box instead of the viewport — collapsing the pane to a fraction of the screen (confirmed via Playwright: `clientHeight` measured 452px instead of the real 900px viewport height) and hiding everything below that point.

First attempt tried fixing the *keyframe's value* (setting the end state to `transform:none` explicitly) — didn't work; confirmed via `getComputedStyle` that the browser still reported a resolved matrix, not `none`, for as long as the animation stayed attached via `both`. The real fix was dropping the fill-mode entirely, back to how this app's view-switching animation always safely worked before today: with no `both`/`forwards`, the animation's effect (and the containing block it creates) ends when the animation itself does, and since nothing else sets `opacity`/`transform` on `.view.active`, the resting style afterward is visually identical to the animation's own end state anyway — no visual regression, just no more lingering containing block. Applied the same fix to `.view.view-leave` (the outgoing-view fade added in the same transition change) for consistency, though it wasn't implicated in this specific bug. Verified: `#detailPane`'s `clientHeight` is back to the full 900px viewport height, and a full screenshot scroll-through shows every row of the loan table rendering correctly, background staying the same ivory it always was (not touched by this fix).

### UCI @ 8.5% row now shows its own tenure, in the heading (2026-09-09, same day)

Alok asked for the anchor-to-today date range to show next to "UCI @ 8.5%" on the Loan Detail card, e.g. "UCI @ 8.5% (30-09-2021 to 09-09-2026)" — the UCI figure alone didn't say what period it was actually being charged over. First pass appended the dates to the *value* cell instead of the row's heading; Alok caught it immediately ("output tab main nahi, heading tab main") and it was corrected the same session, before merging.

`computeUCI()`'s scheme-dependent anchor-date logic (CC004's Mar/Sep-24 cycle vs. every other scheme's end-of-month rule) was inlined and only ever used to feed the day-count math, with no way to read the anchor back out. Extracted it into its own `uciAnchorDate(npaDateRaw, scheme)` helper — `computeUCI()` now calls it instead of duplicating the rule — and added `uciLabelWithTenure(slots)`, which builds the full `"UCI @ 8.5% (anchor to today)"` label string (dates via `fmtDate()`, DD-MM-YYYY per CLAUDE.md). Wired into `loanTableHTML()`'s UCI row label (`th.lt-label`) and `renderPrintView()`'s equivalent row, so both the on-screen card and the printed/shared statement carry it.

The row label is one shared cell across every linked account/column, not a per-column heading, so a genuinely per-account tenure isn't representable there when a borrower's accounts have different NPA dates (and therefore different anchors) -- picks the first account with a computable UCI as the one the heading reflects, exact for the overwhelmingly common single-account case. Verified: the heading reads `UCI @ 8.5% (30-11-2025 to 09-09-2026)` for a real test account, with the value cell back to a plain amount.

### Branch Manager/Recovery Officer contact fields removed from Branch List and Branch Profile; app-wide numeral font switched to self-hosted Inter (2026-09-09)

Two unrelated fixes shipped together.

1. **Manager/RO name + mobile removed, permanently, from both branch surfaces.** Alok asked for the Branch Manager's and Recovery Officer's name and mobile number to be dropped from both the "Branches" edge-panel row list and the full Branch Profile card — not hidden with CSS, actually removed from the code. In `js/app.js`:
   - `branchRowHtml([oldId,newId,name])` (Branch List row renderer) had its entire `bc`/`roleLabels`/`contactLine`/`contact` block deleted — those existed only to render the two contact lines, so once both call-sites were gone the whole block was dead code. The row now shows just the branch name and Old/New Sol ID.
   - `showBranchCard(newId)` (Branch Profile modal) had its four `fields` array entries for Manager name, Manager mobile, RO name, and RO mobile removed, leaving Branch Type/District/Area/Branch Code/Branch Email/Date Opened/Address/Manager Email/Branch Landline/Category/IFSC Code/Remarks untouched.
   - Deliberately **not** touched: `DATA.branchContacts` and its Update Data upload pipeline (still collects `mgr`/`mgrMobile`/`roName`/`roMobile` — just no longer displayed in these two places), Manager Email (not named in the request, no equivalent RO email exists), `branchRoleLabels()` (still needed for the Manager Email label), and `branchMatchesQuery()`'s manager/RO-name search matching in the Branch List search box (a separate, defensible concern — the request was about display, not search).

2. **App-wide numeral font switched from the OS's `ui-monospace` stack to self-hosted Inter.** Alok flagged the numbers looking "mashed"/blurry across the app and asked for the "0" specifically to render more clearly. Root cause: `--font-mono` at `:root` (`css/styles.css`) was `ui-monospace,'SF Mono','Cascadia Code',Consolas,monospace` — whatever generic monospace font happens to be installed on the viewer's OS, which varies a lot in sharpness and in how distinct "0" looks from "O" device to device. The OTS Calculator's own reskin (`#detailPane` scope, shipped 2026-08-14) had already solved exactly this by switching to the self-hosted Inter face with `font-feature-settings` explicitly zeroing out any OpenType "zero" substitution — chosen specifically because Inter's GSUB table has no "zero" feature at all, so its 0 can never render slashed/dotted. That fix only applied inside the OTS Calculator screen, though — every other numeric display (search results, Dashboard cards, KCC Overdue detail card, the Quick Account Detail modal used for KCC Overdue/Daily PNPA lookups, Branch Profile) still used the old system stack, since `#quickAcctModalOverlay`/`#quickAcctGrid` (the modal Alok's screenshot showed) lives outside `#detailPane` in the DOM and never picked up that override. Promoted the same treatment to the root `--font-mono` token instead, and added the matching `font-feature-settings` reset to the base `body` rule, so every numeric field app-wide — not just the OTS Calculator — now renders in the same crisp, self-hosted Inter numerals with an unambiguous "0". Verified via Playwright: `getComputedStyle` on `#quickAcctGrid .v` (the exact modal from the screenshot) now resolves to Inter instead of the old `ui-monospace` fallback, and a rendered screenshot confirms clean digit shapes.

### The three remaining audit findings, fixed on Alok's explicit sign-off (2026-09-09, same day)

Alok's direction on each of the three calculation findings held back from the earlier audit pass: "Total Dues ko 0 kar do" (make it 0, not blank) for the O/S=0 case; didn't follow the rounding-drift explanation and didn't ask further, so it's fixed anyway since the correction itself is unambiguous and low-risk; and for a multi-account borrower with some accounts left blank, explicitly treat Total Sacrifice/other aggregate data as if *none* of them have an OTS Amount filled.

1. **`computeUCI`'s `os===0` case now computes UCI=0 instead of blank.** Was `if(!os || !npaDateRaw) return ''` — `!os` treats the number `0` the same as the blank sentinel `''`, so a real (if unusual) O/S Balance of exactly ₹0 made Total Dues show "—" while Total P&L still correctly showed ₹0, and silently dropped the account from every Total-Dues-based total. Both call sites already guard `os!==''` before calling this function, so the `os` half of that check was fully redundant anyway — changed to `os==null || os===''`, leaving `0` to flow through and compute to `0`.
2. **`exportOtsWorksheet()`'s grand total no longer drifts from the on-screen Worksheet total.** Each row's Sacrifice/Impact-on-P&L live formula used to bake in a pre-rounded (to-the-paisa) constant before Excel's own `SUM()` ran across all rows — summing already-rounded values instead of rounding the sum once, same class of bug as #1 above but for money instead of a UCI gate. The on-screen total was always the correct one (raw per-row values summed, rounded only for display); the export now passes the same raw values through so both agree exactly.
3. **The aggregate "This Account" sidebar (and the printed/shared OTS Settlement Statement) now follow an explicit all-or-nothing rule for a multi-account borrower.** Used to sum Total Dues over *every* linked account but OTS Amount over only the accounts that had one typed, so Total Sacrifice/Impact/Recovery Scale could show real-looking numbers while quietly mixing two different account sets. `recalcAggregate()`'s `any` (at least one filled) became `allFilled` (every linked account filled) everywhere it gates a displayed figure — until every account has an OTS Amount, the whole panel now stays exactly as it does when nothing's typed at all ("—" throughout), never a partial mix. Applied the identical fix to `renderPrintView()`'s Aggregate Totals block for consistency (same figures, different surface). `renderShareCard()` (the WhatsApp share card) was checked and found already correct — its own Settlement Offer sums are internally consistent against only the OTS-filled accounts' own O/S, not mixed against a full-set denominator, so it was left untouched.

Regression-verified: typing an OTS Amount on a normal single-account borrower still computes Total Sacrifice correctly (a single account is trivially "all filled" the moment it's filled, so this path is unchanged); both Excel exports still fire correctly after the rounding/date changes shipped earlier today.

### Datewise Calendar sort + smoother screen-switch transition (2026-09-09, same day)

Two more requests from Alok, landed together:

1. **KCC Overdue Datewise Calendar is now sortable.** Every column header (Sol ID, Branch, each date, Total) is clickable, toggling ascending/descending the same way every other sortable table in the app already does — reused the `.sortable`/`.sort-ic`/`aria-sort` visual language, just scoped to `.kccov-cal-table` since it's a distinct table class from `.dash-table`. New module-level `kccovCalSort` state (`js/app.js`) starts `null` so `renderKccOverdueCalendar()` can tell "never sorted yet" apart from "user picked a sort" — on that first render only, it defaults to **today's own date column, highest slippage first** (`fmtDate(new Date())` matched against the date columns actually present), falling back to the previous default (worst branch overall) if today has no recorded slippage rather than sorting by an all-zero column. Sol ID/Branch default to ascending on first click, every date column and Total default to descending, matching how a slippage table is actually scanned.
2. **Screen switches get a real transition instead of an instant cut.** `.view.active` already had an entrance fade+slide (`viewIn`), but `.view{display:none}` has no transition of its own, so the *outgoing* screen just vanished the instant a nav item was clicked — reading as "blank, then a new screen" rather than one continuous motion. `switchView()` (`js/app.js`) now plays a brief (120ms) fade+settle on the outgoing view first (`.view-leave`/`viewLeave` in `css/styles.css`), and only once that finishes does the actual class swap, re-render, and entrance animation happen — which also picked up a subtle scale (0.985→1) alongside its existing fade+slide for a bit more polish. Skipped entirely under `prefers-reduced-motion` and on the very first view (app startup), so neither case gains any actual delay. Verified rapid back-to-back nav clicks still resolve to the correct final view with no stuck/wrong state.

### Full audit pass: sidebar-overlap layout bug fixed; Excel export date/UCI drift fixed (2026-09-09, same day)

Alok asked for a complete audit — calculation correctness and UI both. Ran two passes in parallel: a subagent reviewed every OTS financial formula and both Excel exporters for correctness bugs; a manual Playwright sweep checked layout across every view/theme/viewport. Two real, verified issues found and fixed; several more surfaced and reported to Alok for a decision before touching live money-math (see below).

1. **Sidebar-overlap layout bug (real, not a test artifact — initially misdiagnosed as one).** `#sideNav` reserves only 76px in normal document flow; `.nav-shell` (the full logo/label panel, 252px) is a `position:absolute` overlay that expands over it on `#sideNav:hover`/`:focus-within`. Clicking any nav-item button leaves it focused (ordinary browser behaviour) — since nothing in the app ever called `.blur()` afterward, `:focus-within` kept matching and the rail stayed visually expanded, covering ~130px of whatever content sat behind it, until focus happened to land on something else entirely unrelated. Confirmed via Playwright with the mouse moved fully away from the sidebar: the Dashboard's leftmost KPI card was still genuinely hidden underneath it. Fixed with one `mouseleave` listener on `#sideNav` (`js/app.js`, inside `wireChrome()`) that blurs `document.activeElement` if focus is still trapped inside the rail — collapses it back to 76px the instant the cursor actually leaves, exactly when a user's eyes expect it to. Verified across Dashboard/KCC Overdue/Search/Utility/PNPA.

2. **`exportOtsExcel()`'s Report Date cell caused UCI/Total Dues/Total Sacrifice/Impact on P&L to silently drift from the on-screen figures on every export.** On screen, `daysBetween()` rounds `(today − anchor)/86400000` with `Math.round` — `today` carries the current time-of-day, so it rounds up to the next day once past noon. The exported sheet's live Excel formulas do plain date subtraction with no rounding, and the Report Date cell was written as the raw full timestamp (`new Date()`), so Excel's day-count silently differed from the on-screen rounded figure by up to a day's interest on every account, worse the later in the day the export ran (afternoon exports were closer to a full day off). Fixed by snapping the initial Report Date to whichever midnight `Math.round` would have resolved to (before noon → today 00:00, at/after noon → tomorrow 00:00) — Excel's plain subtraction against that then lands on the same whole-day count the app showed on screen, regardless of what time of day someone exports. The cell stays user-editable in Excel exactly as before. Verified the export still fires correctly after the change.

**Reported to Alok, not yet acted on** (financial-formula changes on a live banking tool need his sign-off before shipping, and confidence/impact varies): `computeUCI`'s `!os` falsy check treats an O/S Balance of exactly ₹0 as blank rather than 0, so such a row's Total P&L shows ₹0 while Total Dues shows "—" and it's silently dropped from every Total-Dues-based aggregate (medium confidence — depends on whether ₹0-O/S NPA rows actually occur in the live book); `exportOtsWorksheet()` bakes each row's already-rounded Total Sacrifice/Impact on P&L into its live formula before summing, so the grand total is a sum-of-rounded-values rather than a round-of-the-sum, which can drift a few rupees from the on-screen worksheet total on a large book (medium confidence, small magnitude); the aggregate sidebar's Total Sacrifice mixes Total Dues summed over *every* linked account against an OTS Amount summed over only the accounts that *have* one typed, for a multi-account borrower with some accounts left blank (flagged as uncertain — could not tell from the code whether that's deliberate "treat blank as worst case" or an oversight).

### Branch name moved next to the borrower's name on the Loan Detail card (2026-09-09, same day)

Alok pointed out that the branch was buried in the info-grid below and had to be scanned for every time. Added it to the top of the `.borrower-card` (`drawDetailBody()` in `js/app.js`), right-aligned opposite the name, in the exact same size/weight as the name (`.bcard-branch`, matching `.bname`'s 17px/800) rather than as small muted sub-text — so it reads at a glance alongside who the borrower is. `.bcard-top` got `flex-wrap:wrap` so the branch name drops to its own full-width line on narrow/mobile screens instead of squeezing or truncating; verified at both desktop and a 420px-wide viewport. The Branch row in the info-grid below is unchanged/still present.

### Light theme "flatness" follow-up: glass-card borders/shadows and hero-KPI accent bars strengthened (2026-09-09, same day)

Alok flagged that the light-theme polish item from the batch below wasn't actually addressed by what shipped in it — that entry only fixed two narrow, unrelated technical gaps (a missing table row-hover, and confirming a focus-ring asymmetry that turned out to already be fine), not the broader "light mode looks flatter than dark" impression.

Root-caused it properly this time by comparing real dark vs. real light screenshots side by side (previous session testing had unknowingly been screenshotting light theme nearly the whole time — **light, not dark, turns out to be this app's actual default with no saved preference**, confirmed via `document.documentElement.getAttribute('data-theme')` on a fresh session; every "default" screenshot taken all session was already light theme). The `.hero-kpi-card`/`.chart-card` family ("glass" cards: `backdrop-filter: blur+saturate` over a semi-transparent fill) reads as a lifted, glowing panel in dark mode because there's a busy dark gradient background for the blur/saturate to work with; the exact same treatment over a flat cream page has much less to grab onto, so cards were landing closer to "plain white box." Two concrete, low-risk token/rule changes in `css/styles.css`, scoped to `:root[data-theme="light"]`:

- `--glass-border` (used by every glass card: hero KPI tiles, chart cards, the edge-panel rail, `.dash-select`, etc.) raised from `rgba(62,50,30,.10)` to `.18` for a visible edge instead of a near-invisible one.
- `--shadow-sm`/`--shadow`/`--shadow-lg` alphas raised (`.09→.14`, `.13/.07→.18/.10`, `.16/.08→.22/.12`) so cards visibly lift off the page instead of reading flush with it.
- `.hero-kpi-card::after` (the semantic top-edge accent line — cyan/red/gold per card, signalling which KPI is the headline vs. a warning) thickened from 3px/85%-opacity to 4px/full-opacity under light theme specifically — a thin, partly-transparent gradient line pops as a glow against dark mode's near-black cards but nearly disappears against a pale one at the same weight.

Verified via a real before/after screenshot of the Dashboard hero row in light theme: the four KPI cards' top accent colors, barely distinguishable before, are now clearly legible.

### Five usefulness/polish upgrades shipped together, previewed as an Artifact mockup first (2026-09-09)

Alok asked what else would make the app "more beautiful and more useful." Five ideas were proposed, mocked up as a standalone Artifact (using the app's real color tokens/fonts so the preview matched what shipping would actually look like) for review before touching any code, and approved as a batch ("sab implement karenge"). All five are now live:

1. **One-click Excel export — Search & Settlement results and KCC Overdue.** New shared helper `exportRowsToExcel(filename, sheetName, headers, rows, numFmts)` (`js/app.js`, near the existing CSV template helpers) builds a plain, functional `.xlsx` via ExcelJS (bold header row, real numeric cells with optional per-column `numFmt`) and triggers a browser download — deliberately lighter-weight than `exportOtsWorksheet`/`exportOtsExcel` (no borders/formulas/print setup), since this is a quick working copy of whatever's on screen, not a formal print artifact.
   - `exportSearchResults()`: exports exactly `resultListState.list` under its current sort (the same array `resultRowsHtml()` just rendered) — Account No/Customer/Branch/Asset/O-S Balance. Button sits in a new `.results-hint-row` flex wrapper next to the existing match-count hint.
   - `exportKccOverdueSummary()`: exports the branch-summary table currently on screen (Rank/Branch/Accounts/Total O-S) for whichever scheme tab/branch/F.Y./date filter is active — kept WYSIWYG on purpose, not the underlying account-level rows, so the file never shows different granularity than what the banker was looking at. Button only renders in Branch Summary view, not Datewise Calendar (that view has no equivalent flat table to export). `kccovLastExport` (module-level) caches the exact rendered `branchAgg` + scheme/scope labels so the button's `onclick` doesn't need to recompute anything.
   - Both wire into a new shared bottom-center confirmation toast (`showToast()` in `js/app.js`, `.app-toast` in `css/styles.css`) — first toast anywhere in the app, built generically for whatever fire-and-forget action needs one next.
   - **Real bug caught and fixed during verification**: the KCC export button initially landed at the wrong position — `.chart-card-head-row`, the new flex wrapper meant to sit the button beside the section label, was referenced in the JS template but its CSS rule was never actually written, so it rendered as a plain block. `.section-label`'s own `display:flex` made it a full-width block box, pushing the button onto a new line at the row's own left edge — which happened to fall directly under the side nav rail, so every click landed on the nav instead of the button (silent no-op: nothing threw, no download, no toast). Caught via Playwright (`element.click()` kept reporting a nav element intercepting pointer events) rather than by inspection. Fixed by actually adding the missing `.chart-card-head-row{display:flex;...}` rule.

2. **Quick Search (⌘K) results grouped by type.** `renderCmdk(q)` already builds its matches contiguously by source (NPA, then KCC Overdue, then Daily PNPA, in that priority order) — grouping only needed a label inserted whenever the source changes between consecutive items, not a reorder, so `cmdkMatches`/`idx`/arrow-key navigation stay exactly aligned with what's on screen. New `cmdkGroupLabelHtml(source)` renders a small uppercase label with a colored dot (blue for NPA/KCC Overdue, amber for Daily PNPA) between groups.

3. **Consistent "no rows" placeholders.** New shared `emptyStateRowHtml(colspan, msg)` (next to `esc()`) renders a small search-icon + message instead of each call site's own bare, colorless text — applied to KCC Overdue's and PNPA's branch-summary tables, and the two account-list-modal empty states (`acctRows`/`custRows`/`pnpaAcctRows`), replacing five near-duplicate inline `<tr><td colspan=...>` strings. Search & Settlement's own `.no-results` state already had an icon and was left as-is.

4. **Dashboard donut charts get a hover tooltip.** `svgDonut(segments, size)` now stamps `data-label`/`data-value-label`/`data-pct` onto each segment `<circle>`; one delegated `document`-level `mousemove` listener (added once, near `donutLegend()`, since the donut markup is injected via `innerHTML` with no live DOM reference to attach to at construction time) shows a small floating tooltip with the exact label/value/percentage on hover, lazily creating `#chartTooltip` the same way `showToast()` lazily creates `#appToast`. Deliberately did **not** touch the actual segment colors (`--sev-1..5` etc.) even though a "slices look similar" complaint was part of the original ask — those tokens carry asset-severity meaning reused across bar lists and badges elsewhere in the app, and a hover tooltip solves the actual "what am I looking at" problem without risking that broader visual language.

5. **Two small polish fixes**: `.kccov-cal-table` (the KCC Overdue Datewise Calendar) never had a row-hover state in either theme, unlike every other `.dash-table`-style list in the app — added one token-based `tbody tr:hover td` rule that also covers its two sticky columns (its extra type-selector weight already outranks their own background rule, no separate override needed). Investigated a reported light/dark asymmetry on `.search-box:focus-within` and found it already handled correctly via per-theme token swaps (including a documented historical fix for a specificity bug in the OTS Calculator's own search header) — no change needed there.

Verified locally via Playwright end-to-end for all five (export downloads with correct filenames, toast appears, cmdk groups render with correct labels, empty states render, tooltip shows correct text on hover, calendar row hover rule present in the stylesheet) before shipping.

### PWA window-title duplication fixed; splash PIN label simplified (2026-09-09)

Two small polish fixes Alok flagged from a screenshot of the app running as an installed PWA:

1. **Window title bar showing the app name twice** — "UPGB Hathras NPA Dashboard by Alok Mittal - UPGB HATHRAS NPA DASHBOARD BY ALOK MITTAL". Root cause: `manifest.webmanifest`'s `name` field (mixed case) and `index.html`'s `<title>` (all caps) were the same words but not byte-identical, so the installed-PWA window chrome — which shows "`<manifest name>` - `<document title>`" whenever the two strings differ — always appended both. Fixed by making `<title>` match the manifest's `name` exactly (`UPGB Hathras NPA Dashboard by Alok Mittal`), verified via Playwright: `document.title` now string-equals the fetched manifest's `name`.
2. **Splash-screen PIN field relabeled** from "Authorised Signatory — PIN" to a plain "Passcode" — Alok just wanted something simple there instead of the formal wording.

### OneDrive access paused — Utility hub card removed, feature code untouched (2026-09-09)

Alok asked to remove OneDrive access for now, saying he'll pick it back up later ("baad main karenge kabhi") — a pause, not a permanent kill. Removed only the "OneDrive Files" card from the Utility hub grid (`index.html`), which was the single entry point into the feature (confirmed by grepping for every `switchView('onedrive')` call site — only that one button called it, and there's no hash-routing or persisted-last-view mechanism that could reopen it another way). Left the ~400-line MSAL/Graph browser implementation in `js/app.js` (`onedriveConnect`, `onedriveLoadCurrentFolder`, the whole `onedrive*` function set), its `data-view="onedrive"` page section in `index.html`, its CSS, and the self-hosted `msal-browser.min.js` script tag completely untouched — all now simply unreachable dead weight rather than deleted, so re-adding the one card button is all it'll take to bring it back whenever Alok wants to resume. The remaining Utility hub card (PassSheet) verified still works normally.

### Manager/RO contact fields also removed from the Dashboard's branch-info card (2026-09-09, same day, follow-up)

Alok pointed out a third surface still showing Region Head/Senior Manager Recovery (R O Hathras's role labels) after the Branch List/Branch Profile removal above: `dashboardBranchInfoCard(branchFilter, s)` in `js/app.js` — the branch summary card at the top of the Dashboard when a single branch (or the Regional Office) is selected in `#dashBranchFilter`. Missed the first time because it's a third, separate renderer from `branchRowHtml`/`showBranchCard`, built independently for the Dashboard rather than reusing either. Removed its two `item(roleLabels.mgrLabel, ...)`/`item(roleLabels.roLabel, ...)` entries the same way, along with the now-unused `telLink` helper and `roleLabels` variable inside that function (both existed only to render those two lines). District, Branch Email, and Address stay. Grepped the rest of the codebase for `roleLabels`/`mgrLabel`/`roLabel`/`mgrMobile`/`roMobile` display call-sites afterward to confirm no fourth surface was missed.

### Nav restructure: Quick Search relocated, Settings consolidated into a flyout, OneDrive/PassSheet folded into a "Utility" hub tab (2026-09-08, same day)

Alok asked for three related nav-rail changes in one go:

1. **Quick Search moved** to sit directly under "Search & Settlement" (it's a shortcut for that exact screen; it used to live down in the Tools row for no real reason). Same `#cmdkBtnNav` element/id, so its existing click wiring needed no changes.

2. **Settings consolidated**: Refresh, Theme toggle, and Sign-in-with-GitHub used to be three separate always-visible rail buttons. They're now one "Settings" trigger that opens a flyout menu containing all three, plus an "Upload Data" item that runs the same admin-gated flow `#settingsBtnNav` used to open directly. **Critical constraint, confirmed explicitly by Alok mid-build ("wait theme should be accesseable to all")**: Refresh/Theme/Sign-in themselves must stay completely ungated -- every viewer already used them with no login, and moving them into a "Settings" menu must never make them require the admin sign-in that "Upload Data" needs. Implemented by keeping every moved element's original id unchanged (`refreshCurrentBtnNav`, `themeToggleBtn`, `authWidget` and its children) so none of their existing click wiring or `auth.js` DOM references had to change at all -- only `#settingsBtnNav`'s own handler changed, from calling `openUpdateModalAsAdmin` directly to `toggleSettingsMenu()`. Verified explicitly: toggling theme from inside the menu produces no auth prompt of any kind, while clicking "Upload Data" still triggers the exact same sign-in gate as before.

   Hit a real, non-obvious CSS bug while wiring this up: the flyout was rendering completely off-screen even though every computed style looked correct (`display:flex`, right z-index, a plausible-looking position). Root cause: `.nav-shell` (the sidebar's inner scroll container) sets `backdrop-filter`, which per the CSS Filter Effects spec creates a new *containing block* for `position:fixed` descendants -- a `#settingsMenu` nested inside it had its "fixed" position resolving against `.nav-shell`'s own narrow, `overflow:hidden` box instead of the real viewport, clipping it almost entirely off-screen. Fixed by moving the flyout's markup to live as a sibling of `#sideNav` in the DOM (only the trigger button stays inside the rail) -- `toggleSettingsMenu()` already positioned it purely via `getBoundingClientRect()`, so no JS changes were needed beyond that, just the markup's location. Also added a second fix while at it: since the trigger sits near the bottom of the rail, opening the menu straight downward from its top edge could push the sign-in row below the viewport on shorter screens -- `toggleSettingsMenu()` now measures the menu's real height once shown (with `visibility:hidden` to avoid a visible flash) and opens it upward from the trigger's bottom edge instead, whenever opening downward wouldn't fit.

3. **OneDrive Files and PassSheet folded into one "Utility" hub tab** ("ya tools ki jagah utility name rakho... aur bhi utility daalenge... jyada mesh na ho"): the "Tools" nav-lbl section is renamed "Utility"; instead of two separate top-level nav items, there's now one `data-view="utility"` tab whose page is a small card grid (today: OneDrive Files, PassSheet) that just calls `switchView()` on click, same as any nav-item. This scales without the rail growing every time a new utility gets added -- a new card is a markup addition, not a new nav entry. `switchView()`'s active-highlighting got one small addition so the "Utility" nav-item stays visually active while looking at either child page (`UTILITY_CHILD_VIEWS = ['onedrive','passsheet']`), and both child pages got a small "‹ Utility" back-link in their own headers so there's always a way back to the hub without relying on the nav rail.

Verified via Playwright throughout: confirmed the exact new sidebar order (Search & Settlement → Quick Search → ... → Utility tab → Settings trigger); confirmed the settings flyout opens with Refresh/Dark Mode/Upload Data + the auth widget, toggling theme produces no auth prompt and auto-closes the menu, and clicking Upload Data still triggers the real sign-in gate (not the modal directly); confirmed the Utility hub renders both cards, clicking either switches view correctly while the Utility nav-item stays highlighted, and the back-link returns to the hub; re-ran the full PassSheet upload→parse→download end-to-end test (from the previous entry) via this new navigation path with identical results; confirmed mobile's bottom tab bar shows one "Utility" tab in place of the previous two; confirmed no regression to Dashboard, KCC Overdue, Search, or the branch-prefix peek feature. Also independently confirmed (testing against the *original, unmodified* KCC Overdue nav-item) that the sidebar's hover-or-focus-to-expand behavior staying expanded via `:focus-within` after any rail click is pre-existing behavior, not something this change introduced.

Files touched: `index.html` (nav reordering, `.settings-menu-wrap`/`#settingsMenu` restructure and relocation, new `#viewUtility` section, back-links on OneDrive/PassSheet headers, mobile bottom-tab swap), `css/styles.css` (`.settings-menu`/`.settings-menu-item`/`.settings-menu-divider`, `.page-back-link`, `.utility-grid`/`.utility-card`), `js/app.js` (`toggleSettingsMenu()`/`closeSettingsMenu()`, `settingsBtnNav`'s click handler, `switchView()`'s highlighting), `index.html`/`sw.js` (cache-bust bump `20260908g`→`20260908h`, `CACHE_NAME` v175→v176).

### New: PassSheet folded into the app's Tools section (2026-09-08, same day)

Alok supplied a separate, already-working standalone HTML tool ("PassSheet" -- a passbook-PDF-to-structured-Excel-ledger converter he'd built independently, self-contained with its own PDF text extraction, transaction-row parsing, debit/credit reconciliation against the statement's own printed totals, and an ExcelJS-built workbook export) and asked for it to become a real tool inside this app, alongside OneDrive Files.

- **New nav item**: "PassSheet" added to the existing "Tools" group in both the desktop sidebar and the mobile bottom tab bar, right alongside "OneDrive Files" -- a real `data-view="passsheet"` tab using the exact same generic `switchView()` show/hide mechanism every other tab already uses, so no new view-switching logic was needed in `js/app.js` at all.
- **Embedded via iframe, not merged in**: PassSheet is a fully self-contained page with its own class names (`.btn`, `.badge`, `.pill`, etc.) that would collide with this app's own identically-named classes if pasted directly into `index.html`/`styles.css` -- an iframe (`tools/passsheet.html`) keeps its CSS/JS completely isolated, the same call any third-party embedded widget would get.
- **Self-hosted dependencies, not CDN-linked**: the tool as supplied loaded `pdf.js` and `exceljs` from `cdnjs.cloudflare.com`. Brought both in line with this app's established convention (every other vendor library -- xlsx, exceljs, html2canvas, jspdf, msal-browser -- is already self-hosted) since a bank office network is exactly the kind of place likely to block an arbitrary CDN domain, and this tool's entire function depends on both loading successfully. `pdf.js` v3.11.174 (matching what the tool was built against) plus its worker were vendored fresh into `js/vendor/`; the `exceljs` reference now points at the copy the main app already ships for its own Excel exports, rather than a second copy of the same library. Only the Google Fonts stylesheet link stays CDN-linked, since every font-family rule in the tool's own CSS already falls back to a system font if it can't load.
- **Theme synced with the main app**: since the iframe is same-origin, a small bootstrap script reads the exact `localStorage` key the main app's own theme toggle writes (`upgb-theme`) and sets the tool's own `data-theme` attribute to match before first paint (the tool already had its own light/dark CSS variables, just never wired to anything before) -- and listens for the `storage` event so toggling the main app's theme while this tab is already open updates it live too, no reload needed.

Verified end-to-end, not just that it loads: built a synthetic passbook PDF (matching the tool's exact expected text layout, via `reportlab`) with a real opening balance, three transactions, and a reconciling totals line, uploaded it through the actual embedded iframe, and confirmed the parsed account card showed the correct name/reconciliation badge/opening/debit/credit/closing/transaction-count, then triggered the real "Download Excel" button and validated the downloaded `.xlsx` file's contents directly (correct header, account info, dates, particulars, debit/credit/balance columns, and totals row) -- not a mocked test, a genuinely working file came out. Also confirmed: no console errors after moving off the CDN libraries (the CDN versions failed to load in this sandbox's network-restricted browser, self-hosting fixed that outright); dark theme now matches the main app instead of showing a jarring light rectangle; mobile layout reflows correctly (the tool's own responsive CSS already handled this, unmodified).

Files touched: `index.html` (nav items, `#viewPassSheet` section with the iframe), `css/styles.css` (`.tool-page`/`.tool-frame-wrap`/`.tool-frame`), `tools/passsheet.html` (new -- the tool itself, otherwise unmodified from what Alok supplied, only its vendor-library references and a small theme-sync bootstrap changed), `js/vendor/pdf.min.js` + `js/vendor/pdf.worker.min.js` (new, self-hosted), `sw.js` (comment update noting these two are deliberately not precached, same reasoning as html2canvas/jspdf/msal-browser; cache-bust bump `20260908f`→`20260908g`, `CACHE_NAME` v174→v175). No changes to `js/app.js` at all -- the existing generic view-switching machinery already covered this.

### Fix: branch-prefix peek was hiding behind the mobile keyboard (2026-09-08, same day)

Alok's screenshots showed the peek panel completely gone once the on-screen keyboard actually opened on his phone -- the mobile CSS anchored it a fixed 88px from the bottom of the viewport, which is exactly the area the keyboard covers, and the panel is only ever shown while actively typing digits, i.e. essentially always with the keyboard already up.

A different fixed pixel guess wouldn't have been reliable either -- keyboard height varies by device, by whether a suggestions bar is showing, and by keyboard app. Fixed properly using the `visualViewport` API instead: `repositionBranchPeekForKeyboard()` reads how much of the viewport the keyboard is actually covering right now (`window.innerHeight - visualViewport.height - visualViewport.offsetTop`) and sets the panel's `bottom` to clear it live, re-running on every `visualViewport` `resize`/`scroll` event (keyboard open, close, or height change) and once immediately whenever the panel is shown. Falls back to the original fixed 88px (clearing the bottom tab bar) when there's no keyboard, `visualViewport` isn't supported, or the viewport is desktop-sized.

Verified via Playwright with a mocked `visualViewport` object driven manually (real mobile keyboards don't render under Chromium's device emulation, even headed, so the covered-height *effect* was simulated directly): with the mock reporting the full viewport height, the panel sits at its normal `bottom:88px`; shrinking the mock's reported height by 300px (simulating a keyboard covering 300px) and firing `resize` moves the panel to `bottom:388px`, confirmed via bounding-box math to sit clear above the covered region; reverting the mock's height back to full moves it back to `88px`. Re-ran every existing desktop peek scenario (151/16/161/etc.) to confirm no regression there.

Files touched: `js/app.js` (`repositionBranchPeekForKeyboard()`, wired into `visualViewport`'s `resize`/`scroll` events and called once from `renderBranchPeek()`), `index.html`/`sw.js` (cache-bust bump `20260908e`→`20260908f`, `CACHE_NAME` v173→v174).

### Tweak: branch-prefix peek now shows up to 10 branches, full rows (2026-09-08, same day)

Alok asked for 10 branches to show instead of 6, giving the example "151 ki puri list 1519 tak" -- there are exactly 10 branches whose old Sol ID starts with "151" (15100 Eihan through 15190 Ladpur), and he wanted all 10 visible, not truncated behind "+N more". Bumped `BRANCH_PEEK_LIMIT` from 6 to 10, and widened the panel (198px→240px desktop, 172px→208px mobile) since the longest real branch name ("Hathras Service Branch", paired with its Sol ID) was clipping with ellipsis at the old width -- full rows are non-negotiable when the whole point is a clear read.

Verified via Playwright: typing "151" now shows all 10 matching branches with no "+more" line, none of them truncated (including "15140–Hathras Service Branch" in full); "16" (16 total matches) now shows 10 + "+6 more"; re-checked light theme, dark theme, and mobile screenshots for layout.

Files touched: `js/app.js` (`BRANCH_PEEK_LIMIT`), `css/styles.css` (`.branch-peek` width, desktop and mobile), `index.html`/`sw.js` (cache-bust bump `20260908d`→`20260908e`, `CACHE_NAME` v172→v173).

### Tweak: branch-prefix peek now shows Sol ID alongside the branch name (2026-09-08, same day)

Immediate follow-up on the branch-prefix peek above: Alok asked for the Sol ID to show too, as "Sol ID - Branch Name", "clearly visible". Each row now renders as a static, always-crisp Sol ID (bold, bright white-green, e.g. `16010`) followed by a dash and the branch name -- only the name still runs through the decode/scramble animation, the Sol ID itself never dissolves into glyphs, so it stays legible throughout. Panel widened (158px→198px) to fit the longer rows comfortably, and the row cap was trimmed from 8 to 6 (with the "+N more" line adjusting accordingly) so the panel stays compact enough not to overlap the card below it now that each row is wider.

Verified via Playwright: rows now read e.g. `16010–Bajna`, `16100–Pali Kheda`, matching `BRANCH_LIST` exactly; re-ran every earlier peek scenario (1/2/3/4/5-digit boundaries, clear, mode-switch) unchanged and still correct; reviewed screenshots in light theme, dark theme, and mobile to confirm the panel no longer overlaps the OTS Worksheet card underneath it.

Files touched: `js/app.js` (`updateBranchPeek()`, `renderBranchPeek()`), `css/styles.css` (`.branch-peek` width, `.bp-sol`/`.bp-sep`/`.bp-name`), `index.html`/`sw.js` (cache-bust bump `20260908c`→`20260908d`, `CACHE_NAME` v171→v172).

### New: branch-prefix "peek" while typing an Account No. (2026-09-08, same day)

Alok asked for a purely informational touch on the OTS Calculator's search box: type the first 2 digits of an Account No. and a small readout should show which branches that old Sol ID prefix could belong to -- narrowing live as more digits go in, gone entirely past 4 digits -- "unse karna kuch nahi hai bas show hon" (nothing to click, just show), with "hacker type animation... light and small space... something unique."

- **Trigger**: only while searching by Account No. (`searchMode==='acct'` -- a Sol ID prefix means nothing for Cust ID/Mobile/Aadhar/PAN/SB No.), and only while the typed digit count is 2, 3, or 4 -- shown at exactly the range Alok described, hidden below and above it.
- **Match**: filters `BRANCH_LIST` (already in `js/app.js`, `[oldSolId, newSolId, name]` tuples) by whether the old Sol ID starts with the typed digits -- e.g. "16" matches Bajna (16010) first, "161" narrows to Pali Kheda (16100) first, exactly the two examples Alok gave. Capped at 8 branch names with a "+N more" line so the panel stays small even for a 2-digit prefix that matches a couple dozen branches.
- **Placement**: a small, fixed-position panel in the screen's top-right corner (bottom-right above the tab bar on mobile), independent of page scroll -- deliberately given its own dark/monospace/green terminal look rather than following the app's own light/dark theme, since it's a novelty touch, not a themed UI surface. `pointer-events:none` throughout, since there's genuinely nothing to click.
- **Animation**: a "decode" text-reveal effect (`scrambleInto()`) -- each branch name resolves left-to-right out of scrambled terminal glyphs (`!<>-_\/[]{}=+*^?#$%01`) over ~280ms, with each subsequent row starting slightly later (40ms stagger) for a rippling terminal-readout feel. Respects `prefers-reduced-motion` exactly like the rest of the app's animations (`animateNumber()`), jumping straight to final text when motion is reduced.
- Also wired into switching search mode (via the mode-pill click handler) and clearing the field, so leaving Account No. mode or clearing the box hides it immediately rather than leaving a stale panel on screen.

Verified via Playwright: 1 digit → hidden; "16" → visible, Bajna first, 8 shown + "+8 more"; "161" → visible, Pali Kheda first, 7 shown, no "+more"; "1610" → narrows to just Pali Kheda; "16100" (5 digits) → hidden; clearing the field → hidden; switching to Cust ID mid-digit → hidden immediately. Screenshots reviewed in both light and dark theme, and at a mobile viewport (390px) confirming the panel repositions above the bottom tab bar instead of overlapping it. Confirmed no regression to the existing 6+-digit live search/sort behaviour on the same input.

Files touched: `index.html` (`#branchPeekPanel`), `js/app.js` (`updateBranchPeek()`, `renderBranchPeek()`, `hideBranchPeek()`, `scrambleInto()`, wired into the search input's existing `input` listener, the mode-pill click handler, and `clearSearch()`), `css/styles.css` (`.branch-peek` and related rules), `index.html`/`sw.js` (cache-bust bump `20260908b`→`20260908c`, `CACHE_NAME` v170→v171).

### Fix: every Excel date upload was silently reading dates one day early, in IST (2026-09-08, same day)

Alok flagged that the KCC Overdue "Datewise Calendar" always showed Cust NPA Date one day before the real date, and asked for a full audit before any fix. That audit found a genuine, serious, and much wider bug than just this one screen.

**Root cause**: every one of this app's six Excel-upload handlers (`js/app.js`) called `XLSX.read(data, {cellDates:true})` -- the option that makes the bundled SheetJS library return native JS `Date` objects for genuine Excel date-typed cells, instead of raw serial numbers. Reproduced and proved precisely (Playwright with `timezoneId:'Asia/Kolkata'`, plus standalone Node scripts against the exact bundled `js/vendor/xlsx.full.min.js`): reading a real, independently-authored (openpyxl, not round-tripped through the same library) Excel cell for 15-Mar-2026 through `cellDates:true` came back as `2026-03-14T18:29:50.000Z` -- a timestamp genuinely shifted almost 5.5 hours *before* the correct UTC midnight, not just misread by a getter. Both local getters (`getDate()`) and UTC getters (`getUTCDate()`) read it as 14-Mar, not 15-Mar -- there was no getter-based fix, because the underlying instant itself was wrong, always by the same fixed offset, every single date tested.

This meant the bug wasn't confined to the KCC Overdue calendar at all -- `toDate()`'s `v instanceof Date` passthrough branch used this same broken value everywhere, and the *far* more consequential exposure was in `mapHoRowsToNpa()` (the main daily HO NPA upload): **NPA Date** (`earlierRaw()`, feeding `out[20]/[22]/[23]`) and **Sanction Date** (`out[14]`, via `normalizeCell()`) both went through the identical broken path whenever the source column was a genuine date-typed cell rather than DD-MM-YYYY text -- meaning Days-in-NPA, the >180-day eligibility threshold, and every other NPA-Date-driven figure across the *entire* platform could have been silently off by one day for any account where Head Office's export used real date cells for those columns, not just Cust NPA Date in KCC Overdue.

**Fix**: removed `cellDates:true` from all six `XLSX.read()` call sites (`handleBranchContactsUpload`, `handleFileUpload`, `handleMasterFileUpload`, `handleBranchAdvUpload`, `handlePnpaUpload`, `handleKccOverdueUpload`). Genuine date-typed cells now arrive as their raw Excel serial number instead, which this app's own `excelSerialToDate()` already converts correctly (a fixed local-midnight epoch plus whole-day millisecond increments -- immune to this exact class of bug since India has no DST to cause drift). Two call sites needed a companion fix since they didn't go through `toDate()` directly: `earlierRaw()` now formats off the already-correctly-parsed `Date` via `fmtDate()` instead of re-deriving from the raw cell via `normalizeCell()` (which only knows how to stringify a `Date` instance -- a raw serial number would otherwise have passed straight through unconverted as a bare number like "46096", exactly what CLAUDE.md's date-format rule warns against); the Sanction Date assignment in `mapHoRowsToNpa()` got the identical treatment.

Deliberately left out of scope: `processDailyParsed()`'s "legacy workbook format" fallback branch (a rarely-used older file layout, superseded by the current HO export format) still runs every column through generic `normalizeCell()` without column-type awareness, so a genuine date-typed cell there will now show as a raw serial number rather than a wrong date if that legacy path is ever exercised again -- a real cosmetic regression for that one narrow fallback, but a strict correctness improvement over a silently wrong date, and not worth broadening this fix's blast radius to chase given how little that path is used today.

Verified via Playwright end-to-end through the real upload UI (not just unit-level), with the browser context's `timezoneId` explicitly set to `Asia/Kolkata` to match Alok's actual environment:
- KCC Overdue: uploaded a real file with a genuine date-typed Cust NPA Date cell for 15-Mar-2026 -- the Datewise Calendar's column header and the "Worst single day" insight both now correctly read 15-03, not 14-03 (screenshot reviewed).
- Main daily NPA upload: uploaded a real file with genuine date-typed cells for both Account NPA Date (15-Mar-2026) and Sanction Date (10-Jan-2020) -- both now show correctly in the account detail view (`NPA Date: 15-03-2026`, `Sanction Date: 10-01-2020`).
- Regression check: re-ran the exact same main-upload test with the dates as plain DD-MM-YYYY *text* instead of genuine date cells (the other common real-world HO export format) -- identical correct output, confirming the text-date path (untouched by this fix) still works exactly as before.

**Alok, please re-upload and re-publish your current source files once this is live** (including the KCC Overdue file you already have ready) -- the fix only corrects how *new* uploads get parsed; whatever is already published in `data/latest.json`/`data/kcc-overdue.json` was parsed under the old buggy code and may already carry a day-early date for any account whose source column used a genuine date-typed cell.

Files touched: `js/app.js` (`parseHoDate()`, `earlierRaw()`, the Sanction Date assignment in `mapHoRowsToNpa()`, and all six `XLSX.read()` call sites), `index.html`/`sw.js` (cache-bust bump `20260908a`→`20260908b`, `CACHE_NAME` v169→v170).

### Fix: clearing Interest Reversal to 0 silently brought back the seeded master value (2026-09-08, same day)

Immediately surfaced by the data seed above: Alok reported that setting Interest Reversal to 0 stopped changing Total Dues/Total Contractual Dues. Root cause was in `onUriInput()` (`js/app.js`) -- a blank/cleared field was treated as "delete the override, fall back to the master-data default (`s.uri`)", not as an explicit 0. That fallback was invisible before the data seed, since every account's master default was 0 anyway (blank override -> fall back to 0 -> same result as an explicit 0). Once real non-zero per-account defaults existed (the seed above), clearing the field silently brought that non-zero master value straight back instead of showing 0 -- so "setting it to 0" visibly failed to change Total Dues for any account the file had touched.

Reproduced first to confirm the exact mechanism before fixing: on account `161573210000110` (base Interest Reversal 5,525), typing the literal digit "0" into the field correctly dropped Total Dues by 5,525, but backspacing the field fully blank left Total Dues completely unchanged -- proving the bug was specifically in how a *blank* field was handled, not in the calculation itself.

Fixed by making `onUriInput()` treat a blank field exactly like typing "0" (stores the override as `'0'` instead of deleting it), so clearing the field and typing "0" now always produce the same, correct result. Verified via Playwright: both actions now reduce Total Dues/Total Contractual Dues by the same amount; the 0-override survives a page reload (still shows blank with the "0" placeholder, visually indistinguishable from a true default-0 account, but Total Dues stays correctly reduced); and typing a real value back in afterwards still live-updates everything exactly as before -- the field never stopped being editable.

Files touched: `js/app.js` (`onUriInput()`), `index.html`/`sw.js` (cache-bust bump `20260907h`→`20260908a`, `CACHE_NAME` v168→v169).

### Data update: seeded Interest Reversal figures from Alok's own file (2026-09-08)

Alok supplied `Interest_Reversal.xlsx` (Account_Number + Interest Reversal amount, 9,821 rows) and asked for it to fill the OTS Calculator's Interest Reversal field as the *default* value per account -- staying editable, defaulting to 0 wherever there's no data for an account, same as the field already behaves today.

Turned out no code change was needed at all: the Interest Reversal field's live-editable behaviour (`uriFor()` in `js/app.js`) already prefers a per-account typed override (kept in `localStorage`) over a base value read straight from the published dataset's `uri_tot` column (row index 18, `C.URI`) -- and falls back to 0 when that column is blank. That base column simply had almost no data in it yet (93 of 13,671 NPA accounts). So this was purely a **data update**, not a feature: joined Alok's file into `data/latest.json`'s `uri_tot` column by exact account number match.

- 8,988 of the file's 9,783 unique accounts matched a current NPA account and were updated.
- 795 accounts in the file don't correspond to any account in the current NPA dataset (most likely settled/recovered/no longer NPA since the file was prepared) -- left untouched, nothing to set them on.
- One account (`152835100104258`) appeared twice in the source file with two different amounts (23,646 vs 20,146) -- the later of the two was used.
- Two accounts already carried an old, unrelated `uri_tot` value that didn't match anything in the new file (221→5,525 and 683→1,736) -- overwritten with the new file's figure, per "jahan ye data hai wahan is list se aa jaye" (this list is the source of truth for the accounts it covers). The other 91 accounts with pre-existing non-zero values that the new file doesn't mention were left exactly as they were.

Verified in-browser: an account covered by the file now shows its Interest Reversal amount pre-filled on load (e.g. account `161573210000110` shows `5525`), Total Dues reflects it immediately, and typing over it still live-updates Total Dues/Total Contractual Dues exactly as before -- the field never became read-only. An account not in the file still shows blank/0 by default, as before.

Files touched: `data/latest.json` only (the `uri_tot` value for 8,988 matching NPA rows) -- no `js/app.js`/`css/styles.css`/cache-bust changes, since this data file isn't service-worker-precached and the app always fetches it fresh with its own cache-busting `?t=` query param.

### OneDrive: Google Drive-style visual redesign, plus a real sign-in bug fix (2026-09-07, same day)

Alok asked for the OneDrive tab's look to match Google Drive's own UI ("Ise google drive jaisa UI bana do"). Redesigned the file browser accordingly:

- **Colour-coded file-type icons**: a flat folder glyph plus a page glyph colour-coded by extension (red=PDF, green=spreadsheet, blue=doc, orange=slides, purple=image, grey=archive/plain-text/unknown) — the same colour-by-type convention Drive and OneDrive's own web apps both use, in both list and grid views (`onedriveIconSvg()`).
- **List/Grid view toggle**: a segmented pill control (Drive's signature feature) switches between the existing row-table layout and a new card-tile grid layout (`onedriveGridHtml()`), each folder/file rendered as a tile with a big icon, name, and item-count/size+date underneath. The choice is remembered in `localStorage` (`upgb-onedrive-view`) the same way the theme toggle is, and survives folder navigation without needing to be reset each time.
- **Rounded pill search box** replacing the old boxy filter input, styled like Drive's own search bar, with an accent focus ring.
- **Cleaner list rows**: dropped the app's usual bold banker-style table header (used everywhere else for financial figures) in favour of a flat, hairline-divided row list with no header fill — reads like a file manager instead of a ledger. Row actions (Open in OneDrive / Download) now only appear on hover instead of sitting on screen permanently, matching Drive's own reveal-on-hover convention.
- **Breadcrumb polish**: chevron arrows instead of plain "/" separators, current folder in bold, each ancestor a rounded hover-highlighted chip — plus the Back button restyled as a plain circular icon button.

**Real bug fixed along the way**: while reviewing this, Alok reported that when a wrong Microsoft account was already signed into the browser (e.g. from another device/profile), the Microsoft sign-in popup jumped straight into that account's own passwordless "Get a sign-in request" flow with no way to pick a different account at all. Root cause: `onedriveGetToken()`'s `loginPopup()` call never told Microsoft's own login page to show its account-chooser screen, so Microsoft silently continued with whatever account already had an active SSO session in that browser. Fixed by adding `prompt: 'select_account'` to the `loginPopup()` scopes request — a standard OIDC/Entra ID parameter that forces the account-chooser screen ("Pick an account" / "Use another account") every time, regardless of any existing SSO session.

Verified via Playwright: confirmed `loginPopup()` is now called with `prompt:'select_account'`; confirmed file-type icon colours render correctly per extension in both views; confirmed sorting, filtering, and folder navigation all still work identically in both list and grid mode; confirmed the view choice persists in `localStorage` across a subfolder-open/Back round-trip; screenshots reviewed in both dark and light theme for contrast.

Files touched: `js/app.js` (`onedriveIconSvg()`, `onedriveGridHtml()`, `onedriveRenderListArea()`, `onedriveSetView()` all new; `onedriveRowsHtml()`, `onedriveRenderFolderView()` rewritten; `onedriveGetToken()`'s `loginPopup()` call), `css/styles.css` (full rewrite of the OneDrive toolbar/list/grid rules), `index.html`/`sw.js` (cache-bust bump `20260907g`→`20260907h`, `CACHE_NAME` v167→v168).

### Fix: OneDrive folder-load error screen had no Sign out option (2026-09-07, same day)

Alok flagged a real gap: if a different Microsoft account gets signed in on another device (e.g. by mistake), Graph correctly refuses to load the scoped HATHRAS folder for that account and an error screen appears — but that specific error screen (`onedriveLoadCurrentFolder()`'s `!res.ok` branch) only ever offered a "Retry" button. Retry re-sends the exact same request with the exact same (wrong) account's token, so it just fails again every time, with no way to switch accounts short of clearing browser data.

Fixed by adding a "Sign out" button alongside "Retry" on this error screen specifically (the sign-in error screen and the normal folder-view toolbar already both had one). Clicking it now behaves exactly like the existing sign-out flow — clears the MSAL session and folder state, returns to the "Connect OneDrive" screen — so switching to the correct account is one click away instead of a dead end.

Verified via Playwright: simulated a signed-in account with a mocked Graph `403 accessDenied` response (the real shape Graph returns when an account has no access to a given path), confirmed both "Retry" and "Sign out" render on the error screen, and confirmed clicking "Sign out" returns to the Connect screen.

Files touched: `js/app.js` (`onedriveLoadCurrentFolder()`'s error branch), `css/styles.css` (`.onedrive-error-actions` wrapper for the two-button row), `index.html`/`sw.js` (cache-bust bump `20260907f`→`20260907g`, `CACHE_NAME` v166→v167).

### OneDrive: moved from a slide-out panel to a full main-nav tab, plus Back/sort/filter/actions (2026-09-07, same day)

Once sign-in and folder browsing were both confirmed working end-to-end, Alok asked for the OneDrive feature to move out of the slide-out edge panel and into a proper tool-tab that shows data across the full page, with a Back option, and "many more as per your recommendation" — plus, in a follow-up, an explicit sign-out (and sign-in) control.

- **Full-page tab, not a panel**: removed the edge-panel entry point (handle button, backdrop, slide-out `<aside>`) entirely and added a real `data-view="onedrive"` item to both the desktop nav's "Tools" section and the mobile bottom tab bar, alongside a new full-width `<section class="view" data-view="onedrive">`. Clicking the tab now shows the file browser across the whole content area, exactly like Dashboard or Search, instead of a narrow slide-out strip.
- **Back navigation**: added an explicit Back button (disabled at the scoped HATHRAS root, enabled inside any subfolder) plus the existing breadcrumb trail, so moving up the folder tree no longer depends on the breadcrumb alone.
- **Sortable columns**: Name, Size, and Modified columns are now sortable (ascending/descending toggle, same generic `applySort`/`nextSort`/`updateSortIcons` engine used everywhere else in the app for consistency), with folders always kept ahead of files regardless of sort column.
- **Filter box**: a live text filter narrows the current folder's file/folder list instantly, without any extra network call — typing filters the already-fetched folder contents client-side.
- **Explicit sign-in / sign-out**: a visible "Sign out" button sits in the toolbar whenever signed in; signing out clears the session and returns to the same "Connect OneDrive" sign-in screen used for the first-time login.
- **Row actions**: each file row now has both an "Open in OneDrive" link (via Graph's `webUrl`) and a "Download" link (via Graph's direct `@microsoft.graph.downloadUrl`) — still strictly one-way (browse/download only; nothing from this app is ever uploaded back to OneDrive).
- **Modified column formatting**: dates render via `fmtDate()`, keeping the DD-MM-YYYY rule consistent with the rest of the app.

Verified via two Playwright scripts against mocked MSAL + Graph responses: tab activation and full-page rendering, connect→folder flow, initial folder-first/name-ascending order, Back button's disabled/enabled states at root vs. subfolder, unambiguous sort-direction toggling on the Modified column (checked via the `aria-sort` attribute across two clicks), live filtering, subfolder open/back round-trip with correct breadcrumb updates, sign-out→sign-in cycle, and confirmation that every old edge-panel DOM element (`onedriveEdgeHandle`, `onedriveEdgePanel`, `onedriveEdgeBackdrop`) is fully gone. A screenshot of the finished full-page view was also reviewed for visual polish.

As before, the real interactive Microsoft sign-in popup itself cannot be exercised in this sandbox — this change reuses the exact same (already-proven-working) authentication code from the panel version, just rendered in a different container, so the risk of regression there is low, but a quick live check is still worth doing.

Files touched: `index.html` (removed edge-panel markup, added desktop + mobile nav-items and the new full-page `#viewOnedrive` section, cache-bust bump), `css/styles.css` (removed old `.onedrive-*` panel styles, added new full-page layout styles), `js/app.js` (removed `toggleOnedrivePanel`, added `onedriveListState`, `onedriveVisibleItems()`, `onedriveRowsHtml()`, `onedriveRefreshRows()`, `onedriveSortBy()`, `onedriveFilterInput()`, `onedriveGoBack()`, `onedriveRenderFolderView()`; `switchView()` now resumes an existing OneDrive session when the tab is opened), `sw.js` (`CACHE_NAME` v165→v166, matching bump; comment updated to say "tab" instead of "panel").

### Fix: invalid $orderby was the real reason OneDrive folders never loaded (2026-09-07, same day)

The error-surfacing fix above paid off again immediately: Alok's retry now showed `HTTP 400 — BadRequest: The $orderby expression must evaluate to a single value of primitive type.` — a genuine, previously invisible bug in the Graph query itself, not a sign-in or permissions issue at all. `onedriveLoadCurrentFolder()`'s request used `$orderby=folder desc,name asc` to try to put folders ahead of files server-side, but Graph's `folder` property is a complex facet object (`{childCount:N}`), not a primitive field -- Graph's `$orderby` only accepts primitives, so this request was always going to fail with a 400, on literally the very first folder load for anyone, every time.

Fixed by not asking Graph to sort by a non-primitive at all: the request now uses plain `$orderby=name`, and folders are moved ahead of files with a client-side stable sort afterwards (`Array.prototype.sort` is stable in every engine this app runs in, so items already name-ascending from Graph's own ordering stay name-ascending within each group -- the sort only reorders folders ahead of files, nothing else).

Verified via Playwright with a realistic mocked Graph response (folders and files interleaved, as Graph would actually return with `$orderby=name`): confirmed the request URL no longer contains the invalid `folder desc` clause, and the rendered list correctly shows folders first (in their own name-ascending order), then files (in theirs), with no error.

Files touched: `js/app.js` (`onedriveLoadCurrentFolder()`'s query string and client-side folder-first sort), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v164→v165, matching bump).

### Fix: OneDrive folder-load also showed a generic error, same pattern as sign-in (2026-09-07, same day)

Progress: Alok's retry got past sign-in cleanly this time (the `initialize()` fix worked) and landed on the folder-loading step -- but hit "Could not load this folder." with no further detail, the exact same generic-error problem as the sign-in screen had, just in `onedriveLoadCurrentFolder()`'s catch block instead of `onedriveConnect()`'s. Same fix, same reasoning: no DevTools access to fall back on, so the panel needs to say what actually happened.

Now parses Microsoft Graph's own error body on a failed request (Graph returns a structured `{error:{code,message}}`, e.g. `itemNotFound: The resource could not be found` for a folder path that doesn't exist or was renamed, or `accessDenied` for a permission/consent problem) and shows the HTTP status plus that code and message directly in the panel, instead of a bare "Could not load this folder." Verified via Playwright with a mocked 404 `itemNotFound` Graph response: confirmed the full detail renders correctly, including after clicking Retry.

This should now show Alok exactly why his specific folder request is failing (most likely either the scoped path `UPGB/Recovery/ALOK_MITTAL/HATHRAS` not matching his real OneDrive folder structure exactly, or a permissions/consent gap) -- waiting on him to retry and report what it now says.

Files touched: `js/app.js` (`onedriveLoadCurrentFolder()`'s error handling parses and surfaces the Graph error body), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v163→v164, matching bump).

### Fix: OneDrive sign-in was failing on every attempt -- missing MSAL initialize() (2026-09-07, same day)

The error-detail fix above immediately paid off: Alok retried and the panel now showed the real cause instead of a guess -- `uninitialized_public_client_application: You must call and await the initialize function before attempting to call any other MSAL API`. Root cause: `msal-browser` v3 (self-hosted here) added a hard requirement that didn't exist in v2 -- `await instance.initialize()` must be called and awaited before touching any other MSAL method (`loginPopup`, `getAllAccounts`, `acquireTokenSilent`, all of it). `onedriveMsal()` only ever did `new msal.PublicClientApplication({...})` and returned it immediately, so every single sign-in attempt was always going to hit this exact error -- not an edge case, the only possible outcome as shipped.

Fixed by making `onedriveMsal()` async: it now calls `initialize()` once on first construction and caches that promise (`onedriveMsalReady`) so every caller -- `onedriveGetToken()`, `onedriveTryResume()` (fires automatically when the panel opens), `onedriveSignOut()` -- awaits the same initialization instead of racing separate ones or skipping it. All three call sites updated to `await onedriveMsal()` instead of calling it synchronously.

Verified two ways: (1) the existing mocked-MSAL Playwright flow (login → folder browse → subfolder navigation → sign-out) still passes end-to-end with the mock's own `initialize()` stub included; (2) constructed a real `msal.PublicClientApplication` with the actual production config and confirmed `await app.initialize()` now resolves with no error and `getAllAccounts()` works immediately after, against the genuine self-hosted library, not a stand-in. The real interactive login popup itself still can't be exercised here (needs an actual personal Microsoft account) -- that's the one piece still waiting on Alok's own retry.

Files touched: `js/app.js` (`onedriveMsal()` made async with a cached `initialize()` promise; `onedriveGetToken`, `onedriveTryResume`, `onedriveSignOut` all updated to await it), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v162→v163, matching bump).

### Fix: OneDrive panel now surfaces the real sign-in error (2026-09-07, same day)

Alok tried "Connect OneDrive" on the just-shipped panel and hit "Could not sign in. Please try again." — the generic fallback string the panel showed for *any* failure, useless for actually diagnosing what went wrong (a redirect-URI mismatch, a blocked popup, a cancelled login, an account-type mismatch all looked identical). Real MSAL errors already carry a specific `errorCode` (e.g. `popup_window_error`) and message, but `onedriveConnect()`'s catch block discarded all of that and showed one hardcoded sentence regardless.

Now surfaces MSAL's own error code and message directly in the panel (e.g. "Could not sign in — popup_window_error: Error opening popup window..."), so the actual cause is visible without anyone needing to open DevTools and read the console — not realistic to ask of most people using this app. Verified via Playwright with a mocked `loginPopup` failure carrying a realistic MSAL error shape: confirmed the specific code and message both render in the panel.

This directly unblocks diagnosing Alok's actual failure — waiting on him to retry and report back what the panel now actually says.

Files touched: `js/app.js` (`onedriveConnect()`'s catch block), `css/styles.css` (`.onedrive-status` sized/wrapped for a longer error string), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v161→v162, matching bump).

### Feature: read-only OneDrive browser panel (2026-09-07)

Alok: "Mere paas mera personal one drive ka access hai to kya ham yahan ek FTP type kuch bana sakte hain kya jisse ham data download kar saken?" -- clarified over a few messages down to something specific: **one-way only**, nothing from this app ever uploads to OneDrive; just browse and download whatever's already sitting in his OneDrive folders, from inside the dashboard.

Technically feasible entirely client-side -- personal Microsoft accounts support browser-only OAuth (no backend server needed) via MSAL.js against Microsoft Graph. The one unavoidable step: an Entra ID ("Azure AD") app registration, which only an actual Microsoft/Azure account holder can create -- walked Alok through it (App registrations → New registration → "Personal Microsoft account users" → Redirect URI as a Single-page application → add the Files.Read Graph permission), and he came back with a Client ID (`ad7b5590-643c-4b07-9814-8fd890e1568d`) and confirmed redirect URI (`https://npadashboard.alokmittal.net`, no trailing slash) and permission both in place. A Client ID and redirect URI aren't secrets for an SPA registration -- there's no client secret at all for that platform type, that's the point of it.

Built as a 5th edge panel ("OneDrive Files"), same handle-rail/backdrop/panel pattern as the other four. Whoever opens it signs into **their own** personal Microsoft account via a popup -- this isn't tied to Alok's account specifically, it's a general "browse your own OneDrive from here" feature. Scoped to one folder tree per Alok's specific ask, not his whole drive: he named `D:\OneDrive\UPGB\Recovery\ALOK_MITTAL\HATHRAS` (his own OneDrive desktop sync client's local mount point) — the actual Graph-relative path needed is everything after `D:\OneDrive\`, i.e. `UPGB/Recovery/ALOK_MITTAL/HATHRAS`, resolved once by path on connect; every subfolder from there navigates by its own Graph item ID like any folder normally would. The breadcrumb's root entry *is* HATHRAS -- there's no way to navigate back out above it from inside the panel. Only `Files.Read` (not `Files.ReadWrite`) is requested, matching the one-way intent at the API permission level too, not just in the UI — this app cannot write to OneDrive even if its own code tried to.

Self-hosted `msal-browser.min.js` (v3.30.0, MIT-licensed) under `js/vendor/`, matching every other vendor library in this project (html2canvas, jsPDF, xlsx, ExcelJS all already self-hosted rather than CDN-linked) — deliberately left out of the service worker's precache list too, same reasoning as html2canvas/jsPDF: most sessions never open this panel, so the runtime fetch handler caches it normally the first time someone does rather than making everyone's very first page load fetch an unused 300KB library.

**What could and couldn't be verified here**: the actual Microsoft sign-in itself requires a real personal Microsoft account and a real interactive login popup — genuinely impossible to exercise from an automated headless test in this environment, so that step still needs Alok's own hands-on test once live. Everything else was verified end-to-end via Playwright with MSAL's `PublicClientApplication` and `fetch` mocked at the boundary (so the app's own code runs for real, only the actual network calls to Microsoft are stubbed): confirmed the MSAL config passed to it matches exactly (client ID, `authority: '.../consumers'` for personal-accounts-only, the exact registered redirect URI), confirmed `loginPopup` is requested with only the `Files.Read` scope, confirmed the Graph request URL correctly resolves the scoped root path and carries the bearer token, confirmed folder navigation (breadcrumb updates, drilling into a subfolder, clicking back up) and sign-out all work correctly against the mocked responses.

Files touched: `index.html` (new edge-handle button + panel markup, `msal-browser.min.js` script tag), `js/app.js` (`EDGE_PANEL_KEYS` gains `'onedrive'`, `toggleOnedrivePanel` + full OneDrive connect/browse/download logic), `css/styles.css` (`.onedrive-*` panel styles), `js/vendor/msal-browser.min.js` (new, self-hosted), `sw.js` (`CACHE_NAME` v160→v161, matching bump, comment updated).

### Feature: sortable Account/Customer headers on the search results list (2026-09-05, same day)

Alok, right after the mode-aware default sort above: "yahan bhi sort ka filter de do account and customer par ab to z to a like" -- wanted an actual manual toggle on top of the new default, not just a smarter one-time ordering. Rather than build a bespoke sort toggle, found and reused a richer sortable-table system already established elsewhere in this app (the Dashboard's "All Accounts" table, and the Branch/Sol ID list modals) -- `applySort()`/`nextSort()`/`updateSortIcons()`, a shared keyboard handler for `th.sortable` (Enter/Space triggers the same click), and matching `.sortable`/`.sort-ic`/`.sort-asc`/`.sort-desc` CSS already in place. That system sorts plain `{acctNo, name, ...}` objects, not raw NPA data rows, so `renderResults()` now maps each match into that shape once (`resultListState.list`) instead of re-deriving fields inline in the row template.

Account and Customer column headers are now clickable (Branch/Asset/O/S Balance stay static, matching exactly what was asked for) -- a click sorts ascending, a repeat click on the same column toggles to descending, and a click on the other column switches to it ascending, with a small ▾ arrow that highlights and rotates to mark the active column and direction. The mode-aware default from the fix above still sets the *initial* order when a fresh search runs; a header click only overrides it for that result set.

Verified via Playwright: searched "151635" in Account No. mode (559 real matches) and clicked through Customer-ascending, Customer-descending, Account-ascending, and Account-descending in sequence, confirming the result list re-sorts correctly and the active header's arrow updates each time.

Files touched: `js/app.js` (`resultListState`, `renderResultsTable()`, `sortResultsBy()`, `resultRowsHtml()`, `renderResults()` rewritten to build the shaped list and sortable headers), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v159→v160, matching bump).

### Fix: Account No. search results sorted by account number, not name (2026-09-05, same day)

Alok: "ots calculator main pahle 6 digit type karte hi jo accounts aayenge wo accounts wise sort kar k do" -- the live search (kicks in once 6+ characters are typed) has always sorted every result list alphabetically by borrower name, per an earlier explicit request of Alok's own, regardless of which field was actually searched on. That made sense for Mobile/Aadhar/PAN/Cust ID/SB No. searches, but not for the default Account No. search: typing digits of an account number is scanning for a near-match among similar numbers, and a name-ordered list has no relationship to what was actually typed.

Refined `runSearch()`'s sort to be mode-aware: the Account No. mode now sorts by account number itself, numeric-aware (`"...0009"` before `"...0010"`, not lexicographic), while every other search mode keeps the existing by-name sort, since none of Cust ID/Mobile/Aadhar/PAN/SB No. has a natural numeric order of its own to fall back on.

Verified via Playwright: searched "151635" in Account No. mode (559 real matches) and confirmed the full result list renders in strict ascending account-number order; searched a mobile-number prefix in Mobile No. mode (1,133 real matches) and confirmed that list is unaffected, still strict A-Z by name.

Files touched: `js/app.js` (`runSearch()`'s sort branches by `mode.id`), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v158→v159, matching bump).

### Fix: Interest Reversal wasn't folding into Total Contractual Dues (2026-09-05)

Alok: "interest reversal ka amount total dues main to add ho raha hai but total contractual dues main nahi ho raha hai" -- typing an Interest Reversal override correctly updated the on-screen Total Dues figure live, but Total Contractual Dues right below it never moved. Root cause: `computeSlot()`'s formula for Total Contractual Dues was `O/S + UCI@12.5%` only -- Interest Reversal was never part of it at all, static or live -- while Total Dues had always included it (`O/S + UCI@8.5% + Interest Reversal`). The on-screen Loan Table row for Total Contractual Dues also just read that static, load-time snapshot directly (`s.totalContractualDues`), with no live-update wiring the way Total Dues already had one (a dedicated `totalDues-${i}` cell refreshed by `recalcLoan()` on every keystroke) -- so even the static baseline's own original Interest Reversal value from the daily data was never reflected, let alone a typed override.

Fixed both halves to mirror Total Dues exactly: `computeSlot()`'s static formula now includes `uri` (`O/S + UCI@12.5% + Interest Reversal`), and a new live `totalContractualDuesFor(s)` helper (parallel to the existing `totalDuesFor(s)`) recomputes off `uriFor(s)` so a typed override is reflected immediately. The Loan Table row was converted from the generic static `row()` helper to a dedicated `totalContractualDuesRow()` with its own `totalContractualDues-${i}` cell, wired into `recalcLoan()` right alongside Total Dues -- both now update on the exact same Interest Reversal keystroke.

Verified via Playwright: typed Interest Reversal = ₹5,000 on a real account and confirmed both Total Dues and Total Contractual Dues increased by exactly ₹5,000 in the same render pass.

Files touched: `js/app.js` (`computeSlot()`'s static formula, new `totalContractualDuesFor()`, `loanTableHTML()`'s row markup, `recalcLoan()`), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v157→v158, matching bump).

### Fix: OTS Settlement Statement spilling onto a silent second PDF page (2026-09-03, same day)

Alok: "set this to only 1 page." The just-shipped letterhead redesign's added breathing room (bordered borrower panel, section label, bordered totals panel) pushed the sheet's total height just past `canvasToPdfBlob()`'s (js/app.js) one-page budget — measured on a real capture at ~40px over, out of roughly 2,200px available at the export scale. `canvasToPdfBlob()` already has multi-page fallback logic for content that's genuinely too long for one page (it slices the canvas and adds pages automatically), so it didn't error or warn — it silently produced a 2-page PDF where the second page was almost entirely blank except for a spillover sliver (the footer line, in practice).

Root cause is fixed-row-count arithmetic, not per-customer: the particulars table always has the same 17 rows regardless of how many accounts are linked (accounts add columns, not rows), so a single-account and a multi-account statement are exactly the same height — meaning this was going to affect every single statement generated, not an edge case for customers with more linked loans.

Trimmed vertical spacing throughout with real margin to spare rather than shaving it down to the exact limit: table row padding (6px → 4.5px vertical, the single biggest lever across 17 rows), strong-row top padding (8px → 6px), and the top bar/borrower panel/totals panel/footer margins each tightened a few px. Re-verified against the same real `canvasToPdfBlob()` page-fit math (not just a visual check): the redesigned sheet now renders at ~763pt against a ~794pt one-page budget — about 31pt (roughly 1.1cm) of margin to spare — confirmed on both the single-account and 2-account real examples used throughout this redesign. Visually still reads as comfortably spaced, not cramped.

Files touched: `css/styles.css` (`.pv-*` spacing trimmed, explanatory comment added warning future edits to re-check page-fit with a real `html2canvas` capture rather than assuming the margin still holds), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v156→v157, matching bump).

### Redesign: printed/PDF sheet rebuilt as "OTS Settlement Statement" (2026-09-03)

Alok asked what else could improve in the app's design/formatting. The one clear remaining gap: the printed/PDF compliance sheet still carried its original plain black-on-white grid from before the WhatsApp card, splash screen, and edge panels were all redone this week — every particular boxed in its own bordered cell at identical visual weight, no distinction between a supporting figure and the number a manager actually reads this sheet for. Mockup-first per the established workflow: built and shown a letterhead-style redesign using two real accounts (Sanjay Kumar — single account, Bamnai branch; Lochan Singh — two linked accounts, Komari branch), approved outright ("theek hai, ise implement kar do").

Also folded in a naming fix Alok asked for in the same message: this document had only ever been called "patti" informally in conversation and in code comments — never an actual name shown to anyone. Renamed to **"OTS Settlement Statement"**, now the document's own on-page title (previously the header just repeated the app's own name, "UPGB OTS CALCULATOR", which was never actually the sheet's own name either).

**Redesign**, applied to `renderPrintView()`'s markup and a full rewrite of the `.pv-*` CSS block:
- A thin brass top bar (`linear-gradient` across `#B3812A`/`#D4A544`) and a proper letterhead identity block (bank logo + name) replace the old plain centered black header text.
- The bank logo is shown **whole**, not cropped into a circle — a circular crop (tried first, per Alok's own catch on the mockup review) cut off the bank-name lettering under the logo's leaf mark; a letterhead shows a logo in full, the way a real letterhead does, via `object-fit:contain` with no border-radius.
- The borrower info block became a single flat 4-across grid (was two explicit side-by-side columns) inside a bordered panel, and the particulars table dropped its full cell-bordered grid for hairline row-rules — the "strong" rows (O/S Balance, Total Dues, OTS Amount, etc.) keep their bold + heavier-top-rule treatment from before, just without a grid line boxing in every other cell around them.
- Aggregate Totals became a distinct bordered summary panel, with **Total OTS Amount** and **Total Sacrifice** — the two figures actually being decided on — set larger than the rest of the totals.
- Every rupee figure, date, and account number is still pure black ink (unchanged data, unchanged font pairing — Manrope for headings/labels, Inter with the zero-safety `font-feature-settings` for every figure) — only the rules, section labels, and top bar carry colour, and only the brass already established by the OTS Calculator's own on-screen theme, not the WhatsApp share card's separate teal. Printer-safe on any office printer, same reasoning as the original plain design.
- `#printArea` gained `overflow:hidden` so the top bar's edge-to-edge bleed (a negative margin pulling it past the sheet's own padding box) stays clipped exactly at the sheet's edge rather than risking whatever sits behind it showing through at that sliver.

Verified against the **real production rendering path** (not a plain page screenshot, which turned out to expose an unrelated artifact of the verification harness itself, not the shipped feature — traced down and ruled out before shipping): called the real `html2canvas(printEl,...)` capture exactly as `shareOtsPdf()` does, for both the single-account and 2-account real examples above. Both came back clean — full uncropped logo, correct hairline table, correct bordered totals panel, all real figures matching exactly what the on-screen Loan Table and old print sheet already computed, no console errors.

Files touched: `js/app.js` (`renderPrintView()` markup rewrite; renamed "patti" references in comments to "Settlement Statement"), `css/styles.css` (`.pv-*` block rewritten for the letterhead design, `#printArea` gains `overflow:hidden`), `index.html` (renamed "patti" reference in the Lok Adalat panel's note text to "Settlement Statement", cache-bust bump), `sw.js` (`CACHE_NAME` v155→v156, matching bump).

### Fix: default theme now respects the device's own light/dark setting (2026-09-03)

Alok relayed feedback from colleagues that the dark theme "eyes par pressure daal raha hai" (strains the eyes). Investigated rather than taking the complaint at face value: the fonts complaint didn't hold up (Inter/Manrope/IBM Plex Mono are all legitimate modern professional typefaces), and the light theme is already a deliberately tuned warm-ivory palette with WCAG-AA contrast fixes documented inline — but the dark-theme complaint had real substance. The app opened in dark theme **by default on every first visit, regardless of the device's own light/dark OS setting** — there was no `prefers-color-scheme` check at all, only an explicit `localStorage` override for users who'd already found and used the in-app toggle. For a daytime branch-office tool used under bright ambient light, forcing dark on everyone who hadn't yet discovered the toggle is exactly backwards.

Root cause was actually two compounding bugs, not one:
1. The `<head>` script that stamps `data-theme` before first paint only ever checked for a *stored* `'light'` value — it never consulted `window.matchMedia('(prefers-color-scheme: light)')` at all, so a phone/PC already set to light mode still got dark by default.
2. Worse, `wireChrome()` (in `js/app.js`, runs on every load) called `applyTheme()` unconditionally to sync the toggle's label text — and `applyTheme()` always wrote its argument straight back into `localStorage`. That silently converted "no explicit preference, currently showing dark" into "user explicitly chose dark" the very first time the page ever loaded, *before anyone had touched anything* — which would have permanently defeated any OS-preference check going forward even after adding one, since the stored value would already say `'dark'` explicitly.

Fixed both: the head script now falls back to `prefers-color-scheme: light` when nothing is stored (leaving it unset, i.e. dark, only when the OS prefers dark or exposes no preference); `applyTheme(theme, persist)` gained a `persist` parameter (default `true`, so a real click via `toggleTheme()` still saves as before), and `wireChrome()`'s startup call now passes `persist:false` — it only syncs the visible label/attribute to whatever the head script already resolved, never writes to `localStorage` on its own.

Verified via Playwright across 5 scenarios: OS set to light with nothing stored → opens light (previously always opened dark); OS set to dark with nothing stored → still opens dark (unchanged, correct); no OS signal exposed at all → opens light (matches real browsers' own light-first assumption); clicking the toggle → switches and persists to `localStorage` exactly as before; reloading after an explicit toggle → the explicit choice sticks regardless of the OS's own setting, confirming a real user's choice can never be silently overridden by this fix.

Files touched: `index.html` (head theme-init script, cache-bust bump), `js/app.js` (`applyTheme` gains `persist` param, `wireChrome` passes `persist:false`), `sw.js` (`CACHE_NAME` v154→v155, matching bump).

### Fix: login/PIN splash screen now fits one phone screen with no scrolling (2026-09-01, same day)

Alok shared a phone screenshot: on a real device, the stacked hero (logo/bank name/app title/"Secure Access" chip) plus the PIN entry panel below it ran taller than the screen — the keypad's bottom row (7/8/9/0) and the Login button were cut off, needing a scroll to reach, and a scrollbar was visibly showing inside the login card. "Yr mobile par 1 baar main puri screen aaye" — the whole thing should appear in one screen, no scrolling.

The two-panel split layout (branded hero left, PIN form right) is a genuinely desktop-shaped design — `.splash-frame` already stacks them vertically below 819px width, which is correct, but the *combined* stacked height of both panels (hero's badge/org name/title/subtitle/rule/32px spacer/trust chip, then the PIN form's lock icon/welcome text/cells/full numeric pad/Login button/footer) added up to roughly 940–980px, well past what an ordinary phone viewport (600–850px tall) can show at once. A `max-height:100%; overflow-y:auto` on the frame meant it silently became scrollable rather than breaking, which is exactly the "scrollbar peeking out, keys cut off" look in the screenshot.

Added a new `@media (max-width:480px)` block (phone-portrait, distinct from the existing 819px stacking breakpoint and 760px-height tweak) that compacts every element rather than shrinking uniformly: the hero's dots watermark, rule, 32px spacer, and "Secure Access" trust chip are dropped entirely (decorative, not information the PIN screen needs), the badge/lock icon shrink to ~40px, and every remaining margin/padding/font-size on both panels is tightened. Verified via Playwright across 5 realistic phone viewports (iPhone SE 375×667 up through a large Android at 412×915) that the entire login card — logo through the "Designed & Developed by ALOK MITTAL" footer — now renders with zero internal scrolling and the footer fully within the viewport at every size tested; confirmed the PIN pad and unlock flow still work identically (typed the correct PIN, screen unlocked as before).

Files touched: `css/styles.css` (new `@media (max-width:480px)` splash block), `index.html` (cache-bust bump), `sw.js` (`CACHE_NAME` v153→v154, matching bump).

### Feature: live Sol ID fill-in on the Account Numbers panel (2026-09-01, same day)

Each of the 6 accounts in the Account Numbers reference panel (No. Lien, NPA Expenses, BDWO, KCC, CC, TL) is printed in the source ledger as `XXXX` + a fixed 10-digit suffix — the `XXXX` stands in for whichever branch's own Sol ID it actually is, left blank because the panel is a shared static reference, not branch-specific. Alok asked for a small text box next to the "Account Numbers" heading where he can type a Sol ID, with all 6 accounts filling in live "jaise type karte jao" (as he types) rather than only after a full 4-digit ID is entered, an animation on each account as it updates, and a clean revert to `XXXX` on all 6 the moment the box is cleared.

Built exactly as described: a small pill input (`#ledgerSolIdInput`, numeric-only, capped at 4 digits) sits right beside the panel's `<h3>`. Each account number's real suffix is captured once into a `data-acct-suffix` attribute on page load (from its own already-rendered text, so the 10-digit suffixes aren't duplicated a second time anywhere in the code); `onLedgerSolIdInput()` then rebuilds every account's displayed text on every keystroke as `(typed digits + 'XXXX').slice(0,4) + suffix` — so "9" alone shows `9XXX...`, "92" shows `92XX...`, and "9269" completes it, digit by digit exactly like typing rather than jumping straight from placeholder to final. A brief colour pulse (`color: var(--accent) → var(--ink)` over 0.3s) fires on each account on every update, giving the live-fill a "typing itself in" feel. Clearing the input runs the same rebuild with zero digits, which resolves back to plain `XXXX` on all 6.

Verified via Playwright: typed "9269" one character at a time and captured all 6 account numbers after each keystroke completed correctly (`9269` + each account's own suffix); clearing the input reverted all 6 back to their original `XXXX` + suffix text exactly. No console errors, panel's centering (fixed same day, above) unaffected.

Files touched: `index.html` (Sol ID input in the panel head, each account number wrapped in a `.ledger-acct-no` span, cache-bust bump), `css/styles.css` (`.ledger-head-row`, `.ledger-solid-input`, `.ledger-acct-no.pulse` keyframe), `js/app.js` (`initLedgerAcctNumbers`, `onLedgerSolIdInput`), `sw.js` (`CACHE_NAME` v152→v153, matching bump).

### Fix: compact edge panels (Lok Adalat / Sacrifice Delegation / Account Numbers) now centered vertically (2026-09-01, same day)

Alok: "slide bar ko open karne main use left screen k top se shuru ho rahe hai aur niche tak nahi aa pa rahe wo theek nahi lag rahe" — the 3 content-sized reference panels (`.edge-panel-compact`) were pinned to `top:0`, so they sat stuck flush against the top of the screen with a chunk of empty space below (each was `max-height:80vh`, well short of the viewport), unbalanced rather than looking placed. Only the full-height Branch/Sol ID directory panel is meant to run edge-to-edge; the 3 compact ones never needed that anchor.

Fixed by centering them vertically instead: `top:50%` plus a `translateY(-50%)` folded into the same `transform` property that already drives the horizontal slide-in/out (`translate(100%,-50%)` closed → `translate(0,-50%)` open), so the slide animation still works exactly as before, just anchored to the vertical middle instead of the top. Corners changed from "square on top, rounded only at the bottom" to fully rounded on all four sides, since the panel is no longer flush against any screen edge except the right (where it always docks). Verified via Playwright on all 3 compact panels plus the full-height Branch panel (left untouched, still edge-to-edge): each compact panel's gap above and below is now identical (0.0px difference, e.g. Lok Adalat: 212.7px both sides at a 900px-tall viewport), confirming true vertical centering rather than an eyeballed offset.

Files touched: `css/styles.css` (`.edge-panel.edge-panel-compact` repositioned, new `.edge-panel.edge-panel-compact.open` transform), `sw.js` (`CACHE_NAME` v151→v152, matching bump).

### Tweak: full account number on the share card, share text trimmed to name + branch only (2026-09-01, same day)

Two follow-ups on the just-shipped Bulletin card. First, each account row showed only the last 6 digits (`A/c ··000012`), masked the same way the print patti abbreviates it — Alok wants the **full** account number visible on the WhatsApp card, so it now reads the complete number (`A/c 160381010000012`) with no truncation; the row already had `min-width:0` on its flex item so the longer string wraps/fits without breaking layout.

Second, the pre-filled WhatsApp message text (shown alongside the shared file, and in the desktop wa.me fallback) previously read "UPGB OTS Calculator — {Name} (Cust ID {ID})" — more than Alok wants attached to a message going out over WhatsApp. Trimmed to **customer name and branch name only**: `{Name} — {Branch}`, e.g. "PREMVATI W/O PREMSHYAM — BATI". Applied identically in both `shareOtsPdf()` and `shareOtsImage()` since they built the same string.

Verified via Playwright: Premvati's card now shows the full 15-digit account number without layout breakage, and the captured wa.me fallback URL's text decodes to exactly `PREMVATI W/O PREMSHYAM — BATI`, no Cust ID or app name.

Files touched: `js/app.js` (`renderShareCard`'s account-no line, `shareText` in both `shareOtsPdf` and `shareOtsImage`), `sw.js` (`CACHE_NAME` v150→v151, matching bump).

### Redesign: WhatsApp share card rebuilt as "Bulletin" — brand band + colour-coded accounts (2026-09-01, same day)

Alok's read on the white/teal share card (shipped 2026-08-29) was that its design "is not up to the mark" — every section (the two stat cards, each account, the profile row) sat in an identically-styled bordered box, so nothing actually stood out despite the data itself being right. Mockup-first per his instruction ("pahle kuch mockups dikhao"): 2 clean/modern directions built and shown side by side using real accounts (Premvati W/o Premshyam — single account, settled; Sahdev Singh — two accounts, no settlement yet, so both card states were visible) — **A "Ledger"** (flat statement paper, hairline dividers instead of nested boxes, one solid ink-teal panel reserved for the Settlement Offer) and **B "Bulletin"** (a gradient brand band up top carrying the bank's own colour, and colour used as information rather than decoration). Alok approved B outright.

**Implemented exactly as approved**, same data/fields throughout — only `renderShareCard()`'s markup and the `.wa-card*` CSS changed:
- A solid navy→teal gradient band now carries the bank logo + "Uttar Pradesh Gramin Bank / Regional Office Hathras" (previously a small logo on a plain white header with a separate corner-glow/dot-grid/seal-watermark background treatment — all of that texture is gone, replaced by the band itself doing the identity work).
- The profile row, both stat tiles (Total O/S, Total P&L), and the Settlement Offer panel all lost their borders in favour of solid soft-tint surfaces (`#EEF8F7` teal-tint, `#FBF3E4` amber-tint) — flatter, calmer, and each section now reads at a distinct visual weight instead of all looking like the same widget.
- **Each account row now carries a 4px left-edge colour rail keyed to its own asset code** (`SUB_STD` green, `DA1` amber, `DA2` orange, `DA3` red, `LOSS` dark red) — the exact same 5-step severity scale the live Loan Table's result cards already use via `[data-asset]`, so a glance at the card shows which linked account is riskiest without reading the tag text. The old separate 2-column "account grid" (with a distinct wider single-account layout) is gone — accounts are now one straightforward stacked list regardless of count, since the new row design already reads cleanly whether there's 1 or several.
- The Recovery/Sacrifice gauge became a rounded capsule with a white marker dot at the recovery-% position (previously a plain two-segment bar).
- The customer-initials avatar circle was dropped — the redesign's profile row leads with the name directly under the brand band instead, so a generated-initials circle no longer had a role; `waInitials()` (now unused everywhere) was removed rather than left dead.

**Also fixed in the same pass** (Alok, same message): NPA age was showing as a decimal-year approximation (`npaYears = daysSince / 365.25`, e.g. "7.9 yrs in NPA") — "npa ki age hai use year and month main kar k likh do," i.e. write it as whole years **and** months, not a decimal. Replaced with `npaAgeStr()`, a calendar-accurate years+months diff (borrows a month from years when the day-of-month hasn't been reached yet, same logic as any real age calculation) — Premvati's account now reads "7 yrs 11 mos in NPA" instead of "7.9 yrs in NPA".

Verified via Playwright against the same two real scenarios used in the mockups: Premvati (single account, OTS ₹45,000 entered, meets Lok Adalat minimum) and Sahdev Singh (two DA2 accounts, no settlement yet) — both render correctly, asset-severity rail colours correct per account, NPA age pill reads "7 yrs 11 mos in NPA" / "3 yrs 8 mos in NPA" respectively, no console errors. Full-PDF share path (`renderPrintView`, untouched) and the share-format menu unaffected.

Files touched: `js/app.js` (`renderShareCard` markup rewrite, `npaAgeStr` added, `waInitials` removed), `css/styles.css` (`.wa-card*` block rewritten for the Bulletin design), `sw.js` (`CACHE_NAME` v149→v150, matching bump).

### Fix: removed stray "Alok_HATHRAS reference" subtitle, WhatsApp Web desktop-sharing fix (2026-09-01, same day)

Two small direct fixes reported off a screenshot of the Account Numbers panel. First, its header carried a leftover `<span class="edge-panel-count">Alok_HATHRAS reference</span>` subtitle — an internal working label that should never have shipped to the panel Alok actually uses day to day — removed outright, no replacement text needed since the panel's own `<h3>Account Numbers</h3>` already says what it is.

Second: on a PC with WhatsApp Web open in a browser tab but no WhatsApp desktop app installed, sharing looked broken. Root cause isn't a bug in this app's code — it's WhatsApp Web's own session lock: it allows only **one** logged-in tab at a time, so opening a fresh `wa.me` link in a new tab (which is what the desktop no-native-share-API fallback path does) doesn't reach the compose screen, it shows WhatsApp's own "used in another tab" interstitial with a "Use Here" button first. No website can skip that screen. Two honest mitigations rather than pretending it isn't there: `shareFileOrFallback()` now opens a consistently-named window (`window.open(url, 'npaOtsWhatsAppShare')`) instead of `'_blank'`, so repeated shares from this app stop piling up their own duplicate WhatsApp Web tabs against each other; and the pre-filled share message now names the interstitial directly and tells the user what to do — "tap Use Here, then attach the [PDF/image] from your Downloads" — instead of silently looking like nothing happened.

Files touched: `index.html` (removed the stray subtitle span, cache-bust bump), `js/app.js` (`shareFileOrFallback` — named window + interstitial-aware message text), `sw.js` (`CACHE_NAME` v148→v149, matching bump).

### Fix + feature: edge-panel overlap fixed, 2 more static reference panels added (2026-09-01, same day)

Two follow-ups on the Lok Adalat panel just shipped. First, Alok reported the two panels' pull-tabs overlapping. Root cause wasn't the mutual-exclusion logic (that part worked) — it was that `.edge-handle` and `.edge-panel` shared the same `z-index:150`, so whichever panel was later in the DOM rendered on top of the earlier panel's own pull-tab wherever their boxes intersected, showing it half-swallowed. Compounding that: each handle had been given a hand-guessed vertical offset (`top:calc(50% + Npx)`) to stack below the previous one, but rotated vertical text makes longer labels ("Lok Adalat") noticeably taller than shorter ones ("Branches") — the guessed offsets didn't actually clear the real rendered heights, so the handles overlapped each other too, confirmed by measuring actual bounding boxes rather than trusting the CSS to be right.

Fixed both properly rather than patching the symptom: all pull-tabs now live in one `.edge-handle-rail` flex column (`position:fixed` once, on the container) instead of each being independently `position:fixed` with a guessed offset — flexbox measures real heights and gaps them correctly regardless of label length, permanently. And rather than just bumping z-index (which would still leave a handle rendering awkwardly in front of an open panel's background), every handle now hides entirely (`opacity:0`, `pointer-events:none`) while any panel is open, reappearing once it closes — a handle's glass/blur styling was designed to sit over page content, not over another panel's opaque surface, so hiding it is the honest fix, not a cover-up. Also removed the panel's "As on 30-06-2026" subtitle (Alok: these are universal parameters, not date-scoped) and capped the panel's own height to its content (`max-height:80vh`, rounded bottom corner) instead of stretching full-screen, so whatever's open in the background stays visible below it — this is what actually exposed the overlap visually in the first place, since a full-height panel used to just cover both handles entirely rather than exposing the seam between them.

**Two new panels**, same pattern, added while fixing the above (Alok: "ye dono aur alag alag slide bar main implement kar dena," sharing photos of two more static reference tables): **Sacrifice Delegation Powers** (Recovery Policy 2025 — waiver + write-off authority by sanctioning level, Chairman ₹40L down to Branch Manager Scale II ₹1.5L) and **Account Numbers** (two grouped tables — Accounts Name and Details: No. Lien/NPA Expenses/BDWO; Interest Earned Accounts: KCC/CC/TL). Both static, no search, same compact sizing and generic `toggleEdgePanel(key)` plumbing as Lok Adalat.

Refactored all 4 panels' JS onto one shared implementation — `EDGE_PANEL_KEYS` + `toggleEdgePanel(key, force)` — instead of near-duplicate per-panel functions; `toggleBranchPanel`/`toggleLokAdalatPanel`/`toggleSacrificePanel`/`toggleLedgerAccountsPanel` are now thin wrappers kept for the existing `onclick` attributes. Escape now closes whichever panel is open generically, not just the original two by name.

Verified via Playwright: measured all 4 handles' real bounding boxes in the idle state (zero overlap, confirmed programmatically, not just by eye) and opened each of the 4 panels in sequence (open → verify siblings hidden → close via backdrop → next), all correct. Full regression and both share paths unaffected.

Files touched: `index.html` (`.edge-handle-rail` wrapper, 2 new panels, cache-bust bump), `js/app.js` (`toggleEdgePanel` generic implementation, `EDGE_PANEL_KEYS`), `css/styles.css` (`.edge-handle-rail`, `.edge-handle-hidden`, `.edge-panel-compact` max-height, removed per-handle offset rules), `sw.js` (`CACHE_NAME` v147→v148, matching bump).

### Feature: Lok Adalat minimum settlement % — a new calculated row everywhere OTS Amount already shows (2026-09-01)

Alok shared UPGB's own circular (minimum settlement % of O/S Balance by NPA Asset Category, as on 30-06-2026: DA1 80%, DA2 70%, DA3 50%, LOSS & PWO 40%) and asked for a new row — "OTS Amount as per Lok Adalat" — everywhere OTS Amount already shows, so whoever's settling an account sees the mandated floor before typing a proposed figure. Mockup-first: 3 tabs (on-screen Loan Table, print/PDF patti, WhatsApp Summary Image) built with illustrative accounts spanning DA1/DA2/DA3/LOSS to show the rate actually changing per category, plus two flagged questions before implementing — this app has no separate "PWO" Asset Code (every loss-category account is just `LOSS`, so PWO gets the same 40% as any other Loss account here), and Substandard accounts aren't in the circular at all. Alok's answer on Substandard: "Not Eligible," not a guessed rate or a blank — Lok Adalat OTS simply doesn't apply to those accounts. Approved, then asked to also add the rate table itself to a slide-out reference panel, "like the Branch/Sol ID one."

**Shared calc** (`js/app.js`): `LOK_ADALAT_RATES` (`{DA1:.80, DA2:.70, DA3:.50, LOSS:.40}`) and `lokAdalatMin(s)` — returns `{eligible:false}` for `SUB_STD`, `{eligible:true, amount, pct}` for the four rated codes, `null` for anything else (defensive fallback, shouldn't come up in practice). One function, three consumers:
- **On-screen Loan Table** (`loanTableHTML`): new `lokAdalatRow()` sits directly above the real `Settlement (OTS) Amount` input row, reusing `.lt-ots-row`'s existing (already theme-aware across all 3 themes/scopes) gold-tint styling rather than duplicating that whole override matrix — just a thin border added to keep the two adjacent gold rows from visually merging. Added a new `scale` icon to `LT_ICONS` for it.
- **Print/PDF patti** (`renderPrintView`): same row, same position, in `STRONG_ROWS` (bold) like the other settlement-critical rows.
- **WhatsApp Summary Image** (`renderShareCard`): the existing Settlement Offer card (only shown once an OTS Amount is entered) gets a new comparison line — **Lok Adalat Minimum** vs. the account's own OTS figure — with a **Meets minimum** (green) / **Below minimum** (red) pill. Summed the same partial-settlement way as the existing Total OTS/Impact sums: only accounts that are both settled (OTS entered) *and* eligible (not `SUB_STD`) count toward the total, so an ineligible account with a manually-negotiated OTS typed in doesn't skew the comparison.
- **Excel export deliberately left untouched** — it wasn't part of the approved mockups (which covered only these 3 views), and its row system is formula-driven against a fixed `OTS_XL_ROW_LABELS` order with its own hidden-sheet rate-lookup pattern; adding it there is a separate, more involved change than what was shown and approved.

**New reference panel**: a second slide-out edge panel (`#lokAdalatEdgePanel`), built as a near-exact copy of the existing Branch/Sol ID panel's pull-tab pattern (`.edge-handle`/`.edge-backdrop`/`.edge-panel`) but with no search step, since the rate table is 4 static rows. Its pull-tab (`.edge-handle-2`) is positioned 86px below the Branches tab so the two don't overlap — both share the base `.edge-handle` positioning and mobile breakpoint, only the vertical offset differs. `toggleLokAdalatPanel()` mirrors `toggleBranchPanel()` exactly (open/close/Escape-key handling), just without the render-on-open step.

Verified via Playwright against real accounts: DA3 account (O/S ₹81,244.70) correctly shows ₹40,622.35 (50%) on both the on-screen table and the print patti; WhatsApp card tested at both an OTS Amount below (₹30,000 vs. the ₹40,622.35 floor → red "Below minimum") and above (₹45,000 → green "Meets minimum") the calculated minimum, both rendering correctly. Two edge-handles confirmed stacked without overlap; the new panel opens with the correct static rate table. Full regression and both share paths unaffected.

Files touched: `js/app.js` (`LOK_ADALAT_RATES`, `lokAdalatMin`, `lokAdalatRow` in `loanTableHTML`, new row in `renderPrintView`'s `rows`, comparison block in `renderShareCard`, `toggleLokAdalatPanel`, `scale` icon), `css/styles.css` (`.lt-lokadalat-row`/`.lt-lokadalat-na`, `.wa-cmp`/`.wa-met`, `.edge-handle-2`, `.lokadalat-rate-table`/`.lokadalat-note`), `index.html` (second edge-panel markup, cache-bust bump), `sw.js` (`CACHE_NAME` v146→v147, matching bump).

### Redesign: share card converted from dark to a white/teal light theme (2026-08-29, same day)

Immediately after the cyan-dark redesign shipped, Alok asked to convert it to a light theme. Same structure and content throughout — every class name, every layout rule untouched — only the color values changed, in `css/styles.css`'s `.wa-card*` block. Base flipped from near-black `#060B14` to white `#FFFFFF`, cyan `#2DD4CF` darkened to a teal `#0E9AA0` that actually holds contrast on white (the original cyan reads fine on black but washes out on white), and every "glow" treatment (the logo's cyan halo, the profile card's colored shadow, the Settlement Offer card's diagonal light-sweep) became a soft tint or shadow instead, since a glow effect that reads as *light emitting from a dark surface* has no equivalent on a white one — a literal color-swap without touching those rules would have looked broken, not just lighter. Semantic colors (NPA-age red, amber P&L/badges, green/red settlement impact) all got darkened by the same logic — direct light-on-dark values fail contrast on white, so each was individually picked to hold up against `#FFFFFF` rather than mechanically inverted.

Verified via Playwright against the same two real scenarios already covered (Premvati's single-account card, and the Settlement Offer state with an OTS Amount entered): both render with correct contrast, the real bank logo and "Regional Office Hathras" line both still legible, the Recovery/Sacrifice gauge and every semantic color readable against white. Both share paths and the share menu unaffected; full regression clean.

Files touched: `css/styles.css` (`.wa-card*` recolored), `sw.js` (`CACHE_NAME` v145→v146, matching bump).

### Redesign: share card rebuilt in Alok's own cyan reference style, with a Recovery gauge, real bank logo, and Regional Office Hathras (2026-08-29, same day)

Alok sent an AI-generated (Nano Banana) mockup of a mobile banking screen — cyan-glow bordered cards, a profile row, two headline stat cards, an account-breakdown grid, and a highlighted "Settlement Offer" callout with a bottom tab bar. Asked for "kuch is tarah redesign karo... apna improvisation kar lena" (redesign somewhat like this, use your own judgment). Adapted rather than copied: dropped ROI/repay-date (a live-loan concept, not an NPA settlement one) for Scheme + Asset Code; dropped the bell icon and bottom tab bar (a static shared image isn't a navigable app); dropped the fabricated "Valid till" date and an untappable "View Details" button; kept Manrope + Inter (tabular, zero-safe) rather than switching to match the reference's generic sans, since that pairing was already approved for this whole app.

Two rounds of "dil mange more" follow-up before implementing: (1) added icons on every stat/section label, a Recovery vs. Sacrifice gauge in the Settlement Offer card — borrowed directly from the live Loan Detail screen's own "Recovery Scale" component, so the card echoes an existing pattern instead of inventing a new one — an NPA-age pill, a seal-ring watermark, dot-grid texture, and a light sweep across the offer card; (2) caught that the 2-column account grid would leave half the card empty for a single-loan customer, so single-account cases get a dedicated full-width layout (O/S and P&L side by side instead of stacked) — verified against Premvati's real single-account data before shipping.

**Implementation**: `.wa-card` in `css/styles.css` fully replaced (navy/gold → the cyan-glow palette: `#060B14` base, `#2DD4CF` cyan accent, layered `.wa-bg-glow`/`.wa-bg-dots`/`.wa-seal-wm` background). `renderShareCard()` in `js/app.js` rebuilt around the same live `slots`/`custRow` data as before, plus: `waInitials()` for the avatar circle, `s.scheme` now shown per account, an NPA-age-in-years pill (`(Date.now()-earliestNpa)/365.25`), and the Recovery/Sacrifice gauge math (`recoveryPct = totalOtsSum/osOfOtsAccts*100`, same partial-settlement convention — only accounts with an actual OTS figure count toward the denominator).

**Bank logo + branch, on request**: rather than duplicating the ~98 KB base64 logo already embedded in `index.html`'s `.nav-logo` image, `renderShareCard()` reads it live via `document.querySelector('.nav-logo')?.src` — single source of truth, no asset bloat in `app.js`. Added "Regional Office Hathras" as a subtitle under the bank name in the card header, matching the wording already used in the print sheet and Excel export elsewhere in this app.

Verified via Playwright against real accounts: single-account layout (Premvati, Bati branch) renders the full-width card correctly with the real logo and "Regional Office Hathras" both visible; entering an OTS Amount via the actual `otsInput-0` field correctly surfaces the Settlement Offer card with a working Recovery/Sacrifice gauge (73.9%/26.1% against real figures); both share paths (`shareOtsPdf`/`shareOtsImage`) and the share menu still work; full regression clean, zero console errors.

Files touched: `css/styles.css` (`.wa-card*` fully replaced), `js/app.js` (`renderShareCard`, `waInitials`, `WA_ICON_*`), `sw.js` (`CACHE_NAME` v144→v145, matching bump).

### Refinement: share card swaps Dues for O/S, and shows OTS Amount + P&L Impact once a settlement's proposed (2026-08-29, same day)

Three more rounds of feedback on the just-shipped summary-image card. First: trim the share menu's subtitles down to plain "Full PDF" / "Summary Image" headings. Second: add a Total P&L line alongside Total Dues. Third, this round: "use O/S in card everywhere, not total dues" — every per-account "Dues" figure and the bottom bar's "Total Dues" now read O/S (`s.os` / `totalOS`) instead of `totalDuesFor()`; the hero was already "Total O/S Balance" and stayed as-is.

Also added the conditional half of the ask: **if an OTS Amount has actually been typed in for an account, show it with its P&L Impact too.** Per account, `renderShareCard()` now checks `parseOtsAmount(otsAmounts[s.acctNo])` (same helper `renderPrintView()` already uses) — when it's set, a dashed-divider sub-row appears under that account's O/S/P&L showing OTS Amount and P&L Impact (`ots - totalPL`, with the same ▲/▼ arrow convention as the patti's own "Impact on P&L" row). The bottom gold bar swaps too: with no OTS Amount anywhere, it's a single "Total P&L" line (unchanged from the previous round); once at least one account has a figure, it becomes "Total OTS Amount" + "Total P&L Impact" instead — summed only over the accounts that actually have a figure, same partial-settlement convention `renderPrintView()`'s own aggregate totals already use, so an undecided account is never silently counted as zero.

Verified via Playwright against both states on real account data: no-OTS case renders O/S + a single Total P&L bar; typing an OTS Amount into `otsInput-0` (the same input the real Loan Accounts table uses) correctly surfaces the per-account OTS/Impact row and switches the bottom bar to Total OTS Amount + Total P&L Impact, arrow and all. Full regression clean.

Files touched: `js/app.js` (`renderShareCard`), `css/styles.css` (`.wa-ots-row`), `sw.js` (`CACHE_NAME` v143→v144, matching bump).

### Feature: WhatsApp share gets a second option — a mobile summary image, alongside the full PDF (2026-08-29, same day)

Immediately after the PDF-based WhatsApp share shipped, Alok asked for a mobile-shaped version instead: "eye catching, big fonts, summary and limited data." Mockup-first again — 3 Artifact concepts (Hero Stat / Settlement Ticket / Snapshot Tiles) with Sahdev Singh's real figures, presented in phone-frame previews. He picked the Hero Stat direction, then specified the exact field set he wanted on it (name, branch, Total O/S, account-wise Dues, NPA date, Total Dues, P&L), then asked to also add Asset Code per account. Built a second mockup matching that exact spec and got the go-ahead ("done ye image main share ho jaye") — then, before implementation, he asked for both the full PDF and the new image to stay available rather than one replacing the other.

**`renderShareCard()`** (`js/app.js`) builds the approved card into a new `#shareCardArea` (`index.html`, `display:none` by default, same convention as `#printArea`) from live `slots`/`custRow` data — no hardcoded mockup values. Reused the print sheet's own `totalDuesFor()`/`fmtINR2()`/`fmtDate()` helpers rather than re-deriving anything. Loops `slots` for the per-account cards (Dues, P&L with %, Asset Code) so it scales to however many accounts are actually linked, not just the 2 in the mockup; the header's "NPA since" date uses the earliest date across linked accounts, since two accounts under one customer aren't guaranteed to have slipped into NPA on the same day. **`css/styles.css`** adds the card's own `.wa-card` styles — fixed navy/gold palette regardless of the viewer's theme (same reasoning as `#printArea`'s literal white paper: these are the actual pixels that get shared, not themed app chrome), Manrope for labels, Inter with tabular-nums + the same zero-safety `font-feature-settings` used everywhere else in this app that shows money.

**Choice, not replacement**: refactored the original PDF-sharing code into `shareOtsPdf()` (unchanged behavior) and added `shareOtsImage()` (same html2canvas capture, but `canvas.toBlob('image/png')` instead of the jsPDF pipeline, since there's no multi-page/vector need for a single fixed-size card). Both now go through a shared `shareFileOrFallback(blob, fileName, mimeType, shareText)` helper (deduplicates the `navigator.canShare({files})` / `navigator.share()` / download+`wa.me` fallback logic that used to live only in the PDF function). The WhatsApp toolbar button's `onclick` no longer shares directly — `toggleShareOtsMenu(event)` opens a small anchored popover ("Full PDF — the complete patti" / "Summary Image — name, O/S, dues, P&L") built and torn down on demand, positioned against the clicked button's own rect (works from either the desktop or mobile copy of the button), dismissed by a single outside-click listener registered with `{once:true}`.

Verified via Playwright: the popover opens with both options and closes on outside click; `shareOtsImage()` produces a valid ~130 KB PNG through the real fallback path, correctly bound to live data (tested against a different real account than the mockup — header, hero O/S, per-account Dues/P&L, Asset Code, Total Dues all populated correctly, zero glyphs render clean); `shareOtsPdf()` still works unchanged after the refactor. Full regression across every view: zero console errors, zero failed requests.

Files touched: `index.html` (`#shareCardArea`, cache-bust bump), `js/app.js` (`renderShareCard`, `shareOtsImage`, `shareFileOrFallback`, `toggleShareOtsMenu`; `shareOtsOnWhatsApp` renamed `shareOtsPdf`), `css/styles.css` (`.wa-card*`, `.share-ots-menu`), `sw.js` (`CACHE_NAME` v141→v142, matching bump).

### Feature: OTS patti (print/PDF sheet) redesigned to Manrope + Inter, plus a direct WhatsApp share button (2026-08-29)

Alok uploaded a real patti PDF (Sahdev Singh's, from Jajan Patti branch) and asked for "clean fonts" on it, with mockups first. The sheet's current typography — Archivo for headers/labels, IBM Plex Mono for every number — was the plain typewriter look he wanted redesigned. Built two mockup options as an Artifact (interactive tab toggle, Sahdev Singh's real figures, exact production layout preserved) rather than guessing: **Option A** (Inter everywhere, varied by weight) and **Option B** (Manrope for the title/labels/headers, Inter for every figure). Alok picked **Option B**.

**Implemented in `css/styles.css`** (`.pv-*` rules, `#printArea`): swapped every `'Archivo'` reference to `'Manrope'` (title, borrower name, meta, table labels/headers, aggregate title — both already self-hosted in this file, no new font embed needed) and every `'IBM Plex Mono'` reference to `'Inter'` (info-grid values, every table figure, aggregate row values), adding `font-variant-numeric:tabular-nums` and the same `font-feature-settings:"zero" 0,"ss01" 0,"ss02" 0,"ss03" 0,"ss04" 0` zero-safety reset already locked in for the on-screen OTS Calculator — a printed `0` can't render slashed either. Existing weight hierarchy (info-grid values bold, plain table rows unweighted, `.pv-strong` rows bold) left untouched; only the font families changed, per the actual request. IBM Plex Mono's `@font-face` blocks are now fully unused (nothing left references them) but were left in place — not part of what was asked, unlike the Bank Dashboard's PDF.js removal below.

**New feature, same message**: Alok also asked for a button that shares the patti PDF straight to WhatsApp on tap. Added a third `.share-btn` (chat-bubble icon) next to the existing Excel-export and Print/Share buttons in the OTS Calculator's detail-pane header. `shareOtsOnWhatsApp()` in `js/app.js`: calls the existing `renderPrintView()`, briefly floats `#printArea` on-screen at `left:-9999px` (it's `display:none` outside `@media print`, so `html2canvas` — which renders the live DOM, not a print simulation — would otherwise capture nothing), waits on `document.fonts.ready` so Manrope/Inter are actually loaded before the capture, rasterizes it with `html2canvas`, then builds a real PDF client-side with `jsPDF` (`canvasToPdfBlob()` — slices the canvas into page-height strips for the rare settlement tall enough to need more than one A4 page, though with today's fixed 16-row table only account count — which affects width, not height — varies, so this is a defensive path more than a currently-exercised one). The resulting file is handed to `navigator.share({files:[file]})` when `navigator.canShare({files})` says the browser supports it (Android Chrome, iOS Safari 15+) — the OS's own native share sheet opens with WhatsApp sitting right there, one tap away; no web API can skip straight past that sheet into one specific third-party app, so "direct" here means the closest a website can get. Where file-sharing isn't supported (every desktop browser today) it falls back to downloading the PDF and opening a `wa.me` compose window with the message pre-filled, telling the user to attach the file themselves — stated plainly rather than pretending the file went along automatically.

Caught one real bug during testing: `jsPDF.addImage(canvas, 'PNG', ...)` handed the live `HTMLCanvasElement` embeds essentially uncompressed pixel data (~9.6 MB for one plain single-page sheet — exactly `width×height×4` bytes) instead of an actual compressed PNG. Fixed two ways, confirmed via a byte-identical before/after test: pass `canvas.toDataURL('image/png')` instead of the raw canvas (so jsPDF has real PNG bytes to parse), and pass `{compress:true}` to the `jsPDF` constructor (turns on FlateDecode stream compression, which is what actually did the heavy lifting — dropped the same sheet to ~186 KB). Verified by saving and rendering the actual generated PDF: correct Manrope/Inter typography, single page, no visible artifacts, clean `0` glyphs.

Vendored `js/vendor/html2canvas.min.js` (v1.4.1) and `js/vendor/jspdf.umd.min.js` (v2.5.1), both MIT-licensed, from cdnjs — self-hosted the same way every other vendor library in this app is, loaded before `app.js`. Deliberately **not** added to `sw.js`'s `SHELL_ASSETS` precache list, same reasoning as the removed `pdf.worker.min.js`: most sessions never tap Share, so the runtime fetch handler caches them normally the first time someone does rather than forcing the download on every load.

Files touched: `css/styles.css`, `js/app.js`, `index.html` (2 new `<script>` tags, cache-bust bump), `sw.js` (`CACHE_NAME` v140→v141, matching bump), `js/vendor/html2canvas.min.js` (new), `js/vendor/jspdf.umd.min.js` (new). Verified via Playwright: correct computed `font-family` on every `.pv-*` element, zero console errors across the full app, the real button click produces a valid, correctly-typeset, ~186 KB single-page PDF through the actual fallback code path (headless Chromium has no `navigator.share`, so this exercises the download+`wa.me` branch specifically).

### Removed: "Bank Dashboard" tab, permanently (2026-08-24)

Alok uploaded a fresh whole-bank "Dashboard of NPA" PDF (`NPA_DASHBOARD_23.08.2026.pdf`) and asked "ab ismain kya issue hai" (what's the issue in this). Investigated properly rather than guessing:

1. **Upload/parsing path**: drove the real `#bankPdfFileInput` → `handleBankPdfUpload()` → `parseBankPdf()` flow end-to-end with the actual file — parsed cleanly, 65/65 regions, 3/3 circle subtotals, grand total, zero warnings, zero console errors.
2. **Checksum validation**: summed every region's 18 numeric fields per circle and compared against that circle's own "Sub Total" row, and summed the three circle subtotals against the "Total UPGB" grand total — every additive column reconciled exactly (the only reported "mismatches" were the 3 percentage columns, which are never supposed to sum — expected, not a defect).
3. **HATHRAS and the grand total**: already matched what was live in `data/bank-npa.json` figure-for-figure (Alok had evidently already published this exact file through the live production app before asking).
4. **Genuine finding**: no code bug at all — the actual story in the data was BADAUN, the one region moving the wrong direction (NPA rising from ₹494.70 Cr at Mar-26 to ₹521.85 Cr now, the only large positive `netReductionOverMar26` in the whole bank at +₹27.15 Cr vs. the next-worst region's +₹2.51 Cr, and the single largest `gapFromTarget` of all 65 regions at ₹51.90 Cr — more than double the next-worst).
5. Alok then asked whether something from "hamari main sheet" (his master Excel) hadn't made it into the upload. Checked: the PDF's own Excel-derived column-letter row (`A B D F G H I J K L M N O P Q R S T U`) skips letters C and E — meaning the master sheet has 2 columns that were never printed into this PDF export at all, so nothing was dropped by the app; those columns simply never reached it. `BANK_PDF_FIELD_NAMES` (18 fields) has been stable since this parser shipped, so this wasn't new to this file.

Asked Alok directly what "hata do" (remove it) meant, since neither finding was a fixable bug — his answer: **"BANK DASHBOARD KO COMPLETLY HATA DO APP SE"** (remove the Bank Dashboard tab completely from the app), adding "mujhe jyada tension nahi chahiye roz roz ki" (don't want this daily tension). Treated as the same kind of genuine, permanent deletion as the earlier PNPA Reports/KCC Renewal removal (2026-08-19) — not a hide-behind-a-comment like the still-dormant "Daily PNPA" nav button.

**Removed entirely**: the nav buttons (side nav + bottom nav), the `#viewBank` section and `#bankDashboardArea`, the Update Data modal's "Bank-wide NPA Dashboard (PDF)" upload block, and every JS symbol behind it — `BANK_DATA`, `fmtBankCr`/`fmtBankPct`, `bankRegionFilter`/`bankMarchFilter`/`bankTargetFilter`, `bankTabInfo`, `bankCornerGapLine`/`bankCornerStats`, `BANK_PDF_FIELD_NAMES`, `BANK_REGION_CIRCLE`, `bankPdfToNum`/`bankPdfFields`/`bankPdfSumRegions`/`bankPdfClusterRows`, `parseBankPdf`, `handleBankPdfUpload`, `renderBankDashboard`/`renderBankDashboardBody`/`bankRegionRank`, `buildBankHistoryFiles`, plus every wiring point in `pendingUnpublishedLabel()`, `openPublishReview()`, `confirmPublish()`, `switchView()`, and `wireChrome()`. CSS: dropped `.circle-card*`, `.bank-npa-pill`, `.dash-table tr.is-ours/.is-our-circle`, the dead `.target-chip*` rules, and `#viewBank` from the shared selector — kept `.bank-hero-row`/`.bank-filter-row`/`.bank-tab-row`/`.bank-tab-btn`, which PNPA and KCC Overdue still use. Data: deleted `data/bank-npa.json` and the entire `data/bank-history/` snapshot directory (10 files). Also dropped `js/vendor/pdf.min.js` + `pdf.worker.min.js` (~1.4 MB) and their `<script>`/precache entries, since `parseBankPdf` was PDF.js's only consumer in this app and nothing else touches `pdfjsLib`.

Verified via Playwright: 0 `[data-view="bank"]` elements, `#viewBank`/`#bankPdfUploadDetails` both absent, all other views (Dashboard/PNPA/KCC Overdue/Search) still switch cleanly, OTS Calculator detail pane still opens, no failed network requests (no stray 404s on the deleted PDF.js/data files), zero console errors. Cache-bust bumped (`index.html` 8× `?v=20260819a`→`?v=20260824a`, `sw.js` `CACHE_NAME` v139→v140 + matching 8 `?v=` bumps). Files touched: `index.html`, `js/app.js`, `css/styles.css`, `sw.js`, `data/bank-npa.json` (deleted), `data/bank-history/*` (deleted), `js/vendor/pdf.min.js` + `pdf.worker.min.js` (deleted).

### Design: OTS Calculator's rupee/percentage figures switched to Inter (thinner weight), with an explicit no-slashed-zero guarantee (2026-08-19, same day)

Alok's brief: "ultra-thin, sharp and minimalist typography" for every financial figure, but with one hard line — no slashed, dotted, or otherwise marked zero, since a slashed `0` on a small mobile screen risks being misread as `/` or a stray mark, and this is a live NPA/settlement figure app where misreading a zero is a real-money mistake. Simplified on follow-up to: "inter font ka thinner and zero without slash wala... in OTS calculator specially."

Chose Inter over sticking with the reskin's existing IBM Plex Mono for two reasons: it reads thinner/sharper at the same weight (the geometric, minimalist look asked for), and — checked directly against the font's own GSUB table before committing to it — Inter has **no OpenType "zero" feature at all**, so there is no slashed-zero glyph anywhere in the font for any feature combination to accidentally trigger; its default `0` is a plain closed oval. Downloaded the actual variable-weight woff2 Google Fonts serves for Inter (one file spans the full 100-900 weight axis — confirmed via `fontTools`), embedded it self-hosted (same convention as Manrope/Archivo/IBM Plex Mono already in this file, base64 in the stylesheet, no runtime Google Fonts dependency for the offline-first PWA) at `font-weight: 100 900`.

Scope: the three places OTS Calculator figures actually live, none of them sharing a common DOM ancestor — `#detailPane` (loan table, aggregate sidebar, already had its own `--font-mono` override from the brass/paper reskin), `.ots-start` (recent-searches rupee/OTS amounts on the pre-search landing screen), and `.ws-modal` (the OTS Worksheet). Re-pointed `--font-mono` to Inter in all three, and — belt-and-braces on top of Inter's own guarantee — added an explicit `font-variant-numeric:normal;font-feature-settings:"zero" 0,"ss01" 0,"ss02" 0,"ss03" 0,"ss04" 0;` reset in each scope, so a future font swap can't silently reintroduce a slashed zero without someone having to deliberately remove this line first.

Also dropped the heavy `font-weight:800`/`700` on every actual numeric-figure rule in these three scopes (loan table cells, the OTS input, P&L impact cells, aggregate sidebar hero/mini values, worksheet summary/table values, start-screen recent-search amounts — 12 rules total) to `500`, since Inter is a true variable font and any exact weight is valid, not just the usual 400/700 steps; landed on 500 as the calibrated middle ground between "ultra-thin" and Alok's own explicit mobile-legibility requirement, rather than going to a genuinely thin 200-300 that risks being hard to read at small sizes with commas and decimals. Left the OTS print/PDF sheet's IBM Plex Mono untouched — print styles reference that font-family literally rather than through `--font-mono`, and the brief was about on-screen typography.

Verified: computed `font-family`/`font-weight` on live elements in all three scopes (detail pane loan table, worksheet modal) — Inter, weight 500, confirmed via Playwright; screenshotted the detail pane and worksheet in both themes — figures read visibly thinner and sharper, every `0` a clean closed oval with no slash/dot; full regression across Dashboard/Bank/KCC Overdue/Search — zero console errors.

Files: `css/styles.css` (new self-hosted Inter @font-face; `--font-mono` repointed in `#detailPane`/`.ots-start`/`.ws-modal`; explicit zero-feature reset in the same three scopes; 12 font-weight rules dropped from 700/800 to 500). Cache-bust `v=20260819a`, SW `upgb-ots-shell-v139`.

### Removed: "PNPA Reports" and "KCC Renewal & Rollover" tabs, permanently (2026-08-19)

Shipped the day before (see the "Feature" entry directly below), Alok tried the feature live — he even published a fresh Daily PNPA update through it (commit `0be6da3`, 19-08-2026) — then asked for both tabs gone for good: "ye dono reports hata hi do permanent executives ko ab app jyada bhari bhari lag rahe hai aur ye data bekar" (remove both permanently, the app feels too heavy for executives now and this data isn't useful). Unlike the earlier "Daily PNPA" tab (hidden via a commented-out nav button, code kept for future reactivation — see the Refresh-button fix entry below), "permanent" here meant a real deletion, not a hide: removed both nav entries (side nav + bottom nav), both view sections, all six upload sections from the Update Data modal, the entire six-report data/render/parse/upload code block from `js/app.js` (~700 lines: `renderRegionTable()`, the six PDF parsers, the six upload handlers, and their wiring into `switchView()`/`pendingUnpublishedLabel()`/`openPublishReview()`/`confirmPublish()`/`wireChrome()`), the `.rt-*` CSS block, and all six `data/*.json` files (including the one Alok had just re-published, since the whole report is gone, not just stale).

Verified nothing else referenced any of it (`grep` for every symbol/id introduced by the previous entry came back empty in all three files) and ran a full regression across every remaining view (Dashboard/Bank/KCC Overdue/Search) plus the OTS Calculator detail pane — zero console errors, bottom nav back to exactly the original 4 tabs (Dashboard/Bank/Overdue/Search).

One git wrinkle worth noting for future reference: Alok's own publish (`0be6da3`) landed on `main` one commit ahead of what this reversion was built on top of, touching the very file (`data/pnpa-daily.json`) this reversion deletes — `git stash` + fast-forward + `stash pop` hit the expected modify/delete conflict, resolved by keeping the deletion (the whole file is going away regardless of its latest content).

Files: `js/app.js`, `index.html`, `css/styles.css` (all reverted to their pre-feature state); `data/pnpa-daily.json`, `data/pnpa-weekly.json`, `data/pnpa-monthly.json`, `data/rct-efficiency.json`, `data/kcc-renewal.json`, `data/kcc-rollover.json` (deleted). Cache-bust `v=20260818j`, SW `upgb-ots-shell-v138`.

### Feature: two new tabs — "PNPA Reports" (Daily/Weekly/Monthly/RCT Efficiency) and "KCC Renewal & Rollover" — six independently-published Head Office region reports, mocked up and approved before implementation (2026-08-18, same day) — REMOVED THE NEXT DAY, see the reversal entry directly above

Alok sent six PDFs he receives from Head Office that the app didn't yet have anywhere to put: Daily PNPA, Weekly PNPA, Monthly PNPA Reduction Progress, RCT Framework Efficiency, KCC Renewal Progress, and Region-wise KCC Rollover Progress — all region-wise (65 regions), none of them the same shape as the existing Daily PNPA (Hathras-only, account-level) or Bank Dashboard (single bank-wide snapshot) tabs already in the app.

Followed the project's mockup-first convention: built an interactive HTML mockup (two phone-frame panels, real data from the PDFs, clickable sub-tabs) and got explicit sign-off on the navigation shape before writing any app code. First round of feedback: keep Daily/Weekly/Monthly/RCT as genuinely separate views rather than a merged period-toggle, and put KCC Renewal + Rollover in their own new tab. Second round: "data sara wahi aana chahiye jitna pdf main columns hain and han sari headings main sort filter bhi and hathras sab main highlight" (every PDF column must appear, sort+filter on every heading, Hathras highlighted everywhere) — the first mockup had trimmed columns for brevity; the second one carried the PDFs' full grouped-header shape (up to 22 columns for Monthly), added click-to-sort + filter icons on every column, and a gold-outlined "pin" highlight on the Hathras row in all six tables. Approved, then: "ye jaruri nahi hai ki daily sari files ek sath upload ho payenge kabhi koi hogi kabhi sari" (not all six will always arrive together) — confirmed each of the six needed fully independent staging/publish, not bundled.

**Data layer**: transcribed all 65 regions × 6 reports from the source PDFs into `data/pnpa-daily.json`, `pnpa-weekly.json`, `pnpa-monthly.json`, `rct-efficiency.json`, `kcc-renewal.json`, `kcc-rollover.json`, each cross-checked programmatically against the PDF's own area-subtotal and grand-total rows (a Python script summed every field per region and diffed against the printed totals) before shipping — caught one real source-PDF defect this way: Weekly PNPA's Thakurdwara row had its Total A/c and Total Amt merged into a single token ("2.46") by whatever produced the PDF; recovered the true value (496) algebraically from the area subtotal's shortfall rather than guessing.

**UI**: one generic `renderRegionTable()` component (in `js/app.js`) renders all six tables — 2-row grouped headers matching the PDFs' own column groups, per-column click-to-sort (reusing the existing `applySort`/`nextSort` helpers already used by the account-list tables) plus a per-column text-filter row toggled by a funnel icon, a pinned Grand Total row, and Hathras always shown with a gold left-border + pin icon regardless of where it sorts to. "PNPA Reports" is one new nav entry with four pill-switched sub-tabs (Daily/Weekly/Monthly/RCT Efficiency) rather than four separate nav icons, keeping the bottom nav at 6 tabs total (Dashboard/Bank/Overdue/PNPA Reports/KCC Renewal/Search) instead of growing past what M49 deliberately trimmed it to. "KCC Renewal & Rollover" is a second new nav entry with two stacked sections.

**PDF parsers** (for future uploads, one per report, in `js/app.js`): reused the exact text-clustering technique already proven in `parseBankPdf()`/`bankPdfClusterRows()` — extract PDF.js text items, cluster by Y-coordinate into rows, split by known field count. Built and ran a Node/Playwright harness that fed the real uploaded PDFs through the new parsers and diffed every field against the hand-verified JSON as ground truth, which caught two real bugs before they could ship: (1) the PDFs' rotated left-margin area label ("GORAKHPUR"/"LUCKNOW"/"MORADABAD", printed sideways down the page edge) occasionally lands within the row-clustering tolerance of one specific data row's Y-coordinate, silently prepending a stray token ahead of that row's S.No and dropping the row entirely — fixed by detecting and stripping the stray label; (2) KCC Renewal's grand-total row has no trailing "rank" value (meaningless for a sum), one field shorter than every region row, so slicing the numeric fields from the *end* of the row (as region rows correctly do) shifted every field left by one and silently swallowed the branches count into the first field — fixed by slicing grand-total rows from the front instead, padding the missing trailing field with null. After both fixes: 5 of 6 parsers match all 65 regions exactly against the hand-verified JSON; the sixth (Weekly) matches 64 of 65, missing only the one row with the genuine merged-token defect in that specific source PDF — the parser now surfaces a visible warning ("Parsed 64 of 65 regions...") rather than silently publishing incomplete data.

**Independent publish**: each of the six gets its own upload section in the Update Data modal (`data/pnpa-daily.json` through `data/kcc-rollover.json`), staged in its own `__pending*` variable, included in `extraFiles` for the commit only when actually present — verified end-to-end via Playwright by uploading only 3 of the 6 real PDFs and confirming the Publish review panel lists exactly those 3 as "Included" (not all 6), proving genuine independence. Also wired into the existing `pendingUnpublishedLabel()` beforeunload guard and `clearStalePublishStatus()` pattern, same as every other upload type in this app.

**Bugs found and fixed during this build, beyond the two parser bugs above**:
- My own `fmtCr()` silently redefined the *existing* `fmtCr()` (rupee amounts, auto-scaling to ₹X.XX Cr/L) with completely different semantics (plain 2-decimal Cr-denominated numbers, no ₹, no scaling) — since `function` redeclarations in the same scope silently let the later one win, this would have broken all 38 existing call-sites across Bank Dashboard, OTS Calculator, etc. the moment this file loaded. Caught before shipping by grepping for existing usages; renamed mine to `fmtRTCr`.
- The six datasets store `asOnDate` as plain ISO (`2026-08-18`) but the app's shared `toDate()` only accepts `DD-MM-YYYY` or Excel serials, so every "as on" date on the new tabs and in the Publish review silently rendered as an em-dash. Added a small `isoToDate()` helper scoped to just these six datasets rather than widening `toDate()` itself (used in dozens of other places) and risking an unrelated regression.
- The Grand Total row's `position:sticky;bottom:0` visually overlapped the last data row mid-scroll instead of cleanly pinning to the bottom of the scroll container — dropped the sticky positioning; it now sits as a normal (still visually distinct, gold) final row.
- The six new Publish-review labels initially showed the raw ISO date ("as on 2026-08-18") rather than `DD-MM-YYYY`, violating this file's own date-format rule — fixed to route through `fmtDate(isoToDate(...))` like every other date in the app.

Verified: full regression across all six existing views (Dashboard/Bank/KCC Overdue/PNPA Reports/KCC Renewal/Search) plus the OTS Calculator detail pane — zero console errors, confirming the `fmtCr` rename didn't disturb any of its 38 existing call-sites. Both themes screenshotted for the two new tabs.

Files: `data/pnpa-daily.json`, `data/pnpa-weekly.json`, `data/pnpa-monthly.json`, `data/rct-efficiency.json`, `data/kcc-renewal.json`, `data/kcc-rollover.json` (new); `js/app.js` (generic region-table renderer, 6 PDF parsers, 6 upload handlers, publish-review/confirm wiring, ~750 lines); `css/styles.css` (`.rt-*` region-table styles); `index.html` (2 new nav entries × 2 (side+bottom nav), 2 new view sections, 6 new upload sections in the Update Data modal). Cache-bust `v=20260818i`, SW `upgb-ots-shell-v137`.

### Fix: detail pane on wide desktop monitors left a large empty gutter on both sides instead of using the available width (2026-08-18, same day)

Once the aggregate-sidebar wrap fix above shipped, Alok could finally see the full "This Account" detail pane clearly on his screen for the first time -- and immediately spotted the next problem: "ismain left and right main area empty hai ise bhi to use karo thoda stretch lar lo" (there's empty space on the left and right here too, use that too, stretch it out a bit). On a real desktop monitor (1920px), the whole content column -- header row, sidebar, loan table -- was capped at `max-width:1500px` and centered, leaving a wide grey band on both edges.

This is the one screen in the app where extra width is genuinely useful rather than just tolerable: a multi-account borrower's loan table lays every linked account out side-by-side as columns, so more width directly means fewer columns forced into horizontal scroll.

Fix: raised `#detailPane .detail-inner`'s `max-width` from 1500px to 1800px (`@media (min-width:1200px)`). `.detail-headrow` needed its own explicit `max-width:1800px` override in the same block -- it shares a lower 1500px cap with unrelated header rows on other (non-detail) views via a generic selector list, so overriding it there directly (rather than touching the shared rule) keeps the title row's edges aligned with the sidebar/table below it without affecting any other screen.

Verified against the real 3-account borrower from the screenshot (PREMVATI W/O PREMSHYAM, Cust ID 710257339) at a 1920px viewport in both themes: `.detail-inner` now measures 1800px wide (up from 1500px) with symmetric ~60px side margins instead of the earlier wide gutter, and `.detail-headrow`'s edges line up exactly with the sidebar/table below it. All rupee figures still render whole on one line (confirming the earlier aggBar fix is unaffected).

Files: `css/styles.css` (`#detailPane .detail-inner` max-width, new `#detailPane .detail-headrow` max-width override). Cache-bust `v=20260818h`, SW `upgb-ots-shell-v136`.

### Fix: aggregate sidebar figures still wrapped after the comma-<wbr> fix -- widened the sidebar and dropped the mini-grid to one column so every figure fits on a single line (2026-08-18, same day)

Immediately after the comma-<wbr> fix below shipped, Alok sent the exact same "This Account" screenshot again -- and every figure was now wrapping after a comma ("+₹3," / "156.09", "₹1,30," / "000.00", "₹1,81," / "205.58"...) instead of not wrapping at all. He was explicit: every number should read whole on one line, "chahe to row k no. bhada lo width aur bhada lo" (even if it means more rows or more width). The comma fix had done its one job -- no more mid-digit/mid-decimal breaks -- but hadn't addressed the actual complaint, which was that the sidebar was simply too narrow for these figures at any font size reasonable for a summary panel.

Found the exact account from the screenshot in the real data (O/S ₹1,81,205.58 matched `custId 103144990`, LATE LILAVATI W/O LAKHAMI) to reproduce and verify against precisely, rather than approximate numbers.

Fix: `.detail-inner.has-agg #aggBar` widened from 260px (860px breakpoint) / 240px (1200px breakpoint, oddly *narrower* on bigger screens than the tablet breakpoint) to a flat 300px at both -- removing the paradox and giving real headroom. More importantly, `#aggBar .agg-mini-grid` dropped from a 2-column grid to a single column on desktop (`@media (min-width:860px)` only -- the mobile fixed-bottom-dock keeps its existing 2-column layout, where the compact footprint matters more and the figures there are already smaller/shorter in practice) -- each of the four mini stats (Total OTS/O/S/P&L/Sacrifice) now gets the sidebar's full width instead of half, roughly doubling the room per figure. `detailBody` (the loan table) keeps `flex:1;min-width:0`, so it simply absorbs the extra 40px rather than the sidebar and table competing for space.

Verified against the exact reproduced account/figures from the screenshot, in both themes: Net Settlement Impact (+₹3,156.09), Total OTS Amount (₹1,30,000.00), Total O/S Balance (₹1,81,205.58), Total P&L (₹1,26,843.91), Total Sacrifice (₹1,03,658.39) -- every one now renders whole on a single line, no wrapping at all. Also confirmed the wider sidebar doesn't visibly cramp the loan detail table next to it (screenshotted full width).

Files: `css/styles.css` (`.detail-inner.has-agg #aggBar` width, new `.detail-inner.has-agg #aggBar .agg-mini-grid` override). Cache-bust `v=20260818g`, SW `upgb-ots-shell-v135`.

### Fix: OTS Calculator's aggregate sidebar was breaking rupee figures mid-digit, not just at the decimal (2026-08-18, same day)

Alok sent a screenshot of the multi-account "Net Settlement Impact" sidebar: figures like "₹3,156.09" and "₹1,81,205.58" were splitting across two lines mid-number -- "₹3,156.0" then "09" on the next line, "₹1,81,205" then ".58" -- unreadable at a glance, which defeats the point of a summary figure.

Root cause, in `css/styles.css`: `.agg-hero-value`/`.agg-mini .v` both carried `word-break:break-word`, added deliberately in an earlier session specifically so a genuinely-too-long crore-level figure ("₹1,04,50,000.00") would wrap instead of silently clipping against the sidebar's `overflow:hidden`. But `break-word` has no concept of where a *number* is safe to split -- it breaks wherever the line runs out of room, which is exactly why it kept landing mid-decimal.

Fix: kept the deliberate-wrap approach (still needed for real crore figures in a ~110px-wide column) but gave the browser *sanctioned* break points instead of leaving it to guess. New `fmtINR2Wrap()` in `js/app.js` returns the same `fmtINR2()` string with a `<wbr>` inserted after the ₹ symbol and after every thousands/lakhs comma -- Indian-format grouping commas are natural digit-group boundaries, so any forced wrap now lands between whole groups ("₹13,17," / "683.01") instead of through one, and nothing after the *last* comma is ever a break candidate, so the final group + its decimal pair always stays intact together. A first attempt with a `<wbr>` only after ₹ wasn't enough by itself -- the remaining chunk ("13,17,683.01") could still be too wide alone, and still broke mid-digit past that first point; the fix only actually resolved it once every comma got its own `<wbr>`. The five aggregate-sidebar figures (`aggTotOts`, `aggTotNetOs`, `aggTotPL`, `aggTotSac`, `aggTotImpact`) now assign via `.innerHTML` with `fmtINR2Wrap()` instead of `.textContent` + plain `fmtINR2()` (the worksheet rail's own totals elsewhere on the page were left on the plain `fmtINR2()`/`.textContent` path -- that rail isn't cramped the same way and rendering raw `<wbr>` markup as text via `.textContent` would have shown up literally). Also tightened `.agg-mini .v` from 13.5px/-.2px to 12.5px/-.3px letter-spacing and reduced its padding slightly, so more real-world figures fit on one line before any wrap is even needed.

Verified against real multi-account data (a genuine 2-account borrower, ₹13.18 L combined O/S): every sidebar figure now wraps cleanly at a comma boundary in both themes, nothing splits mid-digit or mid-decimal, and a short figure ("₹0.00") stays on one line as before -- confirmed via `.innerHTML` inspection (`"₹<wbr>13,<wbr>17,<wbr>683.01"`) and side-by-side screenshots. `node -c` clean.

Files: `js/app.js` (`fmtINR2Wrap`, the five aggregate-sidebar value assignments), `css/styles.css` (`.agg-mini .v`). Cache-bust `v=20260818f`, SW `upgb-ots-shell-v134`.

### Redesign: Publish review panel now itemizes each dataset by name; version-history log no longer stamps a new "NPA data" entry on every KCC/PNPA/Bank-only publish (2026-08-18, same day)

Immediately after having to publish a KCC Overdue update manually (Alok was exhausted from the earlier debugging), he pointed out the deeper issue: every publish's commit message and version-history entry always says "Publish NPA data: X accounts, as on Y" — even when the actual NPA book hadn't changed at all and the publish was really just a KCC Overdue/Daily PNPA/Bank Dashboard upload going live. Confirmed against the real repo: every commit from that day's session read identically ("13,925 accounts, as on 2026-07-31"), regardless of what was actually new — pure noise cluttering the Version History list and actively misleading about what each entry represented. Asked which of three scopes to take on (label-only fix, label + skip no-op logging, or fully separate per-dataset histories); chose the middle option.

Root cause: `publishData()` in `js/publish.js` unconditionally created a brand-new `data/history/<date>-<ts>.json` snapshot and bumped `data/history/index.json` on every single call, with no check for whether `data/latest.json`'s content had actually changed from what's already live — and the commit message was a static string built once in `openPublishReview()`, with no way to reflect what a given publish action was really carrying.

Fix, in two layers:
- **`js/publish.js`**: `publishData()` now uploads the data blob first, then compares its sha against the *currently live* `data/latest.json`'s own blob sha (fetched directly via GitHub's Contents API, which returns a file's blob sha without downloading its content) — when they match, the NPA history snapshot step is skipped entirely, so a KCC/PNPA/Bank-only publish creates no orphan "version" entry. The commit message is now built from structured parts instead of a caller-supplied string: `meta.npaLabel` (only included when the NPA book actually changed) plus each `extraFiles[i].label` (Bank Dashboard/Daily PNPA/KCC Overdue, whichever are actually staged) — e.g. `Publish: KCC Overdue (8,667 accounts, as on 2026-08-18)` for a KCC-only publish, or `Publish: NPA data (13,925 accounts, as on 31-07-2026) + KCC Overdue (...)` when both genuinely changed together. Rollback keeps its own explicit message untouched. Returns `npaChanged` and the final `commitMessage` so the caller can display exactly what happened.
- **`js/app.js`**: `openPublishReview()` redesigned from five stacked plain-text lines into a small checklist (`publishReviewItemRow()`) — one row per dataset with its own icon, name, and detail (accounts/regions + as-on date). The NPA Book row is marked **"Checked automatically"** rather than a plain "Included" badge, since whether it earns a new history entry can only be known server-side at publish time (the blob-sha compare) — this is deliberately honest rather than a guess. Each staged extra dataset (Bank Dashboard/Daily PNPA/KCC Overdue) builds its own label, threaded through `confirmPublish()`'s `extraFiles` array and into the final success banner, which now shows `result.commitMessage` instead of a generic "✔ Published" line.

New CSS: `.publish-item-list`/`.publish-item`/`.publish-item-icon`/`.publish-item-badge` (token-driven, both themes), reusing `ICON_BANKNOTE`/`ICON_LANDMARK`/`ICON_ALERT_CIRCLE`/`ICON_TARGET` already established elsewhere in the app for NPA Book/Bank/PNPA/KCC respectively.

Verified: screenshotted the redesigned panel in both themes with a real KCC Overdue upload staged (icon rows render correctly, "Checked automatically" vs "Included" badges distinct). The GitHub API itself can't be exercised from this sandbox (no real OAuth token), so the sha-compare/message-building logic was extracted and unit-tested standalone against four scenarios: KCC-only publish with NPA unchanged (message omits "NPA data", tree has no `history/*` entries), NPA+KCC both changed (message includes both, tree has the history entries), rollback (untouched, exact message preserved), and the empty-fallback edge case — all four produced the expected output. `node -c` clean on both changed JS files.

Files: `js/publish.js` (`publishData`), `js/app.js` (`openPublishReview`, `publishReviewItemRow`, `confirmPublish`), `css/styles.css` (`.publish-item-*`). Cache-bust `v=20260818e`, SW `upgb-ots-shell-v133`.

### Fix: Refresh (and any page reload) could silently discard a staged-but-not-yet-published upload with zero warning (2026-08-18, same day)

Alok kept reporting "publish hui but data live nahi hai" even after the stale-banner fix above -- each time, checking the actual GitHub commit showed the same signature: a real, successful publish had gone through, but `data/kcc-overdue.json` simply wasn't in its tree (only `data/history/*` changed). `confirmPublish()`'s `extraFiles` logic was re-audited line by line again and is correct — it only ever fails to include a dataset when `__pendingKccOverdueData` (or the equivalent for PNPA/Bank/main NPA) is genuinely `null` at the moment Confirm is clicked. Grepping every assignment to that variable turns up exactly three: declared `null`, set on a successful upload, cleared to `null` after a successful publish. There is no fourth place that resets it in normal use — **except a full page reload**, which wipes all in-memory JS state including every one of these `__pending*` variables, with the browser giving no indication anything was lost.

That's the connection to the Refresh-button fix shipped earlier today: making Refresh always do `location.reload()` (correct, and still necessary, so Refresh reliably picks up newly shipped app code) also means Refresh now silently discards *any* staged-but-unpublished upload if it's clicked between "upload a file" and "hit Publish" — with no error, no warning, nothing to distinguish it from a normal refresh. Given Alok was actively testing Refresh throughout this same session (at points I myself suggested it, to pick up the Calendar feature), this is almost certainly what happened on at least one of the "published but KCC data missing" reports: upload → Refresh (out of habit, or to sanity-check something) → the reload silently wiped the staged file → Publish → a real, successful commit, just with nothing KCC-related left to include.

Fix: a `beforeunload` listener plus a new `pendingUnpublishedLabel()` helper that checks all four `__pending*` staging variables (main daily NPA upload not yet applied, Bank PDF, Daily PNPA, KCC Overdue). `beforeunload` is the safety net for every way the page can go away (F5, closing the tab, navigating off) where the browser only allows its own generic "leave site?" prompt, not custom text. The in-app Refresh button additionally calls `window.confirm()` first with wording that names exactly what would be lost (e.g. "You have unpublished data staged: the KCC Overdue upload. Refreshing will discard it -- Publish first if you want to keep it. Refresh anyway?") and only proceeds to `location.reload()` if confirmed — declining leaves the page and the staged upload untouched.

Verified via Playwright: uploading a real KCC Overdue file then clicking Refresh now shows the confirm dialog naming the KCC upload; declining leaves the upload status intact (re-checked via the DOM, no reload occurred); accepting reloads as before. Also confirmed no regression — clicking Refresh with nothing staged reloads immediately with no dialog, same as before this fix.

Files: `js/app.js` (`pendingUnpublishedLabel`, new `beforeunload` listener, `refreshCurrentView`). Cache-bust `v=20260818d`, SW `upgb-ots-shell-v132`.

### Fix: "Published" success banner stayed on screen after new data was staged, so a genuinely unpublished upload looked live (2026-08-18, same day)

Right after the Refresh-button fix above, Alok reported the live site showing ₹112-odd lakh of KCC slippage for 18-08 when his freshly-uploaded rollover file said ₹96 lakh — asking whether old data wasn't being cleared on publish. Checked `data/kcc-overdue.json`'s own git history: still untouched since the tab first shipped, `asOnDate` stuck at 12-08-2026 — his new file had genuinely never reached GitHub. He then said the publish "did happen, it showed [success]" and sent the actual file (`kcc_roll_over_16082026.xlsx`) to check.

Parsed that exact file two ways — a standalone Python cross-check and, more importantly, driving the app's own real upload input via Playwright — and both agreed: ₹96.32 L for 18-08-2026 CC004 (26 accounts, 16 branches), confirmed correct end to end including a fresh "8,715 accounts parsed, goes live the next time you hit Publish" from the real handler. So the file and the parser were never the problem. Alok then completed a publish and sent a screenshot with a real commit hash (`5a50699`) and a green "✔ Published" banner. `git show --stat 5a50699` on the actual repo showed it only touched `data/history/*` — no `data/kcc-overdue.json` at all, meaning the KCC data was excluded from that exact publish despite the success message sitting right there.

Root cause, once the DOM was checked directly (`index.html`): `#publishStatus` — the div that renders "✔ Published — live at ... (commit ...)" — is a **sibling** of `#publishReviewPanel`, not a child of it. `closePublishReview()` (called right after a successful `confirmPublish()`) only sets `publishReviewPanel.style.display='none'`; it never touches `publishStatus`. That success banner was then cleared **only** when `openPublishReview()` or `openRollbackReview()` ran again — never when new pending data got staged afterward (a KCC Overdue/Daily PNPA/Bank PDF/Branch Advance/Branch Contacts upload, or a fresh daily NPA Apply Update). So the exact sequence that happened: an earlier, unrelated publish left "✔ Published — commit 5a50699" sitting on screen; the new KCC rollover file was uploaded afterward, correctly parsed and staged (`__pendingKccOverdueData` set) — but the still-visible old banner looked like current confirmation, so "Confirm & Publish" for it may never have actually been pressed. Worth noting: `confirmPublish()`'s own logic for building `extraFiles` (the mechanism that includes `data/kcc-overdue.json`/`data/pnpa.json`/`data/bank-npa.json` in the same commit) was checked line-by-line and is correct — this was purely a stale-UI-feedback bug, not a data-loss or merge bug. There is also no "old data lingering" issue anywhere in this pipeline: every publish fully replaces each file's content (`extraFiles` content is the complete new dataset, never merged with what's already live).

Two fixes: (1) new `clearStalePublishStatus()` helper, called from all six places that stage new pending data (Branch Contacts, Branch Advance, daily NPA Apply Update, Bank PDF, Daily PNPA, KCC Overdue) — a leftover "Published" or "Publish failed" message can no longer be mistaken for feedback on data staged afterward. (2) `openPublishReview()`'s summary panel, which previously only ever mentioned the Bank Dashboard dataset (`__pendingBankData`) if pending, now also lists Daily PNPA and KCC Overdue by name and row count when pending — so "what's about to go live" is explicit every time, not just for the dataset that happened to get a summary line first.

Verified via Playwright: staged a fake "✔ Published" banner, uploaded the real KCC rollover file, confirmed the banner is now empty immediately after upload; opened the review panel and confirmed it now reads "KCC Overdue data will also update — 8,715 accounts, as on 2026-08-18" rather than staying silent about it. `node -c` clean.

Files: `js/app.js` (`clearStalePublishStatus`, `openPublishReview`, and its six call sites: `handleBranchContactsUpload`, `handleBranchAdvUpload`, `applyNewDataNow`, `handleBankPdfUpload`, `handlePnpaUpload`, `handleKccOverdueUpload`). Cache-bust `v=20260818c`, SW `upgb-ots-shell-v131`.

### Fix: Refresh button on Bank Dashboard/Daily PNPA/KCC Overdue silently never picked up new app code (2026-08-18, same day)

Right after the Datewise Calendar shipped above, Alok reported it "showing in mobile view but unable to find in browser." Confirmed the deployed GitHub Pages site itself was already serving the new code (fetched `js/app.js?v=20260818a` directly off the live site and found `renderKccOverdueCalendar` present) — so this wasn't a deploy problem, it was a client stuck on an old cached copy. Walked through the app's own Refresh button as the fix, but a follow-up screenshot showed the toggle still missing on desktop even after pressing it.

Root cause, in the consolidated Refresh button's handler (`refreshCurrentView`, wired in `wireChrome()`): it branched by active view — Dashboard/Search fell back to `location.reload()` (a real page reload, which re-fetches `index.html`/`app.js` through the service worker's network-first handler and therefore always picks up newly shipped code), but Bank Dashboard, Daily PNPA, and **KCC Overdue** instead called a per-tab helper (`refreshBankDashboard`/`refreshPnpaDashboard`/`refreshKccOverdue`) that only nulled out that tab's in-memory data object and re-rendered with whatever `app.js` was *already loaded in the browser*. A user sitting on the KCC Overdue tab with a stale cached `app.js` — exactly Alok's situation — could hit Refresh as many times as they liked and it would faithfully re-fetch `kcc-overdue.json` every time while never once re-evaluating the actual page, so a brand new feature in that same file could never appear. This was silent: the button spun, nothing errored, it looked like it worked.

Fix: `refreshCurrentView` now always calls `location.reload()`, for every view, full stop — Refresh means "get everything fresh," not "refresh data, except when it doesn't." The three now-dead per-tab helpers (`refreshBankDashboard`, `refreshPnpaDashboard`, `refreshKccOverdue`) were deleted rather than left unused, since nothing else referenced them.

Verified via Playwright: clicking Refresh from the KCC Overdue tab now triggers a real `load` navigation event (previously it did not), and the Datewise Calendar toggle is present immediately after — confirming a stale-`app.js` browser would now self-heal on the very next Refresh press instead of needing a manual hard-reload/cache-clear. `node -c` clean.

Files: `js/app.js` (`refreshCurrentView`, removed `refreshBankDashboard`/`refreshPnpaDashboard`/`refreshKccOverdue`). Cache-bust `v=20260818b`, SW `upgb-ots-shell-v130`.

### Feature: "Datewise Calendar" view added to the KCC Overdue tab — a Branch x Cust-NPA-Date slippage heatmap, built from data already on hand (2026-08-18)

Alok uploaded a Head Office MIS export, `PNPA_Calendar_.pdf` ("DATEWISE CALENDAR OF KCC PNPA IN THE MONTH OF AUG 2026") and asked for something similar built from the app's own KCC Overdue data, with an explicit instruction to show a mockup before building anything.

The PDF turned out to be a single embedded image (no extractable text — `pdfplumber` reported zero chars, one `DCTDecode` image), so it was rendered to a PNG and read visually: a matrix with branches as rows (sorted by monthly total, worst first) and specific dates-with-data as columns, each cell the KCC amount that became NPA at that branch on that date, with a Grand Total column and row. Cross-checked the concept against `KC.CUSTNPADATE` ("Cust NPA Date") in the already-shipped KCC Overdue data — grouping the real `data/kcc-overdue.json` by branch and day for August 2026 reproduced the PDF's own top branches (Pora, Eihan, Sasni, Ladpur, Ruheri, ...) and near-identical per-cell figures, confirming this field is exactly what drives HO's calendar. (`Cust NPA Date` is a forward-looking projected-classification date, not a historical one — some rows carry dates into 2027/2028 for accounts not yet stressed enough to need it sooner, which is why the calendar must always be scoped to a window rather than shown unfiltered.)

Two mockup rounds were built as standalone scratchpad HTML (screenshotted via Playwright, sent for review before touching the live app, per Alok's explicit instruction) — the second populated with the real 12-08-2026 KCC Overdue upload instead of synthetic numbers once the design direction firmed up. Alok's feedback on v2: the Grand Total row was already there but he wanted it confirmed; he also wanted the same Grand Total available for **any** two dates, not just a calendar month; and he wanted **both** Sol ID and Branch Name shown, not branch name alone. All three folded into the approved mockup before implementing live ("yahan dekhna mushkil ho raha hai implement kar do wahan real issue dekh kar changes kar lenge").

**Implementation** (`js/app.js`, KCC Overdue tab): a new **Branch Summary / Datewise Calendar** toggle sits below the existing scheme hero cards, reusing the tab's existing Branch/F.Y./scheme/date-mode filters rather than adding new ones — "By Date Range" (already built for the Branch Summary table) now also drives the calendar, so picking any two dates recomputes the whole matrix, both totals, and the insight line for that window. `renderKccOverdueCalendar()` groups the already-filtered rows by branch and by `Cust NPA Date`, sorts branches by window total (worst first, matching HO's own sheet), and renders Sol ID and Branch Name as two independently-sticky left columns (`KCCOV_BRANCH_SOL`, a new upper-cased-name → Sol ID lookup built once off the frozen `BRANCH_LIST`) plus a sticky Total column on the right — both stay visible while scrolling through however many date columns the window produces. Cells are heatmap-shaded (green/amber/red/solid-red) by magnitude relative to the window's own peak cell, tap through to the existing account-list modal now scoped to that exact branch + date (`kccovShowBranchAccounts` gained an optional `custNpaDate` filter), and an auto-generated insight strip calls out the single worst day in the window and what share of the window's total it represents.

One real bug caught before shipping, not present in the mockup (which always had a month picked): `kccovFilteredRows()` only date-filters when a month/range is actually chosen, so opening Calendar with no filter set let every `Cust NPA Date` in the whole upload through — spanning 2026 to 2028 — and rendered a ~490-column, 2MB-of-HTML table that was effectively invisible on screen. Fixed by having `setKccovView('calendar')` default the month (or range) filter to the upload's own `asOnDate` month the first time Calendar is opened, leaving it alone once the user picks their own — Branch Summary's existing all-time-by-default behavior is untouched since the fix only applies inside the calendar branch. A second, smaller bug: the table header/footer used a hardcoded `color:#fff`, invisible against the light theme's pale `--table-head`; switched to `var(--head-ink)`, the same token `.dash-table` already uses for this exact problem.

Verified end-to-end against the real 12-08-2026 KCC Overdue data via Playwright: Calendar view defaults to August 2026 (578 KCC accounts, 51 branches, ₹18.14 Cr) with Pora/Eihan/Sasni on top matching hand-computed Python cross-check; sticky Sol ID/Branch/Total columns hold position scrolling both directions; tapping a cell (Pora, 09-08) opened the account-list modal scoped to exactly that date with the one matching account (₹3,92,162.04, matching the cell's 3.92 L); switching to Date Range (18–24 Aug) recomputed the hero card, insight line, and every total correctly (₹10.09 Cr, 47 branches); both themes checked, header/footer text legible in light theme after the color-token fix; mobile viewport doesn't break layout; no console errors.

Files: `js/app.js` (`KCCOV_BRANCH_SOL`, `kccovView`/`setKccovView`, `renderKccOverdueCalendar`, `kccovCellSeverity`, `kccovShowBranchAccounts` extended, `renderKccOverdueBody` wiring), `css/styles.css` (`.kccov-cal-*` rules). Cache-bust `v=20260818a`, SW `upgb-ots-shell-v129`.

### Fix: Bank Dashboard PDF upload broke because Head Office changed the report's layout (2026-08-16)

Alok uploaded `NPA_DASHBOARD_16.08.2026.pdf` and got "Could not recognize this PDF's layout" on the Bank Dashboard's PDF upload, asking whether the PDF itself had changed. It had: extracted and inspected the actual PDF (via pdfplumber, then cross-checked against `parseBankPdf()`'s real pdf.js parsing in a headless browser to see exactly what it saw). Two things changed from HO's side:

1. The report used to group all 65 regions under their circle, closing each group with its own `"Sub Total CO <name>"` row — that grouping is gone. This PDF is one flat, alphabetical list of all 65 regions with no circle subtotals anywhere.
2. The bank-wide grand total row used to be labelled `"Total UPGB"` — it's now labelled `"G. TOTAL"`.

`parseBankPdf()` only recognized the old grouped format: region rows were staged in a temp array and only flushed into the final `regions` list when a `"Sub Total"` row triggered it, and the grand total was matched by exact `"Total UPGB"` text. With neither present, `regions` stayed empty and `grandTotal` stayed null — hence the generic "could not recognize this PDF's layout" error, correctly describing what happened but not why.

Fix, in `js/app.js`: the grand-total regex now matches `Total UPGB` **or** `G. TOTAL` (HO has used both). For circles: added `BANK_REGION_CIRCLE`, a hardcoded 65-region → circle map extracted from the last PDF that still had the grouping (circle membership is an administrative fact, not something that changes with HO's report formatting) — when the parse loop finishes with zero circles found but ≥50 region rows collected (the flat-layout signature), a new fallback assigns each region's circle from that map and computes circle-level totals itself via `bankPdfSumRegions()`, summing every field except the one percentage the app actually displays (`pctRemainingNpaWithAdv`, recomputed as `remainingNpaAsOnDate/totalAdv*100` — verified against HO's own `G. TOTAL` row, which prints the identical figure to the same decimal). The two other percentage fields in the source data are left `null` at circle level rather than guessed, since nothing in the app reads them and their exact denominator isn't confirmable from the printed report alone. The original grouped-format code path is completely untouched — the fallback only runs when no `Sub Total` rows were found at all, so a future PDF that reverts to the old grouped layout keeps using HO's own subtotal figures directly.

Verified against the real 16-08-2026 file end-to-end: 65 regions parsed across the expected 3 circles; Bank total (₹8,939.62 Cr, 4,330 branches, 9.86% NPA), CO Moradabad (₹3,648.24 Cr, 1,295 branches — hand-summed from the 19 member regions' branch counts as a cross-check, matches exactly), and Hathras (₹127.72 Cr, 56 branches, rank #39 of 65) all match the source PDF; circle filter dropdown correctly shows "19 of 65 regions" for CO Moradabad; NPA-share-by-circle donut sums to 100% (40.8 + 32.5 + 26.7); no console errors.

Files: `js/app.js` (`parseBankPdf`, new `BANK_REGION_CIRCLE` + `bankPdfSumRegions`). Cache-bust `v=20260816a`, SW `upgb-ots-shell-v128`.

### Fix: Removed "Designed & Developed by Alok Mittal · Uttar Pradesh Gramin Bank" credit line from the OTS Calculator's PDF/print sheet (2026-08-15, same day)

Alok asked for this footer line off the PDF. It only lived in one place -- `.pv-footer`, the last element of `renderPrintView()`'s `#printArea` markup, printed via `printOtsSheet()` (Search & Settlement → print/Save as PDF). Removed the `<div class="pv-footer">...</div>` line and its now-unused CSS rule; the credit still appears everywhere else it always has (sidebar signature, mobile signature strip, Excel export footer, splash screen) -- this was a PDF-only removal, not a global one.

Verified via Playwright: `#printArea`'s rendered HTML no longer contains the footer text or the `.pv-footer` class after `renderPrintView()` runs on a real account; no console errors.

Files: `js/app.js` (`renderPrintView`), `css/styles.css` (removed `.pv-footer`). Cache-bust `v=20260815v`, SW `upgb-ots-shell-v127`.

### Config: Login passcode changed (2026-08-15, same day)

Alok asked for the login screen's 4-digit passcode to be changed from the placeholder default to a new value. Same client-side gate as before (`CORRECT_PIN` in `js/splash.js`) -- this was never meant as real security, just a shared-device screen lock, so a plain string swap is the right level of effort. Verified via Playwright: the old code now gets rejected, the new one unlocks.

Files: `js/splash.js`. Cache-bust `v=20260815u`, SW `upgb-ots-shell-v126`.

### Fix: Login screen's left panel was a wall of dead space, not "not aligned" (2026-08-15, same day)

Alok's blunt read on the split-panel login just shipped: "bilkul bhi achha nahi lag raha na hi proper align hai" (doesn't look good at all, also not properly aligned), and asked me to audit it myself rather than describe the fix first.

Screenshotted both themes at desktop width and looked at it critically: the hero panel's content (logo, org name, app name, "OTS Calculator", rule) sat pinned to the top, then a `flex:1` spacer shoved the "Secure Access" chip all the way to the bottom — leaving roughly 300px of pure empty gradient in the middle of the panel with nothing in it, because the form panel next to it is naturally taller (it has to fit a full numeric keypad + Login button) and `.splash-frame`'s default flex `align-items:stretch` forces the hero panel to match that height. The two panels' content was never actually designed as one composition — one was top+bottom-pinned with a hole in the middle, the other filled edge to edge — which is exactly what reads as "not aligned."

Fix: `.splash-hero` switched from top-aligned-with-a-growing-spacer to `justify-content:center`, and `.splash-hero-spacer` from `flex:1` (grab all remaining space) to a fixed small gap (32px desktop, 18px mobile) between the rule and the trust chip. The whole hero content block — logo through trust chip — now sits centered as one group within whatever height the taller form panel gives it, with the extra space distributed evenly above and below instead of dumped in the middle as a hole.

Verified: both themes at desktop width now show a balanced, centered hero panel with no dead gap; mobile stacked layout (already `flex:0 0 auto`, unaffected by this fix) unchanged; PIN flow retested end-to-end (wrong/correct PIN, keyboard, Login button) — all still pass; no console errors.

Files: `css/styles.css` (`.splash-hero`, `.splash-hero-spacer`). Cache-bust `v=20260815t`, SW `upgb-ots-shell-v125`.

### Design: Login screen rebuilt again as a professional split access panel, replacing the handwritten ledger page (2026-08-15, same day)

Alok said the ledger-page login (handwritten masthead, ruled ivory paper, red margin rule, punch holes — shipped earlier this session) "professional nahi lag raha" for a banking tool. Iterated through several mockups before landing on the final direction: a split panel with a branded hero (real UPGB logo, "UPGB Regional Office Hathras", app name, a "Secure Access" trust chip) on one side and PIN entry ("Welcome Back!", PIN cells, numeric keypad, Login button) on the other — closely modelled on a reference image he shared, with the generic stock illustration replaced by the real bank logo per his follow-up ("pasand nahi aaya... bank ka logo use kar lo"), left panel content centered per his request, and a duplicated "Enter your PIN" / "Authorised Signatory — PIN" line removed per his last note before approving.

Before implementing, he asked whether the mockup's custom light-blue shade would actually match the app's real light theme or clash with it once through to the Dashboard. It would have clashed — the mockup used an invented cool-blue palette, while the app's actual light theme is warm ivory paper (established earlier this session: "Warm ivory paper, not cool porcelain"). Rebuilt the whole screen against the app's own design tokens instead of fixed literal colours: the hero panel reuses `var(--head-grad)`/`var(--head-ink)` — the exact gradient/text-colour pair the app's own header already uses in both themes — plus a soft `var(--accent-soft)` glow for a bit of its own visual identity; the form panel reuses `var(--card)`/`var(--ink)`/`var(--sub)`/`var(--line)`/`var(--accent)`, the same tokens as every other card in the app. The inline `<head>` script that stamps `data-theme` from `localStorage` before first paint (already there for the rest of the app) means this now resolves to the correct theme with no flash, and the transition from login into the Dashboard no longer has a colour "jump."

`js/splash.js` was rewritten from scratch: the entire hand-drawn SVG handwriting glyph system (letter path data, seeded jitter layout, stroke-dashoffset write-on animation — built specifically because no font file was allowed for the ledger design) is gone, since the new title is plain text. The PIN state machine (push/back/unlock/reject, session-storage skip flag, keyboard support) is unchanged in behaviour; added a `submit()` path shared by the existing 4th-digit auto-submit and a new explicit Login button (shakes on an incomplete PIN rather than doing nothing, since the button is now a real affordance and needs its own feedback). The wax-seal "VERIFIED" stamp graphic is gone (replaced by the existing text status line, "Verified"/"Incorrect PIN").

Responsive: the two-panel layout is desktop/tablet-width; below 820px the hero stacks above the form (single column), matching how the rest of the app already splits mobile vs desktop chrome. `.splash-frame` scrolls internally on short viewports (verified on a 375×667 iPhone SE-sized viewport) so nothing is unreachable.

One accessibility check caught the "OTS Calculator" subtitle needed the light theme's already-existing `--red:#D1362C` override (not the dark theme's `#FF5A5F`) to clear WCAG AA against the pale hero background — confirmed via pixel-sampled contrast (5.46:1 dark, 4.51:1 light) rather than assumed; title/org-name text (reusing the header's own established `--head-ink`/`--head-grad` pairing) measured 14.86:1 and 15.1:1.

Verified: PIN flow end-to-end via Playwright (wrong PIN shakes and clears, correct PIN unlocks and sets the session skip flag, physical keyboard digits/Backspace/Enter all work, Login button both rejects an incomplete PIN and completes a correct one), both themes at desktop and mobile widths, no console errors, `node -c` clean on both changed JS files.

Files: `index.html` (`#splashScreen` markup), `css/styles.css` (`.splash-*` rules), `js/splash.js` (full rewrite). Cache-bust `v=20260815s`, SW `upgb-ots-shell-v124`.

### Fix: Regional Office info card now also shows on the Dashboard's default "Regional Office" (whole-book) view (2026-08-15, same day)

Alok pointed at a screenshot of the Dashboard's default state -- `#dashBranchFilter` left on "Regional Office" (blank, the whole book) -- and asked for R O Hathras's own info card to show there too, not just when a specific lending branch is picked.

`dashboardBranchInfoCard()` previously returned nothing whenever `branchFilter` was blank, on the assumption that "Regional Office" meant no single branch was in view. But R O Hathras (Sol ID 9269) never carries NPA accounts -- it's the administrative office, not a lending branch -- so it never has its own `s.branchMap` entry either way; the blank-filter case is now hardcoded to Sol ID 9269 instead of returning early, since "Regional Office" on this dropdown always means that one office. Everything downstream (District, Region Head, Senior Manager Recovery, Branch Email, Address, click-through to the full card) reuses the exact same rendering path as a normal branch, including the Region Head/Senior Manager Recovery relabeling shipped just above.

Verified: default Dashboard load (no branch selected) now shows the R O Hathras card with R.S.Verma/Himanshu Sharma; switching to a real branch (Agsauli) and back to "Regional Office" both render correctly; click-through to the full branch card still works; no console errors.

Files: `js/app.js` (`dashboardBranchInfoCard`). Cache-bust `v=20260815r`, SW `upgb-ots-shell-v123`.

### Fix: Regional Office contact uses "Region Head" / "Senior Manager Recovery" instead of the branch-level "Branch Manager" / "Recovery Officer" labels (2026-08-15, same day)

Alok published R O Hathras's (Sol ID 9269) own contacts through the Branch Contacts upload — R.S.Verma and Himanshu Sharma (8172900300) — but pointed out the generic branch labels don't fit the Regional Office: its own head carries the title **Region Head**, and its recovery contact is a **Senior Manager Recovery**, not a plain branch Recovery Officer.

New `branchRoleLabels(newId)` helper checks `BRANCH_META[newId].type` (from the frozen Sol ID master) — `'Regional Office'` gets `Region Head` / `Senior Manager Recovery` (rail pills `RH`/`SMR`), every other branch keeps the existing `Branch Manager` / `Recovery Officer` (`MGR`/`RO`). Applied everywhere those labels appear: the Branch & Sol ID panel's row contact lines, the full branch detail card, and the Dashboard's branch info card. The underlying `DATA.branchContacts` fields (`mgr`/`roName`/`roMobile`) and the Branch Contacts upload template are unchanged — this is a display-only relabel driven by branch type, not a data model change.

Verified: R O Hathras's full card now reads "Region Head — R.S.VERMA" / "Senior Manager Recovery — HIMANSHU SHARMA · 8172900300"; a normal branch (Agsauli, 9270) still reads "Branch Manager" / "Recovery Officer" unchanged; branch panel row pill shows `RH`/`SMR` only for R O Hathras; no console errors.

Files: `js/app.js` (`branchRoleLabels`, `branchRowHtml`, `showBranchCard`, `dashboardBranchInfoCard`). Cache-bust `v=20260815q`, SW `upgb-ots-shell-v122`.

### Feature: Branch master data (email, district, address, ...) now shown on the Branch card and at the top of the Dashboard for a selected branch (2026-08-15, same day)

Alok asked for the extra columns from `UPGB_NEW_SOL_ID.xlsx` (branch email, and "all" the other details) to actually show, not just sit frozen in the data — both when clicking a branch in the Branch & Sol ID panel, and at the top of the Dashboard when a specific branch is selected there.

**New `BRANCH_META` constant** (`js/app.js`), keyed by new Sol ID: branch code, official branch email, Branch/Regional Office/Service Branch type, Urban/Rural/Semi Urban area, district, registered address, PIN, and date opened (already `DD-MM-YYYY` per the date-format rule in CLAUDE.md — the sheet's raw Excel date was converted once at data-authoring time, not left as a serial). `branchGroups()`'s Hathras/Mathura split (shipped a few entries below) was also switched from a hardcoded Sol ID range to reading `BRANCH_META[id].district` directly, since that's now the actual ground truth.

**Branch card** (`showBranchCard`, opened from the Branch & Sol ID panel): gained Branch Type, District, Area, Branch Code, Branch Email, Date Opened, and Address (preferring the manually-curated `DATA.branchContacts` address over the frozen sheet's one, falling back to the sheet's when nothing's been entered yet) — sitting above the existing Manager/Recovery Officer/IFSC/Remarks fields.

**Dashboard branch info card** (new `dashboardBranchInfoCard()`): renders at the top of the Dashboard, only when `#dashBranchFilter` has a specific branch picked (blank/"Regional Office" shows the whole book, where a single branch profile wouldn't make sense) — District, Branch Manager + mobile, Recovery Officer + mobile, Branch Email, Address, clickable through to the same full branch card. The dashboard's branch filter runs off the raw branch-name string in the uploaded NPA data, not `BRANCH_LIST`/`BRANCH_META` directly, so the card reads the Sol ID off `computeDashboardStats()`'s own `branchMap` (which already captures each branch's Sol ID straight from the NPA rows) rather than re-matching names, which use a slightly different spelling convention than the master sheet.

One data quality wrinkle handled: 4 of the newer branches (opened 2016) already have their PIN typed into the address text itself in the source sheet, unlike every other branch — a naive "address + PIN" concatenation would have shown the PIN twice for just those four. `masterAddressOf()` only appends the PIN when it isn't already present in the address string.

Verified: card renders correctly in both themes with real data (Adarshnagar/Agsauli), no double-PIN on the four affected branches, branch panel's district grouping still correct (1/40/16 = 57) after switching to read `BRANCH_META` instead of the hardcoded range, no console errors.

Files: `js/app.js` (`BRANCH_META`, `masterAddressOf`, `showBranchCard`, `dashboardBranchInfoCard`, `branchGroups`, `renderDashboard`), `css/styles.css` (`.branch-info-card` and friends, reusing `.card`/`.info-grid`). Cache-bust `v=20260815p`, SW `upgb-ots-shell-v121`.

### Data: BRANCH_LIST frozen against the official UPGB_NEW_SOL_ID.xlsx master (2026-08-15, same day)

Alok supplied `UPGB_NEW_SOL_ID.xlsx` — the official Old Sol ID / New Sol ID / Branch Name master — and said this is data that won't change, so it should be set/frozen in the app; the still-outstanding Manager/Recovery Officer contact data he'll upload separately (Monday) through the existing Branch Contacts template in Settings.

Diffed all 57 rows of the sheet against the hardcoded `BRANCH_LIST` in `js/app.js` (a small Node script matching by new Sol ID). All 57 Old/New Sol ID pairs matched exactly — no additions, removals, or ID mismatches — but 4 branch names in the sheet were more complete than what shipped: `Agra Road` → **Hathras Agra Road**, `Aligarh Road` → **Hathras Aligarh Road**, `Service Branch` → **Hathras Service Branch**, `Hatisa` → **Hatisa Bhagwantpur**. Updated `BRANCH_LIST` to match the sheet exactly and added a comment marking it as the frozen source of truth going forward.

Bonus find: the sheet carries its own `District Name` column, and it confirms the Hathras/Mathura district split used by `branchGroups()` (shipped just below, 9270–9309 vs 9310–9325) is exactly right — every row in the sheet tagged `Hathras` falls in 9270–9309 and every row tagged `Mathura` falls in 9310–9325, with no exceptions.

No template work was needed for the Manager/RO contact data Alok will upload Monday — `downloadBranchContactsTemplate()` (Settings → Update Data → Branch Contacts) already pre-fills Sol ID/Old Sol ID/Branch Name from `BRANCH_LIST` for all 57 branches and carries forward anything already in `DATA.branchContacts`, so it automatically picks up the 4 corrected names with no changes of its own.

Verified: all 57 rows render in the Branch & Sol ID panel with the corrected names, no console errors, `js/app.js` parses clean.

Files: `js/app.js` (`BRANCH_LIST`). Cache-bust `v=20260815o`, SW `upgb-ots-shell-v120`.

### Fix: Branch panel groups switched from Sol ID decade ranges to the real Hathras/Mathura district split (2026-08-15, same day)

One more correction to the Branch panel grouping shipped just below: the Sol ID decade-range groups (`9270–9279`, `9280–9289`, ...) were an arbitrary numeric bucketing, not a grouping that means anything to a branch officer. Alok pointed out the real structure: Sol ID 9269 is the Regional Office itself, 9270–9309 are the **Hathras district** branches, and 9310–9325 are the **Mathura district** branches — UPGB Hathras Regional Office covers both districts. (The old Sol ID prefix flips from 15xxx to 16xxx at exactly the same 9309/9310 boundary, confirming this is a real administrative line, not a coincidence of the numeric range.)

`branchGroups()` now uses a small `BRANCH_DISTRICTS` table (`{from,to,label,letter}` per district) instead of computing a decade bucket from each Sol ID, so the three groups are Regional Office (1) → Hathras District (40) → Mathura District (16), still sorted ascending by Sol ID within each. Jump-rail labels changed from the decade digits (`27`, `28`, ...) to `HTH`/`MTH`.

Verified: group order, labels, and per-group counts (1/40/16 = 57) all correct in both themes; Sol IDs still strictly ascending within and across groups; no console errors.

Files: `js/app.js` (`branchGroups`, new `BRANCH_DISTRICTS` constant). Cache-bust `v=20260815n`, SW `upgb-ots-shell-v119`.

### Fix: hovered sidebar rail was losing to page content instead of overlaying it; Branch panel re-sorted from A-Z to ascending Sol ID (2026-08-15, same day)

Two follow-up corrections to the sidebar/branch-panel redesign above, both reported by Alok from a live screenshot.

**Branch panel sort order.** He said the A-Z grouping shipped above was wrong — branch staff look a branch up by Sol ID, not alphabetically, so the panel needed to sort ascending by *new* Sol ID instead ("sol id list ki bajay new sol id wise sort karo low to high karo wo hi theek hai"). `branchGroups()`'s sort key changed from `a[2].localeCompare(b[2],...)` (branch name) to `a[1]-b[1]` (new Sol ID) — sorted defensively rather than trusting `BRANCH_LIST`'s own declared order, even though a diagnostic script confirmed that order already happens to be ascending-by-Sol-ID with zero gaps (9269–9325, R O Hathras already the minimum). Letter-based A-Z groups no longer meant anything against a numeric sort, so they were replaced with Sol ID decade-range groups (`9270–9279`, `9280–9289`, ...) — the ID range splits into six clean groups of ~10 branches plus Regional Office pinned alone, so the sticky-header + jump-rail pattern carried over unchanged, just with range labels (`27`, `28`, ... on the rail) instead of letters.

**Hovered rail losing to page content.** Screenshot showed the expanded sidebar rail on the Search & Settlement screen rendering as a jagged double-image with the OTS Calculator's navy header card — nav labels ("Dashboard", "Bank Dashboard") visibly cut off mid-word behind the card instead of the rail cleanly overlaying it like a drawer. Root cause: `.nav-shell`'s hover z-index (20) was being compared against `#sideNav`'s own z-index (5), not against the value written on `.nav-shell` itself — z-index only has meaning inside its own containing stacking context, and a descendant's z-index can never let it outrank elements outside its ancestor's stacking context. `#searchHeader` (`header.app-head`) carries `position:sticky` + `isolation:isolate` + `z-index:40`, which made it win the paint order against `#sideNav`'s context (5) regardless of what `.nav-shell` itself was set to — confirmed by hit-testing the overlap pixel with Playwright before and after each attempted fix. Bumping `.nav-shell`'s own z-index had no effect (still trapped inside `#sideNav`'s context); the real fix was `#sideNav:hover,#sideNav:focus-within{z-index:50}` — raising the *container's* z-index high enough to beat sticky page headers (40) while staying below true full-screen layers (detail pane 95, modals 100+, cmdk 120), so those still correctly win over a hovered rail.

Verified in both themes (dark and the ivory light theme, which is what Alok's screenshot was in) via Playwright hit-testing (`elementFromPoint` on the overlap pixel returns the rail's own `.nav-brand`, not the header card) and screenshots; re-ran the existing mobile/keyboard/detail-pane regression script (`nav-extra-test.js`) plus a new check that the sidebar hover doesn't accidentally out-rank the full-screen detail pane (z-index 95 still wins, since the detail pane blocks the hover from ever reaching the rail underneath it) — all passed, no console errors. Branch panel: sort confirmed strictly ascending across all 57 rows, six decade groups plus Regional Office render with correct counts (10/10/10/10/10/6/1), rail jump buttons match.

Files: `css/styles.css` (`#sideNav`/`.nav-shell` z-index), `js/app.js` (`branchGroups`, `renderBranchList`). Cache-bust `v=20260815m`, SW `upgb-ots-shell-v118`.

### Sidebar redesigned as a collapsible sapphire rail; Branch panel grouped A-Z with old + new Sol ID (2026-08-15, same day)

Alok asked for a modern, unique, simple-but-elegant look for the sidebar. Four mockups were shown as a standalone HTML file (Ledger Register / Quiet Rail / Grouped & Sapphire / — see the earlier login-mockups session for the pattern); he picked **Direction C's look** (grouped labels, the app's own sapphire) combined with **Direction B's hover-to-open collapse**, and asked that the Branches panel carry the same treatment while keeping both old and new Sol ID per branch (already shown there — just had to survive the redesign).

**Sidebar.** `#sideNav` is now a 76px flex placeholder that never changes size — it only reserves that much space in `#app`'s layout, so nothing about `#mainCol` ever reflows. The actual chrome (background, padding, nav items) moved to a `.nav-shell` child, absolutely positioned to fill that 76px box at rest and widen to 252px on `:hover`/`:focus-within`, escaping its parent's bounds to *overlay* the dashboard rather than push it — the same technique VS Code/GitHub Desktop use for a collapsible activity bar. `:focus-within` (not just `:hover`) keeps it open, so a keyboard user tabbing through nav items doesn't lose the rail mid-navigation.

Collapsed, it reads as a plain icon rail. Expanded, it's grouped: **Analysis** (Dashboard, Bank Dashboard, KCC Overdue), **Settlement** (Search & Settlement), a **Data as on** card filling the gap the nav used to leave empty below four tabs, then **Tools** (Refresh, Quick Search, Settings, Theme). The date card reuses the existing `.report-date-val` convention — `updateReportDateDisplay()` already writes `DATA.asOnDate` into every element carrying that class, so the card needed no wiring of its own and can't drift out of sync with the date shown everywhere else.

**Branch panel.** Was a flat 57-row list in Sol ID order (new branches get appended out of alphabetical sequence as they're added, so the source order isn't usable for an A-Z index). The panel now keeps its own sorted copy — Regional Office pinned first, everything else grouped alphabetically under sticky letter headers with a count badge — plus a jump rail along the right edge. Both **old and new Sol ID** continue to show on every row exactly as before (`Sol ID 9269` / `Old 15990`); a search still returns a flat list with the rail cleared, since letter grouping doesn't help a handful of scattered matches.

One real defect caught before shipping: `.nav-card-lbl` was styled with `--accent-2` (a light teal, chosen because it read well on the dark rail) — on the light theme's pale `--accent-soft` card background it measured 2.47:1, well under WCAG AA. Switched to `--accent` (deep sapphire in both themes), which held past 5:1 in both. Every other new element — nav labels, the branch panel's group letters, count badges, and the A-Z rail — was contrast-checked the same way (composited against its real, possibly-translucent background, not assumed opaque) and came back clean; worst case 4.17:1.

Verified: hover expands 76→252px and mouse-leave collapses it back (confirmed independent of `:focus-within` by testing pure mouse movement with no click involved); a focused nav item keeps the rail open through blur; `#mainCol`'s left edge never moves in either state; the borrower detail pane still opens above the collapsed rail (z-index 95 vs. the rail's 5, confirmed by hit-testing the top-left pixel); mobile (`<900px`) is untouched — `#sideNav` still hides in favour of the bottom tabs, no horizontal scroll. Branch panel: 20 groups render (Regional Office + A–Z), rail jump scrolls to the right group, search returns 1 match for "mendu" with the rail cleared, and the full contact card opened from a row still reads "Sol ID 9269 · Old Sol ID 15990". No console errors in either theme.

Files: `index.html`, `css/styles.css`, `js/app.js` (`renderBranchList` split into `branchMatchesQuery`/`branchRowHtml`/`branchGroups`, plus a new `jumpBranchGroup`). Cache-bust `v=20260815l`, SW `upgb-ots-shell-v117`.

### OTS Excel export made row-for-row identical to the PDF (2026-08-15, same day)

Alok: *"Pdf itna simple clean well align hai bahut hi bhadiya and excel utna hi bikhra hua data bhi kuch jyada hai pdf jitna aur jaisa hi chahiye"* — the PDF is clean and well aligned; the Excel is scattered and carries more data than the PDF. Make it the same.

**Tooling note.** LibreOffice is installed in this container but cannot read `.xlsx` at all (confirmed: even a two-cell workbook written by openpyxl fails with "source file could not be loaded"), and there are no PDF rasterisers either. So a small renderer (`xlsx2html.py`, kept in the scratchpad) was written to turn a real `.xlsx` into HTML reproducing its actual column widths, merges, alignment, borders and number formats. Every judgement below was made against that render rather than by reading code.

**Two false alarms it caught first.** The initial render showed columns C/D width-less and the aggregate values missing, both of which looked like export bugs and were not: openpyxl keys `column_dimensions` by letter, so a grouped `<col min="2" max="4">` only surfaces under `B`; and the preview table was stretching because `table-layout:fixed` with no explicit table width fills its container. Both were fixed in the renderer before touching the export — otherwise correct code would have been "fixed".

**What actually differed, and is now aligned:**

| | Before | After |
|---|---|---|
| Trailing column | header merged to column E, table stopped at D — a blank column on every export | one `SPAN` for every merged row; no column past the table |
| `Net O/S` row | present | removed (it always equals O/S Balance — the reason the PDF dropped it). Provision now reads O/S Balance directly instead of going through it |
| `Scheme` row | on the helper sheet only | a proper row, in the PDF's position |
| Aggregates | 4, in a different order, **`Total Ledger Sacrifice` missing** | the PDF's 5, in the PDF's order |
| `scheme · branch` strip | one per account under the totals | removed — the branch already prints in the header |
| "Editable" note row | its own row | a cell note on Report Date, plus one on OTS Amount |
| Helper sheet | a visible second tab | hidden; still drives the live formulas |
| Row label | `OTS Amount (edit me)` | `OTS Amount` |

Live formulas are unchanged in behaviour — editing OTS Amount still recalculates Total Sacrifice, Ledger Sacrifice, Impact on P&L and every aggregate, and editing Report Date still redrives UCI and Days in NPA. The UCI anchor formula now reads Scheme off the main sheet rather than a duplicate copy, so the value is stored once.

Verified against borrowers with **1, 2 and 3 linked accounts** (the account count drives the merge span, so each behaves differently). For each: the 16 table row labels equal the PDF's exactly and in order; the 5 aggregate labels equal the PDF's exactly and in order; title and subtitle match; no column exists past the merge span; every column has an explicit width; all full-width merges end on the same column; the helper sheet is hidden; Scheme is not duplicated on it; `Net O/S` and the `scheme · branch` strip are gone. 33 assertions, all passing. Formulas spot-checked cell by cell against the corrected row numbers, and both cell notes confirmed present in `xl/comments1.xml`.

Files: `js/app.js`. Cache-bust `v=20260815k`, SW `upgb-ots-shell-v116`.

### Login screen rebuilt as a ledger page with a handwritten masthead (2026-08-15, same day)

Alok asked for login mockups — *"kuch new modern approach latest tranding kuch real skills"*. Four concepts were built as working prototypes (Vault Dial, Ledger Page, Split Console, One-Thumb Keypad); he chose **Ledger Page**, then asked for the masthead to read "NPA Dashboard / OTS Calculator" in handwriting rather than "ALOK MITTAL", shown in several colour treatments first. He picked **Study 4 — Ink & Red Seal**, and specified the footer as two lines: `UPGB RO HATHRAS`, then `Designed & Developed by ALOK MITTAL`.

**The handwriting is drawn, not set in a font.** No script/handwriting font exists on the build machine (checked: only Liberation, DejaVu, FreeSans and CJK families), and the app is an offline PWA that cannot pull one from a CDN. So `js/splash.js` carries a small stroke-based handwriting engine: each of the 20 glyphs needed is defined as the actual pen strokes a hand would make, on a shared baseline grid (cap height 30, x-height 20, ascender 34). Words are laid out along the baseline with a **seeded** per-letter vertical nudge and rotation — seeded rather than `Math.random`, so the masthead is byte-identical on every load instead of wobbling differently each time. Rendered as SVG paths with round caps at marker weight, then animated with `stroke-dashoffset` so the two lines write themselves in.

**The old screen is gone**: the dark radial gradient, the drawn gold ring, the "AM" monogram, "ALOK MITTAL", and the four `<input class="pin-box">` fields. In their place: ruled ivory paper, a red margin rule, punch holes, the handwritten masthead, four ledger cells, an on-screen keypad, and a brass seal that stamps on the correct PIN.

Decisions worth recording:

- **Single-look on purpose.** The sheet stays ivory whichever theme the app is in, so every colour in the block is painted explicitly rather than read from the theme tokens — a `var(--bg)` here would have put the dark theme's navy behind ivory paper.
- **On-screen keypad *and* physical keyboard.** The keypad exists so a phone does not raise its own keyboard over the sheet; `keydown` is still handled for digits and Backspace so a desktop keyboard works. The old `<input>` fields would have forced the OS keyboard up every time.
- **The stamp lands on what it certifies** — the PIN row, not the keypad. In the first pass it was anchored to the sheet and sat squarely over the number keys.
- **Reduced motion** skips the write-on entirely and hands every stroke straight to its drawn state, rather than animating faster.

**One real defect found while building this:** the write-on was far too slow — a 21-stroke line took roughly 15 seconds, so the title was still half-written when the PIN was reachable. It was missed at first because the check read `path.style.strokeDashoffset`, which is set to `0` the instant the transition is *declared*, regardless of how far it has actually run; switching the check to `getComputedStyle` exposed it. Stroke speed went from 62 to 300 units/sec and the per-stroke overlap from 0.72 to 0.42, bringing both lines in at ~2.5s, now verified by sampling computed style at 0.5s / 1.5s / 2.5s.

Verified in Chromium at 430×900, 1280×900 and 390×660 (short screen): all 40 strokes finish drawing, both footer lines render, the title never overflows the sheet, keypad and footer stay inside the viewport, the seal never overlaps the keypad, wrong PIN shakes and clears, Backspace works, a physical keyboard unlocks it, unlocking sets `upgb-splash-unlocked` and hides the screen, a reload skips straight past it, and reduced motion shows the finished writing immediately. No console errors.

Files: `index.html`, `css/styles.css`, `js/splash.js`. Cache-bust `v=20260815j`, SW `upgb-ots-shell-v115`.

### OTS Excel export: dropped the bank logo, header rebuilt to match the print/PDF sheet exactly (2026-08-15, same day)

Alok: *"Ots ki excel export main se bank logo hata k use same pdf jaisa bana do"* — remove the bank logo from the OTS Excel export, make it the same as the PDF.

The logo image (`OTS_LOGO_DATA_URI`, a ~98KB base64 PNG) was `wb.addImage`'d into cell A1 of the export, which had also forced the title/subtitle merges to start at column B instead of A to keep the text from overlapping it (a fix from an earlier session, confirmed against a screenshot from Alok's phone). Both are gone now — the merges start at column A like everything else on the sheet.

The header section is rebuilt to mirror `renderPrintView()`'s structure line for line, using a running row counter (`r`) instead of hardcoded row numbers so nothing downstream needs re-deriving by hand:

1. Title — "UPGB OTS CALCULATOR" (previously had the borrower's name appended, which the print sheet never does)
2. Subtitle — "Uttar Pradesh Gramin Bank (Regional Office Hathras)"
3. Report Date (still a live, editable cell — formulas reference it) + Branch, with Sol ID folded into the Branch text as "LADPUR (9288)" instead of its own row, matching how the print sheet folded Sol ID into the branch line earlier this session
4. The "Editable — recalculates off the Report Date" hint
5. Borrower Name and Address — previously shown nowhere in the Excel export except buried in the title
6. The info grid, regrouped to match the print sheet's own two columns exactly: Cust ID / Mobile / PAN / Aadhar beside SB A/c / SB Balance (previously paired differently and still carried a standalone Sol ID field)

`OTS_LOGO_DATA_URI` itself is deleted from `js/app.js` along with its declaration comment — it had no other callers left (the print sheet dropped its own logo in an earlier session), so keeping a 98KB dead constant around served no purpose.

Verified: exported workbook has no `xl/media/` or `xl/drawings/` parts (no embedded image at all), and every text row — title, subtitle, "Branch: LADPUR (9288)", borrower name, address, and the info-grid field order — was diffed field-by-field against `renderPrintView()`'s live DOM for the same borrower and matches exactly. Formulas (Days in NPA, UCI, Total Dues, etc.) still resolve correctly with the shifted row numbers. No console errors.

Files: `js/app.js`. Cache-bust `v=20260815i`, SW `upgb-ots-shell-v114`.

### Removed the Daily NPA Projection module entirely (2026-08-15, same day)

Asked at the end of the worksheet build whether *"Daily npa projection kaam
ka nahi hai ab"* meant "skip its relay-auth problem" or "remove the tab".
Alok chose removal. The tab had already been hidden from the live nav on
2026-08-14; this deletes it outright rather than leaving dead code behind.

**Removed:**
- `js/app.js` — the whole module (~625 lines): the `DP`/`DP_DISPLAY` schema,
  the editable grid, Excel-style per-column AutoFilter, undo stack, summary
  strip, live-sync client (`dpQueueLiveSync`/`dpFlushLiveSync`/`dpPollLive`,
  3s poll), Print/PDF and Excel export, plus the `switchView` and
  refresh-button hooks.
- `index.html` — the `<section data-view="dailyproj">` view and both
  commented-out nav buttons.
- `css/styles.css` — the editable-grid, frozen-column, summary-tile,
  AutoFilter-popover and sync-status rules, and the grid's landscape
  `@media print` block (~137 lines).
- `relay/api/daily-proj-live.js` — deleted. **This also closes the
  unauthenticated relay endpoint** flagged in the earlier forensic audit:
  it accepted row writes with no auth beyond CORS. It is gone with the
  feature rather than fixed, so there is nothing left to secure.
- `data/daily-npa-projection.json` — deleted.
- `sw.js` — `POLLED_ENDPOINTS` is now empty. The list and its fetch branch
  stay deliberately: they are the guard rail that stopped polled endpoints
  from filling Cache Storage, and the next one added must not reintroduce
  that bug.

**Deliberately kept:** the Branch Advance upload still accepts the Head
Office *Daily NPA Projection workbook* as a source file — it reads Sol ID /
Advance / NPA MARCH 26 / NPA JUNE 26 out of it for the Dashboard's Mar/Jun
comparison. That is a separate feature that merely shares the file. Its two
labels were reworded to say "Head Office Daily NPA Projection workbook", so
they read as a filename rather than a pointer to a tab that no longer
exists. Daily PNPA is also untouched — still hidden from nav, not removed.

**Two real defects found and fixed while doing this:**

- *Print sheet lost its white background.* The removed grid's print block
  carried `body{background:#fff!important}`, and the `!important` was
  load-bearing — the base `html,body{background:var(--bg)}` sits later in
  the stylesheet at equal specificity, so without it the theme's navy (dark)
  or ivory (light) painted behind the whole OTS print sheet. Caught by
  diffing computed styles under print emulation against a served copy of
  the pre-change build. The declaration now lives in the OTS print block
  itself, where the app's one remaining printable view cannot lose it again.
- *Refresh button threw on every use (pre-existing, unrelated to removal).*
  `refreshCurrentView` read `e.currentTarget` inside a 700ms `setTimeout`.
  The DOM nulls `currentTarget` as soon as the handler returns, so every
  refresh on the Bank / PNPA / KCC Overdue tabs threw "Cannot read
  properties of null" and the spinner never stopped. The element is now
  captured into a local before the timeout.

Verified in Chromium at 430px and 1280px, dark and light: all four live tabs
render, `switchView('dailyproj')` is inert rather than throwing, no
`dailyproj` DOM or globals remain, the refresh button completes cleanly, and
print emulation matches the pre-change build byte for byte on body
background. The OTS Worksheet shipped earlier today was re-tested
end-to-end afterwards and is unaffected. No console errors.

Files: `js/app.js`, `index.html`, `css/styles.css`, `sw.js`, and the two
deletions. Cache-bust `v=20260815h`, SW `upgb-ots-shell-v113`.

### Feature: OTS Worksheet + device Backup/Restore, brass result list, per-row remove (2026-08-15, same day)

Alok, picking from a list of suggestions: *"Ots worksheet / Backup / Dono
choti cheezen / Contact list monday ko update ho jayegi / Daily npa
projection kaam ka nahi hai ab"* — i.e. build the worksheet, build the
backup, and do both small items.

**1. OTS Worksheet.** Typed OTS Amounts have been saved per account since
this morning's change, but they were only ever visible one borrower at a
time. This is the view that makes a whole settlement batch reviewable in
one place: every account with an OTS Amount saved on this device, with
O/S Balance, OTS Amount, Total Sacrifice and Impact on P&L, plus a totals
row.

Reached from a ledger-cover bar on the OTS start screen ("OTS Worksheet —
N account(s) · O/S ₹X · OTS ₹Y"). The bar renders even when nothing is
saved, because that is exactly the state a fresh phone is in and Restore
has to be reachable from it.

Every figure is recomputed live through `computeSlot(slotFromRow(raw))`
and `totalDuesFor(s)` — the same path the borrower detail screen uses — so
the worksheet cannot drift from what that screen shows. Accounts that have
since dropped out of the NPA book (regularized/closed) are skipped rather
than shown against stale figures. `slotFromRow(row)` was extracted out of
`lookupLoanSlot()` for this, so a slot can be built from an account number
alone.

**Excel export** is built with ExcelJS, not SheetJS, for the same reason
the single-borrower export is: the free SheetJS build writes number formats
but silently drops fonts and borders. Total Sacrifice and Impact on P&L are
written as **live formulas** off column F, so editing a settlement amount
in Excel updates the derived columns and the totals. A4 landscape, fit to
width, header row frozen and repeated on every printed page.

**2. Backup / Restore.** Everything the app saves per-person — OTS Amounts,
Interest Reversal overrides, Recently Opened — lives in this browser's
localStorage. Clearing browser data or changing phone loses all of it.
Backup writes it to a JSON file the user holds; Restore reads it back.
Nothing is uploaded anywhere. Restore validates `app === 'upgb-ots'` and
confirms the count before replacing, so a wrong file cannot silently wipe
real work (verified: a non-backup JSON is rejected and the 3 saved amounts
survived).

**3. Small item — brass result list.** The OTS search results table still
ran on the app's sapphire tokens, so the tab read brass at the top (hero
card), sapphire through the result list, then brass again on the detail
screen. Now scoped to the brass tokens via a `.ots-results` wrapper.

**4. Small item — per-row remove in Recently Opened.** Each row gets a ✕.
The row's `<button>` and the ✕ are siblings inside `.start-rec-row`, never
nested — a button inside a button is invalid markup and breaks keyboard
activation. Removing a row drops it from the visited list only; that
borrower's saved OTS Amount is real work and stays in the worksheet.

**Two real defects found and fixed while building this:**

- *Light-theme header row was dark-on-dark.* The existing rule
  `:root[data-theme="light"] .dash-table th{color:var(--head-ink)}` has
  specificity (0,3,1) and outranked a plain `.ots-results .dash-table th`
  at (0,2,1), putting the light theme's dark ink on the new navy header.
  Fixed by re-pointing the `--head-ink` token inside the scope rather than
  fighting the cascade with a more specific colour rule.
- *Start screen went stale on returning from a borrower.* `closeDetail()`
  never redrew what was behind it, so a just-typed OTS Amount did not
  appear in Recently Opened or in the worksheet bar's totals until the tab
  was re-entered. It now redraws, but only when the start screen is what's
  showing — a result list is left as it was.

Also: totals are repeated as four tiles above the table, because on a phone
the foot row's figures sit past the right edge of a nine-column scroller;
the worksheet modal widens to 1160px on desktop, where nine columns in the
shared 720px sheet forced a needless sideways scroll; and the ✕ buttons
stay at 85% opacity under `@media (hover:none)`, since a phone never shows
the hover state that reveals them.

Verified end-to-end in Chromium at 430px and 1280px, dark and light: seed
three accounts → worksheet rows and totals correct → Excel export (formulas,
freeze pane, A4 landscape, print titles all confirmed in the file's XML) →
Backup → wipe localStorage → Restore → all three amounts and recents back →
bad file rejected without loss. No console errors.

Not acted on: *"Daily npa projection kaam ka nahi hai ab"* — ambiguous
between "don't bother fixing its relay authentication" and "remove the
tab". Removing a whole module is destructive, so it is being asked about
rather than assumed.

Files: `js/app.js`, `index.html`, `css/styles.css`. Cache-bust
`v=20260815g`, SW `upgb-ots-shell-v112`.

### Fix: hero KPI value wrapping onto two lines (2026-08-15, same day)

Flagged as pre-existing in the ivory pass, then Alok asked for it too. On
the Total Outstanding card the value broke across two lines — "₹127.64" /
"Cr" — because `.hero-kpi-side` sat as a column *beside* `.hero-kpi-main`
and reserved whatever width its `white-space:nowrap` "MAR ₹128.95 Cr" rows
needed. At the 4-across grid that left the main column too narrow for a
38px figure.

The card is now a column: icon → label → value → sub, with the badge and
Mar/Jun groups as a strip below, wrapping onto their own line when narrow.
The value gets the card's full width at every breakpoint, and the strip
still cannot overlap it, since it stays a real flex item rather than the
absolute overlay that caused the original overlap bug (see the 2026-08-14
"hero KPI card value overlapping badge" entry — that lesson is preserved).

Putting the strip *above* the main block was tried first and rejected: it
pushed the one card that has it ~90px down, leaving the four headline
figures visibly out of line with each other across the row. Below keeps
every card opening at the same height.

The now-redundant `@media (max-width:599px)` overrides that used to force
this same stacking on phones were removed rather than left duplicating the
base rules.

**Verified**: measured (not eyeballed) at four widths — 1400px 4-across,
1000px and 760px 2-across, 390px 1-across — asserting every
`.hero-kpi-value` renders on exactly one line with no horizontal overflow;
0 wrapped at all four. Bank Dashboard, which reuses the same card, checked
too: all 7 hero values single-line. Full OTS/print/Excel, hero-search and
persistence regressions still passing; zero console errors.

### Design: light theme moved to warm ivory paper (2026-08-15, same day)

Alok: light mode *"bahut simple lagta hai ... kuch woow factor nikal kar
aaye"*, then after seeing the OTS hero, *"jo best hai wo kar do like
ivory"*. Three directions were mocked (Tinted Cards / Gradient Hero /
Ambient Canvas); the shipped result takes the ivory cue plus the parts of
those that carried real weight.

**Diagnosis first.** The page was `#F6F8FC` and cards `#FFFFFF` — about 2%
luminance apart, so nothing read as floating; the ambient wash was pinned
at `opacity:.05`, i.e. invisible; and the four hero KPI cards were
identical but for a small icon badge, so nothing signalled that Total
Outstanding is the headline and High-Risk Exposure is a warning.

Three changes:
1. **Warm ivory neutrals** — page `#F5F2EA`, cards `#FFFDF8`, warm ink/
   line/stripe/table-head tokens, and warm-toned shadows (a cool blue-grey
   shadow over ivory reads as dirt, not depth). The accent stays sapphire:
   navy on cream is a long-standing pairing, and keeping it means only the
   OTS Calculator carries brass.
2. **A real ambient wash** — amber-gold top-left, muted sapphire
   bottom-right, at usable opacity, so cards lift off a colour field
   instead of a flat sheet.
3. **A semantic top rule on each hero KPI card**, drawn from that card's
   existing `--hero-color`, so the row reads as a story rather than four
   interchangeable boxes. This one applies in both themes.

**Kept the OTS tab distinct on purpose.** Warming the whole app risked
erasing what had just been built for the hero, so: the app's ivory is
paler than the OTS hero's cream, and the hero's navy band, brass and
ruled lines appear nowhere else. In the same pass `.ots-start` (Recently
Opened) was moved onto the brass tokens too — it was still sapphire, so
the OTS tab read brass at the top, sapphire in the middle, brass again on
the detail screen.

**Verified**: Playwright on desktop (1400x940) and mobile (390x844), light
and dark, across Dashboard and OTS. Dark theme tokens untouched, so only
the semantic KPI rule changes there. Full OTS/print/Excel, hero-search
functionality, focus-ring-in-both-themes and OTS/URI persistence
regressions all still passing; zero console errors.

**Not touched (pre-existing, unrelated):** on the Total Outstanding card
the value wraps to two lines ("₹127.64" / "Cr") because the Mar/Jun corner
stats take width beside it. Flagged rather than silently changed.

### Design: OTS Calculator search area rebuilt as a brass "hero card" (2026-08-15, same day)

Alok: *"mera main focus rahta hai ots calculator par wo mera hero hai wo
mujhe bilkul unique chahiye ... search area should be hero card"*. Three
directions were mocked (Brass Plate / Ledger Paper / Vault Console); he
picked **C + B mixed** — Vault Console's structure with Ledger Paper's
ivory body: *"wo old ivory sheets concept achha hai"*.

**The finding that shaped it:** the OTS *borrower detail* screen already
runs on the brass tokens (`--seal #D4A544`) while every other tab is
sapphire — but the OTS *search header* was still sapphire. So the
calculator's identity was only half-built: a blue header bolted onto a
brass screen. The hero now closes that gap.

Shipped as `#searchHeader .ots-hero`, two halves:
- **`.ots-hero-band`** — deep navy plate with a brass hairline along the
  top edge and a soft brass glow, carrying the brand seal and the report
  date as a brass chip.
- **`.ots-hero-body`** — ivory ledger paper (ruled lines via a repeating
  gradient) carrying an oversized mono search slot and the six search
  modes restyled from loose chips into one segmented switch.

Everything is ID-scoped (`#searchHeader ...`) so it outranks the shared
`header.app-head, .detail-head` chrome rules without touching the borrower
detail header those also style. Dark theme keeps the metaphor but as aged
stock (`#241F17`) rather than a white slab; the navy band and brass are
identical in both, so the identity doesn't shift with the theme. Subtitle
trimmed "One-time settlement calculator" → "One-time settlement", since
"Calculator" is already in the title directly above it.

**Two bugs caught while building, both from specificity/nesting:**
1. The report-date chip landed as a *sibling* of the band rather than a
   child, so it rendered on the ivory paper in brass-on-cream — verified
   via `band.contains(date) === false`, then fixed.
2. The dark-theme field shadow rule
   (`:root:not([data-theme="light"]) #searchHeader .search-box`, 1‑3‑0)
   outranked `#searchHeader .search-box:focus-within` (1‑2‑0) and silently
   ate the focus ring in dark mode. Resting and focus shadows are now
   per-theme tokens, so one rule per state and focus always wins.

**Verified**: live Playwright on mobile (390x844) and desktop (1400x900),
light and dark — live-typing results, Clear button, mode switching
(placeholder follows the mode), Search button, and a focus ring confirmed
present in *both* themes. Full OTS/print/Excel and recents/persistence
regressions still passing; zero console errors.

### Feature: typed OTS Amounts now saved on the device, start screen trimmed to Recently Opened only (2026-08-15, same day)

Four changes Alok asked for together, a day after the Action Hub shipped:

**1. Start screen is Recently Opened only.** The branch chips, asset bar
and the two portfolio stat cards are gone -- "recently opened hi do keval".
`startBranchStats()`, `showStartBranchList()`, `showStartAssetList()`,
`START_ASSET_ORDER` and their CSS were deleted rather than left dead.

**2. Last 50 instead of last 5** (`RECENT_MAX`). The list just extends the
page and scrolls naturally; 50 rows is nothing to render.

**3. Typed OTS Amounts are saved on the device.** Previously `otsAmounts`
was in-memory only, so every reload wiped a settlement being worked out.
Now persisted to `localStorage` (`upgb-ots-amounts`) on each keystroke and
restored at load. Device-only, exactly as asked -- never published, never
sent anywhere, so each person's working figures stay their own.

   **Interest Reversal overrides are persisted alongside**
   (`upgb-uri-overrides`), which Alok did not explicitly ask for but is
   required for correctness: Interest Reversal feeds Total Dues, which
   feeds Total Sacrifice, so restoring the OTS Amount without it would
   show a *different* sacrifice figure than the one on screen when the
   account was last left. Verified: Total Sacrifice is byte-identical
   across a full reload.

   A daily NPA upload used to do `otsAmounts = {}`. That would now throw
   away real work every morning, so it prunes to accounts still present in
   the new file (regularized/closed ones drop) and carries the rest
   forward.

**4. The saved OTS Amount shows in the Recently Opened row**, under the
O/S figure and in the accent color, summed across the borrower's linked
loan accounts via `savedOtsFor()` -- so it matches the "Total OTS Amount"
the detail screen shows for a multi-loan household. Rows with nothing
entered yet stay a single clean line.

**Also added (not asked for -- flagged for removal if unwanted):** a small
"Clear" control on the Recently Opened header. With a 50-entry list that
only ever grows, there was otherwise no way to prune it. It clears *only*
the visited list -- saved OTS Amounts are keyed by account, not by this
list, and are real work, so they survive; verified explicitly.

**Verified**: live Playwright pass on mobile (390x844), light and dark --
OTS and Interest Reversal both restored after a full reload with Total
Sacrifice unchanged (₹25,974.32 before and after); multi-loan borrower's
row showing OTS ₹1.00 L for 30,000 + 70,000 across two accounts; a seeded
60-entry list correctly capped at 50 rows; Clear emptying the list, falling
back to the search hint, and leaving `upgb-ots-amounts` intact. Zero
console errors; full OTS/print/Excel regression still passing.

### Copy: start screen labels switched to formal English (2026-08-15, same day)

The Action Hub shipped with Hinglish section labels ("Waapas wahin se",
"Branch se kholo", "Saari 55 ›", and a Hinglish first-run hint), matching
how Alok and I talk in chat. He asked for **formal English only,
everywhere** in the product itself. Changed to "Recently Opened", "Open by
Branch", "All 55 ›", and "Search by <mode> above. Borrowers you open will
be listed here for quick access." The multi-loan suffix also moved from
"· 2 loans" to "· 2 accounts", matching the app's own terminology
elsewhere ("NPA Accounts", "loan accounts linked").

Swept the rest of the app for residual Hinglish in user-facing strings --
none found; `index.html` and every other UI string were already English.
One Hinglish phrase remains in a **code comment** in `js/app.js`, where it
quotes Alok's original instruction verbatim ("koi fancy dashboard nahi")
as the recorded reason for a design decision -- left as-is deliberately,
since rewriting a quotation would misrepresent what was actually said. It
never renders anywhere.

### Feature: OTS Calculator start screen rebuilt as an "Action Hub" (2026-08-15)

The Search tab's opening screen was a house icon, a heading and one line of
text on an otherwise empty page -- roughly 70% of a phone screen doing
nothing, while 13,925 accounts of loaded data went unmentioned. Alok asked
for mockups first; three directions were built (Quick Start / Portfolio
Snapshot / Action Hub) and he picked **Action Hub**, then added "aur asset
bhi daal dena".

Shipped layout, in order -- action first, context second:

1. **Waapas wahin se** -- the last 5 borrowers opened, newest first, each a
   tap back into that borrower. New feature: `localStorage` only (key
   `upgb-recent-borrowers`), never published and never sent anywhere, so it
   stays per-person even though the app needs no login. Keyed by cust ID so
   re-opening moves a borrower back to the top instead of duplicating.
   O/S is **summed across the borrower's linked loans** (same slots
   `openDetail()` builds) -- storing only `custRow`'s own balance
   under-reported a 2-loan household as ₹38,155 when the real figure is
   ₹1.19 L. Multi-loan borrowers also show "· N loans".
2. **Branch se kholo** -- top 4 branches by O/S as chips, each opening that
   branch's full account list in the shared list modal, plus a "Saari 55 ›"
   chip through to the Dashboard.
3. **Asset classification** -- a segmented bar in regulatory severity order
   (SUB_STD → DA1 → DA2 → DA3 → LOSS, not by count) so it reads
   left-to-right as a severity ramp, colored on the same green→red language
   `.badge-pill.<code>` already uses. Each legend entry opens that class's
   accounts.
4. **Two stat cards** -- NPA Accounts, Total O/S.

Branch/asset totals come from a memoised pass over the raw NPA rows rather
than `currentDashStats`, which only exists once the Dashboard has rendered
and this is often the first screen opened; the memo is invalidated on data
apply. Before the first borrower is ever opened, the Recent slot carries a
search hint instead, so the screen still opens with a clear next step.

**Also fixed, found while building this:** "Crafted by Alok Mittal" was
rendering **twice on every screen** -- the in-flow `footer.app-foot` plus
the sidebar's `.nav-foot .sig` on desktop, and that same footer plus the
fixed `.mobile-sig` strip on a phone. Each viewport already carries its own
signature (and the print sheet its own `.pv-footer`), so `app-foot` is now
hidden everywhere. A "Data as on" line drafted for the start screen's own
footer was dropped for the same reason -- the page header already prints
the report date.

**Verified**: live Playwright pass on a real mobile viewport (390x844) and
desktop (1400x900), light and dark -- first-run hint state, recents
populating in correct order after opening two borrowers, recent tap opening
the right borrower, branch chip → "JARERA — Accounts | 958 account(s)",
asset chip → "Substandard asset — Accounts | 1,818 account(s)" (matching
the legend count), and exactly one signature visible per viewport in both.
Zero console errors; full OTS/print/Excel regression still passing.

### Feature: Net Settlement Impact now shows both a Dues% and an O/S% (2026-08-14, same day)

Alok pointed out that the aggregate "Net Settlement Impact" ring only ever
showed OTS Amount as a percentage of Total Dues -- correct, but he wanted
the O/S-Balance-based percentage shown alongside it too, and asked for
this "wherever it's shown" consistently, not just the one spot.

**Aggregate hero card**: kept the ring as-is (still the Dues-based %, per
"jo theek bhi hai"), and added a two-chip row underneath it -- "OF TOTAL
DUES" / "OF O/S BALANCE" -- always visible on both desktop and the mobile
dock (unlike `.agg-hero-sub`, which is hidden on mobile).

**Per-account Settlement Progress row**: was already showing "X% of
dues"; now reads "X% of dues · Y% of O/S" so the same pairing applies at
the individual-account level too, not just the aggregate. (The small
`pctNetOs` tag next to the OTS input itself was left as the O/S-based
quick-glance figure it already was -- the fuller Settlement Progress row
right below it now carries both readings.)

**Verified**: live Playwright pass -- Dues% (86.6%) and O/S% (93.1%)
both compute and render correctly on desktop and a real mobile viewport
(390x844), with a screenshot check that the mobile dock's fixed-height
layout still has clearance and doesn't overlap the content behind it.
Zero console errors; full OTS/print/Excel regression still passing.

### Feature: WhatsApp link alongside every Manager/Recovery Officer phone number (2026-08-14, same day)

Alok tapped a phone number in the new branch contact card and noticed the
Android "Open with" chooser only offered Phone/Truecaller/Zoom -- no
WhatsApp. That's expected, not a bug: WhatsApp doesn't register itself as
a handler for `tel:` links on Android/iOS, so it can never appear in that
chooser no matter what the link looks like. The real fix is a separate,
dedicated WhatsApp link.

Added `waIconLink()` -- builds a `https://wa.me/91<10-digit-number>` deep
link (wa.me needs the full international number, no `+`/spaces; a bare
10-digit Indian mobile gets "91" prefixed) rendered as a small green
WhatsApp-brand icon sitting right next to the phone number, both in the
Branch/Sol ID panel's row and in the full branch card -- tapping it opens
a WhatsApp chat with that number directly, same as any other app that
shows a WhatsApp icon beside a phone number.

**Verified**: live Playwright pass on a real mobile viewport (390x844) --
panel row and card both render the tel: link and WhatsApp icon side by
side on one line, hrefs correctly formed (`https://wa.me/919870838125`),
zero console errors, full OTS/print/Excel regression still passing.

### Feature: Branch Contacts becomes a real upload (Manager + Recovery Officer), with a full-detail card (2026-08-14, same day)

Alok asked for three things on top of yesterday's branch-contact panel: (1)
rename "Alternate Contact" to "Recovery Officer" and show that name/number
too, (2) turn Branch Contacts into a proper Update Data upload with a
template, like every other data source in the app, instead of a hardcoded
code-shipped list, and (3) make tapping a branch pop up a card with
everything on file for it, including both Old and New Sol ID.

**Data model change**: removed the hardcoded `MANAGER_CONTACTS` constant
from yesterday's ship entirely. Contacts now live on `DATA.branchContacts`
(keyed by Sol ID), uploaded via a new "Branch Contacts (Manager / Recovery
Officer)" section in Update Data -- same "own slow-moving schedule, full
replace, not part of the daily NPA file, goes live on next Publish"
treatment as the existing Branch Advance upload, and now included in the
Publish payload alongside it. `data/latest.json` was seeded with
everything collected so far (55 branches' worth), with the old "Alternate
Contact" fields renamed to `roName`/`roMobile` (Recovery Officer) so
nothing already collected was lost in the rename.

**Parser**: `buildBranchContactsMap()` (mirrors `buildBranchAdvanceMap` --
header-driven column matching, Sol ID required, every contact field
optional since collection is ongoing).

**Template**: unlike the other "blank + one example row" download
templates in this app, `downloadBranchContactsTemplate()` pre-fills every
branch's Sol ID, Old Sol ID and Branch Name from `BRANCH_LIST` (the app's
own reference list), *and* carries forward whatever's already in
`DATA.branchContacts` -- re-downloading after a partial upload doesn't
throw away what's already been collected, only the still-blank cells need
filling in.

**Full branch card**: tapping any row in the Branch/Sol ID panel now opens
a card (reusing the existing Quick Account Detail modal) showing the
branch name, Old + New Sol ID, and every contact field on file -- Manager
name/mobile/email, Recovery Officer name/mobile, landline, category,
address, IFSC, remarks -- with tap-to-call and mailto links. Each panel
row itself now shows both the Manager's and the Recovery Officer's name +
number (previously Manager only).

**Verified**: live Playwright pass -- template download pre-fills all 56
branches correctly (confirmed by intercepting the generated Blob, since
this sandbox's headless Chromium doesn't fire real download events even
for the pre-existing Branch Advance template button -- a environment
limitation, not a regression); uploading a 2-row test CSV correctly
replaces `DATA.branchContacts`, enables Publish, and the Branch/Sol ID
panel + card immediately reflect the new data with zero console errors;
full OTS/print/Excel regression still passing.

### Fix: OTS Calculator search results now sort A-Z by borrower name (2026-08-14, same day)

Alok asked that the results list under the OTS Calculator's Search tab
(type 6+ characters -- account no./cust ID/mobile/Aadhar/PAN/SB no. --
the matching-borrowers table that appears) come back sorted by name
instead of raw data order. Added one `matches.sort()` by `NAME` (case-
insensitive) in `runSearch()`, right before the results render -- applies
regardless of which of the 6 search modes was used.

**Verified**: live Playwright search on a 6-digit substring that matched
23 real accounts across different names -- results render already
sorted A-Z. Zero console errors.

### Feature: Branch Manager contacts added to the Branch/Sol ID panel (2026-08-14, same day)

Alok asked for an Excel template to collect Branch Manager Name/Mobile/
Email for all 55 Hathras region branches, then filled it in (manager name
for every branch, mobile numbers for the first 6) and sent it back asking
where this shows up in the app -- it didn't, since the template was a
standalone deliverable, not wired into the app. Asked where he wanted it
shown; he picked the existing Branch/Sol ID edge panel.

Added `MANAGER_CONTACTS`, a small object keyed by Sol ID (same pattern as
the existing hardcoded `BRANCH_LIST` right above it -- occasional
reference data updated via a code ship, not part of the daily-published
NPA dataset), holding whatever fields have been collected so far (manager
name/mobile now; email/alternate contact/landline/category/address/IFSC/
remarks as they come in later, per the Excel template's columns). Each
branch row in the panel now shows the manager's name and a tap-to-call
mobile link underneath, only when that branch has data -- branches not
yet collected (or the Regional Office / Service Branch rows, which have
no manager) show no extra line. Branch search now also matches on
manager name.

**Verified**: live Playwright pass -- all 55 branches with a manager name
render correctly, tap-to-call links use `tel:`, searching "harendra"
correctly narrows to just Agsauli, and the 2 rows with no manager data
(R O Hathras, Service Branch) render with no gap. Zero console errors;
full OTS/print/Excel regression still passing.

### Fix: Recovery Scale bar was nearly invisible on the light/brass theme (2026-08-14, same day)

Alok sent a screenshot: the "Recovery Scale" bar in the OTS Calculator's
aggregate sidebar was basically unreadable -- just a faint pale-green
watermark with no visible red zone at all. Two separate bugs, not one:

**1. The loss (pre-break-even) zone had no width at all.** `.agg-band.loss`
was `left:0` with no `right`/`width` set and no JS ever touching it --
an empty, unsized `<div>` collapses to 0×0, so the red zone never
rendered, at any opacity, in any theme. Fixed by making it `left:0;right:0`
(the full track, as a base layer), with the safe band painted over it
from break-even rightward -- exactly mirroring how the two zones are
meant to divide the track.

**2. Both bands used a diagonal-hatch pattern at 18-24% opacity of the
dark-theme hex values, regardless of theme.** On the near-white "brass
paper" background the light-theme OTS reskin introduced, that's nearly
imperceptible -- confirmed exactly matching Alok's screenshot. Replaced
the hatch with solid fills + a solid 1.5px border, and made the color
theme-aware: dark theme keeps the bright `--pos`/`--neg`-adjacent hex at
moderate opacity, light theme switches to the same darker, more-saturated
`--pos`/`--neg` tokens already used elsewhere in light mode for positive/
negative figures (a dark color needs less alpha to read clearly on white
than a bright one does).

**Verified**: live screenshot in both themes with an account whose OTS
Amount sits below break-even (so both zones + the needle are all
exercised) -- red/green bands and the needle position are now clearly
visible with real width and solid color in both. Zero console errors;
print/Excel export/aggregate totals regression-tested unaffected (this
block is desktop/tablet-only -- already hidden on mobile).

### Removed the OTS lock/freeze feature entirely (2026-08-14, same day)

Alok reported the OTS Amount field sometimes refused input, with the
account "freezing" unpredictably. Root cause was a race condition in the
lock-sync design: `refreshLocksFromServer()` polled `data/locked-ots.json`
every 45s to pick up freezes/unfreezes made from other devices, but the
relay write behind a freeze/unfreeze is asynchronous -- if the poll landed
in the few-second gap before the server file caught up, it would read a
stale snapshot. Concretely: unfreeze an account to edit it → the poll
fires before the relay's unfreeze write lands → the poll still sees the
account locked at the old amount → it "helpfully" re-locks it and disables
the input mid-edit. A first fix (a `pendingLockSync` grace window that
lets a fresh local action override a stale server snapshot for ~90s) was
built and verified working, but once the mechanism causing the problem was
explained, Alok asked to remove the whole freeze/lock feature outright
rather than keep maintaining a cross-device sync layer for it.

Removed everywhere: the freeze/unfreeze chip button and its `disabled`
state on the OTS Amount input (`js/app.js` `otsRow()`), all lock state
(`frozen`, `pendingLockSync`, `DATA.lockedOts`) and its functions
(`toggleFreeze`, `syncLockToServer`, `refreshLocksFromServer`), the 45s
background poll, the `🔒` locked badge in search results, the
`data/locked-ots.json` boot-time fetch and merge, the `lockedOts` field
from the Admin Publish payload, and the freeze-chip CSS (including the
now-unused `ringPulse`/`sealStamp` animations). Deleted the
`relay/api/lock-ots.js` endpoint and the `data/locked-ots.json` data file
outright -- nothing in the app calls or reads them anymore. OTS Amount is
now purely a per-session typed value with no cross-device persistence or
sync, same as Interest Reversal has always been.

**Verified**: live Playwright pass confirms no freeze button/chip exists
anywhere, the OTS input is never `disabled`, typing/re-typing an amount
always works (including after waiting past the old 45s poll interval,
with zero network calls to `locked-ots`/`lock-ots`), and print/Excel
export/aggregate totals for a multi-account household all still compute
correctly. Zero console errors.

### Print/PDF: aggregate order, Sol ID next to branch, info-grid grouping, logo removed, P&L arrow (2026-08-14, same day)

Alok reviewed the print/PDF sheet again and asked for five specific layout
fixes:

**1. Aggregate Totals reordered** to O/S Balance → Total Dues → Total OTS
Amount → Total Ledger Sacrifice → Total Sacrifice. The aggregate block
previously stopped at Total Sacrifice without a Ledger Sacrifice line at
all (only the per-account table row had it) -- added a `totalLedgerSac`
sum (Σ O/S − OTS Amount across all frozen/entered slots) so the aggregate
now carries the same figure the per-account rows do.

**2. Sol ID moved into the branch line** in the header ("Branch: MENDU
(9291)") instead of repeating as its own row in the borrower info grid --
same one-mention-only convention as the earlier branch-name dedup fix.

**3. Borrower info grid split into two explicit columns**: Cust ID /
Mobile / PAN / Aadhar on the left, SB A/c / SB Balance on the right --
previously a single auto-interleaving 2-column grid that mixed the two
groups row by row (Cust ID | Sol ID, Mobile | Aadhar, PAN | SB A/c, ...).

**4. Bank logo removed from the print header.** It wasn't fitting the
header band cleanly at print size and Alok said it isn't actually needed
on this sheet; removed the `<img class="pv-logo">` and its absolute-
positioning CSS. (The logo is untouched in the Excel export, which is a
separate code path with its own use for it.)

**5. Impact on P&L now shows a directional arrow** (▲ for positive, ▼ for
negative) before the rupee figure, matching the up/down icon-set
convention Excel's conditional formatting uses -- so the sign reads at a
glance instead of only from a minus sign inside the number.

**Verified**: live Playwright pass against a real account (152235110000753)
at two different OTS Amounts -- confirmed the aggregate order, the "MENDU
(9291)" branch line, the two-column info-grid split, no logo in the
rendered header, and both ▲ (OTS above break-even) and ▼ (OTS below
break-even) arrow directions render correctly. Zero console errors.

### Forensic audit: 3 real defects found and fixed (2026-08-14, same day)

Alok asked for a full forensic audit of the entire application, OTS
calculation especially, treating nothing as correct-by-assumption. Full
findings are in the audit report delivered separately; the three real,
fixable defects found are documented here.

**1. `toDate()` silently misparsed malformed date strings as wrong
dates instead of failing.** Any date string not matching plain
`DD-MM-YYYY` (stray whitespace, ISO `YYYY-MM-DD`, US `MM-DD-YYYY`, ...)
fell through to `parseFloat()`, which parses a *leading* numeric prefix
rather than the whole string -- so e.g. `"  22-07-2022  "` silently
became "Excel serial day 22" (a date near January 1900) instead of
failing or returning null. Rewrote to strictly validate `DD-MM-YYYY`
with a full round-trip check (also now rejecting impossible calendar
dates like 31 Feb), and only accept a numeric-string fallback when the
*entire* trimmed string is numeric. Verified against all 13,925 real
NPA_DT/SANCT_DT values in `data/latest.json` -- zero were in a format
this stricter check doesn't already handle, so nothing real changes;
only malformed input now fails safely instead of silently.

**2. Negative OTS Amount was accepted with no validation anywhere.**
Typing e.g. `-5000` into OTS Amount flowed straight through into Total
Sacrifice, Ledger Sacrifice and Impact on P&L (producing nonsense
figures like a "sacrifice" larger than Total Dues), and could even be
frozen/locked as the amount communicated to the borrower -- across
*seven* independent call sites (screen calc, freeze/lock, aggregate,
print, Excel) that each re-parsed the raw typed value slightly
differently, none checking sign. Added one shared `parseOtsAmount()`
helper (mirroring the existing `uriFor()` pattern) that treats negative
as invalid, same as blank -- used at all seven sites now, so a negative
OTS Amount reads as "not yet entered" (dashes) everywhere consistently,
and can no longer be frozen/locked.

**3. The Daily NPA Projection live-sync relay validated an update's
*shape* but not its *contents*.** `relay/api/daily-proj-live.js`
checked `Array.isArray(u.row)` and nothing else -- a wrong-length row,
wrong cell types, or an oversized string would have been written
straight into the shared `data/daily-npa-projection.json` with no
validation catching it, corrupting the live sheet for every viewer.
Added a full per-cell shape/type check matching the file's real 8-column
schema. Also documented (not changed without asking) that this endpoint
and the OTS-lock endpoint have no authentication at all beyond a CORS
header, which is a browser-only courtesy, not real authorization -- a
direct (non-browser) API call bypasses it entirely. This is a deliberate
trade-off from when the "no GitHub sign-in needed for field staff"
design was chosen earlier this session, not an oversight, so it wasn't
changed unilaterally -- flagged in the audit report for a decision.

**Verified**: independent reference calculations built from scratch and
cross-checked against two real accounts (a standard scheme + a KCC/CC004
scheme) -- exact match to the cent on UCI, Total Dues, Provision, Total
P&L. Formula consistency confirmed across screen/print/Excel (no drift
between the three). XSS-escaping coverage checked for name/address/branch
fields (all consistently escaped). 11/11 unit tests for the new relay
row-validator, including rejecting NaN/Infinity/oversized-string/wrong-
type payloads. Full regression pass: normal OTS flow, freeze/unfreeze,
print render, Excel export -- all still working, no console errors.

### Bug fix: OTS Amount unreachable on mobile right after Interest Reversal (2026-08-14, same day)

Alok: *"App main interest reveral type karne k baad ots amount feed nahi
karne de raha."* Reproduced in a headless browser with a real click, not
guessed from reading code -- confirmed the exact failure Playwright's own
retry log showed: taps meant for the OTS Amount field were landing on
`#aggBar`, the fixed-position aggregate dock at the bottom of the mobile
screen, instead.

**Root cause**: `#aggBar` is `position:fixed;bottom:0` on mobile, sitting
on top of the last ~220px of whatever loan-table content is scrolled
underneath it. A `padding-bottom:330px` rule already existed specifically
to guarantee the *last* table row could clear the dock at full scroll --
but it does nothing for a row scrolled to some *earlier*, in-between
position, which is exactly what happens the moment a field is focused:
the browser's native "bring the focused input above the keyboard"
auto-scroll (the same mechanism Interest Reversal's own focus had just
triggered) stops as soon as the target is merely inside the raw viewport
rectangle -- it has no way to know a fixed dock covers the bottom slice
of that rectangle, so OTS Amount could land right behind it, focused or
not, untappable either way.

**Fix**: added `scroll-margin-bottom:240px` to the OTS Amount/Interest
Reversal input fields (mobile only) -- this tells the browser's own
scroll-into-view logic where the *real* usable bottom edge is, so
focusing either field always leaves genuine clearance above the dock
instead of stopping the moment it's technically inside the raw viewport.
Also added a `focusin` listener as a second line of defense, re-centering
any of these fields on focus regardless of what triggered it.

**Verified**: the exact failing repro (Interest Reversal typed first,
then click+type OTS Amount, on a real 2-account borrower at a 420px
mobile viewport) now succeeds cleanly on both account slots, with no
retry/interception. No console errors.

**Noted but not fixed here** -- while testing, ran into a *separate*,
narrower issue: the freeze/lock button next to OTS Amount can also get
blocked by the sticky first-column label on very narrow screens (a
different mechanism -- horizontal sticky-column overlap, not the fixed
dock). Alok didn't report this one; flagging it here rather than
silently expanding scope, in case it turns out to affect real use too.

### Print/PDF: dropped a repeated branch name, moved scheme code into the table, removed a duplicate O/S row (2026-08-14, same day)

Alok sent a real exported PDF (BHAGWATI_PRASAD) and pointed out three
things: *"ismain branch ka naam ladpur 3 baar aa raha hai jabki 1 baar
theek hai bar bar need nahi hai. niche CC004 jo ki scheme code hai use
wahan se hata kar table main hi daal do outstanding row se upar. kahin
outstanding and net os ek hi rahti hai hamesha to use wahi rehne do."*

- **Branch name repetition**: was in the header ("Branch: LADPUR"), the
  borrower info grid ("Branch: LADPUR"), and the footer scheme line
  ("CC004 · LADPUR") — three times for one fact. Kept only the header
  copy (the natural single "letterhead" spot); removed the info-grid row
  entirely.
- **Scheme code (CC004)**: was stuck in a small footer line alongside
  the now-redundant branch name. Moved into the particulars table as its
  own row, one per account, positioned right above O/S Balance where the
  settlement figures start — and dropped the footer line altogether
  (nothing left in it once branch and scheme both moved elsewhere).
- **O/S Balance vs Net O/S**: these were two separate rows always
  showing the exact same number (Net O/S is defined as always equal to
  O/S Balance, no exceptions — the underlying rule from an earlier
  session). Removed the Net O/S row; O/S Balance is the one that stays.

**Verified** against the real PDF's data: reprinted the same borrower,
confirmed the branch name (BALDEV in the test case) now appears exactly
once as a labeled field (a second incidental appearance inside the
postal address text, e.g. "PO BALDEV", is real address content, not a
duplicate field, and was left alone), confirmed "Scheme" now renders
right above "O/S Balance" showing the account's real scheme code, and
confirmed "Net O/S" no longer appears anywhere in the row list. No
console errors.

### Print/PDF: stripped back to a plain, professional sheet (2026-08-14, same day)

Alok: *"Pdf thoda clean and profesional banao icon wagerah hata do colours
hata do jo main show karne hain unhe bold kar do and act as per your
knowledge."* Same direction as the earlier Excel cleanup, now applied to
the print/PDF sheet (this one had kept the brass reskin from earlier
today, per an explicit "premium look, background light hi rahe" ask —
that request is now superseded by this one, which is more specific:
plain and professional over decorative).

- Removed every icon: the row-label icons in the particulars table
  (`ltIcon(...)` per row) and the person-silhouette icon next to the
  borrower's name. Text-only labels now.
- Removed every accent color: the brass header rule (`#B3812A`), the
  header-band and strong-row fills (`#E9D2A0`/`#F3E6C8`/`#FBF3E1`/
  `#F0DCB0`), and the "AGGREGATE TOTALS" title's brass tint (`#8a6114`)
  are all gone — replaced with black rules and black text throughout.
- The rows that actually matter (O/S Balance, Total Dues, Total P&L,
  OTS Amount, Total Sacrifice, Impact on P&L) stay visually distinct
  through **bold weight + a hair larger size + a heavier top border**
  only — no fill color needed to tell them apart from the plainer rows
  around them, same "which numbers matter" idea as before, done purely
  typographically now (closer to how a real settlement letter or bank
  statement is set).

**Verified** via Playwright with print-media emulation: 0 SVG icons
remain anywhere in `#printArea`, `getComputedStyle` confirms every text
color and border in the sheet is black/dark-gray (no brass/color values
left), and a zoomed screenshot confirms clean black-on-white rendering
throughout (an earlier low-res screenshot looked like it had a bluish
tint on the numbers — a compression artifact in the thumbnail, not a
real rendering issue; getComputedStyle and a zoomed crop both confirmed
pure black). No console errors.

### OTS Calculator: "Where The Dues Go" made collapsible on mobile (2026-08-14, same day)

Alok sent a screenshot of the mobile aggregate dock and asked to either
remove the "Where The Dues Go" waterfall block or add auto-hide/unhide,
since it was eating a lot of phone screen space in the fixed bottom dock.

It had actually been kept on mobile deliberately earlier in the session
("Recovery Scale dropped from the mobile dock... Where The Dues Go
stays -- one chart, not two") -- real usage now shows even that one
chart is too much permanently-visible space on a phone. Rather than
remove the feature outright, made it collapsible: starts collapsed
(just the header + a chevron) on mobile, taps open to the full bar +
legend, taps again to close. Desktop is untouched -- the chevron stays
hidden and the block stays permanently expanded there, since the
sidebar already has the room.

**Verified** via Playwright at a phone viewport: starts collapsed
(0px body height), tapping the header expands it (72.5px, chevron
rotates), tapping again collapses it back. At a desktop viewport the
block stays expanded (85px) with the chevron hidden the whole time, as
before. No console errors.

### Perf: found and fixed the real cause of the slow, WiFi-every-time load (2026-08-14, same day)

The parallel-fetch tweak (previous entry) was flagged as unlikely to
fully explain a 1-minute+ load. Alok confirmed: WiFi, and slow *every*
single time, refresh included -- ruling out a one-off network blip or a
mobile-signal issue, and pointing at something that reloads on every
visit regardless of caching. Two real, substantial finds:

**`css/styles.css` was 1.34MB, and 90% of that was embedded fonts.**
The self-hosted webfonts added earlier today (Manrope, Caveat, Archivo,
IBM Plex Mono, all inlined as base64 so the print/PDF path doesn't
depend on what's installed on the machine opening it) had been pasted in
straight from Google Fonts' CSS output, which splits every weight into
multiple `@font-face` blocks by unicode-range (latin, latin-ext,
cyrillic, cyrillic-ext, greek, vietnamese, ...) so a browser can fetch
*only* the subset it needs -- from a normal `url()` reference. Inlined as
`data:` URIs instead, that per-subset selectivity is defeated entirely:
every subset's full base64 payload ships inside the CSS on every load,
including Cyrillic, Greek and Vietnamese script data that this
Hathras-region NPA app will never render a single character of. Removed
those 24 non-Latin `@font-face` blocks (668KB) — `styles.css` drops from
1.34MB to 782KB, a 42% cut, with zero visual change (Latin + Latin-ext,
the only scripts actually used, are untouched).

**The Service Worker's shell-asset precache had drifted out of sync and
was eagerly downloading a 1.1MB file nobody needed yet.** `SHELL_ASSETS`
in `sw.js` still pointed at `?v=20260724c` for every JS/CSS file, while
`index.html`'s real `<script>`/`<link>` tags had moved through many
later version bumps (today alone: `f` through `n`) -- so every one of
those precached URLs was already dead weight, never actually served,
just wasted install-time bandwidth. Worse, `pdf.worker.min.js` (~1.1MB)
was in that eager list even though it's only used by the PDF-upload
feature (`parseBankPdf`, an occasional Admin action) -- meaning *every*
single Service Worker update, including several shipped today, forced a
~1.1MB download in the background regardless of whether anyone touched
that feature. Synced the version strings and dropped
`pdf.worker.min.js` from the eager list entirely -- it still caches
normally the first time the PDF-upload feature is actually used, nothing
lost, just no longer forced on every load.

**Verified** via Playwright: Cache Storage after a fresh install now
holds only the `?v=20260814n`-tagged files (no stale entries),
`pdf.worker.min.js` is confirmed absent from the precache, `styles.css`'s
brace count stays balanced (781,599 bytes, syntactically valid), fonts
still render correctly (Manrope on the dashboard, Caveat/Archivo/IBM
Plex Mono on the OTS Calculator detail — screenshotted both, no visual
regression), and no console errors.

### Perf: boot-time data fetches now run in parallel, not one after another (2026-08-14, same day)

Alok, after the Service Worker cache-bloat fix: *"Now working fine but
load hone main abhi bhi 1 min. se jyada ka time le raha hai."* Checked
`data/latest.json` -- it's ~4.2MB uncompressed but served gzip'd (~1MB
over the wire, confirmed via a live curl against the production domain,
~1.2s from a well-connected location), and the row-indexing that runs
once the data lands is a single linear pass, not the kind of thing that
would itself take anywhere near a minute.

One real, if modest, inefficiency found: `loadNpaData()` was fetching
`data/latest.json` (the ~4MB main dataset) and `data/locked-ots.json`
(a few KB) **one after another** instead of at the same time -- the tiny
lock file's fetch didn't even start until the multi-MB main dataset had
fully landed, adding a full extra round trip before the app could
render. Fixed via `Promise.all` so both fire together now.

This alone won't fully explain a 1-minute+ load on its own -- flagged
honestly rather than claimed as a complete fix. If it's still slow after
this ships, the next things to check are the actual network conditions
(WiFi vs. mobile data, signal strength) at the point of use, since nothing
else found in the boot path looks like it should cost anywhere near a
minute on a normal connection.

**Verified** via Playwright: both `data/latest.json` and
`data/locked-ots.json` requests now fire within the same tick of each
other on reload (previously fully sequential), data still loads and
renders correctly, no console errors.

### Search: live-typing now waits for 6 characters, and the list is never capped (2026-08-14, same day)

Alok: *"OK search main pahle 2 digit k jagah pahle 6 digit k baad account
list show karo and han 60 search ki jagah puri list aani chahiye."* Two
small tweaks to the live search shipped earlier today:

- Live-typing now waits for **6 characters** before showing results
  (was 2) — narrows the first list a lot before it appears, since a real
  account number's first couple of digits alone matches far too many
  rows to be a useful "quick suggestion."
- The result list is **no longer capped at 60** — whether triggered by
  live-typing or Enter/Search, every matching row now renders, not just
  the first 60.

**Verified** via Playwright: typing 5 characters shows no results
(still gated), the 6th character fires the live list, and a broad query
("16") now returns the full uncapped match count (4,590 rows) instead of
stopping at 60. No console errors.

### Bug fix: Service Worker was silently filling up Cache Storage from the 3s/45s live-sync polls, slowing the whole app down (2026-08-14, same day)

Once the missing `LOCK_OTS_GITHUB_TOKEN` Vercel env var (see previous entry)
was fixed and OTS lock-sync actually started working live, Alok: *"Live to
ho gaya ye work bhi kar raha hai par pura app slow ho gaya hai abhi tak
bahut smooth chal raha tha ise implement karte hi bahut slow ho gaya."*

**Root cause**: two features poll the server on a timer to pick up changes
made from other devices -- Daily NPA Projection's live-sync every **3
seconds**, OTS lock-sync every 45 seconds (`js/app.js`, `dpPollLive`/
`refreshLocksFromServer`). Each poll's URL carries a unique cache-busting
timestamp (`?t=...`) so it's never requested with that exact URL again --
but `sw.js`'s fetch handler was unconditionally running `cache.put()` on
*every* GET response regardless. That means every single poll -- up to
1,200 an hour just from the 3-second one -- added a new, permanently dead
entry to Cache Storage that would never be read back, only cleared out on
the next app version deploy. Across a long-running tab (exactly today's
situation, with the extended Vercel token troubleshooting keeping the app
open for a while on the same version), this silently piled up thousands of
useless entries and visibly slowed the browser tab down.

**Fix**: `sw.js`'s fetch handler now sends `data/locked-ots.json` and
`data/daily-npa-projection.json` straight to the network with no caching
step at all -- nothing to write, nothing to grow. Every other request
(shell assets, `data/latest.json`, KCC Overdue, PNPA, Bank Dashboard, etc.)
still gets cached exactly as before, so offline fallback for the real app
data is unaffected -- only the two endpoints that are *provably* never
re-requested with the same URL were touched.

**Verified** via Playwright: fired 5 rounds of both polled endpoints with
unique cache-busting timestamps (mirroring real polling) -- 0 entries
landed in Cache Storage for either, while a normal one-time data fetch
(`data/bank-npa.json`) and the app shell still cached correctly (1 entry
and present respectively). No console errors. Because this ships as a new
Service Worker version, every user's already-bloated cache from today gets
wiped automatically the next time the app updates (the existing
version-mismatch cleanup in `sw.js`'s `activate` handler already does
this — no extra step needed).

### Search: switched from big result cards to a compact account list, matching the other tabs (2026-08-14, same day)

Alok's follow-up after the live-search change: *"Ye keval 8 match hi kyun
show kr rha hai and pure cards kyun show ho rHe hain jaise baki 2 jo
dashboard hain unamin account ki list aati hai to search main type karne
oar vaise hi list aaye accoring to typed fir select karen to card open ho
ya pura module."*

Two things, both fixed:

**"Keval 8 kyun"** — live-typing was deliberately capped at 8 (to keep
the old, tall result cards from overwhelming the screen on every
keystroke). Now that the list itself is compact (see below), that
special cap is gone -- live typing and Enter/Search both return the same
up-to-60 matches.

**"Baki 2 dashboard jaisi list"** — the Search screen's results were
still the old big `.result-card` blocks (O/S/Net O/S/P&L grid, multi-
account breakdown, badges). Replaced with the exact same compact,
scrollable account-list table already used on the Bank Dashboard's "All
Accounts" list and the KCC Overdue/PNPA account lists: Account No.,
Customer, Branch, Asset code, O/S Balance, one row per match. Tapping a
row opens the full OTS Calculator detail (`openDetail`) exactly like
before -- nothing about what opens on selection changed, only how the
list looks and behaves while choosing from it. An 🔒 marker still shows
next to an account whose OTS is already locked/communicated, carried
over from the old cards.

**Verified** via Playwright: search list now renders as `.dash-table`
rows (Account/Customer/Branch/Asset/O/S Balance columns, no `.result-card`
markup left), returns up to 60 matches while live-typing (not capped at
8 anymore), and clicking a row opens the OTS Calculator detail with that
account's OTS input present. No console errors.

### Search: results now appear live as you type, no Enter/Search tap needed (2026-08-14, same day)

Alok: *"Theek hai ab 1 major integration. Jab ots calculator main account no
type kare to tum khud apna logic use karo and list show ho and select bhi
kar sake list main account no name branch name aur bhi kuch aana chahiye
to dekhna."*

The Search screen (the entry point into the OTS Calculator) already had
result cards showing Account No., Name, Branch, asset code, O/S Balance,
Net O/S and Total P&L — but that list only appeared after pressing Enter
or tapping the Search button. The actual gap was that it wasn't *live*.

**Fix**: typing into the search box (any mode — Account No., Cust ID,
Mobile, Aadhar, PAN, SB No.) now triggers the search itself, debounced by
~160ms so it doesn't refire on every keystroke, gated to 2+ characters so
it doesn't try to match against a single stray digit. While live-typing,
results are capped at 8 (reads like quick suggestions); pressing
Enter or tapping Search still runs the same search uncapped (up to 60,
unchanged). Every card is exactly the same clickable result card as
before — tapping one opens the OTS Calculator detail view directly, same
as it always did.

**Verified** via Playwright: typing "1" alone shows 0 cards (gated),
typing a 2nd character fires the live list (8 cards, each showing
Account No., Name, Branch, asset badge, O/S/Net O/S/P&L), tapping a card
opens the OTS Calculator with the account's OTS input field present,
clearing the box returns to the empty state, and Enter still returns the
full uncapped list (60 cards). No console errors.

### Excel export: colors stripped back to plain, Impact-on-P&L gets a profit/loss arrow (2026-08-14, same day)

Alok, after the logo-overlap fix, still rated the exported Excel file
6/10: *"Ye abhi bhi 6/10 hi hai a  and b column ki har row ko merge kar
lo na to thoda space bhi mileva and data bji proper set ho jayeva ya khcb
aur hai dimag main to wo karo ismain se colors hata do bas last mai.
Profit aa raha hai ya loss wahan arrow set karna."*

Three asks, handled as follows:

**"Colors hata do bas"** — every brass fill color in the Excel export
removed: the Report Date cell, both header-row bands (main sheet +
Calculation Details sheet), row-label bands, the OTS Amount editable
cell, the strong-row highlight tint, and both Aggregate Totals cells.
Also reverted the brass letterhead border (back to the same neutral grey
used everywhere else) and the "AGGREGATE TOTALS" title's brass font
color (back to black). This is a return to, and reinforcement of, the
existing project rule that Excel stays functional/plain — bold text,
real borders, live formulas — while the color/brass treatment is
reserved for the app screen and the print/PDF sheet, which the user did
not ask to change here.

**"Profit aa raha hai ya loss wahan arrow set karna"** — the "Impact on
P&L" row now uses its own Excel number format
(`XL_INR_FMT_PL = '[Green]"▲ ₹"#,##,##0.00;[Red]"▼ -₹"#,##,##0.00'`)
instead of the shared currency format used by every other row. Because
this is a number *format*, not a static label, the arrow flips live off
the formula's own sign as the OTS Amount is edited — ▲ green when the
account is in profit, ▼ red when it's a loss — with no extra
conditional-formatting rule needed. Every other currency cell keeps the
plain black/red format, unaffected.

**"A/B column merge for space"** — not done as literally merging cells.
Every label/value pair in this sheet is a distinct editable cell on
purpose (that's the live-formula export feature itself); merging A and B
row-by-row would destroy the ability to have a separate, independently
addressable numeric cell next to each label. Flagging this back rather
than guessing silently at a change that could break the sheet's core
feature.

**Verified**: re-exported via Playwright + inspected with openpyxl —
zero solid fills remain on either sheet (`OTS Calculator` and
`Calculation Details`), all formulas and cell references are unchanged,
and the "Impact on P&L" row's `number_format` confirmed as the new
arrow format on every account column. Embedded image count still 1 (the
logo only, no colors reintroduced as images).

### Bug fix: Excel export's bank logo overlapped the title text (2026-08-14, same day)

Alok sent a real screenshot from his phone (Google Sheets/mobile Excel)
of an exported file for a single-account borrower and asked for an
honest rating -- the bank logo was visibly sitting on top of the "U" in
"UPGB OTS CALCULATOR", overlapping the title instead of sitting cleanly
to its left.

**Root cause**: the logo image is anchored at column A, row 1
(`tl:{col:0,row:0}`), and the title/subtitle merges also *started* at
column A (`ws.mergeCells(1,1,1,...)`), centered across the merge. On a
narrow export (few linked accounts, so a narrow total merge width), the
centered text's horizontal midpoint lands close enough to the top-left
corner that it visually collides with the 40x40px logo sitting there --
worse the fewer accounts are linked, which is exactly the single-account
case in the screenshot.

**Fix**: title and subtitle merges now start at column B instead of A
(`ws.mergeCells(1,2,1,...)` / `set('B1', ...)`), leaving column A
reserved for the logo alone, with no text ever sharing that column
regardless of how many accounts are linked or how narrow the export is.

**Verified**: re-exported and confirmed via openpyxl that `A1` is now
empty and the title's merged range is `B1:F1` (was `A1:D1`) -- the logo
and title text can no longer occupy the same column. (LibreOffice
headless rendering wasn't cooperating in this sandbox to produce a pixel
screenshot, so this was confirmed structurally rather than visually --
flagged here rather than glossed over.)

### OTS Calculator: brass reskin extended to Print/PDF and Excel export (2026-08-14, same day)

Alok: *"Pdf and excel sahi and redesign krna bahut achhe se and print bhi
dark aaye ye bhi dhyan rahe."* Asked a clarifying question before touching
anything, since this print sheet was explicitly made light/white earlier
this session specifically for laser-printer ink economy (bank branches
print this daily) -- confirmed "dark" meant bold/strong key figures, not
a literal dark background; the printer-friendly white background stays.

**Print sheet** (`renderPrintView()` / `.pv-*` in `css/styles.css`):
brass border under the bank-name letterhead line (was black), Archivo
for headings/labels, IBM Plex Mono for every number, warm-gold header
band and strong-row tints (replacing the old neutral-gray/pale-blue
ones), row icons and the "AGGREGATE TOTALS" label tinted brass. Body
figures stay pure black, not brass -- the file's own existing print-
contrast rule (documented in a comment above this block) already
established that a mid-tone color halftones toward gray on a laser
printer exactly like the mid-grays it already avoids, so the numbers
people actually read keep guaranteed legibility regardless of printer
quality; brass is reserved for structure (rules, header bands, tint
fills), same restraint principle as everywhere else in this reskin.

**Excel export** (`exportOtsExcel()`): every fill color remapped to the
same brass family -- header band, label column, strong-row tints,
aggregate-totals row, and the editable-cell highlight (OTS Amount /
Report Date) now a richer gold, clearly distinct from the paler
structural tints. Added a medium brass border under the bank-name row
as a letterhead rule (a real border renders reliably in Excel
regardless of what's installed on the machine that opens the file --
unlike a font). **Did not** set a custom font family on any cell: unlike
the print sheet (rendered by the browser, which already has Archivo/
IBM Plex Mono self-hosted), an .xlsx file can only *reference* a font by
name -- it can't embed one -- so specifying 'Archivo' would silently
fall back to whatever's installed on the recipient's machine (almost
certainly not Archivo) the moment anyone else opens the file. Left the
existing safe default instead of a change that would look right only on
this machine.

**Verified**: Playwright screenshot of the print view (emulated print
media) confirms the new palette renders correctly with light background
preserved; Excel file inspected with openpyxl confirms every fill color
matches the new brass hex values, the bank-name row's brass border is
present, all formulas are unchanged and correct (spot-checked Total
Dues and Total Sacrifice), the "AGGREGATE TOTALS" label picked up the
dark-brass font color, and exactly 1 image remains embedded (the logo --
confirms this didn't reintroduce the decorative row icons removed
earlier this session). Zero console/page errors.

### OTS Calculator: Recovery Scale now animates live as OTS is typed (2026-08-14, same day)

Alok: *"Ok gud ab recovery scale main % ots amount feed karte hi live
animations show ho with bar and amount."* The needle and the waterfall
bar both jumped instantly to their new position on every keystroke, with
no visible motion, and there was no number on the scale itself showing
what OTS amount the needle's current position actually represented.

- Needle and the safe/loss band split now transition smoothly
  (`left`/`width`, 450ms cubic-bezier) instead of snapping.
- Added a floating value bubble that rides on the needle, showing the
  current Total OTS Amount, using the same `animateNumber()` count-up
  treatment the P&L Impact figure already gets elsewhere in this screen.
  Re-anchors itself inward (instead of centering) within 10% of either
  end of the track, so it can't hang off the sidebar's edge when OTS is
  ₹0 or close to Total Dues -- both very common states.
- Waterfall bar segments and the 3 key-row amounts (cash recovered,
  ledger sacrifice, unrealised interest) also transition/count-up now.

**One real bug caught while wiring this up**: the waterfall bar and key
row were being rebuilt via `innerHTML =` on every `recalcAggregate()`
call -- destroying and recreating the `<span>`/`<b>` elements each time.
A CSS transition needs the *same* element's style to change to animate;
a freshly-created element just appears at its final width/value with no
motion, and `animateNumber()`'s per-element `__val` tracking (a property
cached directly on the DOM node) would have been wiped every render too,
silently breaking the count-up before it ever ran. Rebuilt both blocks
with stable, pre-created elements (`#aggWf1/2/3`, `#aggWfCash/Ledger/Uci`)
that get their `style`/`textContent` updated in place instead.

**Verified** via Playwright: confirmed `getComputedStyle(...).transition`
is actually present on all 4 animated elements (not just declared and
silently overridden); typed OTS from ₹0 up through an extreme value that
pins the needle at 100%, confirming the bubble's text updates correctly
at each step and its anchor point switches from left-aligned to centered
to right-aligned exactly at the two 10%/90% thresholds, staying fully
visible (not clipped) at both track extremes in both themes. Zero
console/page errors.

### OTS Calculator: fixed group-header text scrolling off-screen, dropped Recovery Scale from mobile (2026-08-14, same day)

Alok sent two mobile screenshots: scrolling the loan table horizontally
made the "LOAN TERMS" / "DUES & PROVISIONING" section headers cut off
("OAN TERMS", "UES & PROVISIONING") instead of staying readable like
every other row's label. Also asked to drop the Recovery Scale gauge
from the mobile view specifically.

**Root cause**: `group()` in `loanTableHTML()` built section-header rows
as one `<td colspan="N+1">` spanning the whole row -- unlike every other
row, which uses `<th class="lt-label">` (`position:sticky;left:0`) for
its label cell. Every other row's label correctly stayed pinned while
scrolling; the group headers, having no sticky cell at all, scrolled
away exactly like an ordinary unpinned table cell would, clipping their
own icon+text as soon as the scroll position moved past it.

Fixed by rebuilding `group()` to emit the same sticky `<th class="lt-label">`
pattern as every other row, with empty `<td>`s for the remaining
columns so the colored group-header band still spans the full row width.
Updated all 5 places the group row's background/border color was set
(base dark, base light, the dark "glass" pass, and both `#detailPane`-
scoped brass overrides from the reskin two entries above) to target
`th.lt-label` alongside the existing `td` selector.

Recovery Scale hidden on mobile only (`@media(max-width:859px){#aggBar
.agg-scale{display:none}}`) -- Where The Dues Go stays, one chart instead
of two in the fixed-height bottom dock. Mobile `padding-bottom` reservation
on `.detail-inner.has-agg` reduced from 410px to 330px to match the now-
shorter dock (measured ~300px) instead of leaving unnecessary empty
scroll space below the table.

**Verified** via Playwright: a group-header `th.lt-label`'s bounding box
is now identical before and after `scrollLeft`, and its text reads the
full "Loan Terms" (not truncated) at both a narrow tablet width and the
exact mobile scroll position from Alok's screenshots; `.agg-scale`
confirmed hidden on a 390px viewport and still visible at 1400px;
`.agg-wf` (the waterfall) confirmed still visible on mobile. Zero
console/page errors.

### OTS Calculator: brass/paper reskin + Recovery Scale and Where The Dues Go (2026-08-14, same day)

Alok shared two HTML mockups he'd had Claude Opus build ("Ye main claude
opos ne redesign karaye hain dekho aur batao practically kitna possible
hai") and asked for a practical feasibility read before deciding
anything. Assessment given: the typography/color language and lighter
table borders were a genuine drop-in reskin, but the mockups' 3-screen
mobile flow and 3-column desktop shell (branch rail + sticky right
panel) were real architecture changes, not "visual only" -- and the
mockups were single-account-first, never showing how the recovery-scale
gauge would work for this app's real 2-4-linked-account case. Built a
feasibility mockup applying the reskin to the app's actual multi-account
table/formulas/headings (unchanged) with a portable/engineering/
architecture-change legend on each new piece, published for review.
Alok: *"Han dono implement karne hain"* -- both the reskin and the two
"bonus" pieces (recovery-scale gauge, waterfall chart) approved for real
implementation.

**Scope**: the loan-detail screen only (`#detailPane`), via CSS custom-
property overrides -- Dashboard, Bank Dashboard, KCC Overdue, and search
results keep their existing blue/cyan accent untouched. Headings and
every formula are byte-for-byte unchanged, exactly as Alok specified.

- **Self-hosted Archivo + IBM Plex Mono** the same way Manrope/Caveat
  already are (base64-embedded `@font-face`, no live Google Fonts CDN
  dependency) -- fetched real Google Fonts `.woff2` files, verified
  Archivo ships as a single variable-font file covering weights 400-700.
- **Brass accent**, reusing the app's own existing `--seal`/`--seal-l`/
  `--seal-d` ceremonial-gold tokens (already the freeze-chip's "ready"
  pulse color) rather than inventing a new hex -- `--accent`/`--gold-*`
  overridden to this family inside `#detailPane`, both themes, plus a
  handful of higher-specificity patches for the few rules that used a
  literal blue rgba() instead of a token (group-header tint, OTS-row
  tint, the sidebar's glass-blur gradient).
- **Tabular-figure treatment**: `.loan-table td`, account numbers, and
  the borrower-card KYC grid switch to the mono face.
- **New: Recovery Scale** -- an aggregate-level needle gauge (loss/safe
  bands split at the break-even OTS, i.e. `O/S − Provision`, already
  computed each render as `window.__totalPL`) with a needle at the
  current Total OTS position, scaled against live Total Dues. Built at
  the sidebar/aggregate level rather than per table column -- the
  reason the idea works at all for a 2-4-account borrower, unlike the
  single-account gauge in the original mockups.
- **New: Where The Dues Go** -- a 3-segment waterfall (cash recovered /
  ledger sacrifice / unrealised interest) as one honest breakdown of
  where the settlement amount actually goes.

**Three real bugs caught during Playwright verification, not just
cosmetic tuning**:
1. `font-family` is an inherited CSS property -- `body` had already set
   its own *computed* value to Manrope, so descendants inherited that
   resolved value rather than re-running `var(--font-body)` in their own
   scope. Only elements with an explicit `font-family:var(...)` rule of
   their own (headings, table cells) picked up Archivo; every plain
   label/paragraph silently stayed Manrope. Fixed by re-declaring
   `font-family:var(--font-body)` directly on `#detailPane` itself,
   restarting the inheritance chain for everything under it.
2. The Recovery Scale's three tick labels (Break-even/O-S/Dues),
   positioned along the track by percentage with `translateX(-50%)`,
   collided constantly in the ~208px-wide sidebar -- O/S is normally a
   large share of Total Dues, so its tick sits close to the Dues tick in
   most real cases, not just edge cases. A collision-avoidance algorithm
   was tried first and discarded as too fragile at this width; replaced
   entirely with a plain 3-column legend row below the track, which
   carries the same 3 numbers with zero overlap risk regardless of value.
3. Found (not introduced by this change, but now visible in testing at
   the tablet breakpoint) that `.loan-table`'s sticky label column used
   near-transparent backgrounds (`.58` opacity base, `.03` opacity on
   even rows) meant to be softened by `backdrop-filter: blur`, but at
   this width the scrolled-under column's text showed through sharply
   rather than blurring -- unreadable overlapping text. Raised both to
   near-opaque (~.94), matching the header row's already-legible opacity,
   in both themes.

**Verified** via Playwright across the full matrix: 4-account and
2-account borrowers, dark and light themes, three widths (390px mobile
dock, 1000px tablet sidebar, 1400px desktop sidebar), the mobile dock's
`padding-bottom` reservation bumped to 410px for the taller stack and
confirmed with no overlap even scrolled to the absolute bottom of the
table. Confirmed via `getComputedStyle` that `#detailPane` resolves to
Archivo/IBM Plex Mono while a heading *outside* `#detailPane` (Dashboard)
still resolves to Manrope -- the scoping holds. Zero console/page errors
across every run.

### Daily PNPA + Daily NPA Projection modules hidden from live nav (2026-08-14)

Alok: *"Ab 1 yp daily pnpa and projection module hata do chahe memory main
rakhna for future use but abhi live app se hata do."* Removed both tabs
from the live app while keeping every line of their code intact for a
future reactivation, rather than deleting anything.

Commented out (not deleted) the 4 nav buttons that pointed to these two
tabs -- `data-view="pnpa"` and `data-view="dailyproj"` -- in both nav
copies in `index.html` (`#sideNav` for desktop, `#bottomTabs` for
mobile), each with an inline comment explaining why and how to restore
it. Left everything else completely untouched: the `<section
id="viewPnpa">` / `<section id="viewDailyProj">` markup, every
PNPA/Daily-Projection function in `js/app.js` (`renderPnpaDashboard()`,
`renderDailyProj()`, the live-poll `dpStartLivePolling()`/`dpPollLive()`
pair, the Settings-modal upload handlers), all the CSS, and the
`relay/api/daily-proj-live.js` backend endpoint.

This works cleanly because `switchView()` only ever activates a view in
response to a nav-button click, and `.view{display:none}` is the default
in CSS -- with no button left pointing at `pnpa`/`dailyproj`, those two
`<section>`s simply never receive the `.active` class and stay hidden,
and their live-polling code never starts (it's gated behind
`switchView('dailyproj')` too). No deep link, command-palette entry, or
persisted "last view" pointed at either tab, so hiding the buttons was
the complete fix -- no orphaned references left dangling anywhere else
in the app.

**Verified** via Playwright: `#sideNav` and `#bottomTabs` both list
exactly 4 reachable views now (`dashboard`, `bank`, `kccov`, `search`),
Dashboard still renders correctly with no gap where the removed buttons
were, zero console/page errors. To bring either module back later:
un-comment its button block in both nav copies in `index.html` (the
inline comments point to each other) -- nothing else needs to change.

### OTS Calculator: loan detail screen redesigned around a hero stat + one honest progress bar (2026-08-12, same day)

Alok, via the ui-ux-designer-pro skill: *"GUIDE ME WHAT TO MORE CHANGES
REQUIRE TO LOOKS VISUALLY GUD AND IMPRESIVE FIRST GUIDE ME MAKE A
MOCKUPS THEN AFTER FINALIZING WE WILL IMPLEMENT."* A design audit was
given first (five equal-weight sidebar stats meant nothing stood out as
the headline figure; zero data visualization anywhere on the screen; a
border under every single table row read as a spreadsheet, not a
dashboard; no hint that a wide multi-account table had more columns off
to the right) and a mockup built showing the fix, reusing the app's exact
existing CSS tokens throughout -- no new colors, per the restraint rule
established two entries below. Alok then asked *"AND FOR BROWSER?"*,
pointing out the mockup only covered the narrow mobile width even though
real usage is mostly the desktop sticky-sidebar layout -- the mockup was
extended with a Browser/Mobile toggle before Alok gave the final
go-ahead: *"OK IMPLEMENT THIS."*

Implemented in `js/app.js` / `css/styles.css`:

- **Hero stat**: `#aggBar`'s flat list of 5 same-size stats replaced with
  one headline card -- "Net Settlement Impact" at real size (21px),
  colored green/red by sign, with a settlement-progress ring next to it
  (the ring reuses the same conic-gradient + radial-mask technique the
  old unlabeled `#aggBar::after` ring already used, so the "hole" stays
  naturally transparent instead of needing a hardcoded fill color) --
  and, unlike the old ring, now prints its own percentage inside it.
  The other 4 stats (Total OTS/O-S/P&L/Sacrifice) drop to a quieter 2x2
  `.agg-mini-grid` below it.
- **Settlement Progress row**: a new row in the loan table, one per
  account -- a thin fill-bar plus a printed percentage (OTS Amount as a
  share of Total Dues), the one real data-viz element on the screen,
  live-updating in `recalcLoan()` on every OTS/Interest Reversal edit,
  showing a dash when OTS is still blank.
- **Lighter table borders**: removed the per-row `border-bottom` that
  ran under every single row (read as a spreadsheet); dividers now only
  mark real boundaries -- a new group starting, or the line under a
  strong/key row -- with the existing even-row stripe doing the rest of
  the separating.
- **Scroll-fade cue**: `.loan-table-wrap` gets a right-edge gradient that
  fades out once actually scrolled to the table's end (`.at-end`,
  toggled by a scroll listener wired up in `drawDetailBody()`), so a
  4-account table hints there's more to scroll to.
- **Sidebar widened** 210px→260px (`@media(min-width:860px)`) and
  190px→240px (`@media(min-width:1200px)`) so the hero number has real
  room -- the old width was sized for a list of small stat labels, not a
  21px headline figure.

Two real bugs caught and fixed during Playwright verification, not just
cosmetic tuning:
1. The mini-grid's 2-column layout clipped (not wrapped) long rupee
   figures like ₹1,04,50,000.00 -- a classic CSS grid gotcha where a grid
   item won't shrink below its content's intrinsic width without
   `min-width:0`, so the overflow silently clipped against the grid's own
   `overflow:hidden` (needed for the rounded corners) instead of
   wrapping. Fixed by adding `min-width:0` to `.agg-mini`.
2. The mobile bottom-dock's `padding-bottom` reservation (meant to keep
   the fixed dock from covering the last table rows) was silently losing
   a CSS specificity fight against `#detailPane .detail-inner{padding:0
   16px 40px}` -- an ID selector beats any number of plain classes, so
   `.detail-inner.has-agg{padding-bottom:210px}` never actually applied,
   and the taller new dock (up from ~120px to ~193px) overlapped the
   table's last two rows and the hint banner. Fixed by prefixing the
   override with `#detailPane` to win on specificity, not just source
   order.

**Verified** via Playwright across the full matrix: 4-account borrower
(NATVAR PANDEY) and 2-account borrower (RAM PRAKASH) with large OTS
figures entered, dark and light themes, three widths (390px mobile dock,
1000px tablet sidebar at 260px, 1400px desktop sidebar at 240px) -- ring
percentage renders correctly and stays legible in both themes (a light-
theme contrast bug on the ring's percentage text, hardcoded white, was
caught and fixed too), mini-grid figures no longer clip, the Settlement
Progress bar/percentage updates live and shows a dash for an unfilled
OTS account, the mobile dock no longer overlaps the table when scrolled
to the very bottom, and the scroll-fade class toggles correctly on an
artificially narrowed table wrapper. Zero console/page errors across all
runs.

### OTS Calculator: stripped icons out of the Excel export (2026-08-12, same day)

Alok, via the excel-master-pro skill: *"GAVE ME A PROPER EXCEL DASHBOARD
EXPORT FILE WITH PROPER FORMATED LIKE PDF FILE NO NEED ICON AND FANCY
ITEMS IN EXCEL."* The per-row icon images and borrower avatar added to
`exportOtsExcel()` a couple of entries above were the wrong call for a
spreadsheet a banker needs to actually edit and hand around -- removed
them entirely rather than trying to make them more restrained, since
Excel isn't the right medium for that treatment at all (unlike the app
and print sheet, which are rendered by the browser and can draw real
inline SVG).

Removed: the 13 rasterized row-icon PNGs and their embedding loop, the
borrower avatar image, the `XL_ROW_ICONS` label-to-icon map, and the
two-leading-spaces hack on row labels that existed only to leave room for
those icons. Also deleted `rasterizeLtIcon()` itself, since nothing else
in the codebase used it -- Excel was its only caller.

Kept everything that makes this "proper formatted like PDF": real
ExcelJS cell styling (bold headers, borders, fill-highlighted key rows),
live formulas that recalculate when any cell is edited, the A4
fit-to-page print setup from the previous entry, and the bank logo in
the header (kept as the letterhead, not a decorative icon -- it's the
same logo the printed PDF itself carries).

**Verified**: re-downloaded the export via Playwright with no console
errors; unzipped the raw `.xlsx` and confirmed exactly one image remains
(`xl/media/image1.png`, the logo) versus 18 before; `openpyxl` confirms
the A4 page setup is untouched and every formula (`Total Dues`, `Total
P&L`, `Total Sacrifice`, etc.) still reads exactly as corrected two
entries above.

### OTS Calculator: pulled back the badge colors to one restrained accent (2026-08-12, same day)

Alok's reaction to the badge colors just shipped: *"TABLE K COLORS KUCH
PROPER LAG NAHI RAHE CLAUDE TYPE. LOOKING LIKE SOME YOUNG BOY CREATE
THIS."* Fair critique -- the previous change gave each table section
(Loan Terms/Dues & Provisioning/Settlement & Impact) and each sidebar
stat its own hue (blue/amber/green/gold), which read as decorative
rainbow-coding rather than an intentional design choice -- a genuinely
common "AI-generated design" tell: color spent everywhere instead of
reserved for what actually means something.

Collapsed every `.lt-icon-badge` (table) and `#aggBar .agg-stat .ak-icon`
(sidebar) to ONE consistent tone -- the app's own existing gold/accent
language already used for group headers, the OTS row, the freeze chip,
and the currency symbol -- instead of inventing new section colors.
Color now appears in exactly two places with real meaning: the existing
blue "strong" row values (the few genuinely key figures), and the P&L
Impact figure's live positive/negative state (the one number whose color
actually signals something). Also removed the now-unused `grp` parameter
threaded through `ltIconBadge()`/`row()`/`statRow()` and every call site,
rather than leaving dead per-section arguments that no longer do
anything.

**Verified** via the same Playwright screenshots as the previous entry
(2-account borrower, both themes; 4-account borrower with large OTS
Amounts) -- every icon across the sidebar and table now reads as one
calm, consistent accent, with color reserved for the P&L Impact signal.

### OTS Calculator: table icons matched to sidebar's colored badges, Impact box overflow fixed (2026-08-12, same day)

Alok shared a screenshot and asked directly: *"KYA YE VISUALLY
PROFESSIONAL HAI?"* Two concrete gaps identified and confirmed with him
before fixing: (1) the loan table's row icons were plain thin gray
outlines, while the sidebar's stat icons were bold colored circle badges
-- two different icon "languages" on the same screen; (2) the sidebar's
"Total P&L Impact" figure was crowding right up against its highlighted
box's edge for large values.

Fix 1: new `ltIconBadge()` helper (`js/app.js`) wraps a row icon in a
colored circular badge, same visual language as the aggregate sidebar's
`.ak-icon`. Colored by section rather than a unique color per row (which
would read as arbitrary/rainbow across 14+ rows) -- Loan Terms is blue,
Dues & Provisioning is amber, Settlement & Impact is green -- so the
color also reinforces which group a row belongs to, on top of the
existing section-header bands. `loanTableHTML()`'s `row()`/`statRow()`
builders take a new `grp` parameter for this; `group()` (the section
header rows) intentionally keeps its plain-icon treatment since those
rows already carry their own full-width tinted background.

Fix 2: `#aggBar .agg-stat.impact .av` font size dropped from 21px to
17px and padding increased, with `word-break:break-word` added -- 21px
bold text had no headroom for real loan accounts running into crores,
where the formatted rupee string can run past 12-13 characters.

**Verified** via Playwright screenshots: the earlier 2-account borrower
in both themes (icons now read as one coherent colored system across
sidebar and table), and a 4-account borrower with deliberately large OTS
Amounts entered (up to ₹46,00,000) to force an 8-figure P&L Impact value
(₹98,87,590.71) -- confirmed it now wraps cleanly onto two lines inside
its box instead of touching the edge.

### OTS Calculator: aggregate sidebar alignment + color fix (2026-08-12, same day)

Alok flagged a real bug in a screenshot: in the `#aggBar` account-totals
panel, each stat's icon appeared to float misaligned above/between the
label text instead of sitting next to it, and the whole panel read as
flat grayscale. Root cause: the icon and label shared one
`display:inline-flex` row (`align-items:center`); in the sidebar's narrow
width, long labels like "TOTAL O/S BALANCE" wrapped to two lines, and the
icon -- centered against the *whole* flex row's height -- ended up
floating between the two text lines instead of next to either one.

Restructured each `.agg-stat` so the icon lives in its own fixed-size
circular badge, on a dedicated row above the value, with `min-width:0` on
the row/label so `text-overflow:ellipsis` actually has room to trigger
if a label still doesn't fit (a common flexbox gotcha -- without it,
`overflow:hidden` alone does nothing because flex items refuse to shrink
below their content's intrinsic width by default). This removes any
possibility of a wrapped multi-line label warping the icon's position,
regardless of sidebar width.

Also colored each badge, reusing existing design tokens rather than
inventing new ones (per the project's own "honor what's already there"
convention): Total OTS Amount → accent/teal, Total O/S Balance → the
existing brass "seal" tone (new `--seal-soft` token added alongside the
already-defined `--seal`, since no soft variant existed yet), Total P&L →
amber, Total Sacrifice → green, and Total P&L Impact → dynamically
green/red matching its own value's sign (new `aggTotImpactIcon` id,
toggled in `recalcAggregate()` alongside the existing `pos`/`neg` class
logic on the value itself).

**Verified** via Playwright screenshots of just the `#aggBar` element in
dark theme, light theme, and the mobile bottom-dock layout (a
structurally different CSS mode -- 3-column grid, centered content) --
all three show icon and label cleanly aligned on one line, five visibly
distinct badge colors, and the Impact badge picking up green to match its
positive value.

### OTS Calculator: Excel export redesigned -- corrected formulas, A4 print setup, icons (2026-08-12, same day)

Alok: *"SAME PDF KO EXCEL DASHBOARD MAIN PUSH KARO EXCEL DASHBOARD PROPER
DASHBOARD HONA CHAHIYE WITH ALL CALCULATION AND FORMULAS TO EDIT ANYTHING
TO PRINT A4 SHEET"* -- three concrete things came out of this, in
`exportOtsExcel()` (`js/app.js`):

1. **Formulas were stale.** `exportOtsExcel()` hadn't been touched during
   the big formula correction two entries above (task: remove Net O/S
   row, Total Dues includes Interest Reversal, Total P&L goes static) --
   Excel was still computing Total Dues as O/S+UCI only, Total P&L as
   O/S-Interest Reversal-Provision, and Total Sacrifice as Total
   Dues-OTS+Interest Reversal. Fixed all three formulas to match the
   corrected chain exactly: `Total Dues = OS+UCI+URI`, `Total P&L =
   OS-Provision`, `Total Sacrifice = TotalDues-OTS`.
2. **A4 print setup**, so the sheet can be printed straight from Excel
   like the PDF: `ws.pageSetup = {paperSize:9 (A4), orientation:
   'portrait', fitToPage:true, fitToWidth:1, fitToHeight:1, ...}` plus an
   explicit `ws.pageSetup.printArea` scoped to the "OTS Calculator" sheet
   only (the "Calculation Details" helper sheet isn't meant to be
   printed). Caught one API-name mistake before shipping: ExcelJS wants
   `printArea` nested under `pageSetup`, not `worksheet.printArea`
   directly -- the first attempt silently wrote nothing (confirmed via
   openpyxl reading back an empty `print_area`), found and fixed by
   grepping the vendored ExcelJS source for how it actually reads the
   property.
3. **Icons**, matching the print sheet. Excel can't render inline SVG
   into a cell the way the browser can, so added `rasterizeLtIcon()` --
   renders one of the existing `LT_ICONS` paths to an offscreen `<canvas>`
   and returns a PNG data URI, which gets embedded via ExcelJS's
   `addImage()` (the same technique already used for the bank logo). Each
   of the 16 particulars rows gets its icon (rasterized once per unique
   icon and reused across every row/account that needs it, not
   re-rendered per cell), plus a small borrower avatar in the header.
   Since Excel has no way to lay out an icon and text inline in one cell,
   two leading spaces were added to the label text to leave visual room
   for the icon at the cell's left edge.

**Verified**: `node --check`; a Playwright-downloaded export produced no
console errors (confirming the new async rasterization pipeline
completes correctly before the workbook is written); `openpyxl` confirms
`paperSize=9`, `orientation=portrait`, `fitToWidth=fitToHeight=1`, and
`print_area='OTS Calculator'!$A$1:$D$36` after the fix. `openpyxl`'s own
image reader reported 0 embedded images (a known limitation of its
DrawingML support, already flagged by its own warning), so verified the
real file directly instead: unzipped the `.xlsx` and confirmed 18 PNGs
under `xl/media/` (logo + avatar + 13 unique row icons) with
`xl/drawings/drawing1.xml` anchors landing on the correct 0-indexed rows
(11-26, i.e. Excel rows 12-27 -- exactly the 16 particulars rows). Raw
formula cells (`B19=B17+B18+B20`, `B23=B17-B22`, `B25=B19-B24`, etc.)
cross-checked by hand against the row-to-`R`-index map and match the
already-verified app values from the earlier correction (Interest
Reversal ₹5,000 on account 1 → Total Dues ₹5,85,804.33, unchanged
Provision/Total P&L).

### OTS Calculator: icon-forward redesign extended to the print/PDF sheet (2026-08-12, same day)

Alok: *"OK AB SAME PUSH KR DO PDF MAIN"* -- extend the icon treatment just
shipped for the app's loan table to the print/PDF sheet too.

`renderPrintView()`'s `rows` array (in `js/app.js`) now carries an icon
name per particulars row, reusing the same `LT_ICONS`/`ltIcon()` set built
for the app (plus two new icons added for rows the app table doesn't have:
`tag` for Asset Code, `clock` for Days in NPA). The borrower name also
gets a small avatar icon, matching the app's borrower card. Scoped
narrowly to the icon/avatar visual treatment only -- did not touch the
print sheet's row set or formulas (e.g. Net O/S is still shown there,
even though it was dropped from the app's table two entries above); a
full content redesign of the print/Excel output remains a separate,
not-yet-started follow-up.

New CSS in `css/styles.css`: `.pv-name-row`/`.pv-avatar` for the borrower
header, `.pv-table td.pv-label{display:flex}` plus `.lt-row-icon` color
rules so the icons render in the print sheet's near-black, laser-safe
palette (the contrast fix from the earlier "laser-printer contrast" entry)
rather than the app's colored tokens.

**Verified** the two things this change could plausibly have broken: (1)
the print sheet's laser contrast/near-black styling -- icons render in
#333/#000 depending on row strength, not app-theme colors; (2) the
1-page-fit tuning from the "compress print CSS" entry above -- Playwright
print-media screenshots of both a 2-account and a 4-account borrower show
the sheet comfortably under one A4 page (~772px content height against
roughly 1050px available), with all table borders/row alignment intact
despite `display:flex` on the label cells (confirmed empirically in
Chromium's print rendering, same pattern already proven safe in the app's
own loan table).

### OTS Calculator: icon-forward loan detail redesign (2026-08-12, same day)

Alok shared a reference screenshot of a card-and-icon style loan detail
layout and asked whether to adopt it, calling out that some borrowers have
3 or 4 linked accounts. Built a review mockup first (published as an
Artifact) that broke down what to keep from the reference (row icons,
section-header icons, a borrower avatar card, an icon-tile summary strip,
a plain-language hint banner) versus what didn't map onto this app (the
reference's fixed desktop sidebar layout, its single-account-only design,
and its missing OTS Amount/Interest Reversal/Total Sacrifice/Ledger
Sacrifice/P&L Impact rows -- the actual core of this calculator). Alok
approved the direction ("OK IMPLEMENT BUT USE PROFESSIONAL ENGLISH ONLY").

Implemented in `js/app.js`/`css/styles.css`:
- New `LT_ICONS`/`ltIcon()` helper -- a small stroke-icon set (calendar,
  document, warning, coin, rotate, percent, layers, shield, trend, badge,
  bars, list) rendered next to every Particulars row label and section
  group header (Loan Terms / Dues & Provisioning / Settlement & Impact) in
  `loanTableHTML()`, via `.lt-row-icon` and `display:flex` on `.lt-label`/
  `.lt-group td`.
- Borrower card in `drawDetailBody()` gets a circular avatar icon next to
  the name/address (`.bcard-top`/`.bavatar`).
- The existing `#aggBar` account-totals panel (sticky sidebar at
  &gt;=860px, a 3-tile-per-row dock fixed to the bottom of the screen on
  mobile -- this responsive split already existed, so no structural change
  was needed there) gets the same icons on each stat label; its "Total Net
  O/S" tile is renamed "Total O/S Balance" since the Net O/S row itself
  was already removed from the Particulars table two entries above --
  the old label was stale terminology for a figure that's simply the
  account's O/S Balance.
- A new hint banner under the loan table, in English: "Enter the OTS
  Amount and Interest Reversal for each account to calculate Total
  Sacrifice, Ledger Sacrifice, and P&amp;L Impact automatically."
- Deliberately did NOT copy the reference's fixed sidebar/single-account
  layout -- kept the existing side-by-side comparison table (rows =
  particulars, columns = accounts), which already scales to any number of
  linked accounts via horizontal scroll, layering the icon treatment on
  top of it instead.

**Verified** via Playwright screenshots at desktop width (dark + light
theme, sidebar `#aggBar` layout) and mobile width (bottom-dock `#aggBar`
layout), plus a real 4-linked-account borrower (NATVAR PANDEY S/O
RAMESHWAR, Cust ID 710075639) to specifically confirm the concern Alok
raised -- all 4 accounts render side-by-side with icons and the hint
banner intact, no layout breakage. One issue caught and fixed during
verification: `#aggBar .agg-stat .ak` needed `display:inline-flex` (not
block-level `flex`) so the icon+label pair still centers correctly under
the existing `text-align:center` rule in the mobile bottom-dock layout.

### OTS Calculator: Interest Reversal row repositioned above UCI (2026-08-12, same day)

Alok: *"INTEREST REVERSAL KO UCI K UPAR PAHUNCHA DO WO US HEAD KA DATA HAI
WAHIIN SAHI LAGEGA"* — Interest Reversal is a data-entry figure for that
"Dues & Provisioning" head, same category as UCI, so it reads more
naturally sitting right above UCI@8.5% (immediately after O/S Balance)
than down in Settlement & Impact next to OTS Amount. Pure row reorder in
`loanTableHTML()` — the `uriRow()` editable input and all of its formula
wiring (Total Dues, Total Sacrifice) are unchanged, only its position in
the Particulars table moved. Verified via screenshot on the same RAM
PRAKASH test account — Interest Reversal now renders as the first row
under "Dues & Provisioning", values unaffected.

### OTS Calculator: corrected the whole formula chain per Alok's re-derivation (2026-08-12, same day)

The Interest Reversal change shipped just before this (previous entry below)
had the wrong formula shape. Alok re-derived the entire calculation chain
from scratch and corrected it:

- **Total Dues = O/S + UCI@8.5% + Interest Reversal** (was O/S + UCI only,
  with Interest Reversal added separately downstream in Total Sacrifice).
  Since Interest Reversal is editable, Total Dues is now the reactive/live
  row in the interactive table (`totalDuesFor(s)` helper, `recalcLoan()`
  updates it unconditionally, independent of OTS Amount).
- **Net O/S row removed from the Particulars table entirely** — it's always
  identical to O/S Balance, so it was dropped rather than kept as a
  duplicate row (the underlying field stays in the data model since it's
  still used harmlessly elsewhere — search cards, the aggregate sidebar —
  which weren't in scope for this pass).
- **Provision is calculated directly on O/S Balance** (by asset code) —
  previously it read a `netOutstanding` variable that, post-decoupling,
  was already always equal to O/S anyway; now it's direct, no indirection.
- **Total P&L = O/S - Provision** (was O/S - Interest Reversal - Provision).
  This means Total P&L no longer reacts to Interest Reversal at all — it
  reverted to a plain static value computed once in `computeSlot()`, and
  the `totalPLFor()` live helper from the previous change was removed as
  now-unnecessary.
- **Total Sacrifice = Total Dues - OTS Amount** (Interest Reversal is
  already folded into Total Dues, so it's not added a second time).
- **Ledger Sacrifice (BDWO Amount) = O/S - OTS Amount** and **Impact on
  P&L = OTS Amount - Total P&L** — unchanged, confirmed already correct.
- OTS Amount and Interest Reversal (both manual inputs, both defaulting to
  blank/0) were moved to sit together under "Settlement & Impact", ahead of
  Total Sacrifice/Ledger Sacrifice/Impact which read off them.

Scope for this pass was the interactive app only, per Alok's instruction —
`renderPrintView()` was patched just enough to use the corrected formulas
and not crash/go stale (Total Dues and Total Sacrifice now compute live off
the same helpers), but its layout still carries the old Net O/S row for now.
`exportOtsExcel()`'s formulas were **not** touched this round — Alok wants
a full Excel/PDF redesign as a separate follow-up once the app's own
calculation logic is confirmed correct.

**Verified** on RAM PRAKASH S/O NARAYAN SINGH (Cust ID 704531033, both
accounts asset code LOSS — 100% provision, a good stress test since O/S -
Provision = 0 exactly): confirmed the Net O/S row no longer renders; typed
OTS ₹3,60,000 then Interest Reversal ₹5,000 — Total Dues moved from
₹5,80,804.33 to ₹5,85,804.33 (exactly +5,000), Provision and Total P&L
stayed byte-identical before/after (₹5,00,699.30 / ₹0.00), Total Sacrifice
moved by exactly the same +5,000, and Ledger Sacrifice/Impact on P&L stayed
completely unchanged (correctly independent of Interest Reversal now).

### OTS Calculator: Interest Reversal made editable, Net O/S decoupled from it (2026-08-12, same day)

Alok: *"OUTSTANDING AND NET OUTSTANDING ALWAYS BE SAME EVEN AFTER INTEREST
REVERSAL AND MAKE A EDITABLE FIELD FOR INTEREST REVERSABLE AND ALL
CALCULATION WILL BE DONE"*

Two changes, both applied consistently across the app, the print/PDF sheet,
and the Excel export:

1. **Net O/S now always equals O/S Balance.** Previously `netOutstanding`
   was computed as `O/S − Interest Reversal`, so it silently drifted away
   from O/S Balance whenever Interest Reversal was non-zero. That formula
   was wrong per Alok's instruction — Net O/S is meant to always be the
   same figure as O/S Balance, full stop. `computeSlot()` in `js/app.js`
   now sets `netOutstanding = os` directly (was `os - uri`); the same
   inline calculation in the search-result-card renderer was fixed to
   match. Excel's Net O/S cell formula changed from `=OS-URI` to just
   `=OS` (a direct cell reference), so it self-corrects even if someone
   edits the URI cell in Excel.

2. **Interest Reversal is now a live-editable field**, mirroring the
   existing OTS Amount input pattern (plain typed value, not frozen/locked).
   A new `interestReversalOverrides` map (keyed by account no.) holds
   session-typed edits; `uriFor(s)` resolves override-or-data-default.
   Because Total P&L legitimately depends on Interest Reversal (and Total
   P&L no longer flows through Net O/S, now that Net O/S is decoupled),
   Total P&L had to become reactive too — added `totalPLFor(s)` (=
   `O/S − Interest Reversal − Provision`, Provision itself unaffected since
   it's O/S × asset-rate) and converted the on-screen Total P&L row from a
   static value to a live cell (`totalPL-${i}`) that `recalcLoan()` now
   updates **unconditionally**, not just when OTS Amount is filled in
   (Interest Reversal edits happen independently of OTS). Total Sacrifice,
   Ledger Sacrifice, and P&L Impact — all of which read Total P&L/Interest
   Reversal — were re-wired to use the live helpers everywhere: the
   interactive table, `recalcAggregate()`'s multi-account totals panel,
   `renderPrintView()`'s per-account rows and aggregate Total Sacrifice
   line, and `exportOtsExcel()`'s Total P&L formula (`=OS-URI-Provision`,
   now reading Interest Reversal directly since it can no longer ride on
   Net O/S). The Excel export's Interest Reversal starting value was also
   switched from the raw data field to `uriFor(s)`, so exporting after
   editing the field in-app carries that edit into the spreadsheet — it
   was silently exporting the original data value before this fix, same
   bug class as the decoupling this feature was about.

**Verified** end-to-end against RAM PRAKASH S/O NARAYAN SINGH (Cust ID
704531033, accounts on schemes CC004/CC043, both asset code LOSS — a case
where Provision = O/S 100%, so Total P&L is fully sensitive to Interest
Reversal, a good stress test): typed ₹5,000 into the new Interest Reversal
field via Playwright — O/S Balance and Net O/S stayed byte-identical
(₹5,00,699.30) before and after; Total P&L moved from ₹0.00 to
−₹5,000.00 live; Total Sacrifice and P&L Impact updated live and matched
hand-computed values exactly once animation settled; the print view and
the downloaded Excel file (checked via `openpyxl`, raw formulas inspected
directly — `Net O/S: =B17`, `Total P&L: =B17-B20-B22`, `Interest Reversal:
5000` as a plain editable value) both reflected the same edited figures
consistently with the app.

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

### OTS Calculator: corrected Total Sacrifice formula, merged BDWO row, logo + Regional Office on print/Excel, Total Contractual Dues hidden from print/Excel only (2026-08-12, same day)

You sent a scanned, hand-annotated printout (Adobe Scan) of a real OTS
sheet with checkmarks/✗ marks and margin notes, plus typed instructions:
apply the annotated changes to the app AND the print/PDF; Excel should
match the PDF exactly, with any extra helper values that don't belong on
the printed sheet moved to a **second Excel sheet**; and **Total
Contractual Dues should be hidden from PDF and Excel only** — it stays
on-screen in the app. A follow-up clarifying question about how to merge
the annotated "Ledger Sacrifice (BDWO Amount)" row led to the exact
corrected Total Sacrifice formula (previously it read off Total
Contractual Dues).

- **Total Sacrifice formula corrected** everywhere (app, print, Excel):
  was `Total Contractual Dues − OTS Amount`, now
  **`Total Dues − OTS Amount + Interest Reversal`** (algebraically
  identical to `Ledger Sacrifice + UCI@8.5% + Interest Reversal`, which
  is literally how it was described) — no longer depends on Total
  Contractual Dues at all. Updated in `recalcLoan()` (per-account),
  `recalcAggregate()` (aggregate rail/sidebar, `aggBar` progress %, all
  now driven by a new `window.__totalURI`), `renderPrintView()`, and
  `exportOtsExcel()`.
- **"Ledger Sacrifice" and "BDWO Amount" merged into one row**, labelled
  "Ledger Sacrifice (BDWO Amount)", keeping Ledger Sacrifice's own
  formula (O/S Balance − OTS Amount) — in the app's loan table, the print
  sheet, and Excel. The separate BDWO row/element is gone everywhere.
- **Total Contractual Dues removed from print and Excel only** — the
  app's interactive loan table (`loanTableHTML`) is untouched and still
  shows it, per the explicit instruction that it "APP MAIN TO SHOW HOGA
  HI".
- **Logo + "(Regional Office Hathras)"** added to both the print header
  (new `.pv-logo` positioned top-left, same base64 PNG already used for
  the sidebar's own `nav-logo`) and the Excel export's header row
  (`workbook.addImage()`), matching exactly where the annotation circled
  a blank space for a logo and handwrote the regional office name next
  to "Uttar Pradesh Gramin Bank".
- **Excel restructured into two sheets** so the main sheet mirrors the
  print layout exactly: "OTS Calculator" (visible rows only — the same
  16 rows now shown on the PDF) and a new **"Calculation Details"**
  sheet holding everything the PDF never showed but the formulas still
  need — Scheme, UCI Anchor Date, and the Provision Rate lookup table.
  Main-sheet formulas reference across sheets normally
  (`='Calculation Details'!B6`, `VLOOKUP(B14,'Calculation
  Details'!$A$9:$B$13,2,FALSE)`). UCI @ 12.5% and Total Contractual Dues
  were dropped entirely from the workbook — once Total Sacrifice no
  longer depends on them, nothing downstream needed them either.
- **Verified against the exact borrower from the annotated scan** (RAM
  PRAKASH S/O NARAYAN SINGH, Cust ID 704531033, two accounts on schemes
  CC004 and CC043 — testing both branches of the UCI anchor-date rule):
  entered the same OTS amounts as the annotation (₹3,60,000 /
  ₹98,000) and confirmed the app, print, and Excel all show the
  identical corrected Total Sacrifice figures, matching a fourth,
  independent Python re-implementation of the formula chain. Notably,
  account 2's Total Dues (₹1,59,870.70) landed byte-for-byte identical
  to the value printed on Alok's own scanned reference sheet. Confirmed
  via screenshot: logo renders, "(Regional Office Hathras)" shows,
  Total Contractual Dues row is gone from print, Ledger Sacrifice/BDWO
  are one row, and the sheet still fits one page (removing 2 rows only
  added headroom to the earlier 1-page fit). Confirmed via `openpyxl`
  that the Excel workbook has exactly the two sheets, the logo image is
  embedded byte-identical to the source PNG, cross-sheet formulas
  resolve correctly, and styling (bold/fills/borders) is unaffected by
  the restructure.

### OTS Calculator Excel export: real cell formatting, not a bare grid (2026-08-12, same day)

You tried the new Excel export (above) and said it should stay "properly
formatted" like the PDF — not something plain/different: "EXCEL PROPER
FORMATED RAHE PDF JAISE KUCH AUR ALAG NAHI CHAHIYE". Root cause: the
export used `XLSX` (SheetJS), the same library already vendored for
reading uploaded files and for the Daily NPA Projection export — but the
free Community Edition of SheetJS can only **write** number formats
(`.z`), not actual cell styling. Any `font`/`fill`/`border` set on a cell
object is silently dropped on write; only Pro (paid) SheetJS writes real
styles. So the first version of this export came out as plain black
text on a bare grid — technically correct formulas, but visually nothing
like the print sheet.

- **Vendored ExcelJS** (`js/vendor/exceljs.min.js`, MIT licensed, the
  official browser UMD build) specifically for this export — it writes
  real OOXML styling (fonts, fills, borders, alignment, merged cells,
  frozen panes), verified directly against a fresh SheetJS smoke test
  first (built a cell with bold/color/fill/border, wrote it, inspected
  the resulting `xl/styles.xml` — SheetJS wrote only the default empty
  style; the identical test through ExcelJS wrote the real font/fill/
  border XML). `js/vendor/xlsx.full.min.js` (SheetJS) stays exactly as
  it was for everything else (upload parsing, Daily NPA Projection
  export) — this is additive, not a replacement.
- Rewrote `exportOtsExcel()` on ExcelJS's API, keeping every formula from
  the first version byte-for-byte (re-verified against the same
  independent Python cross-check used before — still an exact match),
  now with real visual formatting mirroring the print sheet's own
  language: bold near-black title/headers, gray header-row fill,
  bordered table, and the same "key rows" highlight convention (O/S
  Balance, Total Dues, Total Contractual Dues, Total P&L, OTS Amount,
  Total Sacrifice, Impact on P&L get a light blue-gray tint + bold) —
  plus one addition print doesn't have: the **OTS Amount** input cells
  get a distinct amber highlight, since that's the one cell meant to
  actually be edited here.
- Frozen header row + label column (`ws.views` frozen pane at the first
  data row/column) so the table stays readable while scrolling on a
  wider multi-account export.
- **Verified**: re-ran the exact same download-and-inspect Playwright
  test as before (KAMLA DEVI, 2 linked accounts, OTS Amount entered) —
  formulas unchanged and still numerically correct, plus now confirmed
  via `openpyxl` that key cells actually carry `bold=True`/the right
  fill colors/borders (e.g. the header row's `FFC9C9C9` fill, strong
  rows' `FFEEF1F8`/`FFD8DEEE` tint, the OTS input's `FFFFF3CD` amber),
  while plain rows correctly stay unstyled. Re-checked the single-account
  case too (frozen pane, self-range `SUM`, styling) — still clean.

### OTS Calculator: Export to Excel with live formulas, alongside Print/PDF (2026-08-12)

You asked for an Excel export next to the existing PDF/Print option —
"WITH ALL CALCULATION AND FORMULAS jisse ki main bhi kuch changes karne
hain to baki figures bhi change ho jayen" (with all calculations and
formulas, so if I make changes myself, the other figures update too).
The existing Daily NPA Projection Excel export (2026-07-23) writes
static computed values, not formulas — this needed to be a genuinely
live spreadsheet instead, so a loan officer can tweak OTS Amount (or
O/S Balance, if a real payment changes it) and watch every dependent
figure recalculate in Excel itself, the same way the on-screen
calculator does.

- New `exportOtsExcel()`, wired to a second header icon button next to
  Print/Share (`.share-btn`, table icon) in the detail view. Only the
  true source-data fields are plain values (Sanction Date/Limit, Asset
  Code, Scheme, NPA Date, O/S Balance, Interest Reversal, OTS Amount) —
  every other figure is a real `=formula` cell:
  - **UCI Anchor Date** replicates `computeUCI()`'s scheme-dependent rule
    exactly as nested `IF`/`DATE`/`EOMONTH`/`YEAR`/`MONTH` formulas — CC004
    (KCC) anchors to fixed 24-Mar/24-Sep half-year edges, every other
    scheme anchors to end of NPA month (or the previous month's end if
    the NPA date itself isn't a month-end).
  - UCI @ 8.5% / 12.5%, Total Dues, Total Contractual Dues, Net O/S,
    Total P&L all chain off O/S Balance, Interest Reversal, and the
    anchor date — a single **Report Date** cell (defaults to `=TODAY()`
    equivalent, editable) drives every UCI calculation.
  - **Provision** looks up the rate for the row's Asset Code via
    `VLOOKUP` against a small reference table placed off to the side
    (columns H/I) rather than hardcoding rates per row.
  - **Total Sacrifice, Ledger Sacrifice, BDWO Amount, Impact on P&L** —
    the figures that actually change when you edit OTS Amount — are all
    formulas referencing the OTS input cell directly.
  - **Aggregate Totals** (Total O/S, Total Dues, Total OTS, Total
    Sacrifice) are `SUM()` formulas across however many linked accounts
    print as columns, not hardcoded sums.
- Dates use `dd-mm-yyyy` number formatting throughout (new
  `dateToExcelSerial()` helper alongside the existing
  `excelSerialToDate()`), not Excel's locale-dependent default — same
  DD-MM-YYYY rule the rest of the app follows.
- **Verified two ways**: (1) Playwright downloaded a real export for the
  exact KAMLA DEVI test borrower (2 linked accounts, one with a test OTS
  Amount entered) and captured the app's own on-screen computed values as
  ground truth. (2) Since LibreOffice headless recalculation isn't
  available in this sandbox (`soffice --headless` fails to load any file
  here, even a trivial one — a sandbox limitation, not a file problem),
  independently re-implemented the exact same anchor-date/UCI/dues chain
  in a standalone Python script reading only the exported file's raw
  input values (no formulas), and compared its output against the app's
  ground truth: **every figure matched exactly** (Total Contractual Dues,
  UCI @ 8.5%, Total Dues, Total Sacrifice, Ledger Sacrifice, BDWO, Impact
  all identical to the displayed values). Also confirmed a single-account
  borrower exports cleanly (`SUM(B18:B18)`-style self-range formulas,
  no errors).
- Print/PDF export is unchanged — this is a genuine "also", not a
  replacement, per the request.

### New "smart edge panel": Branch / Sol ID reference list, reachable from every tab (2026-08-05, same day)

You sent `SOL_ID.xlsx` (Old Sol ID / New Sol ID / Branch, 57 rows —
56 branches + R O Hathras) and asked for a slide-in panel that shows this
list from any tab with one click, opening/closing "just like Android
smart side bar or Edge panels".

- **`.edge-handle`**: a slim pull-tab pinned to the right edge of the
  viewport (`position:fixed`, `right:0;top:50%`), rendered as a sibling
  of `#app` so no individual view's own layout, overflow, or scroll
  container can hide or clip it — reachable on literally any tab,
  including mid-scroll on a long page, matching "kisi bhi tab par bas
  click karte hi" from the ask. Reads "BRANCHES" vertically with a small
  list icon; a hamburger-style always-visible handle rather than
  something the user has to remember exists.
- **`.edge-panel`**: slides in from the right (`transform:translateX`,
  280ms ease) over a dimmed backdrop, listing every branch — Branch name,
  New Sol ID (the one used everywhere else in this app), and the Old Sol
  ID as smaller reference text, in the source file's own order (R O
  Hathras first, then the rest by Sol ID). A live search box filters by
  branch name or either Sol ID as you type (`renderBranchList()`).
- **Three ways to close it**, matching real edge-panel/side-panel
  conventions: tap the handle again, tap the backdrop, or press Escape —
  `toggleBranchPanel()` handles all three plus the initial open, and a
  single global `keydown` listener covers Escape regardless of which
  element currently has focus.
- Data is embedded directly in `js/app.js` as a small constant
  (`BRANCH_LIST`) rather than published/uploaded like the daily NPA
  data — this is static Sol ID↔Branch mapping info that doesn't change
  with daily updates, so it doesn't need the Update Data/Publish
  pipeline at all.
- **Verified** via Playwright: handle is visible and clickable from the
  Dashboard (default view) and after switching to a completely different
  tab (Daily NPA Projection) with no re-navigation needed; all 57 rows
  render; search correctly narrows to 1 row for both a branch-name query
  ("goverdhan") and a Sol ID query ("9270"); closes correctly via
  backdrop click and via Escape. Checked dark theme, light theme, and a
  390px mobile viewport — clean in all three, panel width caps at
  `min(340px, 86vw)` so it never overflows a narrow screen.

### Search result card now shows every linked account, not just the one that matched (2026-08-05, same day)

You sent a screenshot of a result card for a borrower with "2 accounts
linked" that still only showed ONE account's O/S Balance/Net O/S/Total
P&L, and asked for both linked accounts' figures plus a combined Total
O/S/Total Dues/Total P&L on the card itself — "yhin dono a/c ki itna hi
data aana chahiye... fir ye block thoda bada ho jaye ya redesign karna
pade" (show both accounts' data right here, even if the card needs to
get bigger/redesigned for it).

- **Root cause**: `runSearch()` dedupes matches by *customer*, not by
  account, for any search mode other than Account No. — so a borrower
  with 2 linked loans only ever produced ONE row in `matches`, and the
  card rendered straight from that one row's own columns. The "🔗 N
  accounts linked" line was always correct (computed separately via
  `lookupLoanSlot`), but the figures above it silently belonged to just
  one of the N accounts.
- **Fix**: when a matched customer has more than one linked account
  (`[1,2,3,4].map(n=>lookupLoanSlot(custId,n))...`, same helper
  `openDetail()` already uses), the card now renders a new
  `.result-multi` block instead of the old flat O/S/Net O/S/P&L grid —
  one compact row per linked account (Account No., Asset Code badge,
  O/S, Net O/S, P&L), followed by a highlighted "All N Accounts" totals
  row (Total O/S, Total Dues, Total P&L summed across every linked
  account). NPA Date/Branch still show once below (shared per borrower).
  Single-account borrowers (the common case) are completely unchanged —
  still the original compact 5-field grid, no card growth.
- Built the per-account figure grid the same way `result-grid` already
  does (CSS Grid, `repeat(3,1fr)`, not flex) specifically so it keeps
  shrinking cleanly at the results list's card width instead of
  overflowing — an earlier flex-based attempt clipped the 3rd column at
  the card's actual width, caught via a Playwright screenshot before
  shipping.
- **Verified** against the exact borrower from the reported screenshot
  (RADHE LAL S/O PATIRAM, Cust ID 705701596, accounts 160635110000521 +
  160681210000001): both accounts' figures and the combined totals now
  show directly on the card. Checked dark theme, light theme, and a
  390px mobile viewport — all render cleanly with no overflow/clipping.
  Also confirmed a genuinely single-account borrower still renders the
  original, unchanged layout (no regression).

### OTS Calculator print sheet: laser-printer-friendly contrast + bold key figures (2026-08-05)

You sent another printed PDF and asked: "isko thoda aur is tarah banao ki
laser printer se dull print na aaye thoda bold jo data highlight hone
chahiye wo bold and increased font size" — the print sheet should read
crisp and bold off a laser printer, with whatever data matters most
called out bigger/bolder, and to ask if anything needed clarifying.
Asked one question (which figures count as "should be highlighted") —
you picked **key settlement figures only**, not every row.

- **Root cause of "dull"**: the compact print styles from the 1-page fit
  (2026-07-30, below) used mid-gray text (`#333`/`#444`/`#555`) and light
  gray borders (`#bbb`/dotted `#ccc`) throughout. Mid-grays halftone to a
  faint, washed-out result on laser printers, especially toner-saver
  settings — fine on a backlit screen, poor on paper. Replaced with
  near-black text everywhere and solid (not dotted) darker-gray borders.
- **Key figures now bold + a hair larger, with a light tint background**:
  O/S Balance, Total Dues, Total Contractual Dues, Total P&L, OTS Amount,
  Total Sacrifice, Impact on P&L, and the entire Aggregate Totals section
  — the same "which numbers matter" convention already used by the
  on-screen loan table's `lt-strong` rows, now mirrored in print via a
  new `.pv-strong` row class set from `renderPrintView()`'s `STRONG_ROWS`
  list. Every other row (Sanction Date, Asset Code, NPA Date, etc.) stays
  plain weight, so the highlighted rows actually stand out instead of
  everything being uniformly bold.
- **Also fixed while in there**: this print view still had the same
  decimal-inconsistency bug fixed on-screen five days earlier (below) —
  it was never touched at the time since only the interactive table was
  shown. Switched every `fmtINR()` call in `renderPrintView()` to
  `fmtINR2()` so the print sheet now also always shows exactly 2 decimals.
- `print-color-adjust:exact` added on the shaded cells so the highlight
  tint survives regardless of the browser/OS print dialog's own
  "background graphics" toggle.
- **Verified the 1-page fit from 2026-07-30 didn't regress**: re-ran the
  same Playwright + `page.pdf({preferCSSPageSize:true})` + `pypdf` check
  used for that fix — still exactly 1 page after the bolder/larger key
  rows. Confirmed visually via a print-media screenshot: highlighted rows
  clearly pop against the plain ones, borrower name and all header text
  read solid black, borders are crisp.

### OTS Calculator detail table: all currency figures now always show exactly 2 decimals (2026-07-30, same day)

You sent a screenshot of the interactive Loan Accounts table (not the
print sheet — the on-screen "A/c · ..." particulars grid with Sanction
Limit, O/S Balance, Settlement/OTS Amount etc.) asking for all digits to
be fixed at 2 decimal places. Root cause: this table (and the aggregate
sidebar showing the same totals for multi-account borrowers) used
`fmtINR()`, which caps decimals at 2 but doesn't pad them
(`maximumFractionDigits:2` with no minimum) — so a whole-number value
like ₹4,63,000 showed with no decimals at all while a value like
₹4,58,728.90 got its trailing zero silently dropped to ₹4,58,728.9,
right next to each other in the same column. Switched every currency
figure on this page (borrower card's SB Balance, every row in the loan
particulars table, Total Sacrifice/Ledger Sacrifice/BDWO/P&L Impact, and
the aggregate sidebar's totals) to `fmtINR2()` — an existing helper
(already used elsewhere for KCC Overdue/PNPA account tables) that forces
`minimumFractionDigits:2` too, so every amount reads consistently as
`₹X,XX,XXX.XX`. The print sheet (fixed separately, above) and the search
results list were left untouched — not shown in the reported screenshot,
so out of scope for this fix. Verified against the same KAMLA DEVI
account (Cust ID 710391021) with a test OTS amount entered: every figure
in both the loan table and the sidebar now shows exactly 2 decimals,
confirmed via screenshot.

### Bug fix: OTS Calculator print sheet spilled onto 2 pages instead of fitting 1 (2026-07-30)

You sent the actual printed PDF: "OTS SHEET ASE PRINT HO RAHE HAI JABKI YE
MUJHE 1 PAGE PAR CHAHIYE. PURA 1 PAGE PAR ALIGN KARO" — the borrower's
Sanction Date through Net O/S rows landed on page 1, then Provision
through Impact on P&L plus the Aggregate Totals spilled onto a 2nd page.
Two separate things were wrong:

1. **The `.pv-*` print styles were sized for on-screen comfort, not a
   single printed page.** The particulars table always has exactly 18
   rows regardless of how many loan accounts a borrower has (accounts
   print as extra *columns*, not rows), so the sheet's height is
   effectively fixed — it just needed tightening, not a dynamic
   scale-to-fit. Compressed font sizes, paddings and margins across the
   header, borrower-info grid, particulars table, aggregate totals and
   footer, and trimmed the page margin from 14mm to 12mm — built in
   deliberate headroom (verified content height leaves ~250px of A4 page
   to spare) so an occasional 2-line address won't tip it back over.
2. **Found in the process, a real latent bug**: this print view's own
   `@page{size:A4;margin:12mm}` and the Daily NPA Projection grid's
   `@page{size:A4 landscape;margin:8mm}` (added 2026-07-23) both lived as
   unconditional rules in the stylesheet. `@page` can't be scoped to a
   selector/view, so the two were silently fighting over the page `size`
   property for **every** print job on the site, with whichever rule
   happened to sit later in the stylesheet winning regardless of which
   view was actually being printed. Fixed by removing both static rules
   and instead injecting a single `<style>` tag's `@page` text right
   before each `window.print()` call (`printWithPageSize()` in
   `js/app.js`) — the OTS Calculator's Print/Share button now calls
   `printOtsSheet()` (portrait/12mm) and the Daily NPA Projection grid's
   Print button sets landscape/8mm, each independently, with no more
   cross-view interference.
- **Verified with Playwright + `page.pdf({preferCSSPageSize:true})`**
  (which honors the page's actual CSS `@page`, the same as a real
  "Save as PDF"), against the exact real account from your reported PDF
  (KAMLA DEVI, Cust ID 710391021): clicking the real Print/Share button
  correctly injects the portrait/12mm rule and the resulting PDF is
  **1 page** (confirmed via `pypdf`'s page count), where before it was 2.
  Separately confirmed the Daily NPA Projection grid's print button still
  independently gets its own landscape/8mm rule, unaffected.

### Bug fix: only the 3 left-frozen header cells were staying pinned on vertical scroll, not the whole header row (2026-07-26, same day)

You reported: "Projection ki table main keval pahle 2 column ki 1st row
freeze hai baki nahi jabki 1st row header wali puri row freeze honi
chahiye" — only the first couple of header cells stayed put while
scrolling the grid down, the rest of the header row scrolled away with
the data. Root cause: the AutoFilter feature (2026-07-23) added
`#dailyProjTable th{position:relative}` to anchor each column's filter
popover — an ID selector, which outranks the class-based sticky-header
rule (`.projgrid-scroll .dash-table thead th{position:sticky;top:0}`) on
specificity for the `position` property alone, silently un-stickying
every header cell except S N/Sol ID/Branch (which already had their own
even-more-specific left-freeze override). Fixed by changing that rule to
`#dailyProjTable thead th{position:sticky;top:0;z-index:2}` — same or
higher specificity, so it wins outright instead of fighting the other
rule column-by-column, and `position:sticky` still anchors the filter
popover exactly as `position:relative` did. Verified with Playwright:
after scrolling the grid 400px, all 11 header cells report computed
`position:sticky` and sit at the identical `top` offset (fully aligned,
whole row moves together).

### Daily NPA Projection now syncs live to every user, no Publish needed for this tab (2026-07-26)

You asked: "Projection har user ko live changes dikhenge na chahe koi bhi
user jo bhi last type kare wo type hote hi har user ko live hona chahiye
bina koi push k ye live intdrface hai realtime update" — the grid should
show every user's changes to everyone else the instant they're typed, with
no Publish/push step, because this is meant to be a genuinely live shared
interface. Clarified scope via two quick questions and you picked
near-real-time (2-3 second sync, no new paid infra) and removing Publish
entirely for this one tab (every other tab keeps Publish unchanged).

- **New relay endpoint** `relay/api/daily-proj-live.js`, built on the exact
  same pattern as the existing `lock-ots.js` OTS-lock relay: no GitHub
  sign-in needed, writes go through a repo-scoped token held server-side
  (`LOCK_OTS_GITHUB_TOKEN` — the same Vercel env var OTS locking already
  uses, no new setup). Body is `{ updates: [{ rowIndex, row }, ...] }` —
  rows are addressed by array index (this 55-branch sheet is only ever
  edited in place, rows never added/removed/reordered) and replaced whole,
  so the server stays "dumb" about column meaning. Uses the same GitHub
  Contents API GET-sha→merge→PUT-with-sha cycle, retried up to 3 times on
  a 409/422 sha conflict from a concurrent writer.
- **Client-side write path**: edits are no longer per-keystroke commits —
  `dpQueueLiveSync()` debounces edits per-row into a `Map`, and
  `dpFlushLiveSync()` sends everything queued as ONE batched POST after
  ~1200ms of inactivity, so a multi-branch Excel paste becomes one write,
  not dozens. A failed sync is never dropped (Publish, the old safety net,
  no longer exists for this tab) — it retries with exponential backoff
  (capped at 20s) and shows a persistent, hard-to-miss status pill:
  **● Live** (green), **◐ Saving…** (amber, shown the instant an edit is
  queued, not just once the network call starts), or **✕ Not syncing —
  retrying…** (red).
- **Client-side read path**: `dpPollLive()` polls the existing public
  `data/daily-npa-projection.json` (no new endpoint needed for reads — it's
  just the same GitHub Pages static file, cache-busted) every 3 seconds
  while the tab is visible, and merges in any row that's actually changed —
  **except** a row the local user currently has an input focused in
  (checked live against `document.activeElement`, not cached) or a row
  still sitting unconfirmed in the local pending map, so a slow round-trip
  can never let a poll clobber someone's own newer, not-yet-saved edit.
  A changed row is patched into the DOM surgically cell-by-cell
  (`dpApplyRowToDom()`), not via a full table re-render, so a poll landing
  mid-keystroke anywhere else in the grid never steals focus.
  Undo, Clear All Fields, and paste all route through the same queue/flush
  functions, so they sync live too.
- **Publish removed for this tab only**: `__pendingDailyProjData` deleted
  entirely; `confirmPublish()` no longer touches this file at all. Every
  other tab (Dashboard NPA data, Bank Dashboard, PNPA, KCC Overdue) is
  completely unchanged and still requires the Admin's manual Publish.
- **Verified with Playwright** (mocked relay for the write side, direct
  file edits simulating "another user" for the read side): editing a cell
  recalculates Recovery/GAP/the summary strip instantly as before, flips
  to "Saving" immediately then back to "Live" once the batched POST
  resolves, with the exact expected payload. Separately confirmed the poll
  path: an unfocused row picks up another user's change within one 3s
  poll; a row with focus is left untouched (and regains it correctly on
  the next poll after blur); a row with a local edit still pending sync is
  also left untouched even if the server file changed underneath it too.
  Zero console errors across all runs.
- **Depends on `LOCK_OTS_GITHUB_TOKEN` already being configured in
  Vercel** (see Section 5 — flagged there since 2026-07-23 for OTS lock
  sync). If OTS locking already syncs live across devices for you, this
  will too, automatically. If that one-time setup was never finished,
  writes from this tab will fail the same way lock syncing would, until
  it's done — no other part of the app is affected either way.

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

### Rows in PNPA/KCC Overdue account-list modals now open the same Quick Account Detail card (2026-07-24, same day)

Liked the new Quick Account Detail card from Quick Search results and
asked for the same thing when tapping any account row inside the PNPA
and KCC Overdue account-list modals (the ones opened by tapping a
branch's row in their "Branch-wise Summary" tables) — those rows did
nothing on tap before.

- Added `showQuickAcctDetailByAcct(source, acctNo)`, which looks the row
  up by account number against the raw `KCC_OVERDUE_DATA`/`PNPA_DATA`
  (account numbers are unique within each report) and reuses the exact
  same `showQuickAcctDetail()` card built for search results — no new UI,
  just wired the existing one to a second entry point.
- Every row in `kccovAcctRows()`/`pnpaAcctRows()` now carries the
  `clickable` class (existing hover-highlight styling) and this onclick.
- Verified: tapping a row inside a KCC Overdue branch's account list
  opens the borrower's detail card stacked on top, correct data every
  time; same for a PNPA branch's account list.

### Quick Search couldn't find KCC Overdue or PNPA accounts at all (2026-07-24, same day)

Reported "Overdue ke accounts search nahi kar pa raha hun" (can't search
KCC Overdue's accounts). Investigated with a direct data check rather
than guessing: Quick Search (`openCmdk`/`renderCmdk`) has only ever
searched `DATA.npa.rows`. Cross-checked every KCC Overdue account number
(9,744 rows) and every Daily PNPA account number (104 rows) against that
NPA dataset — **zero overlap in either case**. These are genuinely
separate report universes, not filtered views of the same book, so no
amount of typing the right name or account number could ever have
surfaced a KCC Overdue or PNPA borrower — this wasn't a search-quality
bug, Quick Search was blind to those two datasets entirely.

- `renderCmdk()` now also searches `KCC_OVERDUE_DATA` and `PNPA_DATA` by
  name/account no. (NPA results still get priority, capped at 12, then up
  to 3 more from KCC Overdue, then up to 3 more from PNPA — 18 max total).
  Each result carries a small "KCC Overdue" or "PNPA" tag so it's clear
  which report it came from.
- `openCmdk()` now prefetches both datasets in the background the moment
  the palette opens, if they haven't already been loaded by visiting
  those tabs — otherwise search would only start working for them after
  the user happened to open KCC Overdue/PNPA at least once that session.
- NPA results still open the full OTS settlement detail (`openDetail`) as
  before. KCC Overdue/PNPA rows have no customer ID and none of the
  fuller fields that view needs (confirmed by the same zero-overlap
  check), so picking one instead opens a new lightweight read-only "Quick
  Account Detail" modal (reusing the existing `.info-grid` key/value
  layout from the borrower card) showing Account No, Scheme, Outstanding,
  CADU, Limit, and whatever else that report tracks (Cust NPA Date/F.Y./
  Category/SMA for KCC Overdue; Review Date/Reason for PNPA).
- Verified: searching "Shashi Kumari" from the Dashboard (without ever
  visiting the KCC Overdue tab first) correctly surfaced her KCC Overdue
  record with the right account/branch, and opened a detail card matching
  the real underlying data exactly; a PNPA-only borrower ("Narayan Singh
  S/O Jeevan Lal") was found the same way; regular NPA search (e.g.
  "Mahesh") still works exactly as before, unaffected.

### Fixed: AutoFilter button looked identical to the sort arrow (2026-07-24)

Next day, reported that the column filter "only sorts, filtering doesn't
work" — sounded like a functional regression, but re-tested the exact same
Zero-Recovery/Follow-up-By scenarios from yesterday and the filtering
itself was working exactly as before (rows correctly hidden, summary
correctly recalculated). The real bug was **discoverability, not
function**: the filter button used the `⏷` Unicode glyph sitting right
next to the sort label's own `▾` indicator — at header font size the two
looked nearly identical, so it was very easy to tap the sort label
(reordering the column) while aiming for the filter button, and conclude
filtering wasn't doing anything.

- Replaced the `⏷` glyph with a real funnel SVG icon inside a bordered,
  backgrounded chip (`.dp-filter-btn`) so it unmistakably reads as a
  separate button, not just another small triangle floating next to the
  header text. Active filters now also show a clearly highlighted
  chip (accent-colored background/border), not just a subtle opacity
  change.
- Verified the chip's slightly larger size doesn't reopen the Sol ID
  sticky-column overflow bug from yesterday (button stays inside its
  106px column on a 390px mobile viewport), and confirmed with a direct
  DOM check that clicking the filter chip never applies the `sort-asc`/
  `sort-desc` class to that header — the two controls are genuinely
  independent, this was purely a visual mix-up.

### Daily NPA Projection: Excel-style AutoFilter on every column + borrower search icon on account lists (2026-07-23, same day)

Two asks in one batch: (1) "Projection main bilkul vaise filter lagao jaise
Excel main lagta hai" — wants to see, e.g., only branches with 0 Recovery,
or only branches that gave an Evening Commitment, with every column's
subtotal recalculating for just those branches; (2) a search icon next to
every heading where an account list appears, to jump straight to a
borrower by name/account no.

- **Column AutoFilter** (`js/app.js`, `dailyProjFilters`): every column
  header in Daily NPA Projection now has a ⏷ button, same idea as Excel's
  filter dropdown. Numeric columns (Morning/Evening NPA, Commitment,
  Recovery, GAP, Eve. Commitment) get quick filters — All / Non-zero /
  Zero (0) / Has a value / Blank (not entered) — covering the "0 recovery"
  and "gave Eve. Commitment" cases directly. Text columns (Branch,
  Follow-up By, Remarks) get a real Excel-style searchable checkbox list
  of distinct values with a Select All toggle. Multiple column filters
  combine with AND logic, same as Excel.
- Filtering drives everything consistently: the visible rows, the summary
  strip's totals (`dpSummary()` now runs over the filtered set, read
  straight from the current tbody's `data-orig` rows so it can't drift out
  of sync with what's on screen), and the Excel export (`dpComputeVisibleOrder()`
  is shared by the render path and `exportDailyProjExcel()`, so exporting
  after filtering gives you exactly the filtered branches, with a note in
  the file saying how many were filtered out) — What-you-see-is-what-you-
  export, like filtering a range in Excel.
- A "N column filter(s) active · showing X of 55 branches · Clear Filters"
  status line appears in the toolbar whenever any filter is on.
- **Fixed along the way**: the Sol ID sticky column (frozen for horizontal
  scroll, shipped earlier today) was 64px wide — enough for its numbers,
  but too narrow to also fit the new filter button next to its header
  label. The button silently overflowed into the neighboring Branch
  header and became unclickable there instead. Widened Sol ID's frozen
  column to 106px (verified via exact pixel measurement, not just eyeballing
  it) so both the label and button fit inside its own header.
- **Borrower search icon** (`sectionSearchBtn()`): a small 🔍 button next
  to "All Accounts by Outstanding" on the Dashboard, and next to the title
  in the shared account-list drill-down modal (used everywhere else an
  account list surfaces — PNPA, KCC Overdue, and every Dashboard bucket/
  asset/scheme click) — both just open the existing Quick Search (Cmd+K)
  palette rather than building a second search UI, since that already
  looks a borrower up by name/account no./customer ID/mobile and opens
  their settlement detail.
- **Bug caught while wiring the search icon**: `openCmdk()` had never been
  exposed on `window` — the whole app lives inside one `initApp(DATA){...}`
  function scope, so nothing inside it is globally callable unless
  explicitly assigned to `window`, and every other place that opens it did
  so via a proper JS event-listener closure, never an inline
  `onclick="openCmdk()"` attribute, so this had never surfaced before.
  Fixed by adding `window.openCmdk = openCmdk`.
- Verified in the browser (dark theme, desktop + 390px mobile): Zero-
  Recovery filter correctly narrowed 55 branches to 16, all showing
  Recovery 0.00, with the summary strip recalculating to match; a
  Follow-up-By checkbox filter (just "Deepak") correctly showed his 11
  branches with a matching recalculated summary; Clear Filters correctly
  restored all 55; the search icons open Cmd+K and find a borrower by
  partial name; editing, sorting, Undo, and Excel export all still work
  correctly alongside the new filters with no console errors.

### Fixed: hero KPI card value overlapping the NPA%/Mar-Jun badge (2026-07-23, same day)

Asked to search for more bugs after the last two fixes. Two more phone
screenshots showed the "Total Outstanding" hero card's big value
("₹128.35 Cr") visually overlapping the "8.9% NPA" badge and "MAR/JUN"
corner-stats sitting in the card's top-right corner — the "JUN ₹129.00 Cr"
text was rendering right through the "Cr" of the value.

- Root cause: `.hero-kpi-badge` and `.hero-kpi-corner-stats` were
  `position:absolute` overlays pinned at a fixed distance from the card's
  top-right corner, completely independent of how wide the value text
  actually rendered. Measured with Playwright across 7 different card
  widths (600px to 1440px) — the overlap was present at **every** one of
  them, not just narrow ones; the "clean" earlier screenshots of this
  exact card just hadn't been looked at closely enough. Affects any hero
  card carrying both a badge and Mar/Jun corner-stats together: Dashboard's
  Total Outstanding card, and all 3 of Bank Dashboard's hero cards.
- Fixed the actual layout, not just this one card's numbers: `heroKpiCard()`
  now wraps its icon/label/value/sub content in `.hero-kpi-main` and its
  badge/corner-stats in `.hero-kpi-side`, laid out as two real flex columns
  on the card (`display:flex;justify-content:space-between`) instead of an
  absolutely-positioned layer on top of normal-flow content — so they
  physically cannot share the same space regardless of value length or
  card width. The existing mobile single-column stack (badge, then
  corner-stats, then icon/label/value) is preserved via `order:-1` on
  `.hero-kpi-side` inside the existing `max-width:599px` breakpoint — no
  visual change there.
- Verified: the same 7-width Playwright measurement now shows zero
  horizontal overlap at every desktop/tablet width, and screenshots of
  Dashboard, Bank Dashboard, Daily PNPA, and KCC Overdue (dark + light,
  mobile + desktop) all show clean, non-overlapping cards. On very narrow
  cards the value can now wrap onto two lines instead of overlapping —
  a legible two-line number instead of illegible overlapping text.

### Fixed: left sidebar wouldn't scroll on a rotated (landscape) phone (2026-07-23, same day)

A phone screenshot showed the desktop-style left sidebar cut off after
"Daily NPA Projection" with the Refresh icon barely peeking in at the
bottom — Quick Search, Settings, Theme, and Sign-in-with-GitHub were all
below the fold and unreachable ("Rotate karne par left side mein panel
scroll nahi ho raha" — the panel doesn't scroll after rotating).

- Root cause: `#sideNav` never had `overflow-y:auto`. In portrait mode the
  sidebar's full content (nav items + Quick Search/Settings/Theme/sign-in/
  footer) always fit within the viewport height, so this was never
  visible — but rotating a phone to landscape can be wide enough to
  trigger the `>=900px` desktop sidebar layout while only being ~400-500px
  tall, at which point the overflowing content had nowhere to go: `html,
  body{overflow:hidden}` blocks the page itself from scrolling, and the
  sidebar had no scroll of its own either, so that content was just
  clipped.
- Fixed with `#sideNav{overflow-y:auto;-webkit-overflow-scrolling:touch}`.
- Verified with a 1000×420 viewport (simulating a rotated phone): before
  the fix the sidebar's `scrollHeight` (666px) exceeded its `clientHeight`
  (420px) with no way to reach the rest; after the fix, scrolling the
  sidebar reveals Refresh, Quick Search, Settings, Light/Dark Mode,
  Sign in with GitHub, and the footer, exactly as expected.

### One consolidated Refresh button instead of 5 duplicated per-tab icons (2026-07-23, same day)

- Every data tab (Dashboard, Bank Dashboard, Daily PNPA, KCC Overdue, Daily
  NPA Projection) had its own "Refresh" icon in its view header
  (`refreshDataBtn`/`bankRefreshBtn`/`pnpaRefreshBtn`/`kccovRefreshBtn`/
  `dailyProjRefreshBtn`) — five copies of the same action. Removed all five
  and added a single Refresh button in the same header area as the other
  utility buttons: `#mobileUtilBar` on mobile, `#sideNav` on desktop.
- New `refreshCurrentView()` checks which view is currently active and
  calls that tab's own refresh function (Daily NPA Projection still warns
  before discarding unpublished edits, same as before); Dashboard and
  Search fall back to a full page reload, same as Dashboard's refresh
  always did (also picks up any newly published app-shell code).
- The mobile "Update data" button's icon was, by oversight, the same
  circular-arrow "refresh" glyph — now that a real Refresh button sits
  right next to it in the same bar, that would've been confusing. Changed
  it to a distinct upload-tray icon; the desktop sidebar's "Settings"
  button already used a separate gear icon, so it needed no change.
- Verified in the browser (mobile 390px + desktop 1440px, both themes):
  the old per-tab refresh icons are gone, the new header/sidebar Refresh
  button correctly refreshes whichever tab is active without navigating
  away from it (tested switching to KCC Overdue and refreshing from
  there), and the Update Data icon no longer looks like a refresh icon.

### Recovery tile now shows how many branches reduced NPA today (2026-07-23, same day)

- `dpSummary()` now also counts `reducedBranches` (branches where Recovery
  = Morning NPA − Evening NPA is positive, i.e. Evening NPA is lower than
  Morning) out of `totalBranches`. Shown as a small sub-line under the
  Recovery summary tile: "N of 55 branches reduced NPA" — live-recalculated
  the same way every other total on this strip already is, no publish
  needed. Also added to the Excel export's summary row for the same
  reason as everything else in that row: keep the exported figures
  consistent with what's on screen.

### Center the account-list modal + freeze Branch column in Daily NPA Projection (2026-07-23, same day)

Two more phone screenshots: one showing a KCC Overdue branch drill-down list
rendered as a barely-visible sliver stuck to the bottom of the screen
("Ye top ya middle se show hona chahiye" — this should show from the top or
middle), and one of the Daily NPA Projection grid asking that the branch
name stay visible alongside Recovery when scrolling right, plus a general
"make this more beautiful" ask.

- **List modal (account/branch drill-down)**: `#listModalOverlay` (shared
  by every "tap to see the list" drill-down across Dashboard/PNPA/KCC
  Overdue) was using the same `.modal-overlay{align-items:flex-end}` as
  short confirm-style sheets — fine for a 2-line dialog, but a data table
  with only a couple of rows rendered as a tiny sliver pinned to the
  screen's bottom edge, half-hidden behind the mobile bottom nav. Scoped an
  override to just this modal: `#listModalOverlay{align-items:center}` +
  full corner rounding (was flat-bottomed for the bottom-sheet look), so it
  now always renders as a clearly visible centered dialog regardless of
  row count. Other short modals (Update Data, GitHub sign-in) keep their
  original bottom-sheet behavior — this was scoped to the list modal only.
- **Daily NPA Projection — frozen Branch column**: the grid is 11 columns
  wide and needs horizontal scroll to reach Recovery/GAP/Follow-up, during
  which the Branch name used to scroll out of view, making it easy to lose
  track of which row you were looking at. S N, Sol ID, and Branch are now
  `position:sticky` on the left (explicit pixel widths so the 3 sticky
  offsets line up exactly, since a plain table's auto column widths can't
  be trusted for that), with a subtle drop-shadow marking the edge of the
  frozen block, correct zebra-stripe backgrounds so alternating rows still
  look right as they scroll under the frozen columns, and a light
  row-hover highlight added for easier scanning across a wide sheet.
- Verified both fixes live in the browser (dark and light theme, 390px
  mobile viewport): the list modal now shows centered and fully visible
  even for a 1-row list; scrolling the projection grid right to Recovery
  keeps Sol ID/Branch pinned and legible the whole time.

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
