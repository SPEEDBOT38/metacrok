// GET /api/runs/get?id=&since=&ads=1 — everything the UI needs to render a run.
import { db } from '../../lib/hatchable.js';
import { progressOf, loadRunAds, loadIgPosts, pendingChanges } from '../../lib/pipeline.js';
import { ANGLES, str } from '../../lib/util.js';

export const access = 'public';
export const methods = ['GET'];

function totalCost(cost) {
  let t = 0;
  for (const k of ['brand', 'rivals', 'pull', 'analysis', 'synthesis', 'generation', 'tweaks']) t += Number(cost && cost[k] && cost[k].usd) || 0;
  return Math.round(t * 1e5) / 1e5;
}

export default async function (req, res) {
  const id = str(req.query.id, 20);
  if (!/^[a-z0-9]{6,20}$/.test(id)) return res.status(400).json({ error: 'bad run id' });
  const { rows } = await db.query('SELECT * FROM runs WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'No run with that id. It may have been eaten.' });
  const run = rows[0];
  const since = Number(req.query.since) || 0;
  const { rows: logs } = await db.query('SELECT id, ts, kind, line FROM run_logs WHERE run_id = $1 AND id > $2 ORDER BY id LIMIT 200', [id, since]);

  const out = {
    id: run.id, stage: run.stage, status: run.status, error: run.error, source: run.source,
    input: run.input, brand: run.brand, competitors: run.competitors, synthesis: run.synthesis,
    created_at: run.created_at, finished_at: run.finished_at,
    progress: run.status === 'done' ? 100 : await progressOf(run),
    cost: { ...(run.cost || {}), instagram: run.ig && run.ig.usd != null ? { usd: Number(run.ig.usd) || 0 } : undefined,
      total_usd: Math.round((totalCost(run.cost) + (Number(run.ig && run.ig.usd) || 0)) * 1e5) / 1e5 },
    apify: run.apify ? { actor: run.apify.actor, items: run.apify.items, urls: run.apify.urls } : null,
    logs,
    ig: run.ig ? { state: run.ig.state, brand: run.ig.brand || null, handles: run.ig.handles || [], posts: run.ig.posts || 0, brand_posts: run.ig.brand_posts || 0, note: run.ig.note || run.ig.reason || null } : null,
    icp: run.icp || null,
  };
  if (req.query.ads === '1' && ['analyze', 'synthesize', 'generate', 'done'].includes(run.stage)) {
    out.ads = (await loadRunAds(id, true)).map(a => ({
      id: a.id, source: a.source, competitor: a.competitor, page_name: a.page_name, body: str(a.body, 600), headline: a.headline,
      description: a.description, cta: a.cta, image_url: a.image_url, visual_note: a.visual_note, display_format: a.display_format,
      platforms: a.platforms, days_running: a.days_running, variants: a.collation_count, weight: a.weight, pick_reason: a.pick_reason,
      ad_library_url: a.ad_library_url, analysis: a.analysis, excluded: a.excluded, correction: a.correction, pos: a.pos,
    }));
    out.angles = ANGLES;
    out.ig_posts = (await loadIgPosts(id)).map(x => ({
      id: x.id, handle: x.handle, is_brand: x.is_brand, caption: str(x.caption, 300), image_url: x.image_url, url: x.url,
      post_type: x.post_type, likes: x.likes, comments: x.comments, posted_at: x.posted_at, analysis: x.analysis, pos: x.pos,
    }));
  }
  if (run.status === 'done') out.controls_pending = await pendingChanges(id);
  if (run.stage === 'done') {
    const { rows: v } = await db.query('SELECT idx, data, version FROM variants WHERE run_id = $1 ORDER BY idx', [id]);
    out.variants = v.map(x => ({ idx: x.idx, version: x.version, ...x.data }));
    const { rows: im } = await db.query('SELECT idx, meta, variant_version, extract(epoch from created_at)::bigint AS t FROM variant_images WHERE run_id = $1 ORDER BY idx', [id]);
    out.images = im.map(x => ({ idx: x.idx, url: '/api/images/get?run_id=' + id + '&idx=' + x.idx + '&v=' + x.t, variant_version: x.variant_version, ...x.meta }));
    out.can_make_images = true;
  }
  res.json(out);
}