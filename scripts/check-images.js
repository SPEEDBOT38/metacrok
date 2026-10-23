// scripts/check-images.js — ad image generation with stubbed Pexels and OpenRouter (no network, no cost).
import assert from 'node:assert/strict';
import { adPrompt, printableOverlay, headlineFor, toDataUrl, paintAd, pexelsSearch, pixabaySearch, stockSearch, stockName, ImageSetupError, DEFAULT_IMAGE_MODELS } from '../lib/images.js';

process.env.OPENROUTER_API_KEY = 'test-key';
const run = { input: { brand: { name: 'Acme' } }, brand: { name: 'Acme', sells: 'hand-block printed cotton sarees', tone_of_voice: 'calm, understated', voice_traits: ['elegant'], colour: '#8a2b3d', price_band: 'mid' } };
const v = { angle: 'education', audience: 'saree lovers', creative_direction: 'Folded saree on a wooden table in morning light.', overlay_text: 'Cotton that breathes' };

// text on the image: never a bracketed placeholder
assert.equal(printableOverlay(v), 'Cotton that breathes');
assert.equal(printableOverlay({ overlay_text: '[founder story]' }), '');
assert.equal(printableOverlay({ overlay_text: 'Grooming science explained simply ' + String.fromCodePoint(0x1F62E, 0x200D, 0x1F4A8) }), 'Grooming science explained simply', 'emoji are not painted');
assert.equal(printableOverlay({ overlay_text: String.fromCodePoint(0x1F525, 0x1F525) }), '');
assert.equal(printableOverlay({ overlay_text: 'x'.repeat(80) }), '');
const kit = { colors: { primary: '#DF2A27', secondary: '#FFF7EC', background: '#F9C3D2', text: '#4A2320' }, fonts: { heading: 'Bagel Fat One', body: 'Figtree' }, personality: { tone: 'playful', energy: 'high' } };
const product = { title: 'Red Velvet', images: ['https://cdn.example/rv.jpg'] };
const p = adPrompt(run, v, { kit, product, refs: { product: 2, logo: 1, brand: 1, mood: 1 } });
assert.match(p, /images 1 to 2 show the REAL product "Red Velvet"/, 'the real product photos are named first');
assert.match(p, /Do NOT redesign it, do NOT invent a different box/, 'never invent packaging');
assert.match(p, /image 3 is the brand's real logo/);
assert.match(p, /image 4 is from the brand's own Instagram/);
assert.match(p, /image 5 is a stock photo/);
assert.match(p, /primary #DF2A27, secondary #FFF7EC, background #F9C3D2, text #4A2320/, 'the exact brand palette in hex');
assert.match(p, /feels playful, high energy/);
assert.match(p, /no words, letters, numbers, logos or watermarks/, 'the painter never writes the headline: it is set afterwards in the brand font');
assert.match(p, /top 38% of the frame one calm, plain, completely empty backdrop \(no stripes, bands, props or horizon line\) in the brand colour #F9C3D2/);
assert.match(p, /do not show a recognisable face/);
assert.match(p, /Folded saree on a wooden table/);
assert.ok(!/Cotton that breathes/.test(p), 'headline text is not sent to the painter');
const bare = adPrompt(run, v, { kit: {}, product: null, refs: {} });
assert.match(bare, /no product photo is available[^]*NO brand name, logo or lettering/, 'no photo: forbid invented lettering');
assert.match(bare, /LOGO: use no logo or brand name anywhere/);
assert.ok(!/REAL product/.test(bare) && !/COLOURS/.test(bare), 'nothing claimed that we do not have');
// the headline: the on-image line, else the ad headline; never a placeholder or emoji
assert.equal(headlineFor(v), 'Cotton that breathes');
assert.equal(headlineFor({ overlay_text: '[N] customers', headline: 'Honest cotton' }), 'Honest cotton');
assert.equal(headlineFor({ overlay_text: '', headline: '[offer] sale' }), '');

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

// ---- brand kit: real colours, fonts and product photos from the brand's own site ----
import { buildKit, pickProduct, overlayColor, lum, shopifyProducts } from '../lib/brandkit.js';
process.env.FIRECRAWL_API_KEY = 'fc-test';
const route = async (url) => {
  if (/firecrawl/.test(url)) return { ok: true, status: 200, json: async () => ({ data: { branding: { colors: { primary: '#df2a27', secondary: '#fff7ec', background: '#F9C3D2', textPrimary: '#4A2320' }, fonts: [{ family: 'Bagel Fat One', role: 'heading' }, { family: 'Figtree', role: 'body' }], typography: { fontFamilies: { primary: 'Figtree', heading: 'Bagel Fat One' } }, images: { logo: 'https://cdn.example/logo.png' }, personality: { tone: 'playful', energy: 'high' } } } }) };
  if (/products\.json/.test(url)) return { ok: true, status: 200, json: async () => ({ products: [{ title: 'Red Velvet', handle: 'red-velvet', variants: [{ price: '250.00' }], images: [{ src: 'https://cdn/rv1.jpg' }, { src: 'https://cdn/rv2.jpg' }], body_html: '<p>Soft</p>' }, { title: 'Choco Chip', handle: 'choco-chip', images: [{ src: 'https://cdn/cc.jpg' }] }, { title: 'No photo', handle: 'x', images: [] }] }) };
  return { ok: false, status: 404, text: async () => '' };
};
const kitb = await buildKit({ input: { brand: { url: 'https://munchnco.myshopify.com/' } }, brand: {} }, { fetchImpl: route });
assert.deepEqual(kitb.fonts, { heading: 'Bagel Fat One', body: 'Figtree' });
assert.equal(kitb.colors.primary, '#DF2A27', 'hex is normalised');
assert.equal(kitb.logo, 'https://cdn.example/logo.png');
assert.deepEqual(kitb.products.map(x => x.title), ['Red Velvet', 'Choco Chip'], 'products with no photo are dropped');
assert.equal(kitb.products[0].price, '250.00'); assert.equal(kitb.products[0].images.length, 2);
assert.equal(pickProduct(kitb.products, { primary_text: 'Our choco chip box is moving fast' }, 0).title, 'Choco Chip', 'the ad names its product');
assert.equal(pickProduct(kitb.products, { primary_text: 'gift boxes' }, 1).title, 'Choco Chip', 'otherwise rotate so the three ads differ');
assert.equal(pickProduct([], {}, 0), null);
assert.equal(overlayColor(kitb), '#4A2320', 'dark text on the brand\'s light pink');
assert.equal(overlayColor({ colors: { background: '#000000', text: '#FFFFFF' } }), '#FFFFFF', 'light text on a dark brand');
assert.ok(lum('#000000') < 0.01 && lum('#FFFFFF') > 0.99);
assert.deepEqual(await shopifyProducts('not a url'), []);

console.log('images ok');
process.exit(0);
