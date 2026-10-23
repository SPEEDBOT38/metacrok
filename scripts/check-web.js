// scripts/check-web.js — Firecrawl layer and the rescue helpers, with stubbed network (no cost).
import assert from 'node:assert/strict';
import { pickBrandSite, webSearch, scrapeLinks, hasFirecrawl, findBrandSite } from '../lib/web.js';
import { pagesOf } from '../lib/apify.js';
import { socialsFromHtml } from '../lib/rivals.js';

// the real search results behind the Munch & Co failure (23 Oct 2026): "The Cookie Co." is thecookie-co.com, not the guessed thecookieco.in
const results = [
  { url: 'https://culturedcookieco.com/', title: 'Cultured Cookie Co' },
  { url: 'https://www.instagram.com/thecookiecoindia/?hl=en', title: 'The Cookie Co. (@thecookiecoindia) • Instagram photos and videos' },
  { url: 'https://www.zomato.com/vadodara/the-cookie-co', title: 'The Cookie Co - Zomato' },
  { url: 'https://thecookie-co.com/?srsltid=AYCX9v', title: 'The Cookie Co | Freshly Baked Cookies' },
  { url: 'https://www.instagram.com/sweetishhousemafia/', title: 'Sweetish House Mafia' },
];
const p = pickBrandSite('The Cookie Co.', results);
assert.equal(p.site, 'thecookie-co.com', 'the exact name in the address beats a lookalike and skips Zomato');
assert.equal(p.ig, 'thecookiecoindia');
assert.deepEqual(pickBrandSite('House of Cookies', results), { site: null, ig: null }, 'no site carries the name: say so, do not guess');
assert.equal(pickBrandSite('Nothing', [{ url: 'https://in.nothing.tech/', title: 'Nothing | IN' }]).site, 'in.nothing.tech');
assert.equal(pickBrandSite('Zed Beauty', [{ url: 'https://www.amazon.in/zed', title: 'Zed Beauty' }, { url: 'https://www.facebook.com/zed', title: 'Zed' }]).site, null, 'marketplaces and social pages are never the brand site');
assert.equal(pickBrandSite('Cookie', [{ url: 'https://cookiecartel.in', title: 'Cookie Cartel' }]).site, 'cookiecartel.in', 'a one-word name still matches when it is in the address');
assert.equal(pickBrandSite('Dot & Key', [{ url: 'https://www.dotandkey.com/', title: 'Dot & Key' }]).site, 'dotandkey.com');

// Firecrawl: off without a key, parses both response shapes, never throws on a throttled call
delete process.env.FIRECRAWL_API_KEY;
assert.equal(hasFirecrawl(), false);
assert.deepEqual(await webSearch('x', { fetchImpl: async () => { throw new Error('no call without a key'); } }), []);
assert.deepEqual(await findBrandSite('X'), { site: null, ig: null });
process.env.FIRECRAWL_API_KEY = 'fc-test';
const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });
let seen = null;
const viaWeb = await webSearch('best cookies India', { limit: 3, fetchImpl: async (u, o) => { seen = { u, auth: o.headers.authorization, body: JSON.parse(o.body) }; return { ok: true, status: 200, json: async () => ({ success: true, data: { web: [{ url: 'https://a.in', title: 'A', description: 'd' }, { title: 'no url' }] } }) }; } });
assert.deepEqual(viaWeb.map(x => x.url), ['https://a.in']);
assert.equal(seen.auth, 'Bearer fc-test'); assert.match(seen.u, /\/v2\/search$/); assert.equal(seen.body.limit, 3);
assert.equal((await webSearch('q', { fetchImpl: ok({ data: [{ url: 'https://b.in', title: 'B' }] }) }))[0].url, 'https://b.in', 'the older array shape works too');
await assert.rejects(webSearch('q', { fetchImpl: async () => ({ ok: false, status: 402, json: async () => ({}) }) }), /out of credits/);
const sc = await scrapeLinks('https://vivobarefoot.com', { fetchImpl: ok({ data: { links: ['https://www.facebook.com/vivobarefoot', 'https://instagram.com/vivobarefoot'], metadata: { title: 'Vivobarefoot', description: 'Barefoot shoes' } } }) });
assert.deepEqual(socialsFromHtml(sc.links.map(l => '"' + l + '"').join(' ')), { fb: 'vivobarefoot', ig: 'vivobarefoot' }, 'social links come out of a scraped link list');

// market fallback: the busiest advertiser pages behind a keyword search
const mk = (n, pg, id) => ({ ad_archive_id: String(n), page_id: id, page_name: pg, snapshot: { page_profile_uri: 'https://www.facebook.com/' + id, link_url: 'https://' + pg + '.in/p', images: [{ original_image_url: 'x' }] } });
const pages = pagesOf([...[1, 2, 3].map(n => mk(n, 'small', 's1')), ...[4, 5, 6, 7, 8].map(n => mk(n, 'big', 'b1')), mk(9, 'tiny', 't1')]);
assert.deepEqual(pages.map(x => [x.page_name, x.ads.length]), [['big', 5], ['small', 3], ['tiny', 1]], 'busiest page first');

console.log('web ok');
process.exit(0);
