// lib/brandkit.js — the brand's REAL look, read from its own site, so painted ads match it.
//   colours + fonts + logo : Firecrawl's branding read of the homepage (a real browser, so JavaScript themes work)
//   product photos         : the store's own catalogue (Shopify /products.json), else the page's og:image / JSON-LD
// A description of the brand makes a model invent packaging, a logo and a typeface (Munch & Co got a made-up box and a
// made-up founder). The real photos, hex colours and font names are what keep the ad faithful.
import { str } from './util.js';
import { fetchSite, descOf } from './rivals.js';
import { hasFirecrawl } from './web.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '').trim()) ? String(c).trim().toUpperCase() : /^#[0-9a-f]{3}$/i.test(String(c || '').trim()) ? '#' + String(c).trim().slice(1).split('').map(x => x + x).join('').toUpperCase() : null);
export const lum = (h) => { const m = /^#([0-9a-f]{6})$/i.exec(h || ''); if (!m) return 0.5; const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const origin = (u) => { try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).origin; } catch (_) { return null; } };

export async function firecrawlBranding(url, { fetchImpl = fetch } = {}) {
  if (!hasFirecrawl()) return null;
  const r = await fetchImpl('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST', headers: { authorization: 'Bearer ' + (process.env.FIRECRAWL_API_KEY || '').trim(), 'content-type': 'application/json' },
    body: JSON.stringify({ url, formats: ['branding'], onlyMainContent: false }), signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j && j.data && j.data.branding) || null;
}

// the store's own catalogue: title, price, real photos
export async function shopifyProducts(site, { fetchImpl = fetch, limit = 12 } = {}) {
  const o = origin(site); if (!o) return [];
  try {
    const r = await fetchImpl(o + '/products.json?limit=' + limit, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.products || []).map(p => ({
      title: str(p.title, 80), type: str(p.product_type, 40), price: p.variants && p.variants[0] && p.variants[0].price || null,
      images: (p.images || []).map(i => i.src).filter(Boolean).slice(0, 3), url: o + '/products/' + p.handle,
      text: str(String(p.body_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), 160),
    })).filter(p => p.images.length);
  } catch (_) { return []; }
}

// no catalogue: whatever product photo the page itself offers
export async function pageImages(site, { fetchImpl } = {}) {
  const s = await fetchSite(site, { fetchImpl });
  if (!s) return { products: [], logo: null };
  const out = [];
  const og = (s.html.match(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)/i) || [])[1];
  if (og) out.push(og);
  for (const m of s.html.matchAll(/"@type"\s*:\s*"Product"[\s\S]{0,1500}?"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
    try { const v = JSON.parse(m[1].replace(/\\\//g, '/')); for (const u of [].concat(v)) if (typeof u === 'string') out.push(u); } catch (_) { /* skip */ }
  }
  const abs = [...new Set(out)].map(u => { try { return new URL(u, s.url).href; } catch (_) { return null; } }).filter(Boolean).slice(0, 3);
  return { products: abs.length ? [{ title: str(descOf(s.html) || 'the product', 80), images: abs, url: s.url }] : [], logo: null };
}

export async function buildKit(run, { fetchImpl } = {}) {
  const site = (run.input.brand && run.input.brand.url) || '';
  const o = origin(site);
  if (!o) return { source: 'none', colors: {}, fonts: {}, logo: null, products: [] };
  const [b, shop] = await Promise.all([firecrawlBranding(o, { fetchImpl }).catch(() => null), shopifyProducts(o, { fetchImpl })]);
  let products = shop, logo = (b && b.images && b.images.logo) || null;
  if (!products.length) { const p = await pageImages(o, { fetchImpl }); products = p.products; }
  const c = (b && b.colors) || {};
  const fam = (b && b.typography && b.typography.fontFamilies) || {};
  const fonts = (b && b.fonts) || [];
  const pick = (role) => (fonts.find(f => f.role === role) || {}).family || null;
  const kit = {
    source: b ? 'firecrawl' : 'page',
    colors: { primary: hex(c.primary), secondary: hex(c.secondary), accent: hex(c.accent), background: hex(c.background), text: hex(c.textPrimary), theme: hex(run.brand && run.brand.colour) },
    fonts: { heading: fam.heading || pick('heading') || null, body: fam.primary || pick('body') || null },
    logo: logo && /^https?:/.test(logo) ? logo : null,
    personality: (b && b.personality) || null,
    radius: b && b.spacing && b.spacing.borderRadius || null,
    products: products.slice(0, 8),
    built_at: new Date().toISOString(),
  };
  return kit;
}

// which product does this ad show? the one the ad's words name; otherwise rotate so three ads show different ones
export function pickProduct(products, v, idx = 0) {
  if (!products || !products.length) return null;
  const hay = String([v.primary_text, v.headline, v.creative_direction, v.overlay_text].join(' ')).toLowerCase();
  let best = null, bs = 0;
  for (const p of products) {
    const words = String(p.title).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4);
    const s = words.filter(w => hay.includes(w)).length + (hay.includes(String(p.title).toLowerCase()) ? 3 : 0);
    if (s > bs) { best = p; bs = s; }
  }
  return best || products[idx % products.length];
}

// the headline colour that reads on the brand's own background
export function overlayColor(kit) {
  const c = (kit && kit.colors) || {};
  const bg = c.background || c.theme || '#FFFFFF';
  const dark = [c.text, c.secondary, c.primary].map(hex).find(h => h && lum(h) < 0.25);
  const light = [c.secondary, c.accent, c.background].map(hex).find(h => h && lum(h) > 0.75);
  return lum(bg) > 0.45 ? (dark || '#1A1A1A') : (light || '#FFFFFF');
}
