// lib/rivals.js — find a rival's REAL pages from its own website, instead of guessing from its name.
// A brand's site links to its official Facebook page and Instagram (footer, JSON-LD). Those links are the
// evidence we trust: a name or a language-model guess only ever finds lookalikes (probe, 22 Oct 2026: "Samsung
// India" -> a phone-case seller, "Pehchaann" saree rivals -> prop shops and jewellery).
import { str } from './util.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const cleanDomain = (d) => String(d || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '');
export function isDomain(d) { return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(String(d || '')); }

// samsung.com / shop.samsung.com / samsung.co.in -> the part a link must end with to count as theirs
const SLD = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);
export function baseDomain(d) {
  const p = cleanDomain(d).split('.');
  if (p.length <= 2) return p.join('.');
  const last2 = p.slice(-2);
  return (SLD.has(last2[0]) && last2[1].length === 2 ? p.slice(-3) : last2).join('.');
}
export function hostOf(url) {
  try { return new URL(/^https?:/i.test(url) ? url : 'https://' + url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; }
}
// does this link point at the rival's own website (host-only: a "/samsung-cases" path on a reseller does not count)
export function linksTo(url, site) {
  const h = hostOf(url), b = baseDomain(site);
  return !!h && !!b && (h === b || h.endsWith('.' + b));
}

const FB_SKIP = new Set(['sharer', 'sharer.php', 'share', 'share.php', 'tr', 'plugins', 'dialog', 'login', 'login.php', 'groups', 'events', 'policies', 'policy', 'privacy', 'help', 'pages', 'people', 'public', 'watch', 'marketplace', 'ads', 'business', 'legal', 'about', 'photo', 'photo.php', 'permalink.php', 'story.php', 'profile.php', 'hashtag', 'l.php', 'facebook', 'home.php', 'gaming', 'reel', 'reels', 'videos', 'stories', 'tr.php', 'rsrc.php']);
const IG_SKIP = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'share', 'about', 'legal', 'developer', 'direct', 'web', 'instagram', 'oauth', 'privacy', 'press', 'directory', 'challenge', 'emails', 'api']);

const count = (arr) => arr.reduce((m, x) => (m.set(x, (m.get(x) || 0) + 1), m), new Map());
const top = (arr) => [...count(arr)].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

// pull the brand's own Facebook slug and Instagram handle out of a page's HTML
export function socialsFromHtml(html) {
  const h = String(html || '').replace(/\\\//g, '/');
  const fb = [], ig = [];
  for (const m of h.matchAll(/(?:https?:)?\/\/(?:www\.|m\.|web\.)?(?:facebook|fb)\.com\/(?:pg\/)?([A-Za-z0-9._-]{3,80})(?:[/?#"'\s\\]|$)/gi)) {
    const s = m[1];
    if (!FB_SKIP.has(s.toLowerCase()) && !/^\d+$/.test(s) && !/\.php$/i.test(s)) fb.push(s);
  }
  for (const m of h.matchAll(/(?:https?:)?\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})(?:[/?#"'\s\\]|$)/gi)) {
    const s = m[1].toLowerCase();
    if (!IG_SKIP.has(s) && !s.endsWith('.')) ig.push(s);
  }
  // when a page links a few accounts, the brand's own is the one named most often
  return { fb: top(fb), ig: top(ig) };
}

export function titleOf(html) {
  const m = String(html || '').match(/<title[^>]*>([^<]*)/i);
  return str((m && m[1] || '').replace(/\s+/g, ' ').trim(), 160);
}
export function descOf(html) {
  const h = String(html || '');
  const m = h.match(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]*content=["']([^"']*)/i) || h.match(/<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:og:)?description["']/i);
  return str((m && m[1] || '').replace(/\s+/g, ' ').trim(), 300);
}

export async function fetchSite(site, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  const d = cleanDomain(site);
  if (!isDomain(d)) return null;
  for (const u of ['https://' + d, 'https://www.' + d]) {
    try {
      const r = await fetchImpl(u, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA, accept: 'text/html,*/*', 'accept-language': 'en-IN,en;q=0.9' } });
      if (!r.ok) continue;
      const html = (await r.text()).slice(0, 600000);
      if (html.length > 200) return { url: r.url || u, html };
    } catch (_) { /* try the next form */ }
  }
  return null;
}

// a handle found on a site only counts if it resembles the brand ("@invites" on Snack Amor's site is someone else's)
const nn = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function handleFits(handle, name, site) {
  const h = nn(handle), n = nn(name), l = nn(baseDomain(site).split('.')[0]);
  if (!h) return false;
  const near = (a, b) => a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
  return near(h, l) || near(h, n);
}

// everything we can verify about a rival from its own site
export async function readRival(site, opts = {}) {
  const s = await fetchSite(site, opts);
  if (!s) return { ok: false };
  const soc = socialsFromHtml(s.html);
  const fits = (h) => (!opts.name || handleFits(h, opts.name, site) ? h : null);
  return { ok: true, title: titleOf(s.html), description: descOf(s.html), fb: fits(soc.fb), ig: fits(soc.ig) };
}

// Page names a brand plausibly uses on Facebook, tried as page links. A guess proves nothing by itself: whatever
// comes back still has to match the brand (its name, or ads linking to its site) before it is used.
export function slugGuesses(comp, max = 4) {
  const base = String(comp.name || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 ]+/g, ' ').trim();
  const bare = base.replace(/\b(india|store|shop|official|the|co|pvt|ltd)\b/g, ' ').replace(/\s+/g, '');
  const joined = base.replace(/\s+/g, '');
  const have = String(comp.fb || '').toLowerCase();
  const cand = [comp.site_ig, comp.hint_ig, comp.ig, bare, joined, bare && bare + 'in', bare && bare + 'india', bare && bare + 'official']
    .map(x => String(x || '').toLowerCase().replace(/^@/, '').trim()).filter(x => /^[a-z0-9._]{4,50}$/.test(x) && x !== have);
  return [...new Set(cand)].slice(0, max);
}
