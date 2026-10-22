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
console.log('claims ok');
process.exit(0); // pipeline import opens the db
