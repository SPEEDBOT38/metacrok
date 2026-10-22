// POST /api/runs/icp { id, audiences: [{ name, who, need }], target } — the founder's own say over the
// audiences the gator inferred: rename, describe, add, remove, and pick the one to aim at. Like the ad
// controls, it only takes effect when the founder regenerates; null audiences clears it back to inferred.
import { db } from '../../lib/hatchable.js';
import { clientIp, hashIp, rateLimit, str } from '../../lib/util.js';
import { pendingChanges } from '../../lib/pipeline.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const b = req.body || {};
  const id = str(b.id, 20);
  if (!/^[a-z0-9]{6,20}$/.test(id)) return res.status(400).json({ error: 'bad run id' });
  if (!(await rateLimit('icp:' + (await hashIp(clientIp(req))), 120, 60))) return res.status(429).json({ error: 'Slow down a little.' });
  const { rows: run } = await db.query('SELECT status FROM runs WHERE id = $1', [id]);
  if (!run.length) return res.status(404).json({ error: 'No run with that id.' });
  if (run[0].status !== 'done') return res.status(409).json({ error: 'Let the run finish before editing audiences.' });

  let icp = null;
  if (b.audiences !== null) {
    if (!Array.isArray(b.audiences)) return res.status(400).json({ error: 'audiences must be a list' });
    const seen = new Set();
    const audiences = b.audiences.map(a => ({ name: str(a && a.name, 40), who: str(a && a.who, 120), need: str(a && a.need, 100) }))
      .filter(a => a.name && !seen.has(a.name.toLowerCase()) && seen.add(a.name.toLowerCase()));
    if (audiences.length < 1 || audiences.length > 6) return res.status(400).json({ error: 'Keep between 1 and 6 audiences, each with a name.' });
    const target = str(b.target, 40);
    if (target && !audiences.some(a => a.name === target)) return res.status(400).json({ error: 'The target must be one of your audiences.' });
    icp = { audiences, target: target || null };
  }
  await db.query('UPDATE runs SET icp = $2::jsonb, icp_at = now() WHERE id = $1', [id, icp ? JSON.stringify(icp) : null]);
  res.json({ ok: true, icp, pending: await pendingChanges(id) });
}
