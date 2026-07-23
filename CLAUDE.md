# UPGB Hathras NPA Dashboard — persistent project notes

## Date format
All dates shown to the user must always be **DD-MM-YYYY** — never
YYYY-MM-DD, MM-DD-YYYY, or a locale-dependent format (e.g.
`toLocaleDateString()`/`toLocaleString()` with no explicit format, which
can render as M/D/YYYY or D/M/YYYY depending on the browser/OS locale).

- Use `fmtDate(d)` (in `js/app.js`) for any date shown as text — it
  always produces `DD-MM-YYYY` regardless of locale.
- For a date + time, use `fmtDateTime(d)` (also `js/app.js`) — the date
  portion always goes through `fmtDate()`; only the time-of-day part uses
  `toLocaleTimeString('en-IN', ...)`, which carries no date-format
  ambiguity.
- Native `<input type="date">`/`<input type="month">` are exempt — their
  `value` attribute is required by the HTML spec to be `YYYY-MM-DD`/
  `YYYY-MM`, and the on-screen rendering of the picker itself is native
  browser UI outside JS's control. `dateToInputValue(d)` exists
  specifically to produce that wire format for these inputs — don't use
  it for anything that's actually displayed as text.
- When adding a new data tab/parser that reads a date column, always
  convert through `toDate()` → `fmtDate()` (or store the already-
  formatted `DD-MM-YYYY` string in the row) rather than passing the raw
  Excel serial number, ISO string, or JS `Date` object straight through
  to display.

See `PROJECT_ROADMAP.md` for the full running log of features and fixes.
