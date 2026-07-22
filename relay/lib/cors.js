// Shared CORS setup -- the dashboard (npadashboard.alokmittal.net) and this
// backend (npa-dashboard.vercel.app) are different origins, so every route
// needs these headers, not just the OAuth relay endpoints.
const ALLOWED_ORIGIN = 'https://npadashboard.alokmittal.net';

export function setCors(req, res, methods) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', methods + ', OPTIONS');
  // X-Upload-Id/X-Chunk-Index/X-Total-Chunks are custom headers used by the
  // chunked publish flow (publish-chunk.js) -- a browser's CORS preflight
  // rejects the actual request if a custom header isn't explicitly listed
  // here, which surfaces to JS as an opaque "Failed to fetch" with no
  // response at all (curl doesn't enforce CORS, so this only shows up in a
  // real browser).
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Upload-Id, X-Chunk-Index, X-Total-Chunks');
}

export function handlePreflight(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}
