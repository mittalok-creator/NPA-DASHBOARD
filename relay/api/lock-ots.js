// Lets ANY user lock/unlock an OTS amount for an account -- no GitHub sign-in
// needed -- so it syncs to every viewer without the Admin having to manually
// Publish. Writes touch only data/locked-ots.json (a small, separate file
// from the main data/latest.json publish flow) via a repo-scoped token held
// only here, server-side, in a Vercel environment variable -- it is never
// sent to the browser.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';
const REPO_OWNER = 'mittalok-creator';
const REPO_NAME = 'NPA-DASHBOARD';
const REPO_BRANCH = 'main';
const FILE_PATH = 'data/locked-ots.json';
const TOKEN = process.env.LOCK_OTS_GITHUB_TOKEN;

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
  const acctNo = String((body && body.acctNo) || '').trim();
  const locked = !!(body && body.locked);
  const amount = body && body.amount;
  if (!acctNo || !/^[0-9A-Za-z]{3,30}$/.test(acctNo)) { res.status(400).json({ error: 'invalid_acctNo' }); return; }
  if (locked && (amount === undefined || amount === null || isNaN(parseFloat(amount)))) {
    res.status(400).json({ error: 'invalid_amount' }); return;
  }

  const contentsUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const getRes = await fetch(`${contentsUrl}?ref=${REPO_BRANCH}`, { headers: ghHeaders() });
      if (!getRes.ok) { res.status(502).json({ error: 'github_read_failed', status: getRes.status }); return; }
      const getData = await getRes.json();
      let current = {};
      try { current = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf8')); } catch (e) { current = {}; }

      if (locked) current[acctNo] = parseFloat(amount);
      else delete current[acctNo];

      const putRes = await fetch(contentsUrl, {
        method: 'PUT',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${locked ? 'Lock' : 'Unlock'} OTS for account ${acctNo}`,
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
      res.status(200).json({ ok: true, acctNo, locked });
      return;
    } catch (err) {
      if (attempt === 2) { res.status(502).json({ error: 'relay_failed', detail: String(err) }); return; }
    }
  }
  res.status(409).json({ error: 'conflict_retry_exhausted' });
}
