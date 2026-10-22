// POST /api/runs/control — the founder's say over what the gator ate:
//   { run_id, ad_id, action: "exclude" | "restore" | "correct" | "clear", angle?, note? }
// Changes are saved per run and only take effect when the founder regenerates (api/runs/regenerate.js).
import { db } from '../../lib/hatchable.js';
import { ANGLES, clientIp, hashIp, rateLimit, str } from '../../lib/util.js';
import { MIN_KEPT, pendingChanges } from '../../lib/pipeline.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const b = req.body || {};
  const runId = str(b.run_id, 20), adId = str(b.ad_id, 80), action = str(b.action, 12);
  if (!/^[a-z0-9]{6,20}$/.test(runId) || !adId) return res.status(400).json({ error: 'bad run or ad id' });
  if (!(await rateLimit('ctl:' + (await hashIp(clientIp(req))), 200, 60))) return res.status(429).json({ error: 'Slow down a little.' });

  const { rows: run } = await db.query('SELECT status FROM runs WHERE id = $1', [runId]);
  if (!run.length) return res.status(404).json({ error: 'No run with that id.' });
  if (run[0].status !== 'done') return res.status(409).json({ error: 'Let the run finish before changing what it ate.' });

  let q;
  if (action === 'exclude') {
    const { rows } = await db.query('SELECT count(*)::int AS n FROM run_ads WHERE run_id = $1 AND NOT excluded', [runId]);
    if (rows[0].n <= MIN_KEPT) return res.status(400).json({ error: 'Keep at least ' + MIN_KEPT + ' ads so the gator has something to learn from.' });
    q = ['UPDATE run_ads SET excluded = true, controlled_at = now() WHERE run_id = $1 AND ad_id = $2 RETURNING excluded, correction', [runId, adId]];
  } else if (action === 'restore') {
    q = ['UPDATE run_ads SET excluded = false, controlled_at = now() WHERE run_id = $1 AND ad_id = $2 RETURNING excluded, correction', [runId, adId]];
  } else if (action === 'correct') {
    const angle = str(b.angle, 40).toLowerCase(), note = str(b.note, 200);
    if (angle && !ANGLES.includes(angle)) return res.status(400).json({ error: 'Pick one of the listed angles.' });
    if (!angle && !note) return res.status(400).json({ error: 'Say what the angle really is, or what the ad actually does.' });
    q = ['UPDATE run_ads SET correction = $3::jsonb, controlled_at = now() WHERE run_id = $1 AND ad_id = $2 RETURNING excluded, correction',
      [runId, adId, JSON.stringify({ ...(angle ? { angle } : {}), ...(note ? { note } : {}) })]];
  } else if (action === 'clear') {
    q = ['UPDATE run_ads SET correction = NULL, controlled_at = now() WHERE run_id = $1 AND ad_id = $2 RETURNING excluded, correction', [runId, adId]];
  } else {
    return res.status(400).json({ error: 'action must be exclude, restore, correct or clear' });
  }

  const { rows } = await db.query(q[0], q[1]);
  if (!rows.length) return res.status(404).json({ error: 'That ad is not part of this run.' });
  res.json({ ok: true, ad_id: adId, excluded: rows[0].excluded, correction: rows[0].correction, pending: await pendingChanges(runId) });
}
