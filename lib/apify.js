// lib/apify.js — live Meta Ad Library pull through an Apify actor.
// The official Ad Library API does not return commercial ads outside UK/EU,
// so we read the public Ad Library website the way a scraper actor does.
import { api, config } from './hatchable.js';
import { str, looseMatch, normName, daysSince } from './util.js';

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

// What we feed the actor for one competitor. Facebook URLs pass through;
// names and @handles become an Ad Library keyword search.
export function sourceUrlFor(comp, country) {
  const raw = String(comp.input || comp.name || '').trim();
  if (/facebook\.com\//i.test(raw)) return raw.startsWith('http') ? raw : 'https://' + raw.replace(/^\/+/, '');
  if (comp.page_id) return pageAdsUrl(comp.page_id, country);
  return keywordUrl(comp.name.replace(/^@/, ''), country);
}

export async function startPull(competitors, country) {
  const actor = String((await config.get('apify_actor')) || 'curious_coder~facebook-ads-library-scraper').trim().replace('/', '~');
  const urls = competitors.map(c => ({ url: sourceUrlFor(c, country) }));
  const input = {
    urls,
    count: PULL_PER_SOURCE * competitors.length,
    limitPerSource: PULL_PER_SOURCE,
    scrapeAdDetails: false,
    'scrapePageAds.activeStatus': 'active',
    'scrapePageAds.countryCode': country === 'ALL' ? 'ALL' : (country || 'IN'),
    'scrapePageAds.sortBy': 'impressions_desc',
    // field names used by the official apify/facebook-ads-scraper
    startUrls: urls,
    resultsLimit: PULL_PER_SOURCE * competitors.length,
  };
  // the actor wants 1 input URL per 512 MB; with 1-3 competitors, 512 MB is the only size that always fits
  const r = await api.apify.post('/acts/' + actor + '/runs', { query: { timeout: '170', memory: '512' }, body: input });
  if (r.status >= 300 || !r.body || !r.body.data) {
    throw new Error('Apify start failed (' + r.status + '): ' + JSON.stringify(r.body || {}).slice(0, 200));
  }
  return { runId: r.body.data.id, datasetId: r.body.data.defaultDatasetId, actor, startedAt: Date.now(), urls: urls.map(u => u.url) };
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

// Group pulled ads under the competitors the founder named.
export function assignToCompetitors(items, competitors) {
  const ads = items.map(normalizeItem).filter(a => a.id);
  const out = {};
  for (const c of competitors) {
    const term = normName(c.name);
    let mine = ads.filter(a => looseMatch(a.page_name, c.name) || (a.page_uri && normName(a.page_uri).includes(term)));
    let resolution = 'matched page name';
    if (!mine.length) {
      // keyword search often returns resellers/affiliates; fall back to the
      // dominant page among ads that came from this competitor's search URL
      const fromSearch = ads.filter(a => a.source_url && decodeURIComponent(a.source_url).toLowerCase().includes(String(c.name).toLowerCase().replace(/^@/, '')));
      const pool = fromSearch.length ? fromSearch : [];
      const counts = {};
      for (const a of pool) counts[a.page_id] = (counts[a.page_id] || 0) + 1;
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      if (top) { mine = pool.filter(a => a.page_id === top[0]); resolution = 'best guess: page "' + (mine[0] && mine[0].page_name) + '"'; }
    }
    // keep the dominant page id when several pages matched
    const pc = {};
    for (const a of mine) pc[a.page_id] = (pc[a.page_id] || 0) + 1;
    const dom = Object.entries(pc).sort((x, y) => y[1] - x[1])[0];
    out[c.name] = { ads: mine, page_id: dom ? dom[0] : null, page_name: mine[0] ? mine[0].page_name : null, resolution };
  }
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