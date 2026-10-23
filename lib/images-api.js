// POST /api/images { run_id, idx } — paint one of the three ads.
// Inspiration: Pixabay (or Pexels) photos that fit the ad's mood + the founder's own Instagram images (the brand's real look).
// Painter: Google's Nano Banana through OpenRouter. On demand only: each image costs real money.
import { db } from './hatchable.js';
import { loadIgPosts } from './pipeline.js';
import { inspirationQueries, stockSearch, hasStock, stockName, toDataUrl, adPrompt, headlineFor, paintAd } from './images.js';
import { buildKit, pickProduct, overlayColor } from './brandkit.js';
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
    // 0. the brand's real look: product photos, colours, fonts, logo (read once, kept on the run)
    let kit = run.brand && run.brand.kit;
    if (!kit || !kit.built_at) {
      kit = await buildKit(run);
      await db.query('UPDATE runs SET brand = $2 WHERE id = $1', [runId, JSON.stringify({ ...(run.brand || {}), kit })]);
    }
    const product = pickProduct(kit.products, v, idx);

    // 1. references, in the order the prompt names them: the real product, the real logo, a brand post, one mood photo
    const q = hasStock() ? await inspirationQueries(run, v) : { queries: [], usd: 0 };
    let photo = null, note = null;
    if (hasStock()) {
      try { photo = (await Promise.all(q.queries.slice(0, 2).map(s => stockSearch(s, { n: 1 }).catch(() => [])))).flat()[0] || null; if (!photo) note = stockName() + ' had nothing for those searches'; }
      catch (e) { note = stockName() + ' failed (' + str(e.message, 60) + ')'; }
    }
    let brandPost = null;
    try { brandPost = (await loadIgPosts(runId)).find(p => p.is_brand && p.image_url) || null; } catch (_) {}
    const productUrls = await Promise.all(((product && product.images) || []).slice(0, 2).map(u => toDataUrl(u)));
    const logoUrl = kit.logo ? await toDataUrl(kit.logo) : null;
    const brandUrl = brandPost ? await toDataUrl(brandPost.image_url) : null;
    const moodUrl = photo ? await toDataUrl(photo.src) : null;
    if (photo && !moodUrl) note = stockName() + ' photo could not be downloaded';
    const prod = productUrls.filter(Boolean);
    const refs = { product: prod.length, logo: logoUrl ? 1 : 0, brand: brandUrl ? 1 : 0, mood: moodUrl ? 1 : 0 };

    // 2. paint (no words: the headline is set afterwards in the brand's own font)
    const prompt = adPrompt(run, v, { kit, product: prod.length ? product : null, refs });
    const out = await paintAd({ prompt, refs: [...prod, ...(logoUrl ? [logoUrl] : []), ...(brandUrl ? [brandUrl] : []), ...(moodUrl ? [moodUrl] : [])], deadline });
    const text = headlineFor(v);
    const meta = {
      model: out.model, tried: out.tried, usd: out.usd + q.usd, queries: q.queries, pexels_note: note,
      kit: { source: kit.source, colors: kit.colors, fonts: kit.fonts, product: prod.length && product ? product.title : null, product_url: product && product.url || null, logo_used: !!logoUrl, brand_post_used: !!brandUrl },
      overlay: text ? { text, font: kit.fonts.heading || kit.fonts.body || null, body_font: kit.fonts.body || null, color: overlayColor(kit), pos: 'top' } : null,
      photos: photo && moodUrl ? [{ page: photo.page, photographer: photo.photographer, photographer_url: photo.photographer_url, source: photo.source }] : [],
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
