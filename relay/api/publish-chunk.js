// Accepts one raw-byte chunk of a larger gzip-compressed publish payload.
// A genuine bank-wide multi-region upload can exceed Vercel's per-request
// payload ceiling (empirically ~4.5MB) even after compression, so the
// browser splits the compressed bytes into chunks well under that ceiling
// and uploads them one at a time here, tagged by upload id/index/total via
// headers. Body parsing is disabled so the raw chunk bytes can be read
// directly (same reasoning as publish.js).
import { setCors, handlePreflight } from '../lib/cors.js';
import { verifyAdmin } from '../lib/verify-admin.js';
import { storeChunk } from '../lib/db.js';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  setCors(req, res, 'POST');
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const admin = await verifyAdmin(req);
  if (!admin.ok) { res.status(admin.status).json({ error: admin.error }); return; }

  const uploadId = req.headers['x-upload-id'];
  const chunkIndex = parseInt(req.headers['x-chunk-index'], 10);
  const totalChunks = parseInt(req.headers['x-total-chunks'], 10);
  if (!uploadId || Number.isNaN(chunkIndex) || Number.isNaN(totalChunks)) {
    res.status(400).json({ error: 'missing_chunk_headers' });
    return;
  }

  try {
    const raw = await readRawBody(req);
    await storeChunk(uploadId, chunkIndex, totalChunks, raw.toString('base64'), admin.login);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'chunk_store_failed', detail: String((err && err.message) || err) });
  }
}
