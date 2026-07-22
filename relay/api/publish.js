// Admin publishes new NPA data here. The browser gzip-compresses the JSON
// payload before sending (Content-Encoding: gzip) -- Vercel's Serverless
// Functions enforce a request body size ceiling, and compression buys real
// headroom over that ceiling for realistic per-region upload sizes. Body
// parsing is disabled so the raw (still-compressed) bytes can be read and
// gunzipped here rather than fighting the platform's default JSON parser.
import zlib from 'zlib';
import { setCors, handlePreflight } from '../lib/cors.js';
import { verifyAdmin } from '../lib/verify-admin.js';
import { publishVersion } from '../lib/db.js';

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

  try {
    const raw = await readRawBody(req);
    const isGzip = (req.headers['content-encoding'] || '').includes('gzip');
    const jsonText = (isGzip ? zlib.gunzipSync(raw) : raw).toString('utf-8');
    const payload = JSON.parse(jsonText);
    const { data, meta } = payload || {};
    if (!data || !data.npa || !Array.isArray(data.npa.rows)) {
      res.status(400).json({ error: 'invalid_payload' });
      return;
    }
    const result = await publishVersion({
      data,
      asOnDate: (meta && meta.asOnDate) || null,
      rowCount: (meta && meta.rowCount) || data.npa.rows.length,
      regions: (meta && meta.regions) || [],
      publishedBy: admin.login,
      isRollback: !!(meta && meta.isRollback),
    });
    res.status(200).json({ ok: true, id: result.id, publishedAt: result.published_at });
  } catch (err) {
    res.status(500).json({ error: 'publish_failed', detail: String((err && err.message) || err) });
  }
}
