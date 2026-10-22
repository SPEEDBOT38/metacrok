// GET /api/status — is the live Ad Library pull on, or are we on demo seed?
import { apifyStatus } from '../lib/apify.js';
import { allSeedNames } from '../lib/seed.js';
import { db } from '../lib/hatchable.js';

export const access = 'public';
export const methods = ['GET'];

export default async function (req, res) {
  const apify = await apifyStatus();
  const { rows: done } = await db.query("SELECT cost FROM runs WHERE status = 'done' ORDER BY finished_at DESC LIMIT 50");
  const totals = done.map(r => ['brand', 'pull', 'analysis', 'synthesis', 'generation'].reduce((s, k) => s + (Number(r.cost && r.cost[k] && r.cost[k].usd) || 0), 0));
  const rows = [{ n: done.length, avg_usd: totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0 }];
  const { rows: saved } = await db.query('SELECT count(*)::int AS n FROM seed_ads');
  res.json({
    live_pull: apify.connected,
    live_reason: apify.connected ? null : apify.reason,
    seed_brands: allSeedNames(),
    saved_seed_ads: saved[0].n,
    runs_done: rows[0].n,
    avg_run_usd: Math.round((rows[0].avg_usd || 0) * 10000) / 10000,
  });
}