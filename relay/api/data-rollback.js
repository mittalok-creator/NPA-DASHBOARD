// Admin-only rollback: re-publishes an older version's content as a brand
// new current version (never rewrites/deletes the old row), so the
// rollback itself shows up in history exactly like any other publish.
import { setCors, handlePreflight } from '../lib/cors.js';
import { verifyAdmin } from '../lib/verify-admin.js';
import { getVersionData, publishVersion } from '../lib/db.js';

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
    const versionId = body && body.versionId;
    if (!versionId) { res.status(400).json({ error: 'missing_version_id' }); return; }

    const version = await getVersionData(versionId);
    if (!version) { res.status(404).json({ error: 'version_not_found' }); return; }

    const data = version.data;
    const rows = (data && data.npa && data.npa.rows) || [];
    const regions = Array.from(new Set(rows.map(r => String(r[26] || '')).filter(Boolean)));

    const result = await publishVersion({
      data,
      asOnDate: version.as_on_date,
      rowCount: rows.length,
      regions,
      publishedBy: admin.login,
      isRollback: true,
    });
    res.status(200).json({ ok: true, id: result.id, publishedAt: result.published_at });
  } catch (err) {
    res.status(500).json({ error: 'rollback_failed', detail: String((err && err.message) || err) });
  }
}
