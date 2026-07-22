import { setCors, handlePreflight } from '../lib/cors.js';
import { getHistory } from '../lib/db.js';

export default async function handler(req, res) {
  setCors(req, res, 'GET');
  if (handlePreflight(req, res)) return;
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  try {
    const history = await getHistory();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(history);
  } catch (err) {
    res.status(500).json({ error: 'db_error', detail: String(err) });
  }
}
