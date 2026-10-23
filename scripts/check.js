// node scripts/check.js — fails if the Meta copy limits stop being enforced.
import assert from 'node:assert';
import { metaClip, normalizeVariant } from '../lib/pipeline.js';
assert.equal(metaClip('Stable. Affordable. No orange tears.', 30), 'Stable. Affordable. No orange');
assert.equal(metaClip('Quick quiz. Honest match. ₹799.', 30), 'Quick quiz. Honest match.');
assert.equal(metaClip('short', 30), 'short');
assert.equal(metaClip('x'.repeat(50), 30).length, 30);
const v = normalizeVariant({ primary_text: 'word '.repeat(80), headline: 'h', description: 'Match your behaviour. Not the hype.', cta: 'learn more' });
assert.ok(v.primary_text.length <= 300 && !v.primary_text.endsWith(' '));
assert.equal(v.cta, 'Learn more');
assert.equal(normalizeVariant({ cta: 'Buy it' }).cta, 'Shop now');
console.log('ok');

// ---- claims guardrail (MVP-SPEC 9.6) ----
import { guardVariant, claimSource } from '../lib/claims.js';
const g = (text, source = '') => guardVariant({ primary_text: text }, source);

// the two lines a live run actually produced
let r = g('Clinically proven ingredients, dermatologically tested and suitable for sensitive skin.');
assert.ok(!/clinically proven|dermatologically tested/i.test(r.variant.primary_text), r.variant.primary_text);
assert.ok(r.flagged.includes('clinical'));
r = g('I built Kaya Glow after struggling with my own dark spots. It is a daily ritual.');
assert.ok(r.variant.primary_text.startsWith('[founder story]') && r.variant.primary_text.includes('daily ritual'), r.variant.primary_text);

// numbers, ratings, prices the founder never gave
assert.ok(g('Rated 4.8★ by 2,000+ customers').flagged.length >= 2);
assert.equal(g('Save 30% today').variant.primary_text, 'Save [N]% today');
assert.equal(g('Only ₹999').variant.primary_text, 'Only [price]');
assert.ok(g('The #1 serum, guaranteed').flagged.includes('superlative'));

// supplied by the founder: left alone
assert.equal(g('Save 30% today', '30% off launch week').variant.primary_text, 'Save 30% today');
assert.equal(g('Only ₹799', 'vitamin c serum, rs 799').variant.primary_text, 'Only ₹799');
assert.equal(g('Dermatologically tested', 'dermatologically tested, cruelty-free').flagged.length, 0);

// placeholders and plain copy pass untouched
assert.equal(g('Loved by [4.8★ from N reviews] customers').flagged.length, 0);
assert.equal(g('Glow starts here. Brighten dull skin.').flagged.length, 0);

// every field is scanned, not just primary text
assert.ok(guardVariant({ creative_direction: 'Add a "Dermatologically tested" callout' }).flagged.includes('clinical'));

// a web-search guess is not evidence; the real site is
const brand = { read_from: 'web search', proof_points: ['Dermatologically tested'] };
assert.ok(!claimSource({ input: {}, brand }).includes('dermatologically'));
assert.ok(claimSource({ input: {}, brand: { ...brand, read_from: 'website' } }).includes('dermatologically'));

// through the real normalizer: claims swapped first, then limits applied
const nv = normalizeVariant({ primary_text: 'Clinically proven. ' + 'word '.repeat(80), headline: 'Rated 4.8★', description: 'x', cta: 'Shop now' });
assert.ok(nv.claims_flagged.length && nv.primary_text.length <= 300 && !/clinically/i.test(nv.primary_text));
// ---- invented offers ----
import { claimContext } from '../lib/claims.js';
r = g('Every order includes free mini samples, and orders above ₹999 ship free.', 'vitamin c serum, rs 799');
assert.ok(!/free mini samples|ship free/i.test(r.variant.primary_text), r.variant.primary_text);
assert.ok(r.flagged.includes('offer') && r.flagged.includes('price'), r.flagged.join());
for (const t of ['Free shipping on every order', 'Get a free gift today', 'Buy 1 get 1', 'Easy returns, cash on delivery'])
  assert.ok(g(t).flagged.includes('offer'), t);
assert.equal(g('Free shipping on every order', 'free shipping above rs 499').flagged.length, 0); // founder announced it
assert.equal(g('Freshly made, shipped fast.').flagged.length, 0);

// ---- first-person voice nobody supplied ----
for (const t of ['I vet Korean skincare for Indian humidity.', 'I simplify K-beauty into three steps.', "I've tried everything.", "Here is why I'm obsessed.", 'Meet the brands I personally curate.'])
  assert.ok(g(t).flagged.includes('founder story'), t);
assert.equal(g('I vet Korean skincare. Skin first.').variant.primary_text, '[founder story] Skin first.');
assert.equal(g('Vitamin C that works. Ideal for IG reels, ID check not needed.').flagged.length, 0); // "I" inside words is not a person
assert.equal(g('I vet Korean skincare.', 'i vet korean skincare').flagged.length, 0); // founder wrote it

// ---- third-party brand names ----
r = g('Meet authentic Korean brands like COSRX, Beauty of Joseon and Anua.');
assert.equal(r.variant.primary_text, 'Meet authentic Korean brands like [brand names].', r.variant.primary_text);
assert.equal(g('Meet authentic brands like COSRX, Beauty of Joseon and Anua.', 'we stock cosrx, beauty of joseon and anua').flagged.length, 0);
assert.equal(g('Delivered to cities like Mumbai, Delhi and Pune.').flagged.length, 0);
assert.equal(g('Sourced from Korea, Japan and India.').flagged.length, 0);
assert.equal(g('Made with Vitamin C, Niacinamide and Ceramides.').flagged.length, 0); // no cue word, so an ingredient list is left alone
const ctx = { source: 'vitamin c serum', banned: ['Minimalist'] };
r = guardVariant({ primary_text: "Better than Minimalist's serums. Gel texture." }, ctx);
assert.ok(!/minimalist/i.test(r.variant.primary_text) && r.flagged.includes('competitor name'), r.variant.primary_text);

// ---- the run context: competitors banned, own brand name allowed ----
const cc = claimContext({ input: { notes: 'rs 799', brand: { name: 'Kaya Glow' }, competitors: [{ name: 'Minimalist' }, { name: 'Zed' }] }, brand: { name: 'Kaya Glow', read_from: 'web search' } });
assert.deepEqual(cc.banned, ['Minimalist']);
assert.ok(cc.source.includes('kaya glow') && cc.source.includes('rs 799'));
assert.equal(guardVariant({ headline: 'Kaya Glow, Kaya Glow and Kaya Glow' }, cc).flagged.length, 0);

// ---- last live run's real output, end to end ----
const live = normalizeVariant({
  primary_text: 'Meet the authentic Korean brands I personally curate: COSRX, Beauty of Joseon and Anua.',
  headline: 'Skincare Vetted For India', description: 'Authentic K-beauty, wrapped', cta: 'Shop now',
  creative_direction: 'Add simple text callouts for authentic Korean brands.',
}, cc);
assert.equal(live.primary_text, '[founder story]');
const live2 = normalizeVariant({
  primary_text: 'Looking for a gift? Every order includes free mini samples, and orders above ₹999 ship free.',
  headline: 'The Gift Glowers Will Love', description: 'x', cta: 'Shop now',
}, cc);
assert.ok(!/free mini samples|ship free|999/.test(live2.primary_text) && live2.claims_flagged.includes('offer'), live2.primary_text);

// ---- authority claims that slipped through a live run ----
for (const t of ['Top skin experts agree: radiance starts deeper.', 'Backed By Skin Experts', 'Highlight dermatological backing', 'Doctors recommend it daily'])
  assert.ok(g(t).flagged.includes('expert claim'), t);
assert.equal(g('Top skin experts agree', 'top skin experts agree').flagged.length, 0); // the site said it

// ---- competitor wording: the Same-Claim Trap ----
import { phraseSet } from '../lib/claims.js';
const rival = phraseSet(['Glow like never before with active ingredients.', 'Say goodbye to dull, dry skin instantly!']);
const ctxR = { source: '', banned: [], grams: rival };
r = guardVariant({ primary_text: 'Meet Kaya. Glow like never before with active ingredients, every single day.' }, ctxR);
assert.equal(r.variant.primary_text, 'Meet Kaya. [your own line]', r.variant.primary_text);
assert.ok(r.flagged.includes('competitor wording'));
assert.equal(guardVariant({ primary_text: 'Glow like never before.' }, ctxR).flagged.length, 0); // under 6 shared words is the same idea, not the same line
assert.equal(guardVariant({ primary_text: 'Skin that holds its glow all day.' }, ctxR).flagged.length, 0);
assert.equal(guardVariant({ primary_text: 'Say goodbye to dull, dry skin instantly' }, { ...ctxR, source: 'say goodbye to dull, dry skin instantly' }).flagged.length, 0); // founder's own words win
assert.equal(phraseSet(['one two']).size, 0);

// ---- rivals: a named competitor is matched to ITS page or reported missing, never swapped for another brand ----
import { assignToCompetitors, pageScore } from '../lib/apify.js';
const ad = (n, pid, pname, uri, link) => ({ ad_archive_id: String(n), page_id: pid, page_name: pname, snapshot: { page_profile_uri: uri || '', link_url: link || '', body: { text: 'b' + n }, images: [{ original_image_url: 'https://x/' + n + '.jpg' }] } });
const pool = [
  ...[1, 2, 3].map(n => ad(n, 'p1', 'Dot & Key', 'https://www.facebook.com/dotandkey')),
  ...[4, 5].map(n => ad(n, 'p3', 'Dr Sheths', 'https://www.facebook.com/drsheths')),
  ...[10, 11, 12, 13, 14, 15, 16, 17].map(n => ad(n, 'p9', 'Cheap Reseller Hub', 'https://www.facebook.com/resellerhub')), // dominates the search results
  ...[20, 21].map(n => ad(n, 'p5', 'Plum Goodness', 'https://www.facebook.com/plumgoodness')),
];
const rv = assignToCompetitors(pool, [{ name: 'Dot & Key' }, { name: "Dr. Sheth's" }, { name: 'Foxtale' }, { name: 'Plum' }, { name: 'DK', hint_ig: 'dotandkey' }, { name: 'Dot' }]);
assert.equal(rv['Dot & Key'].page_id, 'p1'); assert.equal(rv['Dot & Key'].ads.length, 3);
assert.equal(rv["Dr. Sheth's"].page_id, 'p3', 'punctuation does not hide a page');
assert.equal(rv['Foxtale'].resolution, 'not found'); assert.equal(rv['Foxtale'].ads.length, 0, 'the dominant look-alike is NOT used instead');
assert.ok(rv['Foxtale'].candidates.includes('Cheap Reseller Hub'), 'what the search did return is reported');
assert.equal(rv['Plum'].page_name, 'Plum Goodness', 'a short name finds the longer page');
assert.equal(rv['DK'].page_id, 'p1', 'an Instagram/website hint recognises the page when the name cannot');
assert.equal(rv['Dot'].resolution, 'not found', 'a 3-letter name is too weak to claim a page on its own');
assert.equal(pageScore({ page_name: 'Anything', page_uri: '' }, { name: '' }), 0);
// the website is the best evidence: the page whose ads LINK to the rival's site is the rival, whatever it is called
const web = [
  ...[30, 31, 32].map(n => ad(n, 'w1', 'Plum', 'https://www.facebook.com/plum', 'https://plumgoodness.com/products/' + n)),
  ...[40, 41].map(n => ad(n, 'w2', 'Totally Different Name', 'https://www.facebook.com/tdn', 'https://xyzbeauty.in/p/' + n)),
  ...[50, 51, 52, 53, 54].map(n => ad(n, 'w3', 'Cheap Reseller Hub', 'https://www.facebook.com/hub', 'https://reseller.example/' + n)),
];
const wr = assignToCompetitors(web, [{ name: 'Plum Goodness', site: 'plumgoodness.com' }, { name: 'Xyz Beauty', site: 'xyzbeauty.in' }, { name: 'Nope Brand', site: 'nopebrand.com' }]);
assert.equal(wr['Plum Goodness'].page_id, 'w1');
assert.equal(wr['Xyz Beauty'].page_id, 'w2', 'matched by where its ads link, not by what the page is called');
assert.equal(wr['Nope Brand'].resolution, 'not found', 'a wrong website guess fails safe');
assert.equal(wr['Nope Brand'].ads.length, 0);
assert.ok(!wr['Nope Brand'].candidates.includes('Plum') && !wr['Nope Brand'].candidates.includes('Totally Different Name'), 'rivals we did find are not listed as what the search "turned up"');

// ---- 22 Oct 2026 reports: "Apple" -> Samsung India matched to Rezoni (a phone-case seller), and a missing page ----
import { socialsFromHtml, linksTo, baseDomain, handleFits } from '../lib/rivals.js';
import { sourceUrlsFor } from '../lib/apify.js';
const mk = (n, pageName, pid, uri, link, src) => ({ ad_archive_id: String(n), page_name: pageName, page_id: pid, url: src, snapshot: { page_profile_uri: uri, link_url: link, images: [{ original_image_url: 'x' }] } });
const sam = [
  ...[1, 2, 3, 4, 5].map(n => mk(n, 'Rezoni', 'rz', 'https://www.facebook.com/rezoni/', 'https://rezoni.in/collections/samsung-cases', 'kw')),
  ...[6, 7].map(n => mk(n, 'Samsung', 'sam', 'https://www.facebook.com/SamsungIndia/', 'https://www.samsung.com/in/smartphones/x', 'kw')),
  ...[8, 9, 10].map(n => mk(n, 'Sirphire', 'sp', 'https://www.facebook.com/sirphire/', 'https://sirphire.com/oneplus-cases', 'kw')),
];
const sm = assignToCompetitors(sam, [{ name: 'Samsung India', site: 'samsung.com', hint_ig: 'samsungindia' }]);
assert.equal(sm['Samsung India'].page_id, 'sam', 'the real Samsung page beats a case seller whose URL merely says "samsung"');
assert.equal(assignToCompetitors(sam, [{ name: 'OnePlus', site: 'oneplus.in', hint_ig: 'oneplus_in' }])['OnePlus'].resolution, 'not found', 'a reseller of OnePlus cases is not OnePlus');
assert.ok(!linksTo('https://rezoni.in/collections/samsung-cases', 'samsung.com') && linksTo('https://shop.samsung.com/in/x', 'samsung.com'), 'links match on host, not path');
assert.equal(baseDomain('in.nothing.tech'), 'nothing.tech');
// a rival's own Facebook page link is exact: its ads win with no name guessing, even when a namesake is louder
const fbItems = [
  ...[1, 2, 3, 4, 5, 6].map(n => mk(n, 'Nothing Bar & Kitchen', 'bar', 'https://www.facebook.com/nothingbar/', 'https://nothingbar.in/menu', 'kw')),
  ...[7, 8].map(n => mk(n, 'Nothing', 'nt', 'https://www.facebook.com/nothing/', 'https://nothing.tech/x', 'https://www.facebook.com/nothing')),
];
const nf = assignToCompetitors(fbItems, [{ name: 'Nothing', site: 'nothing.tech', fb: 'nothing' }]);
assert.equal(nf['Nothing'].page_id, 'nt');
assert.equal(nf['Nothing'].via, 'facebook page');
// no Facebook page known: a namesake with no tie to the rival's site loses to the page whose ads link to it
const ns = assignToCompetitors([...fbItems.slice(0, 6), ...[7, 8, 9].map(n => mk(n, 'Nothing Technology', 'nt2', 'https://www.facebook.com/nothingtech/', 'https://nothing.tech/p' + n, 'kw'))], [{ name: 'Nothing', site: 'nothing.tech' }]);
assert.equal(ns['Nothing'].page_id, 'nt2', 'ads linking to the rival site decide between namesakes');
// one page wins: lookalikes are never merged
assert.ok(sm['Samsung India'].ads.every(a => a.page_id === 'sam'));
// search sources: their page link first, then their website; a name alone only when nothing else is known
assert.match(sourceUrlsFor({ name: 'Samsung India', site: 'samsung.com', fb: 'SamsungIndia' }, 'IN')[0], /facebook\.com\/SamsungIndia$/);
const zed = sourceUrlsFor({ name: 'Zed' }, 'IN');
assert.ok(zed.some(u => /q=Zed/.test(u)) && zed.length <= 5, 'a name-only rival is searched by name, plus a few page-name guesses');
assert.ok(!sourceUrlsFor({ name: 'Samsung India', site: 'samsung.com', fb: 'SamsungIndia' }, 'IN').some(u => /q=Samsung/.test(u)), 'no name search once its site is known');
assert.equal(sourceUrlsFor({ name: 'facebook.com/zed', input: 'https://facebook.com/zed', site: 'zed.in' }, 'IN').length, 1, 'a pasted page link is already exact');
// reading socials off a site
const html = '<a href="https://www.facebook.com/sharer/sharer.php?u=x">s</a><a href="https://www.facebook.com/SamsungIndia">f</a><a href="https://instagram.com/p/abc">p</a><a href="https://www.instagram.com/samsungindia/">i</a><a href="https://www.instagram.com/samsungindia">i2</a>';
const so = socialsFromHtml(html);
assert.deepEqual([so.fb, so.ig], ['SamsungIndia', 'samsungindia'], 'skips share links and posts');
assert.ok(!handleFits('invites', 'Snack Amor', 'snackamor.com') && handleFits('SamsungIndia', 'Samsung India', 'samsung.com'), 'a handle must resemble the brand');
// a brand's own Facebook link counts even when the page name differs from the brand (Fire-Boltt -> bolttsports); platform links never do
assert.equal(socialsFromHtml('<a href="https://www.facebook.com/bolttsports">f</a><a href="https://www.facebook.com/shopify">s</a>').fb, 'bolttsports');
assert.equal(socialsFromHtml('<a href="https://www.facebook.com/shopify">s</a>').fb, null, 'a platform link is not the brand');
// ---- 22 Oct 2026 edge runs: a new ad copied the position of the rival ad it borrowed from (distance 0) ----
import { clearOfRivals } from '../lib/util.js';
const rivalsAt = [{ x: -0.8, y: 0.2 }, { x: -0.7, y: 0.3 }, { x: 0.5, y: -0.6 }];
const cleared = clearOfRivals([{ angle: 'a', pos: { x: -0.8, y: 0.2 } }, { angle: 'b', pos: { x: -0.79, y: 0.21 } }, { angle: 'c', pos: { x: 0.9, y: 0.9 } }], rivalsAt);
const dmin = (p, others) => Math.min(...others.map(o => Math.hypot(p.x - o.x, p.y - o.y)));
assert.ok(cleared.every((v, i) => dmin(v.pos, [...rivalsAt, ...cleared.slice(0, i).map(c => c.pos)]) >= 0.3 - 1e-9), 'no new ad within 0.3 of a rival or of an earlier new ad');
assert.ok(cleared[0].pos.adjusted && cleared[1].pos.adjusted, 'moved ads are marked');
assert.ok(!cleared[2].pos.adjusted && cleared[2].pos.x === 0.9, 'an ad already in clear space is left alone');
assert.deepEqual(clearOfRivals([{ pos: { x: 0, y: 0 } }], []).map(v => v.pos), [{ x: 0, y: 0 }], 'no rivals, nothing to move');
// a tweak keeps where the ad was placed instead of falling back to an angle-based guess
const kept = normalizeVariant({ angle: 'humour', headline: 'h', primary_text: 'p', pos: { x: 0.61, y: -0.42, estimated: false, adjusted: true } }, {});
assert.deepEqual([kept.pos.x, kept.pos.y], [0.61, -0.42]);
console.log('rivals ok');

console.log('claims ok');
process.exit(0); // pipeline import opens the db
