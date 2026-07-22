// Public, no login needed (Viewers never authenticate). Response is
// gzip-compressed server-side -- browsers decompress Content-Encoding: gzip
// transparently, so js/app.js's plain fetch(...).then(r=>r.json()) needs no
// change, but the actual bytes crossing the wire (and counted against any
// platform response-size limit) are a fraction of the raw JSON size.
import zlib from 'zlib';
import { setCors, handlePreflight } from '../lib/cors.js';
import { getCurrentVersion } from '../lib/db.js';

export default async function handler(req, res) {
  setCors(req, res, 'GET');
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  try {
    const current = await getCurrentVersion();
    if (!current) { res.status(404).json({ error: 'no_data_published_yet' }); return; }
    const gzipped = zlib.gzipSync(JSON.stringify(current.data));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(gzipped);
  } catch (err) {
    res.status(500).json({ error: 'db_error', detail: String(err) });
  }
}
