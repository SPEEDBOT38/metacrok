// POST /api/suggest — "don't know your rivals?" Claude + web search finds 5.
import { claude, extractJson } from '../lib/claude.js';
import { SUGGEST_SYSTEM } from '../lib/prompts.js';
import { clientIp, hashIp, rateLimit, str } from '../lib/util.js';

export const access = 'public';
export const methods = ['POST'];

export default async function (req, res) {
  const b = req.body || {};
  const name = str(b.brand_name, 80), url = str(b.brand_url, 200), country = str(b.country, 4) || 'IN';
  if (!name && !url) return res.status(400).json({ error: 'Add your brand name or website first, so the gator knows whose rivals to sniff out.' });
  const ipHash = await hashIp(clientIp(req));
  if (!(await rateLimit('suggest:' + ipHash, 10, 60))) return res.status(429).json({ error: 'Too many lookups this hour. Name your competitors by hand for now.' });
  try {
    const r = await claude({
      role: 'writer', purpose: 'suggest-competitors', maxTokens: 1500, system: SUGGEST_SYSTEM, timeoutMs: 50000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: 'Founder brand: ' + (name || '') + ' ' + (url || '') + '\nCountry/market: ' + country + '\nFind their 5 closest D2C competitors that run Meta ads.' }],
    });
    const j = extractJson(r.text) || {};
    const list = (j.competitors || []).slice(0, 5).map(c => ({
      name: str(c.name, 60), instagram: c.instagram && c.instagram !== 'null' ? str(c.instagram, 60) : null,
      website: c.website && c.website !== 'null' ? str(c.website, 100) : null, why: str(c.why, 120),
    })).filter(c => c.name);
    if (!list.length) return res.status(502).json({ error: 'Couldn\'t find rivals with confidence. Try adding your website, or name them yourself.' });
    res.json({ niche: str(j.niche, 60), competitors: list, cost_usd: r.usd, searches: r.usage.searches });
  } catch (e) {
    res.status(e.code === 'ai_setup' ? 412 : 502).json({ error: e.code === 'ai_setup' ? e.message : 'Lookup failed: ' + str(e.message, 120) });
  }
}