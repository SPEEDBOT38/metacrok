// lib/apify.js — live Meta Ad Library pull through an Apify actor.
// The official Ad Library API does not return commercial ads outside UK/EU,
// so we read the public Ad Library website the way a scraper actor does.
import { api, config } from './hatchable.js';
import { str, normName, daysSince } from './util.js';
import { linksTo, slugGuesses } from './rivals.js';

export const PULL_PER_SOURCE = 30;   // pulled per competitor (keyword search returns other pages too)
export const MAX_ADS_PER_COMPETITOR = 15; // hard cap on what we analyze

export async function apifyStatus() {
  try {
    const r = await api.apify.get('/users/me');
    if (r.status === 200) return { connected: true, user: r.body && r.body.data && r.body.data.username };
    return { connected: false, reason: 'Apify returned ' + r.status };
  } catch (e) {
    const m = String(e.message || e);
    return { connected: false, reason: (e.code === 'SetupRequired' || /not connected|412/i.test(m)) ? 'not connected' : m.slice(0, 120) };
  }
}

export function keywordUrl(term, country) {
  const c = country || 'IN';
  return 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=' + encodeURIComponent(c) +
    '&q=' + encodeURIComponent(term) + '&search_type=keyword_unordered&media_type=all';
}

export function pageAdsUrl(pageId, country) {
  return 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=' + encodeURIComponent(country || 'IN') +
    '&view_all_page_id=' + encodeURIComponent(pageId) + '&search_type=page&media_type=all';
}

// What we feed the actor for one competitor, best evidence first:
//   1. its own Facebook page, read off its website (or pasted by the founder): an exact page, no guessing
//   2. a search for its WEBSITE, which returns the ads that link to it
//   3. a search for its NAME, only when we know neither (a name mostly returns OTHER advertisers whose ads mention
//      the word: probe 22 Oct 2026, "Plum Goodness" returned ten unrelated pages and none of Plum's own)
export const fbUrl = (slug) => 'https://www.facebook.com/' + String(slug).replace(/^\/+|\/+$/g, '');
export function sourceUrlsFor(comp, country) {
  const raw = String(comp.input || comp.name || '').trim();
  const urls = [];
  if (/facebook\.com\//i.test(raw)) urls.push(raw.startsWith('http') ? raw : 'https://' + raw.replace(/^\/+/, ''));
  else if (comp.page_id) urls.push(pageAdsUrl(comp.page_id, country));
  else if (comp.fb) urls.push(fbUrl(comp.fb));
  if (!comp.page_id && !/facebook\.com\//i.test(raw)) { // a pasted page link is already exact
    for (const g of slugGuesses(comp)) urls.push(fbUrl(g));
    if (comp.site) urls.push(keywordUrl(comp.site, country));
  }
  if (!comp.fb && !comp.site && !comp.page_id && !/facebook\.com\//i.test(raw)) urls.push(keywordUrl(comp.name.replace(/^@/, ''), country)); // nothing else known
  return [...new Set(urls)];
}

export function sourceUrlFor(comp, country) { return sourceUrlsFor(comp, country)[0]; }

export async function startPull(competitors, country) {
  const actor = String((await config.get('apify_actor')) || 'curious_coder~facebook-ads-library-scraper').trim().replace('/', '~');
  const urls = competitors.flatMap(c => sourceUrlsFor(c, country)).map(url => ({ url }));
  const input = {
    urls,
    count: PULL_PER_SOURCE * urls.length,
    limitPerSource: PULL_PER_SOURCE,
    scrapeAdDetails: false,
    'scrapePageAds.activeStatus': 'active',
    'scrapePageAds.countryCode': country === 'ALL' ? 'ALL' : (country || 'IN'),
    'scrapePageAds.sortBy': 'impressions_desc',
    // field names used by the official apify/facebook-ads-scraper
    startUrls: urls,
    resultsLimit: PULL_PER_SOURCE * urls.length,
  };
  // the actor wants 1 input URL per 512 MB; with 1-3 competitors, 512 MB is the only size that always fits
  const r = await api.apify.post('/acts/' + actor + '/runs', { query: { timeout: '170', memory: '512' }, body: input });
  if (r.status >= 300 || !r.body || !r.body.data) {
    throw new Error('Apify start failed (' + r.status + '): ' + JSON.stringify(r.body || {}).slice(0, 200));
  }
  return { runId: r.body.data.id, datasetId: r.body.data.defaultDatasetId, actor, startedAt: Date.now(), urls: urls.map(u => u.url) };
}

// Who advertises in this category? Keyword searches for the product itself (not a brand), most-impressions first.
export const MARKET_PER_SOURCE = 60;
export async function startMarketPull(queries, country) {
  const actor = String((await config.get('apify_actor')) || 'curious_coder~facebook-ads-library-scraper').trim().replace('/', '~');
  const urls = queries.map(q => ({ url: keywordUrl(q, country) }));
  const input = {
    urls, count: MARKET_PER_SOURCE * urls.length, limitPerSource: MARKET_PER_SOURCE, scrapeAdDetails: false,
    'scrapePageAds.activeStatus': 'active', 'scrapePageAds.countryCode': country === 'ALL' ? 'ALL' : (country || 'IN'), 'scrapePageAds.sortBy': 'impressions_desc',
    startUrls: urls, resultsLimit: MARKET_PER_SOURCE * urls.length,
  };
  const r = await api.apify.post('/acts/' + actor + '/runs', { query: { timeout: '170', memory: '512' }, body: input });
  if (r.status >= 300 || !r.body || !r.body.data) throw new Error('Apify start failed (' + r.status + '): ' + JSON.stringify(r.body || {}).slice(0, 200));
  return { runId: r.body.data.id, datasetId: r.body.data.defaultDatasetId, actor, startedAt: Date.now(), urls: urls.map(u => u.url), market: true };
}

// the pages behind a keyword pull, busiest first
export function pagesOf(items) {
  const pages = new Map();
  for (const a of items.map(normalizeItem).filter(x => x.id)) {
    const k = a.page_id || a.page_name; if (!k) continue;
    const e = pages.get(k) || { page_id: a.page_id, page_name: a.page_name, page_uri: a.page_uri, ads: [] };
    e.ads.push(a); pages.set(k, e);
  }
  return [...pages.values()].sort((x, y) => y.ads.length - x.ads.length);
}

export async function pollPull(runId) {
  const r = await api.apify.get('/actor-runs/' + runId);
  const d = (r.body && r.body.data) || {};
  return { status: d.status || 'UNKNOWN', usd: d.usageTotalUsd != null ? Number(d.usageTotalUsd) : null, datasetId: d.defaultDatasetId };
}

export async function fetchItems(datasetId) {
  const r = await api.apify.get('/datasets/' + datasetId + '/items', { query: { clean: 'true', format: 'json', limit: '600' } });
  const b = r.body;
  if (Array.isArray(b)) return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (_) { return []; } }
  return (b && b.items) || [];
}

function firstImage(s) {
  const img = (s.images || [])[0];
  if (img) return img.resized_image_url || img.original_image_url || img.url;
  const card = (s.cards || []).find(c => c.resized_image_url || c.original_image_url || c.video_preview_image_url);
  if (card) return card.resized_image_url || card.original_image_url || card.video_preview_image_url;
  const vid = (s.videos || [])[0];
  if (vid) return vid.video_preview_image_url;
  return null;
}

function cleanTemplate(t) {
  return str(t, 1500).replace(/\{\{[^}]+\}\}/g, '').trim();
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  const n = Number(v);
  if (isFinite(n) && String(v).length >= 9) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  const t = new Date(v);
  return isFinite(t.getTime()) ? t.toISOString() : null;
}

export function normalizeItem(it) {
  const s = it.snapshot || {};
  const card0 = (s.cards || [])[0] || {};
  const id = String(it.ad_archive_id || it.adArchiveID || it.adArchiveId || it.id || '');
  const body = cleanTemplate((s.body && (s.body.text || s.body.markup && s.body.markup.__html)) || card0.body || it.ad_creative_body || '');
  const fmt = String(s.display_format || it.display_format || (s.videos && s.videos.length ? 'VIDEO' : (s.cards && s.cards.length > 1 ? 'CAROUSEL' : 'IMAGE'))).toUpperCase();
  return {
    id: id ? 'fb-' + id : null,
    archive_id: id,
    page_id: String(it.page_id || s.page_id || ''),
    page_name: str(it.page_name || s.page_name || '', 120),
    page_uri: s.page_profile_uri || '',
    body,
    headline: cleanTemplate(s.title || card0.title || it.ad_creative_link_title || ''),
    description: cleanTemplate(s.link_description || card0.link_description || it.ad_creative_link_description || ''),
    cta: str(s.cta_text || card0.cta_text || '', 40),
    link_url: str(s.link_url || card0.link_url || '', 500),
    image_url: firstImage(s),
    display_format: fmt,
    platforms: it.publisher_platform || it.publisher_platforms || [],
    start_date: toDate(it.start_date != null ? it.start_date : (it.startDate || it.start_date_formatted)),
    collation_count: Number(it.collation_count || 1) || 1,
    collation_id: it.collation_id ? String(it.collation_id) : null,
    ad_library_url: it.ad_library_url || (id ? 'https://www.facebook.com/ads/library/?id=' + id : null),
    source_url: it.url || it.inputUrl || it.startUrl || null,
  };
}

// Which advertiser page is this competitor? Search results hold ads from every page that mentions a word, so a
// page counts only if it is plausibly THEIRS. We never fall back to "whoever dominates the results": a wrong
// brand under the right name is worse than an honest "not found".
const STOP = new Set(['the', 'and', 'co', 'inc', 'llp', 'pvt', 'ltd', 'official', 'india', 'store', 'shop', 'by', 'of', 'brand', 'brands']);
const toks = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1 && !STOP.has(t));
const slugOf = (uri) => normName((String(uri || '').match(/facebook\.com\/(?:pg\/)?([^/?#]+)/i) || [])[1] || '');
const sameUrl = (a, b) => String(a || '').toLowerCase().replace(/\/+$/, '') === String(b || '').toLowerCase().replace(/\/+$/, '');

// share of a page's ads whose link goes to the rival's own website (host only: "/samsung-cases" on a reseller is not Samsung)
export function linkShare(page, comp) {
  if (!comp.site || !page.ads || !page.ads.length) return { hits: 0, share: 0 };
  const hits = page.ads.filter(a => linksTo(a.link_url, comp.site)).length;
  return { hits, share: hits / page.ads.length };
}
const hasEvidence = (ls) => ls.hits >= 2 || (ls.hits >= 1 && ls.share >= 0.5);

// 6 their Facebook page (slug matches the one on their site) · 5 their page URL is their Instagram handle, or the name
// is the same brand ("Samsung India" = "Samsung") · 4 ads linking to their site · 3 page named like their Instagram
// · 2 the name sits inside the page name · 0 not this brand
export function pageScore(page, comp) {
  const n = normName(comp.name), p = normName(page.page_name), slug = slugOf(page.page_uri);
  if (!n) return 0;
  if (comp.fb && slug && slug === normName(comp.fb)) return 6;
  const igs = [comp.ig, comp.hint_ig, comp.site_ig].map(normName).filter(h => h.length >= 4);
  if (slug && igs.includes(slug)) return 5;
  if (p && p === n) return 5;
  const ct = toks(comp.name), pt = toks(page.page_name);
  if (ct.length && ct.join('').length >= 4 && ct.length === pt.length && ct.every(t => pt.includes(t))) return 5; // a lone 3-letter word proves nothing
  if (hasEvidence(linkShare(page, comp))) return 4;
  if (p && igs.includes(p)) return 3;
  if (p && ((n.length >= 4 && p.includes(n)) || (p.length >= 4 && n.includes(p)))) return 2;
  if (ct.length && ct.join('').length >= 4 && ct.every(t => pt.includes(t))) return 2;
  if (slug && n.length >= 5 && slug.includes(n)) return 2;
  return 0;
}

// Group pulled ads under the competitors the founder named.
//  - ads that came back from a rival's own Facebook page link are that rival's, no scoring needed
//  - for the rest, ONE page wins: the best-evidenced, never a merge of lookalikes
//  - if any page in the results links to the rival's own website, only such pages (or its Facebook page) qualify,
//    so a namesake with no tie to the site cannot win
// A competitor with no plausible page comes back with no ads, resolution "not found", and the pages that DID
// come back (so the UI can say so).
export function assignToCompetitors(items, competitors) {
  const ads = items.map(normalizeItem).filter(a => a.id);
  const pages = new Map();
  for (const a of ads) {
    const k = a.page_id || a.page_name;
    if (!k) continue;
    const e = pages.get(k) || { page_id: a.page_id, page_name: a.page_name, page_uri: a.page_uri, ads: [] };
    e.ads.push(a); pages.set(k, e);
  }
  const all = [...pages.values()];
  const out = {};
  const taken = new Set();
  for (const c of competitors) {
    // 1. its own Facebook page
    const via = c.fb ? all.filter(pg => pg.ads.some(a => sameUrl(a.source_url, fbUrl(c.fb))) || slugOf(pg.page_uri) === normName(c.fb)) : [];
    if (via.length) {
      const dom = via.slice().sort((x, y) => y.ads.length - x.ads.length)[0];
      out[c.name] = { ads: dom.ads, page_id: dom.page_id, page_name: dom.page_name, resolution: 'matched page', via: 'facebook page', candidates: [] };
      taken.add(dom.page_id || dom.page_name);
      continue;
    }
    // 2. score every page
    let scored = all.map(pg => ({ pg, s: pageScore(pg, c), ls: linkShare(pg, c) })).filter(x => x.s >= 2);
    if (c.site && all.some(pg => hasEvidence(linkShare(pg, c)))) scored = scored.filter(x => hasEvidence(x.ls) || x.s >= 6);
    scored.sort((x, y) => y.s - x.s || y.ls.share - x.ls.share || y.pg.ads.length - x.pg.ads.length);
    if (!scored.length) {
      const candidates = all.slice().sort((x, y) => y.ads.length - x.ads.length).slice(0, 3).map(pg => pg.page_name).filter(Boolean);
      out[c.name] = { ads: [], page_id: null, page_name: null, resolution: 'not found', candidates };
      continue;
    }
    const best = scored[0];
    out[c.name] = { ads: best.pg.ads, page_id: best.pg.page_id, page_name: best.pg.page_name, resolution: best.s >= 4 ? 'matched page' : 'matched page name', via: best.s >= 5 ? 'name or handle' : best.s === 4 ? 'ads linking to its website' : 'page name', candidates: [] };
    taken.add(best.pg.page_id || best.pg.page_name);
  }
  // the pages a missing rival "turned up" should not include the rivals the founder DID name and we did find
  const names = new Set(Object.values(out).map(g => g.page_name).filter(Boolean));
  for (const g of Object.values(out)) if (g.resolution === 'not found') g.candidates = g.candidates.filter(n => !names.has(n));
  return out;
}

// Pick up to 15: longest-running first (the profitable signal), then the
// freshest (what they're testing now). Skip ads with no visible creative,
// collapse near-identical variants but remember how many there were.
export function selectAds(ads, max = MAX_ADS_PER_COMPETITOR) {
  const seen = new Map();
  for (const a of ads) {
    if (!a.image_url) continue;
    const key = a.collation_id || normName((a.body || '').slice(0, 80) + (a.headline || '')) || a.id;
    const prev = seen.get(key);
    if (!prev) seen.set(key, { ...a, variant_count: Math.max(1, a.collation_count || 1) });
    else {
      prev.variant_count = Math.max(prev.variant_count + 1, a.collation_count || 1);
      if ((a.start_date || '9') < (prev.start_date || '9')) prev.start_date = a.start_date;
    }
  }
  const uniq = [...seen.values()].map(a => ({ ...a, days_running: daysSince(a.start_date) || 0 }));
  const imageFirst = (a) => (a.display_format === 'VIDEO' ? 0 : 1);
  const byAge = [...uniq].sort((x, y) => imageFirst(y) - imageFirst(x) || y.days_running - x.days_running);
  const picked = [];
  const ids = new Set();
  for (const a of byAge) { if (picked.length >= Math.ceil(max * 2 / 3)) break; picked.push({ ...a, pick_reason: 'long-running' }); ids.add(a.id); }
  const byNew = [...uniq].sort((x, y) => x.days_running - y.days_running);
  for (const a of byNew) { if (picked.length >= max) break; if (!ids.has(a.id)) { picked.push({ ...a, pick_reason: 'fresh' }); ids.add(a.id); } }
  return picked;
}