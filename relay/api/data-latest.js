// Public, no login needed (Viewers never authenticate). The stored data is
// already gzip-compressed (see db.js), so this just decodes the base64 and
// ships the compressed bytes straight through with Content-Encoding: gzip
// -- browsers decompress that transparently, so js/app.js's plain
// fetch(...).then(r=>r.json()) needs no change, and no re-compression work
// happens on every request.
import { setCors, handlePreflight } from '../lib/cors.js';
import { getCurrentVersion } from '../lib/db.js';

export default async function handler(req, res) {
  setCors(req, res, 'GET');
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  try {
    const current = await getCurrentVersion();
    if (!current || !current.dataGzipB64) { res.status(404).json({ error: 'no_data_published_yet' }); return; }
    const gzipped = Buffer.from(current.dataGzipB64, 'base64');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(gzipped);
  } catch (err) {
    res.status(500).json({ error: 'db_error', detail: String(err) });
  }
}
