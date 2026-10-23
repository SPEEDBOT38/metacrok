// POST /api/images { run_id, idx } — paint one of the three ads.
// Inspiration: Pixabay (or Pexels) photos that fit the ad's mood + the founder's own Instagram images (the brand's real look).
// Painter: Google's Nano Banana through OpenRouter. On demand only: each image costs real money.
import { db } from './hatchable.js';
import { loadIgPosts } from './pipeline.js';
import { inspirationQueries, stockSearch, hasStock, stockName, toDataUrl, adPrompt, printableOverlay, paintAd } from './images.js';
import { addCost } from './claude.js';
import { clientIp, hashIp, rateLimit, str } from './util.js';

export async function createImage(req, res) {
  const b = req.body || {};
  const runId = str(b.run_id, 20), idx = Number(b.idx);
  if (!/^[a-z0-9]{6,20}$/.test(runId) || !(idx >= 0 && idx <= 2)) return res.status(400).json({ error: 'bad ad' });
  const perHour = Number(process.env.IMAGES_PER_HOUR) || 15; // each image is a paid call
  if (!(await rateLimit('img:' + (await hashIp(clientIp(req))), perHour, 60))) return res.status(429).json({ error: 'That is ' + perHour + ' images an hour per person. Try again shortly.' });

  const { rows } = await db.query('SELECT r.*, v.data AS vdata, v.version AS vversion FROM runs r JOIN variants v ON v.run_id = r.id AND v.idx = $2 WHERE r.id = $1', [runId, idx]);
  if (!rows.length) return res.status(404).json({ error: 'No such ad.' });
  const run = rows[0], v = run.vdata;
  const deadline = Date.now() + 52000;
  try {
    // 1. inspiration: stock photos for the mood, the brand's own posts for the look
    const q = await inspirationQueries(run, v);
    let photos = [], pexelsNote = null;
    if (hasStock()) {
      try {
        const found = await Promise.all(q.queries.slice(0, 3).map(s => stockSearch(s, { n: 2 }).catch(() => [])));
        const seen = new Set();
        photos = found.flat().filter(p => !seen.has(p.id) && seen.add(p.id)).slice(0, 3);
        if (!photos.length) pexelsNote = stockName() + ' had nothing for those searches';
      } catch (e) { pexelsNote = stockName() + ' failed (' + str(e.message, 60) + ')'; }
    } else pexelsNote = 'no stock-photo key set, painted from the brand alone';
    let brandPosts = [];
    try { brandPosts = (await loadIgPosts(runId)).filter(p => p.is_brand && p.image_url).slice(0, 2); } catch (_) {}
    // the brand's posts and the stock photos come from different hosts; the stock photos go one at a time (they throttle bursts)
    const brandUrlsP = Promise.all(brandPosts.map(p => toDataUrl(p.image_url)));
    const inspoUrls = [];
    for (const p of photos) inspoUrls.push(await toDataUrl(p.src));
    const brandUrls = await brandUrlsP;
    if (photos.length && !inspoUrls.some(Boolean)) pexelsNote = stockName() + ' photos could not be downloaded, painted from the brand alone';
    const brandRefs = brandUrls.filter(Boolean), inspoRefs = inspoUrls.filter(Boolean);
    const usedPhotos = photos.filter((p, i) => inspoUrls[i]);

    // 2. paint
    const prompt = adPrompt(run, v, { brandRefs: brandRefs.length, inspoRefs: inspoRefs.length });
    const out = await paintAd({ prompt, refs: [...brandRefs, ...inspoRefs], deadline });
    const meta = {
      model: out.model, tried: out.tried, usd: out.usd + q.usd, queries: q.queries, pexels_note: pexelsNote, brand_refs: brandRefs.length,
      text_on_image: printableOverlay(v) || null,
      photos: usedPhotos.map(p => ({ page: p.page, photographer: p.photographer, photographer_url: p.photographer_url, source: p.source })),
    };
    await db.query(
      `INSERT INTO variant_images (run_id, idx, mime, data, meta, variant_version) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (run_id, idx) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, meta = EXCLUDED.meta, variant_version = EXCLUDED.variant_version, created_at = now()`,
      [runId, idx, out.mime, out.data, JSON.stringify(meta), run.vversion]);
    const cost = { ...(run.cost || {}) };
    cost.images = addCost(cost.images, { usd: out.usd + q.usd, usage: out.usage, model: out.model });
    await db.query('UPDATE runs SET cost = $2 WHERE id = $1', [runId, JSON.stringify(cost)]);
    res.json({ ok: true, idx, url: '/api/images?run_id=' + runId + '&idx=' + idx + '&v=' + Date.now(), ...meta, variant_version: run.vversion, cost_usd: meta.usd });
  } catch (e) {
    res.status(e.code === 'ai_setup' ? 412 : 502).json({ error: e.code === 'ai_setup' ? e.message : 'Image failed: ' + str(e.message, 160) });
  }
}

// GET /api/images?run_id=&idx= — the painted ad, as an image.
export async function serveImage(req, res) {
  const runId = str(req.query && req.query.run_id, 20), idx = Number(req.query && req.query.idx);
  if (!/^[a-z0-9]{6,20}$/.test(runId) || !(idx >= 0 && idx <= 2)) return res.status(400).json({ error: 'bad image' });
  const { rows } = await db.query('SELECT mime, data FROM variant_images WHERE run_id = $1 AND idx = $2', [runId, idx]);
  if (!rows.length) return res.status(404).json({ error: 'No image yet.' });
  res.statusCode = 200;
  res.setHeader('content-type', rows[0].mime || 'image/png');
  res.setHeader('cache-control', 'private, max-age=31536000, immutable'); // the ?v= in the link changes with each new image
  res.end(Buffer.from(rows[0].data, 'base64'));
}
