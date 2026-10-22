// POST /api/admin/seed — owner-only. Replace the fictional demo pack with REAL saved ads.
//  { action: "promote", run_id }                 -> save a live run's picked ads as the demo seed
//  { action: "import", competitor, items: [...] } -> paste Apify actor output for one competitor
//  { action: "clear" }                           -> back to the fictional fixtures
import { db } from '../../lib/hatchable.js';
import { normalizeItem, selectAds } from '../../lib/apify.js';
import { str } from '../../lib/util.js';

export const access = 'admin';
export const methods = ['POST'];

export default async function (req, res) {
  const b = req.body || {};
  if (b.action === 'clear') {
    await db.query('DELETE FROM seed_ads');
    return res.json({ ok: true, cleared: true });
  }
  if (b.action === 'promote') {
    const runId = str(b.run_id, 20);
    const { rows } = await db.query(
      `SELECT a.*, ra.competitor AS comp, ra.days_running FROM run_ads ra JOIN ads a ON a.id = ra.ad_id WHERE ra.run_id = $1 AND a.source = 'live'`, [runId]);
    if (!rows.length) return res.status(404).json({ error: 'That run has no live ads to save.' });
    for (const a of rows) {
      const ad = { id: a.id, page_name: a.page_name, body: a.body, headline: a.headline, description: a.description, cta: a.cta, link_url: a.link_url,
        image_url: a.image_url, display_format: a.display_format, platforms: a.platforms, start_date: a.start_date, collation_count: a.collation_count,
        variant_count: a.collation_count, ad_library_url: a.ad_library_url, visual_note: a.visual_note };
      await db.query('INSERT INTO seed_ads (id, pack, competitor, ad) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET ad = EXCLUDED.ad, competitor = EXCLUDED.competitor',
        ['s-' + a.id, 'saved', a.comp, JSON.stringify(ad)]);
    }
    return res.json({ ok: true, saved: rows.length });
  }
  if (b.action === 'import') {
    const comp = str(b.competitor, 60);
    const items = Array.isArray(b.items) ? b.items : [];
    if (!comp || !items.length) return res.status(400).json({ error: 'competitor and items[] (Apify actor output) required' });
    const picked = selectAds(items.map(normalizeItem).filter(a => a.id));
    for (const a of picked) {
      await db.query('INSERT INTO seed_ads (id, pack, competitor, ad) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET ad = EXCLUDED.ad',
        ['s-' + a.id, 'saved', comp, JSON.stringify(a)]);
    }
    return res.json({ ok: true, saved: picked.length });
  }
  res.status(400).json({ error: 'action must be promote, import or clear' });
}