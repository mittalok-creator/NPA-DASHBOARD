// Reassembles every chunk for an upload id, gunzips the result, and
// publishes it exactly like publish.js does for a small single-request
// payload. Used once all chunks from publish-chunk.js have arrived.
import zlib from 'zlib';
import { setCors, handlePreflight } from '../lib/cors.js';
import { verifyAdmin } from '../lib/verify-admin.js';
import { assembleChunks, deleteChunks, publishVersion } from '../lib/db.js';

export default async function handler(req, res) {
  setCors(req, res, 'POST');
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const admin = await verifyAdmin(req);
  if (!admin.ok) { res.status(admin.status).json({ error: admin.error }); return; }

  try {
    let body = req.body;
    if (!body || typeof body === 'string') {
      try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
    }
    const uploadId = body && body.uploadId;
    if (!uploadId) { res.status(400).json({ error: 'missing_upload_id' }); return; }

    const compressedBuf = await assembleChunks(uploadId, admin.login);
    if (!compressedBuf) { res.status(404).json({ error: 'upload_not_found_or_incomplete' }); return; }

    const jsonText = zlib.gunzipSync(compressedBuf).toString('utf-8');
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
    await deleteChunks(uploadId);
    res.status(200).json({ ok: true, id: result.id, publishedAt: result.published_at });
  } catch (err) {
    res.status(500).json({ error: 'finalize_failed', detail: String((err && err.message) || err) });
  }
}
