// Relays the GitHub Device Flow "start" request. Exists only to get around
// the browser's same-origin restriction (GitHub's login endpoints don't
// allow direct cross-site fetch from a static site's JavaScript). Carries
// no secret — client_id is a public identifier.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';
const GITHUB_CLIENT_ID = 'Ov23liwGRJMlo4VZSBzn';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  try {
    const upstream = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GITHUB_CLIENT_ID, scope: 'repo' })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'relay_failed', detail: String(err) });
  }
}
