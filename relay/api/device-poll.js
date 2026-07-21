// Relays the GitHub Device Flow "poll for token" request, for the same
// CORS reason as device-start.js. Still no secret involved — Device Flow
// is designed to work with only the public client_id.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';
const GITHUB_CLIENT_ID = 'Ov23liwGRJMlo4VZSBzn';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const deviceCode = body && body.device_code;
  if (!deviceCode) { res.status(400).json({ error: 'missing_device_code' }); return; }

  try {
    const upstream = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'relay_failed', detail: String(err) });
  }
}
