// POST /api/tweak — regenerate one variant with an instruction ("shorter", "more aggressive"...).
import { db } from '../lib/hatchable.js';
import { claude, extractJson, addCost } from '../lib/claude.js';
import { TWEAK_SYSTEM } from '../lib/prompts.js';
import { brandBrief, normalizeVariant, claimContextFor } from '../lib/pipeline.js';
import { clientIp, hashIp, rateLimit, str } from '../lib/util.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const b = req.body || {};
  const runId = str(b.run_id, 20), idx = Number(b.idx), instruction = str(b.instruction, 240);
  if (!/^[a-z0-9]{6,20}$/.test(runId) || !(idx >= 0 && idx <= 2)) return res.status(400).json({ error: 'bad variant' });
  if (!instruction) return res.status(400).json({ error: 'Say how to change it, e.g. "shorter" or "more playful".' });
  const ipHash = await hashIp(clientIp(req));
  if (!(await rateLimit('tweak:' + ipHash, 40, 60))) return res.status(429).json({ error: 'Tweak limit reached for this hour.' });

  const { rows } = await db.query('SELECT r.*, v.data AS vdata, v.version, v.history FROM runs r JOIN variants v ON v.run_id = r.id AND v.idx = $2 WHERE r.id = $1', [runId, idx]);
  if (!rows.length) return res.status(404).json({ error: 'Variant not found' });
  const run = rows[0];
  try {
    const r = await claude({
      role: 'writer', purpose: 'tweak-variant', maxTokens: 1200, system: TWEAK_SYSTEM, temperature: 0.8,
      messages: [{ role: 'user', content:
        'BRAND: ' + JSON.stringify(brandBrief(run)) + '\nFOUNDER SAY/AVOID: ' + (run.input.notes || 'nothing') + '\nGOAL: ' + run.input.goal +
        '\nCURRENT VARIANT: ' + JSON.stringify(run.vdata) + '\nINSTRUCTION: ' + instruction }],
    });
    const j = extractJson(r.text);
    if (!j || typeof j !== 'object' || Array.isArray(j)) return res.status(502).json({ error: 'The rewrite came back garbled. Try again.' });
    const next = normalizeVariant({ ...run.vdata, ...j }, await claimContextFor(run));
    const history = [...(run.history || []), { at: new Date().toISOString(), instruction, data: run.vdata }].slice(-10);
    await db.query('UPDATE variants SET data = $3, version = version + 1, history = $4, updated_at = now() WHERE run_id = $1 AND idx = $2',
      [runId, idx, JSON.stringify(next), JSON.stringify(history)]);
    const cost = { ...(run.cost || {}) };
    cost.tweaks = addCost(cost.tweaks, r);
    await db.query('UPDATE runs SET cost = $2 WHERE id = $1', [runId, JSON.stringify(cost)]);
    res.json({ idx, version: run.version + 1, ...next, cost_usd: r.usd });
  } catch (e) {
    res.status(e.code === 'ai_setup' ? 412 : 502).json({ error: e.code === 'ai_setup' ? e.message : 'Tweak failed: ' + str(e.message, 120) });
  }
}