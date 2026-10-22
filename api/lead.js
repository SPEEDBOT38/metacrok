// POST /api/lead — optional email capture at the end of a run.
import { db } from '../lib/hatchable.js';
import { clientIp, hashIp, rateLimit, str } from '../lib/util.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const email = str(req.body && req.body.email, 160).toLowerCase();
  const runId = str(req.body && req.body.run_id, 20) || null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That email doesn\'t look right.' });
  const ipHash = await hashIp(clientIp(req));
  if (!(await rateLimit('lead:' + ipHash, 5, 60))) return res.status(429).json({ error: 'Already got you. Thanks!' });
  await db.query('INSERT INTO leads (email, run_id) VALUES ($1, $2)', [email, runId]);
  res.json({ ok: true });
}