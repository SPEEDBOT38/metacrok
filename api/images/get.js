// GET /api/images/get?run_id=&idx= — the painted ad, as an image.
import { db } from '../../lib/hatchable.js';
import { str } from '../../lib/util.js';

export const access = 'public';
export const methods = ['GET'];

export default async function (req, res) {
  const runId = str(req.query && req.query.run_id, 20), idx = Number(req.query && req.query.idx);
  if (!/^[a-z0-9]{6,20}$/.test(runId) || !(idx >= 0 && idx <= 2)) return res.status(400).json({ error: 'bad image' });
  const { rows } = await db.query('SELECT mime, data FROM variant_images WHERE run_id = $1 AND idx = $2', [runId, idx]);
  if (!rows.length) return res.status(404).json({ error: 'No image yet.' });
  res.statusCode = 200;
  res.setHeader('content-type', rows[0].mime || 'image/png');
  res.setHeader('cache-control', 'private, max-age=31536000, immutable'); // the ?v= in the link changes with each new image
  res.end(Buffer.from(rows[0].data, 'base64'));
}
