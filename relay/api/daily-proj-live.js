// Lets ANY user's edits to the Daily NPA Projection grid sync to every
// other viewer within a few seconds -- no GitHub sign-in or Admin Publish
// needed for this sheet, since it's edited by whoever's on shift that day,
// not just the Admin, and the app now treats it as a live shared
// spreadsheet rather than something with a manual "go live" step. Writes
// touch only data/daily-npa-projection.json, using the SAME repo-scoped
// token as the OTS-lock relay (LOCK_OTS_GITHUB_TOKEN already grants
// Contents: Read and write on this one repo -- no extra setup needed
// beyond what OTS locking already required).
//
// Body: { updates: [{ rowIndex, row }, ...] } -- row is the FULL row array
// (matching data/daily-npa-projection.json's own row shape) for whichever
// branch changed. Sent as a batch so a paste touching many branches at
// once becomes one write/one commit, not dozens.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';
const REPO_OWNER = 'mittalok-creator';
const REPO_NAME = 'NPA-DASHBOARD';
const REPO_BRANCH = 'main';
const FILE_PATH = 'data/daily-npa-projection.json';
const TOKEN = process.env.LOCK_OTS_GITHUB_TOKEN;
const MAX_UPDATES = 55; // there are only 55 branches in this sheet

function ghHeaders() {
  return { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/vnd.github+json' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  if (!TOKEN) { res.status(500).json({ error: 'server_not_configured' }); return; }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const updates = Array.isArray(body && body.updates) ? body.updates : null;
  if (!updates || !updates.length || updates.length > MAX_UPDATES) {
    res.status(400).json({ error: 'invalid_updates' }); return;
  }
  // Row shape was only checked for "is an array" -- not its length or the
  // type of each cell. Since this endpoint has no login (by design -- see
  // top-of-file comment) and CORS headers are a browser-only courtesy, not
  // real authorization, a stray client bug or a direct (non-browser) API
  // call with a malformed row could silently corrupt data/daily-npa-
  // projection.json for every viewer with no error anywhere. Every row is
  // now checked against the real shape (8 cells: SOL ID, Branch, 3 numeric
  // figures, an optional numeric figure, an optional "updated by" string,
  // one reserved slot) before it's ever accepted.
  const ROW_LEN = 8;
  const isNumOrNull = v => v === null || (typeof v === 'number' && isFinite(v));
  const isStrOrNull = v => v === null || (typeof v === 'string' && v.length <= 200);
  for (const u of updates) {
    if (!u || typeof u.rowIndex !== 'number' || !Number.isInteger(u.rowIndex) || u.rowIndex < 0 || !Array.isArray(u.row)) {
      res.status(400).json({ error: 'invalid_update_entry' }); return;
    }
    const row = u.row;
    const rowOk = row.length === ROW_LEN
      && typeof row[0] === 'number' && isFinite(row[0])
      && typeof row[1] === 'string' && row[1].length <= 200
      && isNumOrNull(row[2]) && isNumOrNull(row[3]) && isNumOrNull(row[4]) && isNumOrNull(row[5])
      && isStrOrNull(row[6]) && isStrOrNull(row[7]);
    if (!rowOk) { res.status(400).json({ error: 'invalid_row_shape' }); return; }
  }

  const contentsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const getRes = await fetch(`${contentsUrl}?ref=${REPO_BRANCH}`, { headers: ghHeaders() });
      if (!getRes.ok) { res.status(502).json({ error: 'github_read_failed', status: getRes.status }); return; }
      const getData = await getRes.json();
      let current;
      try { current = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf8')); } catch (e) { current = null; }
      if (!current || !Array.isArray(current.rows)) { res.status(502).json({ error: 'corrupt_current_file' }); return; }

      for (const u of updates) {
        if (u.rowIndex < current.rows.length) current.rows[u.rowIndex] = u.row;
      }

      const putRes = await fetch(contentsUrl, {
        method: 'PUT',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Live edit: Daily NPA Projection (${updates.length} row${updates.length > 1 ? 's' : ''})`,
          content: Buffer.from(JSON.stringify(current)).toString('base64'),
          sha: getData.sha,
          branch: REPO_BRANCH
        })
      });

      if (putRes.status === 409 || putRes.status === 422) continue; // sha moved under us -- retry
      if (!putRes.ok) {
        const detail = await putRes.text();
        res.status(502).json({ error: 'github_write_failed', status: putRes.status, detail });
        return;
      }
      res.status(200).json({ ok: true, updated: updates.length });
      return;
    } catch (err) {
      if (attempt === 2) { res.status(502).json({ error: 'relay_failed', detail: String(err) }); return; }
    }
  }
  res.status(409).json({ error: 'conflict_retry_exhausted' });
}
