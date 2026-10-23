// lib/pipeline.js — the whole product: FEED -> CHEW -> FRESH OUT.
// A resumable state machine. Each advance() call does one bounded chunk of
// work (< ~45 s) so it fits Hatchable's 60 s request ceiling, and every
// stage is idempotent so a reload or a double-click can't break a run.
import { db, config, api } from './hatchable.js';
import { claude, extractJson, addCost } from './claude.js';
import { log, str, htmlToText, metaTag, normName, sleep, toBase64, daysSince, ANGLES, positionFor, clearOfRivals } from './util.js';
import { igHandles, startIgPull, normalizePost, IG_GIVE_UP_MS } from './instagram.js';
import { apifyStatus, startPull, startMarketPull, pagesOf, pollPull, fetchItems, assignToCompetitors, selectAds, pageAdsUrl, keywordUrl, MAX_ADS_PER_COMPETITOR } from './apify.js';
import { loadSeed, seedPackFor, allSeedNames } from './seed.js';
import { readRival, cleanDomain, isDomain, socialsFromHtml } from './rivals.js';
import { findBrandSite, hasFirecrawl } from './web.js';
import { BRAND_SYSTEM, ANALYZE_SYSTEM, SYNTH_SYSTEM, GENERATE_SYSTEM } from './prompts.js';
import { guardVariant, claimContext, phraseSet } from './claims.js';
export { claimContext, phraseSet };

// Claim context for one run: what the founder supplied, who is banned, and the rivals' own wording.
export async function claimContextFor(run) {
  const ads = await loadRunAds(run.id, true); // an excluded ad is still the rival's wording
  return { ...claimContext(run), grams: phraseSet(ads.flatMap(a => [a.body, a.headline])) };
}

const CALL_BUDGET_MS = 42000;
const APIFY_GIVE_UP_MS = 210000;
const ANALYZE_PER_CALL = 20;
const ANALYZE_BATCH = 5;
// A cached read is reused only if it has the fields the map needs; older reads are refreshed once.
const UNREAD = `(an.ad_id IS NULL OR an.analysis->'position' IS NULL)`;

export const STAGES = ['brand', 'pull', 'analyze', 'synthesize', 'generate', 'done'];

async function save(run, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => k + ' = $' + (i + 2)).join(', ');
  const vals = keys.map(k => {
    const v = fields[k];
    return v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v;
  });
  await db.query('UPDATE runs SET ' + sets + ', updated_at = now() WHERE id = $1', [run.id, ...vals]);
  Object.assign(run, fields);
}

function setCost(run, key, val) {
  const cost = { ...(run.cost || {}) };
  cost[key] = val;
  return cost;
}

function markTiming(run, stage) {
  const t = { ...((run.cost && run.cost.timings) || {}) };
  t[stage] = Math.round((Date.now() - new Date(run.created_at).getTime()) / 100) / 10;
  return t;
}

/* ---------------- 1. brand: read the founder's page ---------------- */

async function stageBrand(run) {
  const b = run.input.brand || {};
  const url = String(b.url || '').trim();
  const isSite = url && !/instagram\.com|^@/i.test(url);
  const label = b.name || url;
  await log(run.id, 'reading ' + (isSite ? url.replace(/^https?:\/\//, '') : label) + '...');

  let page = null;
  if (isSite) {
    try {
      const full = /^https?:/i.test(url) ? url : 'https://' + url;
      const r = await fetch(full, { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; MetacrokBot/1.0)', accept: 'text/html' } });
      const html = (await r.text()).slice(0, 400000);
      const theme = metaTag(html, ['theme-color']);
      page = {
        title: str((html.match(/<title[^>]*>([^<]*)/i) || [])[1], 160),
        description: str(metaTag(html, ['description', 'og:description']), 400),
        og_title: str(metaTag(html, ['og:title', 'og:site_name']), 160),
        theme: /^#[0-9a-f]{3,8}$/i.test(theme) ? theme : null,
        text: htmlToText(html).slice(0, 7000),
      };
      // the site's own Instagram link beats a guess, and saves the founder typing it
      const igLink = socialsFromHtml(html).ig;
      if (!b.ig && igLink) {
        run.input = { ...run.input, brand: { ...b, ig: igLink.toLowerCase() } };
        await save(run, { input: run.input });
        await log(run.id, 'found your Instagram on your site: @' + igLink.toLowerCase(), 'ok');
      }
    } catch (e) {
      await log(run.id, 'couldn\'t open the site (' + str(e.message, 60) + '), asking the web instead', 'warn');
    }
  }

  let res;
  if (page && (page.text.length > 200 || page.description)) {
    res = await claude({
      role: 'vision', purpose: 'brand-profile', maxTokens: 900, system: BRAND_SYSTEM,
      messages: [{ role: 'user', content: 'Brand name given by founder: ' + (b.name || 'unknown') + '\nURL: ' + url +
        '\nTitle: ' + page.title + '\nMeta description: ' + page.description + '\nOG: ' + page.og_title + '\n\nPage text:\n' + page.text }],
    });
  } else {
    res = await claude({
      role: 'writer', purpose: 'brand-profile-search', maxTokens: 1400, system: BRAND_SYSTEM,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
      messages: [{ role: 'user', content: 'Profile this D2C brand using web search. Brand: ' + (b.name || '') + ' ' + url + '. Country focus: ' + (run.input.country || 'IN') }],
    });
  }
  const p = extractJson(res.text) || {};
  const brand = {
    name: p.name && p.name !== 'unknown' ? p.name : (b.name || label),
    url, sells: p.sells || 'unknown', category: p.category || '', niche: p.niche || '',
    price_point: p.price_point || 'unknown', price_band: p.price_band || 'unknown',
    tone_of_voice: p.tone_of_voice || 'unknown', voice_traits: p.voice_traits || [], voice_sample: p.voice_sample || '',
    target_buyer: p.target_buyer || 'unknown', geography: p.geography || run.input.country || '',
    proof_points: p.proof_points || [], offers: p.offers || [],
    colour: page && page.theme, read_from: page ? 'website' : 'web search',
  };
  await log(run.id, 'got it: ' + brand.sells + (brand.price_point !== 'unknown' ? ' at ' + brand.price_point : ''), 'ok');
  if (brand.tone_of_voice !== 'unknown') await log(run.id, 'voice: ' + brand.tone_of_voice);
  await save(run, {
    brand, stage: 'pull',
    cost: { ...setCost(run, 'brand', addCost(null, res)), timings: markTiming(run, 'brand') },
  });
}

/* ---------------- 2. pull: competitors' live ads ---------------- */

async function insertAds(run, picked, source) {
  for (const a of picked) {
    await db.query(
      `INSERT INTO ads (id, source, competitor, page_id, page_name, body, headline, description, cta, link_url, image_url, visual_note, display_format, platforms, start_date, collation_count, ad_library_url, fetched_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       ON CONFLICT (id) DO UPDATE SET image_url = EXCLUDED.image_url, start_date = EXCLUDED.start_date, collation_count = EXCLUDED.collation_count, visual_note = EXCLUDED.visual_note, fetched_at = now()`,
      [a.id, source, a.competitor, a.page_id || null, a.page_name || a.competitor, a.body || '', a.headline || '', a.description || '', a.cta || '', a.link_url || '',
        a.image_url || null, a.visual_note || null, a.display_format || 'IMAGE', JSON.stringify(a.platforms || []), a.start_date || null,
        a.variant_count || a.collation_count || 1, a.ad_library_url || null]
    );
    await db.query(
      'INSERT INTO run_ads (run_id, ad_id, competitor, days_running, pick_reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (run_id, ad_id) DO NOTHING',
      [run.id, a.id, a.competitor, a.days_running != null ? a.days_running : daysSince(a.start_date), a.pick_reason || null]
    );
  }
}

async function useSeed(run, reason) {
  const seedNames = allSeedNames();
  const asked = (run.input.competitors || []).map(c => normName(c.name)).filter(n => seedNames[n]);
  const pack = asked.length ? seedNames[asked[0]] : seedPackFor(run.brand);
  const { ads, names, pack: usedPack } = await loadSeed(pack, asked);
  await log(run.id, reason, 'warn');
  await log(run.id, 'serving the demo seed pack (' + (usedPack === 'custom' ? 'saved ads' : 'fictional ' + usedPack + ' brands') + '): ' + names.join(', '));
  const byComp = {};
  for (const a of ads) (byComp[a.competitor] = byComp[a.competitor] || []).push(a);
  const picked = [];
  for (const n of names) {
    const list = (byComp[n] || []).map(a => ({ ...a, days_running: a.days_running != null ? a.days_running : daysSince(a.start_date) }))
      .sort((x, y) => y.days_running - x.days_running).slice(0, MAX_ADS_PER_COMPETITOR)
      .map(a => ({ ...a, pick_reason: a.days_running >= 60 ? 'long-running' : 'fresh' }));
    picked.push(...list);
  }
  await insertAds(run, picked, usedPack === 'custom' ? 'seed-saved' : 'seed');
  const competitors = names.map(n => {
    const first = byComp[n] && byComp[n][0];
    return { name: n, input: n, ig: first && first.ig || null, page_name: n, page_id: null, ad_library_url: first && first.ad_library_url || null,
      source: usedPack === 'custom' ? 'saved' : 'seed', ads_found: (byComp[n] || []).length, ads_kept: picked.filter(a => a.competitor === n).length };
  });
  for (const c of competitors) await log(run.id, 'swallowed ' + c.ads_kept + ' ads from ' + c.name, 'ok');
  await save(run, {
    competitors, source: usedPack === 'custom' ? 'seed-saved' : 'seed', stage: 'analyze',
    cost: { ...setCost(run, 'pull', { usd: 0, ads: picked.length, source: 'seed', note: reason }), timings: markTiming(run, 'pull') },
  });
}

// A live run that can't read the rivals the founder named STOPS. It never swaps in other brands (the old
// fallback served fictional demo rivals under a real founder's name). Demo ads run only when asked for.
async function failLive(run, reason) {
  const msg = 'Couldn\'t read your rivals\' ads: ' + reason + ' Nothing else was swapped in. Try again, paste each rival\'s Facebook page link instead of its name, or run the demo ads.';
  await log(run.id, msg, 'error');
  await save(run, { status: 'error', error: msg, stage: 'pull' });
}

async function finishLivePull(run, items, apifyUsd) {
  const comps = run.input.competitors;
  for (const c of comps) { // a rival pasted as a page ID is named after the page its ads came from
    if (c.page_id && /^Page \d+$/.test(c.name)) { const it = items.find(i => String(i.page_id || (i.snapshot || {}).page_id) === String(c.page_id)); const nm = it && (it.page_name || (it.snapshot || {}).page_name); if (nm) c.name = str(nm, 60); }
  }
  const grouped = assignToCompetitors(items, comps);
  const country = run.input.country || 'IN';
  const picked = [];
  const competitors = [];
  for (const c of comps) {
    const g = grouped[c.name] || { ads: [] };
    const sel = selectAds(g.ads).map(a => ({ ...a, competitor: c.name }));
    picked.push(...sel);
    competitors.push({
      name: c.name, input: c.input, candidates: g.candidates || [], page_name: g.page_name, page_id: g.page_id,
      ad_library_url: g.page_id ? pageAdsUrl(g.page_id, country) : keywordUrl(c.name.replace(/^@/, ''), country),
      source: 'live', resolution: g.resolution, matched_by: g.via || null, fb: c.fb || null, site: c.site || null, ads_found: g.ads.length, ads_kept: sel.length,
    });
    if (sel.length) await log(run.id, 'swallowed ' + sel.length + ' ads from ' + c.name + (g.page_name && normName(g.page_name) !== normName(c.name) ? ' (page: ' + g.page_name + ')' : '') + (g.via ? ' · matched by ' + g.via : ''), 'ok');
    else if (g.resolution === 'not found') await log(run.id, c.page_id || c.fb
      ? c.name + ' has a Facebook page (' + (c.fb || c.page_id) + ') but no active ads in ' + country + ' right now' + (country !== 'ALL' ? '. Try the All markets setting' : '')
      : 'no active Meta advertiser found for ' + c.name + ' in ' + country + (c.site ? ' (checked its website, ads linking to ' + c.site + ', and common page names; if you know its Facebook page, paste the link)' : (g.candidates && g.candidates.length ? ' (the search only turned up ' + g.candidates.join(', ') + ', so none were used)' : '')), 'warn');
    else await log(run.id, 'no active image ads found for ' + c.name + ' in ' + country, 'warn');
  }
  if (!picked.length) return failLive(run, 'no active ads found for ' + comps.map(c => c.name).join(', ') + ' in ' + country + '.');
  await insertAds(run, picked, 'live');
  const per1k = Number(await config.get('apify_price_per_1k')) || 0.75;
  const usd = apifyUsd != null && apifyUsd > 0 ? apifyUsd : Math.round(items.length * per1k / 1000 * 1e6) / 1e6;
  await save(run, {
    competitors, source: 'live', stage: 'analyze',
    apify: { ...(run.apify || {}), done: true, items: items.length },
    cost: { ...setCost(run, 'pull', { usd, ads: items.length, kept: picked.length, source: 'apify', actor: run.apify && run.apify.actor, metered: apifyUsd != null && apifyUsd > 0 }), timings: markTiming(run, 'pull') },
  });
}

// The founder's own Instagram (and rivals given as @handles) is pulled in parallel with the ads and collected
// during analyze. It never blocks the run: no handle, no Apify, or a failed pull just means "compare from the site".
async function kickIg(run) {
  if (run.ig) return;
  const h = igHandles(run);
  if (!h.all.length) return save(run, { ig: { state: 'none' } });
  const st = await apifyStatus();
  if (!st.connected) return save(run, { ig: { state: 'failed', reason: 'Apify not connected' } });
  try {
    const r = await startIgPull(h.all);
    await save(run, { ig: { state: 'running', handles: h.all, brand: h.brand, ...r } });
    await log(run.id, 'peeking at ' + h.all.map(x => '@' + x).join(', ') + ' on Instagram...');
  } catch (e) {
    await save(run, { ig: { state: 'failed', reason: str(e.message, 120) } });
  }
}

async function pollIg(run) {
  const ig = run.ig;
  if (!ig || ig.state !== 'running') return;
  let p;
  try { p = await pollPull(ig.runId); } catch (_) { return; }
  if (p.status === 'SUCCEEDED') {
    const items = await fetchItems(p.datasetId || ig.datasetId);
    const posts = items.map(it => normalizePost(it, ig.brand)).filter(Boolean);
    for (const x of posts) {
      await db.query(
        `INSERT INTO ig_posts (run_id, id, handle, is_brand, caption, image_url, url, post_type, likes, comments, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (run_id, id) DO NOTHING`,
        [run.id, x.id, x.handle, x.is_brand, x.caption, x.image_url, x.url, x.post_type, x.likes, x.comments, x.posted_at]);
    }
    const mine = posts.filter(x => x.is_brand).length;
    const err = items.find(i => i && i.error);
    await save(run, { ig: { ...ig, state: 'done', posts: posts.length, brand_posts: mine, usd: p.usd, note: err && !posts.length ? str(err.error || err.errorDescription, 120) : null } });
    await log(run.id, posts.length ? 'read the Instagram grid: ' + mine + ' of your posts' + (posts.length > mine ? ', ' + (posts.length - mine) + ' of theirs' : '') : 'Instagram came back empty (' + str((err && (err.errorDescription || err.error)) || 'private or wrong handle?', 80) + '); comparing from your site instead', posts.length ? 'ok' : 'warn');
  } else if (['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'].includes(p.status) || Date.now() - ig.startedAt > IG_GIVE_UP_MS) {
    await save(run, { ig: { ...ig, state: 'failed', reason: 'Instagram pull ' + String(p.status).toLowerCase() } });
    await log(run.id, 'couldn\'t read Instagram in time; comparing from your site instead', 'warn');
  }
}

export async function loadIgPosts(runId) {
  const { rows } = await db.query('SELECT * FROM ig_posts WHERE run_id = $1 ORDER BY is_brand DESC, posted_at DESC NULLS LAST', [runId]);
  return rows.map(r => ({ ...r, pos: r.analysis ? positionFor(r.analysis, r.id) : null }));
}

// A rival's name alone finds the wrong advertisers (see sourceUrlsFor), and a language model's guess at its
// website or Instagram is only a guess. So: ask for the official website of any rival we don't know, then OPEN
// that site and read the brand's own Facebook page and Instagram off it. A site whose title doesn't even mention
// the brand is rejected (a wrong guess fails safe as "not found", never as a different company).
const nameInText = (name, text) => {
  const t = normName(text), tk = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(x => x.length >= 3);
  return !tk.length || tk.some(x => t.includes(x)) || t.includes(normName(name));
};
const COUNTRY_NAME = { IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'UAE', AU: 'Australia', CA: 'Canada', SG: 'Singapore', ALL: '' };
async function resolveSites(run) {
  const comps = run.input.competitors || [];
  const need = comps.filter(c => !c.site && !c.page_id && !/facebook\.com\//i.test(String(c.input || c.name)));
  const found = [];
  if (need.length && hasFirecrawl()) {
    // a web search finds the REAL site (and Instagram); a model's memory only guesses ("thecookieco.in" never existed)
    await Promise.all(need.map(async (c) => {
      try {
        const w = await findBrandSite(c.name, { niche: (run.brand && run.brand.niche) || '', country: COUNTRY_NAME[run.input.country || 'IN'] || '' });
        if (w.site) { c.site = w.site; c.site_src = 'web'; }
        if (w.ig && !c.hint_ig) c.web_ig = w.ig;
        if (!w.site) found.push(c.name + ': no website turned up on the web');
      } catch (_) { /* fall through to the guess below */ }
    }));
  }
  const still = comps.filter(c => !c.site && !c.page_id && !c.web_ig && !/facebook\.com\//i.test(String(c.input || c.name)) && !hasFirecrawl());
  if (still.length) {
    try {
      const res = await claude({
        role: 'writer', purpose: 'rival-websites', maxTokens: 400, timeoutMs: 20000,
        system: 'You map D2C brand names to their official website domain. Return ONLY JSON: {"sites": {"<name exactly as given>": "domain.tld" or null}}. Use null unless you are sure. Never guess.',
        messages: [{ role: 'user', content: 'Market: ' + (run.input.country || 'IN') + '. Category hint: ' + str((run.brand && run.brand.niche) || run.input.brand.name, 60) + '\nBrands: ' + JSON.stringify(still.map(c => c.name)) }],
      });
      const map = (extractJson(res.text) || {}).sites || {};
      for (const c of still) { const d = cleanDomain(map[c.name]); if (isDomain(d)) { c.site = d; c.site_src = 'guess'; } }
      run.cost = { ...setCost(run, 'rivals', addCost(null, res)) };
    } catch (_) { /* name search still runs */ }
  }
  // read every rival's own site: its real Facebook page and Instagram, and a check that the site is the brand
  await Promise.all(comps.filter(c => c.site && !c.fb).map(async (c) => {
    const r = await readRival(c.site, { name: c.name });
    if (!r.ok) {
      if (c.site_src === 'guess') { found.push(c.name + ': ' + c.site + ' does not open, so it was a guess; ignoring it'); c.site = null; }
      else found.push(c.name + ': could not open ' + c.site + ', searching by its web address');
      return;
    }
    if (!nameInText(c.name, r.title + ' ' + r.description + ' ' + c.site)) {
      found.push(c.name + ': ' + c.site + ' does not look like its site (“' + str(r.title, 40) + '”), ignoring it');
      c.site = null; return;
    }
    if (r.finalSite) { found.push(c.name + ': its site moved to ' + r.finalSite); c.site = r.finalSite; }
    if (r.fb) c.fb = r.fb;
    if (r.ig) c.site_ig = r.ig;
    found.push(c.name + ': ' + (r.fb ? 'found its Facebook page (' + r.fb + ')' : 'no Facebook link on ' + c.site) + (r.ig ? ', Instagram @' + r.ig : '') + (c.site_src === 'web' ? ' · site found by web search' : '') + (r.viaFirecrawl ? ' · read with a full browser' : ''));
  }));
  for (const c of comps) if (!c.site_ig && c.web_ig) c.site_ig = c.web_ig; // an Instagram the web search tied to the brand still seeds the page-name guesses
  for (const f of found) await log(run.id, f, /ignoring|could not|no website/.test(f) ? 'warn' : 'info');
  await save(run, { input: run.input, cost: run.cost });
}

/* ---------------- market fallback: who advertises in this category? ---------------- */

// Opt-in rescue when the named rivals have no ads: find the real brands advertising the same kind of product.
async function marketQueries(run) {
  const b = run.brand || {};
  const fallback = [str(b.niche || b.sells, 50)].filter(Boolean);
  try {
    const r = await claude({
      role: 'writer', purpose: 'market-queries', maxTokens: 200, timeoutMs: 12000,
      system: 'You write Meta Ad Library keyword searches. Return ONLY JSON: {"queries": ["2-3 words", "2-3 words"]}: the plain words a shopper uses for the founder\'s product category (e.g. "eggless cookies", "cotton sarees"). No brand names.',
      messages: [{ role: 'user', content: 'The founder sells: ' + str(b.sells || b.niche, 200) + '\nCategory: ' + str(b.niche, 80) }],
    });
    const q = (extractJson(r.text) || {}).queries;
    const list = (Array.isArray(q) ? q : []).map(x => str(x, 40)).filter(x => x.length >= 3).slice(0, 2);
    return list.length ? list : fallback;
  } catch (_) { return fallback; }
}

async function finishMarketPull(run, items, apifyUsd) {
  const own = new Set([normName(run.brand && run.brand.name), normName(run.input.brand.name), normName(run.input.brand.ig)].filter(Boolean));
  const pages = pagesOf(items).filter(p => p.ads.length >= 2 && !own.has(normName(p.page_name)) && !(p.page_uri && [...own].some(o => o && normName(p.page_uri).endsWith(o)))).slice(0, 12);
  if (!pages.length) return failLive(run, 'nobody was advertising that kind of product in ' + (run.input.country || 'IN') + ' right now. Try the All markets setting.');
  let keep = [];
  try {
    const r = await claude({
      role: 'writer', purpose: 'market-filter', maxTokens: 400, timeoutMs: 20000,
      system: 'You pick direct competitors for a founder from the advertisers of a Meta Ad Library search. Keep a page only if it is a brand that sells the same kind of product to the same kind of buyer. Skip marketplaces, resellers, agencies, apps, classifieds, individuals and unrelated products. Return ONLY JSON: {"keep": [indexes, best first, at most 3]}.',
      messages: [{ role: 'user', content: 'The founder sells: ' + str((run.brand && (run.brand.sells || run.brand.niche)) || '', 200) + '\nAdvertisers:\n' +
        JSON.stringify(pages.map((p, i) => ({ i, name: p.page_name, ads: p.ads.length, sample: str(p.ads[0].body || p.ads[0].headline, 110), links_to: String(p.ads[0].link_url || '').replace(/^https?:\/\/(www\.)?/, '').split('/')[0] }))) }],
    });
    const k = (extractJson(r.text) || {}).keep;
    keep = (Array.isArray(k) ? k : []).map(Number).filter(i => pages[i]).slice(0, 3);
    run.cost = { ...setCost(run, 'rivals', addCost(run.cost && run.cost.rivals, r)) };
  } catch (_) { /* nothing kept: honest failure below */ }
  if (!keep.length) return failLive(run, 'none of the advertisers in your category looked like a direct competitor. Name a rival yourself, or paste its Facebook page link.');
  const comps = keep.map(i => ({ name: str(pages[i].page_name, 60), input: pages[i].page_name, page_id: pages[i].page_id, source: 'market' }));
  run.input = { ...run.input, competitors: comps };
  await save(run, { input: run.input, cost: run.cost });
  await log(run.id, 'you named no working rivals, so he looked at who advertises in your category: ' + comps.map(c => c.name).join(', '), 'ok');
  return finishLivePull(run, items, apifyUsd);
}

async function stagePull(run) {
  const t0 = Date.now();
  await kickIg(run);
  const comps = run.input.competitors || [];
  const seedNames = allSeedNames();
  if (run.input.mode === 'seed') return useSeed(run, 'demo mode is on, skipping the live pull');
  if (comps.length && comps.every(c => seedNames[normName(c.name)])) return useSeed(run, 'these are the demo brands');

  if (!run.apify || !run.apify.runId) {
    const st = await apifyStatus();
    if (!st.connected) return useSeed(run, 'live Ad Library pull is off (Apify ' + st.reason + '), so this run uses the demo ads and NOT your rivals');
    let a0 = null;
    try {
      if (run.input.market) {
        const qs = await marketQueries(run);
        await log(run.id, 'no rivals named: looking at who advertises ' + qs.map(q => '"' + q + '"').join(' and ') + ' in the Ad Library...');
        a0 = await startMarketPull(qs, run.input.country || 'IN');
      } else {
        await resolveSites(run);
        await log(run.id, 'sniffing the Meta Ad Library for ' + comps.map(c => c.name).join(', ') + '...');
      }
      const a = a0 || await startPull(comps, run.input.country || 'IN');
      await save(run, { apify: a });
      await log(run.id, 'scraper running (' + a.actor.split('~')[1] + ')');
    } catch (e) {
      return failLive(run, 'the scraper failed to start (' + str(e.message, 100) + ').');
    }
  }

  let lastStatus = '';
  while (Date.now() - t0 < CALL_BUDGET_MS) {
    let p;
    try { p = await pollPull(run.apify.runId); } catch (e) { p = { status: 'POLL_ERROR' }; }
    if (p.status === 'SUCCEEDED') {
      const items = await fetchItems(p.datasetId || run.apify.datasetId);
      // The actor reports a search with no results as an {error} row next to the good rows. That is one
      // rival with no ads, not a failed run: only when EVERY row is an error is the pull a failure.
      const bad = items.filter(i => i && i.error && !i.ad_archive_id && !i.snapshot);
      const good = items.filter(i => !(i && i.error && !i.ad_archive_id && !i.snapshot));
      if (!good.length) return failLive(run, 'the scraper found no active ads for ' + comps.map(c => c.name).join(', ') + ' in ' + (run.input.country || 'IN') + ' (' + str((bad[0] && bad[0].error) || 'no ads', 80) + '). Their page may exist but not be advertising in this market: try the All markets setting.');
      if (bad.length) await log(run.id, bad.length + ' page lookups had nothing (page names that do not exist or run no ads); using the rest'); // expected: most page-name guesses miss
      await log(run.id, 'pulled ' + good.length + ' live ads, picking the winners...');
      return run.apify.market ? finishMarketPull(run, good, p.usd) : finishLivePull(run, good, p.usd);
    }
    if (['FAILED', 'ABORTED', 'TIMED-OUT', 'TIMED_OUT'].includes(p.status)) {
      return failLive(run, 'the Ad Library scraper ' + p.status.toLowerCase() + '.');
    }
    if (Date.now() - run.apify.startedAt > APIFY_GIVE_UP_MS) {
      try { await import_abort(run.apify.runId); } catch (_) {}
      return failLive(run, 'the Ad Library scraper took too long.');
    }
    if (p.status !== lastStatus && p.status === 'RUNNING') await log(run.id, 'scrolling the Ad Library...');
    lastStatus = p.status;
    await sleep(4000);
  }
}

async function import_abort(runId) {
  return api.apify.post('/actor-runs/' + runId + '/abort', { body: {} });
}

/* ---------------- 3. analyze: vision read per ad ---------------- */

async function imageBlock(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    let type = String(r.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) type = 'image/jpeg';
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 500 || buf.byteLength > 3500000) return null;
    return { type: 'image', source: { type: 'base64', media_type: type, data: toBase64(buf) } };
  } catch (_) { return null; }
}

function adText(a, i) {
  return [
    'AD #' + i + ' — competitor: ' + a.competitor,
    'format: ' + (a.display_format || 'IMAGE') + ' | running ' + (a.days_running || 0) + ' days | ' + (a.collation_count || 1) + ' variant(s) | platforms: ' + (a.platforms || []).join(', '),
    'primary text: ' + str(a.body, 900),
    'headline: ' + str(a.headline, 120),
    'description: ' + str(a.description, 120),
    'cta button: ' + (a.cta || 'none'),
    a.visual_note ? 'creative (described): ' + a.visual_note : '',
  ].filter(Boolean).join('\n');
}

async function analyzeBatch(ads) {
  const content = [];
  let images = 0;
  const blocks = await Promise.all(ads.map(a => a.image_url ? imageBlock(a.image_url) : null));
  ads.forEach((a, k) => {
    if (blocks[k]) { content.push(blocks[k]); images++; }
    content.push({ type: 'text', text: adText(a, k + 1) + (blocks[k] ? '\n(the image above is this ad\'s creative)' : '') });
  });
  content.push({ type: 'text', text: 'Return the JSON array for AD #1 to AD #' + ads.length + '.' });
  const res = await claude({ role: 'vision', purpose: 'ad-vision-read', maxTokens: 450 * ads.length + 200, system: ANALYZE_SYSTEM, messages: [{ role: 'user', content }], timeoutMs: 45000 });
  let arr = extractJson(res.text);
  if (!Array.isArray(arr)) arr = arr && Array.isArray(arr.ads) ? arr.ads : [];
  const share = res.usd / ads.length;
  const out = [];
  ads.forEach((a, k) => {
    const read = arr.find(x => Number(x.i) === k + 1) || arr[k];
    if (read) out.push({ ad: a, read, usd: share, model: res.model });
  });
  return { out, res, images };
}

async function stageAnalyze(run) {
  const firstVisit = !(run.cost && run.cost.analysis);
  if (firstVisit) {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT ${UNREAD})::int AS cached FROM run_ads ra LEFT JOIN ad_analyses an ON an.ad_id = ra.ad_id WHERE ra.run_id = $1`, [run.id]);
    if (rows[0].cached) await log(run.id, rows[0].cached + ' of ' + rows[0].total + ' ads already digested earlier (cache hit, free)', 'ok');
    run.cost = setCost(run, 'analysis', { usd: 0, in: 0, out: 0, calls: 0, searches: 0, model: null, cached: rows[0].cached, images: 0 });
  }
  const { rows: todo } = await db.query(
    `SELECT a.*, ra.competitor AS comp, ra.days_running FROM run_ads ra JOIN ads a ON a.id = ra.ad_id
     LEFT JOIN ad_analyses an ON an.ad_id = ra.ad_id WHERE ra.run_id = $1 AND ${UNREAD}
     ORDER BY ra.competitor, ra.days_running DESC LIMIT $2`, [run.id, ANALYZE_PER_CALL]);

  if (todo.length) {
    const ads = todo.map(r => ({ ...r, competitor: r.comp, platforms: r.platforms || [] }));
    const batches = [];
    for (let i = 0; i < ads.length; i += ANALYZE_BATCH) batches.push(ads.slice(i, i + ANALYZE_BATCH));
    const names = [...new Set(ads.map(a => a.competitor))];
    for (const n of names) await log(run.id, 'digesting ' + n + '\'s hook structure...');
    const results = await Promise.allSettled(batches.map(analyzeBatch));
    let bucket = run.cost.analysis;
    let stored = 0;
    for (const r of results) {
      if (r.status !== 'fulfilled') { await log(run.id, 'one bite didn\'t go down (' + str(r.reason && r.reason.message, 80) + '), retrying', 'warn'); if (r.reason && r.reason.code === 'ai_setup') throw r.reason; continue; }
      bucket = addCost(bucket, r.value.res);
      bucket.images = (bucket.images || 0) + r.value.images;
      for (const x of r.value.out) {
        await db.query(`INSERT INTO ad_analyses (ad_id, analysis, model, cost_usd) VALUES ($1,$2,$3,$4)
          ON CONFLICT (ad_id) DO UPDATE SET analysis = EXCLUDED.analysis, model = EXCLUDED.model, cost_usd = EXCLUDED.cost_usd, created_at = now()`,
          [x.ad.id, JSON.stringify(x.read), x.model, x.usd]);
        stored++;
      }
      const best = r.value.out.slice().sort((p, q) => (q.ad.days_running || 0) - (p.ad.days_running || 0))[0];
      if (best && best.read && best.read.hook) {
        await log(run.id, best.ad.competitor + ': "' + str(best.read.hook.line, 70) + '" (' + (best.read.angle || '?') + ', ' + (best.ad.days_running || 0) + 'd running)');
      }
    }
    if (!stored) {
      const fails = ((run.cost.meta && run.cost.meta.analyzeFails) || 0) + 1;
      run.cost = setCost(run, 'meta', { ...(run.cost.meta || {}), analyzeFails: fails });
      if (fails >= 3) throw new Error('Vision analysis keeps failing');
    }
    run.cost = setCost(run, 'analysis', bucket);
    await save(run, { cost: run.cost });
  }

  const { rows: left } = await db.query(
    `SELECT count(*)::int AS n FROM run_ads ra LEFT JOIN ad_analyses an ON an.ad_id = ra.ad_id WHERE ra.run_id = $1 AND ${UNREAD}`, [run.id]);
  if (left[0].n > 0 && !(run.cost.meta && run.cost.meta.analyzeFails >= 3)) return;

  await pollIg(run);
  if (run.ig && run.ig.state === 'running') { await sleep(3000); return; } // ads are done; Instagram is still scrolling
  const { rows: posts } = await db.query('SELECT * FROM ig_posts WHERE run_id = $1 AND analysis IS NULL ORDER BY is_brand DESC LIMIT 12', [run.id]);
  if (posts.length && !(run.ig && run.ig.readFails >= 2)) {
    const as = posts.map(x => ({ id: x.id, competitor: '@' + x.handle + (x.is_brand ? ' (the founder)' : ''), body: x.caption, headline: '', description: '', cta: '',
      image_url: x.image_url, display_format: 'INSTAGRAM ' + (x.post_type || 'POST'), days_running: 0, collation_count: 1, platforms: ['instagram'] }));
    const batches = [];
    for (let i = 0; i < as.length; i += 4) batches.push(as.slice(i, i + 4));
    const results = await Promise.allSettled(batches.map(analyzeBatch));
    let bucket = run.cost.analysis, stored = 0;
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      bucket = addCost(bucket, r.value.res);
      for (const x of r.value.out) { await db.query('UPDATE ig_posts SET analysis = $3 WHERE run_id = $1 AND id = $2', [run.id, x.ad.id, JSON.stringify(x.read)]); stored++; }
    }
    run.cost = setCost(run, 'analysis', bucket);
    if (!stored) run.ig = { ...run.ig, readFails: ((run.ig && run.ig.readFails) || 0) + 1 };
    await save(run, { cost: run.cost, ig: run.ig });
    if (stored) await log(run.id, 'read ' + stored + ' Instagram posts', 'ok');
    return;
  }
  await log(run.id, 'every ad chewed. looking for the pattern...', 'ok');
  await save(run, { stage: 'synthesize', cost: { ...run.cost, timings: markTiming(run, 'analyze') } });
}

/* ---------------- 4. synthesize: what's working + whitespace ---------------- */

// The founder's controls live on run_ads (per run, so one founder's correction never leaks into the shared
// ad_analyses cache). Stages see only the ads the founder kept, with corrections applied; the UI passes
// all = true to list excluded ads too, so they can be restored.
export async function loadRunAds(runId, all = false) {
  const { rows } = await db.query(
    `SELECT a.id, a.source, ra.competitor, a.page_name, a.body, a.headline, a.description, a.cta, a.link_url, a.image_url, a.visual_note,
            a.display_format, a.platforms, a.start_date, a.collation_count, a.ad_library_url, ra.days_running, ra.pick_reason, an.analysis,
            ra.excluded, ra.correction, ra.controlled_at
     FROM run_ads ra JOIN ads a ON a.id = ra.ad_id LEFT JOIN ad_analyses an ON an.ad_id = ra.ad_id
     WHERE ra.run_id = $1 AND ($2 OR NOT ra.excluded) ORDER BY ra.competitor, ra.days_running DESC`, [runId, all]);
  return rows.map(r => {
    const fix = r.correction;
    const analysis = r.analysis && fix
      ? { ...r.analysis, ...(fix.angle ? { angle: fix.angle } : {}), ...(fix.note ? { why_it_works: fix.note } : {}), corrected: true }
      : r.analysis;
    return { ...r, analysis, pos: analysis ? positionFor(analysis, r.id) : null, weight: Math.round((1 + (r.days_running || 0) / 60 + Math.max(0, (r.collation_count || 1) - 1) * 0.25) * 100) / 100 };
  });
}

export const MIN_KEPT = 3; // fewer ads than this and the niche read is noise

// Changes the founder made after the last run finished: what a regenerate would apply.
export async function pendingChanges(runId) {
  const { rows } = await db.query(
    `SELECT (SELECT count(*)::int FROM run_ads ra JOIN runs r ON r.id = ra.run_id WHERE ra.run_id = $1 AND ra.controlled_at > r.finished_at)
          + (SELECT count(*)::int FROM runs WHERE id = $1 AND icp_at > finished_at) AS n`, [runId]);
  return rows[0].n;
}

export function angleStats(ads) {
  const by = {};
  const niche = {};
  for (const a of ads) {
    const ang = a.analysis && a.analysis.angle;
    if (!ang) continue;
    by[a.competitor] = by[a.competitor] || {};
    by[a.competitor][ang] = (by[a.competitor][ang] || 0) + a.weight;
    niche[ang] = (niche[ang] || 0) + a.weight;
  }
  const round = (o) => Object.fromEntries(Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, Math.round(v * 10) / 10]));
  const totalW = Object.values(niche).reduce((s, v) => s + v, 0) || 1;
  return {
    by_competitor: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, round(v)])),
    niche: round(niche),
    share: Object.fromEntries(Object.entries(niche).map(([k, v]) => [k, Math.round(v / totalW * 100)])),
    unused: ANGLES.filter(a => !niche[a]),
  };
}

async function stageSynthesize(run) {
  const ads = await loadRunAds(run.id);
  const stats = angleStats(ads);
  const compact = ads.filter(a => a.analysis).map(a => ({
    id: a.id, competitor: a.competitor, days_running: a.days_running, variants: a.collation_count, weight: a.weight,
    hook: a.analysis.hook, angle: a.analysis.angle, offer: a.analysis.offer, format: a.analysis.format,
    visual: a.analysis.visual_style, why: a.analysis.why_it_works, headline: str(a.headline, 80), audience: a.analysis.audience || null,
  }));
  const ig = (await loadIgPosts(run.id)).filter(x => x.analysis);
  const igRead = x => ({ handle: x.handle, likes: x.likes, comments: x.comments, angle: x.analysis.angle, hook: x.analysis.hook && x.analysis.hook.line, audience: x.analysis.audience || null, caption: str(x.caption, 160) });
  const mine = ig.filter(x => x.is_brand).map(igRead), theirsIg = ig.filter(x => !x.is_brand).map(igRead);
  const icp = run.icp && Array.isArray(run.icp.audiences) && run.icp.audiences.length ? run.icp : null;
  // buyers disagree on the cutoff (14, 30 or 60 days), so report both tiers; the weight itself grows with days
  const days = a => a.days_running || 0;
  await log(run.id, 'weighing longevity (a hint, not proof): ' + ads.filter(a => days(a) >= 30).length + ' ads have run 30+ days, ' + ads.filter(a => days(a) >= 60).length + ' have run 60+');
  const rivals = (run.competitors || []).filter(c => c.ads_kept > 0).map(c => c.name);
  const res = await claude({
    role: 'writer', purpose: 'synthesis', maxTokens: 3400, system: SYNTH_SYSTEM,
    messages: [{ role: 'user', content:
      'RIVALS (the only competitors that exist for this task; use exactly these names, mention no other brand): ' + JSON.stringify(rivals) +
      '\nFOUNDER BRAND: ' + JSON.stringify({ name: run.brand.name, sells: run.brand.sells, niche: run.brand.niche, price: run.brand.price_point, buyer: run.brand.target_buyer }) +
      '\nGOAL: ' + run.input.goal +
      '\nANGLE WEIGHTS (longevity-weighted, whole niche): ' + JSON.stringify(stats.niche) +
      '\nANGLES NOBODY USES: ' + JSON.stringify(stats.unused) +
      '\nCOMPETITOR AD READS:\n' + JSON.stringify(compact) +
      (mine.length ? '\nFOUNDER\'S OWN INSTAGRAM POSTS (organic, newest first):\n' + JSON.stringify(mine) : '\nFOUNDER\'S INSTAGRAM: not available; compare using the brand profile (basis "site"). Brand profile: ' + JSON.stringify({ voice: run.brand.tone_of_voice, proof: run.brand.proof_points, offers: run.brand.offers })) +
      (theirsIg.length ? '\nRIVALS\' ORGANIC INSTAGRAM POSTS:\n' + JSON.stringify(theirsIg) : '') +
      (icp ? '\nFOUNDER-DEFINED AUDIENCES (use exactly these): ' + JSON.stringify(icp.audiences) + (icp.target ? '\nFOUNDER\'S TARGET AUDIENCE: ' + icp.target : '') : '') }],
  });
  const s = extractJson(res.text);
  if (!s || !s.niche) throw new Error('Synthesis came back malformed (' + res.model + ', ' + res.stop + ')');
  // whatever the model returns, only the rivals we actually read survive, under their exact names
  const canon = (n) => rivals.find(r => normName(r) === normName(n));
  s.competitors = (s.competitors || []).map(c => ({ ...c, name: canon(c.name) })).filter(c => c.name);
  s.audiences = (s.audiences || []).map(a => ({ ...a, share: Object.fromEntries(Object.entries(a.share || {}).map(([k, v]) => [canon(k), v]).filter(([k]) => k)) }));
  const synthesis = { ...s, stats };
  if (icp && icp.target) synthesis.recommended_audience = icp.target; // the founder's call wins
  if (synthesis.you_vs_them && !mine.length) synthesis.you_vs_them.basis = 'site';
  const over = (s.niche.overused_angles || []).slice(0, 3).join(', ');
  if (over) await log(run.id, 'the niche is over-feeding on: ' + over);
  if (s.niche.whitespace) await log(run.id, 'whitespace: ' + str(s.niche.whitespace, 140), 'ok');
  await save(run, { synthesis, stage: 'generate', cost: { ...setCost(run, 'synthesis', addCost(null, res)), timings: markTiming(run, 'synthesize') } });
}

/* ---------------- 5. generate: 3 variants, 3 angles ---------------- */

export function brandBrief(run) {
  const b = run.brand || {};
  return {
    name: b.name, sells: b.sells, price_point: b.price_point, price_band: b.price_band, tone_of_voice: b.tone_of_voice,
    voice_traits: b.voice_traits, voice_sample: b.voice_sample, target_buyer: b.target_buyer, geography: b.geography,
    proof_points: b.proof_points, offers: b.offers,
  };
}

const CTAS = ['Shop now', 'Learn more', 'Sign up', 'Get offer', 'Order now', 'Subscribe', 'Book now', 'Get quote'];

// Meta hard limits; models can't count, so cut at the last word boundary that fits.
export function metaClip(s, n) {
  const t = str(s, 2000);
  if (t.length <= n) return t;
  const hard = t.slice(0, n);
  const cut = /\s/.test(t[n]) ? hard : hard.replace(/\s+\S*$/, ''); // drop a half-cut last word
  return (cut.length >= n * 0.6 ? cut : hard).replace(/[\s,;:—–-]+$/, '');
}

// ctx = claimContext(run); empty means no claim is allowed.
export function normalizeVariant(raw, ctx = '') {
  const clip = (s, n) => str(s, n);
  const { variant: v, flagged } = guardVariant(raw, ctx); // before clipping so a placeholder is never cut in half
  const cta = CTAS.find(c => c.toLowerCase() === String(v.cta || '').trim().toLowerCase()) || 'Shop now';
  return {
    claims_flagged: flagged,
    angle: String(v.angle || 'aspiration').toLowerCase(), hook_type: clip(v.hook_type, 40), format: clip(v.format || 'static image', 30),
    placement: clip(v.placement || 'IG feed', 20), overlay_text: clip(v.overlay_text, 60),
    primary_text: metaClip(v.primary_text, 300), headline: metaClip(v.headline, 40), description: metaClip(v.description, 30), cta,
    creative_direction: clip(v.creative_direction, 400),
    inspired_by: v.inspired_by && typeof v.inspired_by === 'object' ? { competitor: clip(v.inspired_by.competitor, 60), ad_id: clip(v.inspired_by.ad_id, 60), what_we_borrowed: clip(v.inspired_by.what_we_borrowed, 140) } : null,
    why_this_angle: clip(v.why_this_angle, 200),
    audience: clip(v.audience, 60) || null,
    // a stored position (a tweaked ad keeps where it was placed) wins over a fresh angle-based guess
    pos: v.position ? positionFor({ position: v.position }, String(v.angle) + String(v.headline)) : (v.pos && Number.isFinite(Number(v.pos.x)) && Number.isFinite(Number(v.pos.y)) ? v.pos : positionFor({ angle: String(v.angle || '').toLowerCase() }, String(v.angle) + String(v.headline))),
  };
}

async function stageGenerate(run) {
  const ads = await loadRunAds(run.id);
  const winners = ads.filter(a => a.analysis).sort((x, y) => y.weight - x.weight).slice(0, 8).map(a => ({
    id: a.id, competitor: a.competitor, days_running: a.days_running, variants: a.collation_count,
    hook: a.analysis.hook, angle: a.analysis.angle, format: a.analysis.format, structure: a.analysis.copy_structure,
    copy: str(a.body, 300), headline: a.headline, position: a.pos ? { x: Math.round(a.pos.x * 100) / 100, y: Math.round(a.pos.y * 100) / 100 } : undefined,
  }));
  const syn = run.synthesis || {};
  const target = (syn.audiences || []).find(a => a.name === syn.recommended_audience) || null;
  const captions = (await loadIgPosts(run.id)).filter(x => x.is_brand && x.caption).slice(0, 6).map(x => str(x.caption, 220));
  await log(run.id, 're-seasoning in ' + (run.brand.name || 'your') + '\'s voice' + (target ? ', aimed at ' + target.name : '') + '...');
  const ask = (extra, avoid) => claude({
    role: 'writer', purpose: 'generate-variants', maxTokens: 2600, system: GENERATE_SYSTEM, temperature: 0.8, avoid,
    messages: [{ role: 'user', content:
      'FOUNDER BRAND PROFILE: ' + JSON.stringify(brandBrief(run)) +
      '\nAD GOAL: ' + run.input.goal +
      '\nFOUNDER SAYS (say / avoid): ' + (run.input.notes || 'nothing specific') +
      '\nCOMPETITOR READ: ' + JSON.stringify({ competitors: syn.competitors, niche: syn.niche }) +
      (target ? '\nTARGET AUDIENCE: ' + JSON.stringify({ name: target.name, who: target.who, need: target.need }) : '') +
      (captions.length ? '\nFOUNDER\'S OWN INSTAGRAM CAPTIONS (their real voice): ' + JSON.stringify(captions) : '') +
      '\nWINNING COMPETITOR ADS (by longevity weight): ' + JSON.stringify(winners) + (extra || '') }],
  });
  // Models answer in slightly different shapes ([..], {"variants": [..]}, {"ads": [..]}), sometimes with chatter around it.
  const variantsOf = (text) => {
    const j = extractJson(text);
    if (Array.isArray(j)) return j;
    if (j && typeof j === 'object') {
      const arr = j.variants || j.ads || j.results || j.result || Object.values(j).find(x => Array.isArray(x) && x.some(y => y && y.primary_text));
      if (Array.isArray(arr)) return arr;
      if (j.primary_text) return [j];
    }
    return [];
  };
  const src = { ...claimContext(run), grams: phraseSet((await loadRunAds(run.id, true)).flatMap(a => [a.body, a.headline])) };
  const distinct = (vs) => new Set(vs.map(v => v.angle)).size;
  let cost = null, vars = [], note = '';
  const used = [];
  // up to 3 tries, each on a model that has not just failed us; keep the best answer seen
  for (let attempt = 0; attempt < 3 && !(vars.length >= 3 && distinct(vars) >= 3); attempt++) {
    if (attempt) await log(run.id, vars.length ? 'two variants tasted the same, spitting one back out...' : 'that came back unreadable, trying another model...', 'warn');
    const fix = attempt ? '\n\nIMPORTANT: ' + (vars.length ? 'your last answer had ' + vars.length + ' variants with ' + distinct(vars) + ' distinct angles. ' : 'your last answer could not be read. ') + 'Return ONLY a JSON array of exactly 3 objects with 3 DIFFERENT angles, no other text.' + note : '';
    const res = await ask(fix, used);
    cost = addCost(cost, res); used.push(res.model);
    const got = variantsOf(res.text).map(x => normalizeVariant(x, src));
    if (!got.length) note = ' (the previous reply began: ' + str(res.text, 80).replace(/\s+/g, ' ') + ')';
    if (got.length > vars.length || (got.length === vars.length && distinct(got) > distinct(vars))) vars = got;
  }
  if (!vars.length) await log(run.id, 'no model gave a usable answer (' + used.join(', ') + ')', 'warn');
  vars = clearOfRivals(vars.slice(0, 3), ads.filter(a => a.pos).map(a => a.pos));
  if (vars.some(v => v.pos && v.pos.adjusted)) await log(run.id, 'moved ' + vars.filter(v => v.pos.adjusted).length + ' ad(s) on the map so none sits on top of a rival ad');
  if (!vars.length) throw new Error('Generation came back empty (' + used.join(', ') + ')');
  await db.query('DELETE FROM variant_images WHERE run_id = $1', [run.id]); // new ads: the old painted images no longer match
  for (let i = 0; i < vars.length; i++) {
    await db.query(
      `INSERT INTO variants (run_id, idx, data) VALUES ($1,$2,$3) ON CONFLICT (run_id, idx) DO UPDATE SET data = EXCLUDED.data, version = 1, history = '[]'::jsonb, updated_at = now()`,
      [run.id, i, JSON.stringify(vars[i])]);
  }
  const swapped = vars.filter(v => v.claims_flagged.length).length;
  if (swapped) await log(run.id, 'swapped unsupported claims for placeholders in ' + swapped + ' variant(s): ' + [...new Set(vars.flatMap(v => v.claims_flagged))].join(', '), 'warn');
  await log(run.id, 'fresh out: ' + vars.map(v => v.angle).join(' / '), 'ok');
  await save(run, {
    stage: 'done', status: 'done', finished_at: new Date().toISOString(),
    cost: { ...setCost(run, 'generation', cost), timings: markTiming(run, 'generate') },
  });
}

/* ---------------- driver ---------------- */

const HANDLERS = { brand: stageBrand, pull: stagePull, analyze: stageAnalyze, synthesize: stageSynthesize, generate: stageGenerate };

export async function advance(runId) {
  const { rows } = await db.query(
    `UPDATE runs SET lock_until = now() + interval '58 seconds' WHERE id = $1 AND status = 'running'
     AND (lock_until IS NULL OR lock_until < now()) RETURNING *`, [runId]);
  if (!rows.length) {
    const { rows: cur } = await db.query('SELECT stage, status FROM runs WHERE id = $1', [runId]);
    if (!cur.length) return { busy: false, status: 'error', error: 'no such run' };
    return cur[0].status === 'running' ? { busy: true } : { busy: false, stage: cur[0].stage, status: cur[0].status };
  }
  const run = rows[0];
  const stageBefore = run.stage;
  try {
    const h = HANDLERS[run.stage];
    if (h) await h(run);
  } catch (e) {
    const msg = str(e && e.message, 300);
    if (e && e.code === 'ai_setup') {
      await log(run.id, msg, 'error');
      await save(run, { status: 'error', error: msg });
    } else {
      const meta = (run.cost && run.cost.meta) || {};
      const fails = (meta['fail_' + stageBefore] || 0) + 1;
      await log(run.id, 'hiccup while ' + stageBefore + ': ' + msg + (fails < 3 ? ' (retrying)' : ''), fails < 3 ? 'warn' : 'error');
      const fields = { cost: { ...(run.cost || {}), meta: { ...meta, ['fail_' + stageBefore]: fails } } };
      if (fails >= 3) { fields.status = 'error'; fields.error = 'Stuck at ' + stageBefore + ': ' + msg; }
      await save(run, fields);
    }
  } finally {
    await db.query('UPDATE runs SET lock_until = NULL WHERE id = $1', [run.id]);
  }
  return { busy: false, stage: run.stage, status: run.status };
}

export async function progressOf(run) {
  const base = { brand: 4, pull: 14, analyze: 40, synthesize: 72, generate: 86, done: 100 }[run.stage] || 0;
  if (run.stage === 'pull' && run.apify && run.apify.startedAt) {
    return Math.min(38, base + Math.round((Date.now() - run.apify.startedAt) / 4000));
  }
  if (run.stage === 'analyze') {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT ${UNREAD})::int AS done FROM run_ads ra LEFT JOIN ad_analyses an ON an.ad_id = ra.ad_id WHERE ra.run_id = $1`, [run.id]);
    const t = rows[0].total || 1;
    return Math.round(40 + 30 * rows[0].done / t);
  }
  return base;
}