// POST /api/runs/regenerate { id } — re-run only synthesis and generation on the ads the founder kept,
// with their corrections applied. The ads are not pulled or read again, so this costs a few cents and
// takes about half a minute. The three variants (and any tweaks to them) are replaced.
import { db } from '../../lib/hatchable.js';
import { clientIp, hashIp, rateLimit, log, str } from '../../lib/util.js';
import { MIN_KEPT, pendingChanges } from '../../lib/pipeline.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const id = str(req.body && req.body.id, 20);
  if (!/^[a-z0-9]{6,20}$/.test(id)) return res.status(400).json({ error: 'bad run id' });
  if (!(await rateLimit('regen:' + (await hashIp(clientIp(req))), 12, 60))) {
    return res.status(429).json({ error: 'The gator is full. 12 re-runs an hour per person; try again shortly.' });
  }

  const { rows: run } = await db.query('SELECT status, stage FROM runs WHERE id = $1', [id]);
  if (!run.length) return res.status(404).json({ error: 'No run with that id.' });
  if (run[0].status !== 'done') return res.status(409).json({ error: 'Let the run finish first.' });

  const pending = await pendingChanges(id);
  if (!pending) return res.status(400).json({ error: 'Nothing to apply yet: exclude an ad or correct a read first.' });
  const { rows: c } = await db.query(
    'SELECT count(*) FILTER (WHERE NOT excluded)::int AS kept, count(*) FILTER (WHERE excluded)::int AS excluded, count(*) FILTER (WHERE correction IS NOT NULL)::int AS corrected FROM run_ads WHERE run_id = $1', [id]);
  if (c[0].kept < MIN_KEPT) return res.status(400).json({ error: 'Keep at least ' + MIN_KEPT + ' ads.' });

  // created_at moves forward by the idle time so the run clock keeps showing compute time, not days
  const { rows: upd } = await db.query(
    `UPDATE runs SET stage = 'synthesize', status = 'running', error = NULL, lock_until = NULL,
            created_at = now() - (finished_at - created_at), finished_at = NULL,
            cost = COALESCE(cost, '{}'::jsonb) - 'meta', updated_at = now()
     WHERE id = $1 AND status = 'done' RETURNING id`, [id]);
  if (!upd.length) return res.status(409).json({ error: 'Already re-running.' });
  await log(id, 're-chewing with your changes: ' + c[0].excluded + ' ad(s) set aside, ' + c[0].corrected + ' read(s) corrected', 'ok');
  res.json({ ok: true });
}
