// Shared CORS setup -- the dashboard (npadashboard.alokmittal.net) and this
// backend (npa-dashboard.vercel.app) are different origins, so every route
// needs these headers, not just the OAuth relay endpoints.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';

export function setCors(req, res, methods) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
