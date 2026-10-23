// POST /api/suggest — "don't know your rivals?" Reads the founder's own site, searches the web for brands that
// sell the SAME kind of product, then checks every candidate against its real website before showing it.
// (probe, 22 Oct 2026: a saree brand got jewellery, prop-shop and decor "rivals" because the model only saw a name.)
import { claude, extractJson } from '../lib/claude.js';
import { SUGGEST_SYSTEM, SAMEKIND_SYSTEM } from '../lib/prompts.js';
import { clientIp, hashIp, rateLimit, str, htmlToText } from '../lib/util.js';
import { fetchSite, titleOf, descOf, readRival, cleanDomain, isDomain } from '../lib/rivals.js';

export const access = 'public';
export const methods = ['POST'];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// does a site's own title/description mention the brand? (a guessed domain that belongs to someone else fails this)
function looksLike(name, text) {
  const t = norm(text), tk = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(x => x.length >= 3);
  return t.includes(norm(name)) || (tk.length > 0 && tk.some(x => t.includes(x)));
}

export default async function (req, res) {
  const b = req.body || {};
  const name = str(b.brand_name, 80), url = str(b.brand_url, 200), country = str(b.country, 4) || 'IN';
  if (!name && !url) return res.status(400).json({ error: 'Add your brand name or website first, so the gator knows whose rivals to sniff out.' });
  const ipHash = await hashIp(clientIp(req));
  if (!(await rateLimit('suggest:' + ipHash, 10, 60))) return res.status(429).json({ error: 'Too many lookups this hour. Name your competitors by hand for now.' });
  const t0 = Date.now(), left = () => Math.max(4000, 52000 - (Date.now() - t0));
  let usd = 0;
  try {
    // 1. what does the founder actually sell? their own site is the ground truth
    let site = null;
    const dom = cleanDomain(url);
    if (isDomain(dom)) {
      const s = await fetchSite(dom, { timeoutMs: 6000 });
      if (s) site = { title: titleOf(s.html), description: descOf(s.html), text: htmlToText(s.html).slice(0, 2500) };
    }
    const about = site ? 'Their website says:\nTitle: ' + site.title + '\nDescription: ' + site.description + '\nText: ' + site.text : 'We could not read their website; rely on web search for what they sell.';

    // 2. candidates that sell the same kind of product
    const r = await claude({
      role: 'writer', purpose: 'suggest-competitors', maxTokens: 1800, system: SUGGEST_SYSTEM, timeoutMs: Math.min(34000, left()),
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: 'Founder brand: ' + (name || '') + ' ' + (url || '') + '\nCountry/market: ' + country + '\n' + about + '\n\nFind their closest direct competitors that run Meta ads.' }],
    });
    usd += r.usd || 0;
    const j = extractJson(r.text) || {};
    const category = str(j.category || j.niche, 80);
    const cands = (j.competitors || []).slice(0, 8).map(c => ({
      name: str(c.name, 60), instagram: c.instagram && c.instagram !== 'null' ? str(c.instagram, 60) : null,
      website: c.website && c.website !== 'null' ? cleanDomain(c.website) : null, sells: str(c.sells, 80), why: str(c.why, 120),
    })).filter(c => c.name && norm(c.name) !== norm(name) && norm(c.website) !== norm(dom));

    // 3. open each candidate's own website: it must exist, be that brand, and its Instagram comes from the site (never a guess)
    const checked = await Promise.all(cands.map(async (c) => {
      if (!isDomain(c.website)) return { ...c, website: null, instagram: null, verified: false, text: '' };
      const v = await readRival(c.website, { timeoutMs: Math.min(6000, left()), name: c.name });
      if (!v.ok) return { ...c, instagram: null, verified: false, text: '' };
      if (!looksLike(c.name, v.title + ' ' + v.description + ' ' + c.website)) return { ...c, website: null, instagram: null, verified: false, wrongSite: true, text: '' };
      return { ...c, instagram: v.ig ? '@' + v.ig : null, verified: true, text: (v.title + '. ' + v.description).slice(0, 220) };
    }));

    // 4. keep only brands that sell the same kind of product, judged on what their own site says
    let keep = checked;
    if (category && checked.length) {
      try {
        const k = await claude({
          role: 'writer', purpose: 'suggest-samekind', maxTokens: 500, system: SAMEKIND_SYSTEM, timeoutMs: Math.min(12000, left()),
          messages: [{ role: 'user', content: 'The founder sells: ' + category + (site ? ' (' + str(site.description || site.title, 160) + ')' : '') + '\nCandidates:\n' +
            JSON.stringify(checked.map((c, i) => ({ i, name: c.name, claimed: c.sells, its_site_says: c.text }))) }],
        });
        usd += k.usd || 0;
        const same = (extractJson(k.text) || {}).same;
        if (Array.isArray(same)) { const ok = new Set(same.map(Number)); keep = checked.filter((c, i) => ok.has(i)); } // an empty list means none qualify
      } catch (_) { /* the category check is a filter, not a gate: fall back to the verified list */ }
    }
    const dropped = checked.filter(c => !keep.includes(c)).map(c => ({ name: c.name, website: c.website, why: c.wrongSite ? 'site is not this brand' : 'not the same kind of product', sells: c.sells }));
    keep = keep.filter(c => !c.wrongSite).sort((a, c) => Number(c.verified) - Number(a.verified)).slice(0, 5);
    if (!keep.length) return res.status(502).json({ error: 'Couldn\'t find rivals that sell the same kind of product with confidence. Try adding your website, or name them yourself.' });
    res.json({
      niche: category, searches: r.usage && r.usage.searches, cost_usd: usd,
      ...(b.debug ? { dropped, candidates: cands.length } : {}),
      competitors: keep.map(c => ({ name: c.name, instagram: c.instagram, website: c.website, why: c.why || c.sells, sells: c.sells, verified: c.verified })),
    });
  } catch (e) {
    res.status(e.code === 'ai_setup' ? 412 : 502).json({ error: e.code === 'ai_setup' ? e.message : 'Lookup failed: ' + str(e.message, 120) });
  }
}
