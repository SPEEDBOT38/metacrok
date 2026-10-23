// scripts/check-images.js — ad image generation with stubbed Pexels and OpenRouter (no network, no cost).
import assert from 'node:assert/strict';
import { adPrompt, printableOverlay, toDataUrl, paintAd, pexelsSearch, pixabaySearch, stockSearch, stockName, ImageSetupError, DEFAULT_IMAGE_MODELS } from '../lib/images.js';

process.env.OPENROUTER_API_KEY = 'test-key';
const run = { input: { brand: { name: 'Acme' } }, brand: { name: 'Acme', sells: 'hand-block printed cotton sarees', tone_of_voice: 'calm, understated', voice_traits: ['elegant'], colour: '#8a2b3d', price_band: 'mid' } };
const v = { angle: 'education', audience: 'saree lovers', creative_direction: 'Folded saree on a wooden table in morning light.', overlay_text: 'Cotton that breathes' };

// text on the image: never a bracketed placeholder
assert.equal(printableOverlay(v), 'Cotton that breathes');
assert.equal(printableOverlay({ overlay_text: '[founder story]' }), '');
assert.equal(printableOverlay({ overlay_text: 'Grooming science explained simply ' + String.fromCodePoint(0x1F62E, 0x200D, 0x1F4A8) }), 'Grooming science explained simply', 'emoji are not painted');
assert.equal(printableOverlay({ overlay_text: String.fromCodePoint(0x1F525, 0x1F525) }), '');
assert.equal(printableOverlay({ overlay_text: 'x'.repeat(80) }), '');
const p = adPrompt(run, v, { brandRefs: 2, inspoRefs: 3 });
assert.match(p, /Cotton that breathes/);
assert.match(p, /Folded saree on a wooden table/);
assert.match(p, /first 2 attached image\(s\) are the BRAND'S OWN posts/);
assert.match(p, /3 attached image\(s\) are stock-photo INSPIRATION/);
assert.match(p, /#8a2b3d/);
assert.match(adPrompt(run, { ...v, overlay_text: '[N] customers' }, {}), /no words, letters, numbers or logos/, 'a placeholder is never painted');
assert.ok(!/BRAND'S OWN posts/.test(adPrompt(run, v, {})), 'no brand refs, no claim about them');

// models: Google only, newest Nano Banana first
assert.ok(DEFAULT_IMAGE_MODELS.every(m => m.startsWith('google/')) && /nano-banana/.test(DEFAULT_IMAGE_MODELS[0]));

// paintAd: pinned to Google, asks for an image, falls through an empty reply to the next model
const png = 'data:image/png;base64,' + Buffer.from('fakepng').toString('base64');
const calls = [];
const stub = (replies) => async (url, opts) => {
  const body = JSON.parse(opts.body); calls.push(body);
  const r = replies.shift();
  return { status: r.status, text: async () => JSON.stringify(r.json) };
};
calls.length = 0;
const ok = await paintAd({
  prompt: 'x', refs: ['data:image/jpeg;base64,AAAA'],
  fetchImpl: stub([{ status: 200, json: { choices: [{ message: { content: 'sorry', images: [] } }] } }, { status: 200, json: { choices: [{ message: { images: [{ image_url: { url: png } }] } }], usage: { cost: 0.031, prompt_tokens: 300, completion_tokens: 1290 } } }]),
});
assert.equal(calls.length, 2, 'an empty first reply moves to the next model');
assert.notEqual(calls[0].model, calls[1].model);
assert.equal(ok.tried.length, 1, 'the model that gave no image is recorded');
assert.deepEqual(calls[0].provider, { only: ['google-vertex', 'google-ai-studio'], allow_fallbacks: false }, 'pinned to Google infrastructure');
assert.deepEqual(calls[0].modalities, ['image', 'text']);
assert.equal(calls[0].messages[0].content[1].type, 'image_url', 'reference images are sent');
assert.equal(ok.mime, 'image/png');
assert.equal(Buffer.from(ok.data, 'base64').toString(), 'fakepng');
assert.equal(ok.usd, 0.031);
// BYOK: cost reads 0, the real cost is upstream
const byok = await paintAd({ prompt: 'x', fetchImpl: stub([{ status: 200, json: { choices: [{ message: { images: [{ image_url: { url: png } }] } }], usage: { cost: 0, is_byok: true, cost_details: { upstream_inference_cost: 0.0123 } } } }]) });
assert.equal(byok.usd, 0.0123);
// no credits: stop, say so
await assert.rejects(paintAd({ prompt: 'x', fetchImpl: stub([{ status: 402, json: { error: { message: 'no credits' } } }]) }), (e) => e instanceof ImageSetupError && /credits/.test(e.message));
// every model fails: an error that says what happened
await assert.rejects(paintAd({ prompt: 'x', fetchImpl: stub([1, 2, 3, 4].map(() => ({ status: 200, json: { choices: [{ message: { content: "no" } }] } }))) }), /gave no image/);

// stock downloads: a 429 is retried, then given up on quietly (the ad is still painted)
let hits = 0;
const flaky = async () => (++hits < 3 ? { status: 429, ok: false } : { status: 200, ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new Uint8Array(900).buffer });
const got = await toDataUrl('https://x/y.jpg', { fetchImpl: flaky, sleepMs: async () => {} });
assert.ok(got && got.startsWith('data:image/jpeg;base64,') && hits === 3, 'two 429s, then success');
hits = -9;
assert.equal(await toDataUrl('https://x/y.jpg', { fetchImpl: async () => ({ status: 429, ok: false }), sleepMs: async () => {} }), null, 'still throttled: give up, no throw');

// Pexels: needs a key, maps the fields we credit
delete process.env.PEXELS_API_KEY;
assert.deepEqual(await pexelsSearch('saree', { fetchImpl: async () => { throw new Error('no call without a key'); } }), []);
process.env.PEXELS_API_KEY = 'pk';
let seen = null;
const photos = await pexelsSearch('soft morning light', { n: 2, fetchImpl: async (url, o) => { seen = { url, auth: o.headers.authorization }; return { ok: true, json: async () => ({ photos: [{ id: 7, url: 'https://www.pexels.com/photo/7/', photographer: 'Ann', photographer_url: 'https://www.pexels.com/@ann', src: { large: 'https://images.pexels.com/7.jpg' }, alt: 'light' }, { id: 8, src: {} }] }) }; } });
assert.equal(seen.auth, 'pk');
assert.match(seen.url, /query=soft%20morning%20light&per_page=2&orientation=square/);
assert.deepEqual(photos.map(x => [x.id, x.photographer, x.src]), [[7, 'Ann', 'https://images.pexels.com/7.jpg']], 'photos with no image are dropped; photographers are kept for the credit');

// Pixabay is the default stock source; credits link to the photographer
delete process.env.PEXELS_API_KEY; delete process.env.PIXABAY_API_KEY;
assert.deepEqual(await pixabaySearch('saree', { fetchImpl: async () => { throw new Error('no call without a key'); } }), []);
assert.equal(stockName(), null);
process.env.PIXABAY_API_KEY = 'pbk'; process.env.PEXELS_API_KEY = 'pk';
assert.equal(stockName(), 'Pixabay', 'Pixabay wins when both keys are set');
let pburl = null;
const pix = await stockSearch('folded saree table', { n: 2, fetchImpl: async (url) => { pburl = url; return { ok: true, json: async () => ({ hits: [{ id: 5, pageURL: 'https://pixabay.com/photos/x-5/', user: 'Bea', user_id: 99, webformatURL: 'https://pixabay.com/get/5_640.jpg', tags: 'saree, cloth' }, { id: 6, pageURL: 'p' }, { id: 7, pageURL: 'p7', user: 'Cy', user_id: 1, webformatURL: 'https://pixabay.com/get/7.jpg' }] }) }; } });
assert.match(pburl, /pixabay\.com\/api\/\?key=pbk&q=folded%20saree%20table&image_type=photo&safesearch=true/);
assert.deepEqual(pix.map(x => [x.id, x.photographer, x.source, x.photographer_url]), [['pb5', 'Bea', 'Pixabay', 'https://pixabay.com/users/Bea-99/']], 'n caps the list, photos with no image are dropped');
console.log('images ok');
process.exit(0);
