// lib/web.js — Firecrawl: the web layer behind rival research.
//   search: finds a brand's REAL website and Instagram instead of trusting a model's memory (a guessed domain such as
//           thecookieco.in fed the Munch & Co run no evidence at all; the real one is thecookie-co.com)
//   scrape: reads sites we cannot read ourselves (JavaScript shells, bot-blocked stores) so their social links still count
// FIRECRAWL_API_KEY in the env. Without it everything here quietly returns nothing and the old paths run.
import { str } from './util.js';

const BASE = 'https://api.firecrawl.dev';
export const hasFirecrawl = () => !!(process.env.FIRECRAWL_API_KEY || '').trim();

async function call(path, body, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const r = await fetchImpl(BASE + path, {
    method: 'POST', headers: { authorization: 'Bearer ' + (process.env.FIRECRAWL_API_KEY || '').trim(), 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  let j = null; try { j = await r.json(); } catch (_) {}
  if (r.status === 402) throw Object.assign(new Error('Firecrawl is out of credits'), { code: 'web_credits' });
  if (!r.ok) throw new Error('Firecrawl ' + r.status + ': ' + str((j && (j.error || j.message)) || '', 100));
  return j;
}

export async function webSearch(query, { limit = 6, fetchImpl, country } = {}) {
  if (!hasFirecrawl() || !query) return [];
  const j = await call('/v2/search', { query, limit, ...(country ? { country } : {}) }, { fetchImpl });
  const d = j && j.data;
  const list = Array.isArray(d) ? d : (d && d.web) || [];
  return list.map(x => ({ url: x.url, title: str(x.title, 160), description: str(x.description, 240) })).filter(x => x.url);
}

// a page's own links plus its title/description, rendered by a real browser
export async function scrapeLinks(url, { fetchImpl } = {}) {
  if (!hasFirecrawl() || !url) return null;
  const j = await call('/v2/scrape', { url, formats: ['links'], onlyMainContent: false }, { fetchImpl, timeoutMs: 30000 });
  const d = j && j.data;
  if (!d) return null;
  const md = d.metadata || {};
  return { links: Array.isArray(d.links) ? d.links : [], title: str(md.title || md.ogTitle, 160), description: str(md.description || md.ogDescription, 300), url: md.sourceURL || url };
}

/* ---------- finding a rival's official site from search results ---------- */

// hosts that are about a brand, never the brand's own site
const NOT_BRAND_SITE = /(^|\.)(instagram|facebook|fb|youtube|twitter|x|linkedin|pinterest|tiktok|reddit|quora|medium|wikipedia|amazon|flipkart|myntra|nykaa|meesho|ajio|zomato|swiggy|justdial|indiamart|tripadvisor|yelp|glassdoor|crunchbase|tofler|zaubacorp|mouthshut|blogspot|wordpress|wixsite|google|bing|apple|play\.google|linktr\.ee|bigbasket|blinkit|zepto|snapdeal|shopclues|ebay|walmart|etsy)\./i;
const clean = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const tokens = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 3 && !['the', 'and', 'co', 'ltd', 'pvt', 'india', 'store', 'shop', 'official'].includes(t));
const hostOfUrl = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; } };

// { site, ig } from a brand-name search. A site must carry the brand's EXACT name in its address ("thecookieco" in
// thecookie-co.com), and only a multi-word name may fall back to all of its words; a one-word overlap is how
// "The Cookie Co." once matched culturedcookieco.com. An Instagram handle must resemble the name too.
export function pickBrandSite(name, results) {
  const nm = clean(name), tk = tokens(name);
  const fits = (h) => { const c = clean(h); return c.length >= 5 && nm.length >= 4 && (c.includes(nm) || (nm.includes(c) && c.length >= 6)); };
  let ig = null;
  const sites = [];
  for (const r of results || []) {
    const host = hostOfUrl(r.url);
    if (!host) continue;
    if (/(^|\.)instagram\.com$/.test(host)) {
      const h = (r.url.match(/instagram\.com\/([A-Za-z0-9._]{2,30})/i) || [])[1];
      if (!ig && h && !/^(p|reel|reels|explore|stories|accounts)$/i.test(h) && fits(h)) ig = h.toLowerCase();
      continue;
    }
    if (NOT_BRAND_SITE.test(host + '.')) continue;
    sites.push({ host, label: clean(host.replace(/\.(co|com|org|net)\.[a-z]{2}$|\.[a-z]{2,}$/, '')) });
  }
  let site = (sites.find(x => nm.length >= 4 && x.label.includes(nm)) || {}).host || null;
  if (!site && tk.length >= 2) site = (sites.find(x => tk.every(t => x.label.includes(t))) || {}).host || null;
  return { site, ig };
}

export async function findBrandSite(name, { niche = '', country = 'India', fetchImpl } = {}) {
  if (!hasFirecrawl()) return { site: null, ig: null };
  const results = await webSearch(name + (niche ? ' ' + niche : '') + ' ' + country + ' official website', { limit: 8, fetchImpl });
  return pickBrandSite(name, results);
}
