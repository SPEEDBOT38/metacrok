// lib/images.js — ad images: Pexels for inspiration, Google's Nano Banana (via OpenRouter) to paint the ad.
// Same house rules as lib/claude.js: Google models only, pinned to Google's own infrastructure, key from the env.
//   PIXABAY_API_KEY           free key from pixabay.com/api/docs (inspiration photos)
//   PEXELS_API_KEY            optional alternative (pexels.com/api). With neither key we paint from the brand alone
//   OPENROUTER_IMAGE_MODELS   comma list, cheapest/newest Nano Banana first
import { claude, extractJson, addCost } from './claude.js';
import { str } from './util.js';

const BASE = 'https://openrouter.ai/api/v1';
const GOOGLE = { only: ['google-vertex', 'google-ai-studio'], allow_fallbacks: false };
// checked live 2026-10-23 against GET /api/v1/models: all output image+text
// ordered by real cost per 1K image (output tokens: $30/M for the first three, $60/M for 3.1 flash); a model your OpenRouter guardrails block fails instantly and free, so it just falls through
export const DEFAULT_IMAGE_MODELS = ['google/gemini-nano-banana-2.1', 'google/gemini-3.1-flash-lite-image', 'google/gemini-2.5-flash-image', 'google/gemini-3.1-flash-image'];
const models = () => { const l = (process.env.OPENROUTER_IMAGE_MODELS || '').split(',').map(s => s.trim()).filter(Boolean); return l.length ? l : DEFAULT_IMAGE_MODELS; };

export const hasPexels = () => !!(process.env.PEXELS_API_KEY || '').trim();

/* ---------------- Pexels: inspiration photos ---------------- */

export async function pexelsSearch(query, { n = 3, fetchImpl = fetch } = {}) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key || !query) return [];
  const url = 'https://api.pexels.com/v1/search?query=' + encodeURIComponent(query) + '&per_page=' + n + '&orientation=square&size=medium';
  const r = await fetchImpl(url, { headers: { authorization: key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Pexels ' + r.status);
  const j = await r.json();
  return (j.photos || []).map(p => ({
    id: p.id, page: p.url, photographer: p.photographer, photographer_url: p.photographer_url,
    src: (p.src && (p.src.large || p.src.medium)) || null, alt: str(p.alt, 100),
  })).filter(p => p.src);
}

/* ---------------- stock photos for inspiration: Pixabay first, Pexels if that is the key we have ---------------- */

export const hasPixabay = () => !!(process.env.PIXABAY_API_KEY || '').trim();
export const hasStock = () => hasPixabay() || hasPexels();
export const stockName = () => (hasPixabay() ? 'Pixabay' : hasPexels() ? 'Pexels' : null);

export async function pixabaySearch(query, { n = 3, fetchImpl = fetch } = {}) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  if (!key || !query) return [];
  const url = 'https://pixabay.com/api/?key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(query) + '&image_type=photo&safesearch=true&order=popular&per_page=' + Math.max(3, n);
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('Pixabay ' + r.status);
  const j = await r.json();
  return (j.hits || []).slice(0, n).map(p => ({
    id: 'pb' + p.id, page: p.pageURL, photographer: p.user, photographer_url: p.user && p.user_id ? 'https://pixabay.com/users/' + p.user + '-' + p.user_id + '/' : p.pageURL,
    src: p.webformatURL || p.largeImageURL, alt: str(p.tags, 100), source: 'Pixabay',
  })).filter(p => p.src);
}

// the photos for one search, from whichever stock service has a key
export async function stockSearch(query, opts = {}) {
  if (hasPixabay()) return pixabaySearch(query, opts);
  return (await pexelsSearch(query, opts)).map(p => ({ ...p, source: 'Pexels' }));
}

// 2-3 short stock-photo searches that fit the ad: the photo mood, not the product name or any brand
export async function inspirationQueries(run, v) {
  const b = run.brand || {};
  const fallback = [str([b.niche, v.angle].filter(Boolean).join(' '), 60), str(b.category || b.niche, 40)].filter(Boolean);
  try {
    const r = await claude({
      role: 'writer', purpose: 'image-queries', maxTokens: 200, timeoutMs: 12000,
      system: 'You pick stock-photo search phrases for an ad designer. Return ONLY JSON: {"queries": ["2-4 words", "2-4 words", "2-4 words"]}. Describe the scene, lighting and mood that would inspire this ad (e.g. "soft morning light vanity", "hands holding silk fabric"). No brand names, no people\'s names, no text, no logos.',
      messages: [{ role: 'user', content: 'Brand sells: ' + str(b.sells || b.niche, 160) + '\nBrand tone: ' + str(b.tone_of_voice, 100) + '\nAd angle: ' + v.angle + '\nCreative direction: ' + str(v.creative_direction, 300) }],
    });
    const q = (extractJson(r.text) || {}).queries;
    const list = (Array.isArray(q) ? q : []).map(x => str(x, 60)).filter(x => x && x.length >= 3).slice(0, 3);
    return { queries: list.length ? list : fallback, usd: r.usd || 0 };
  } catch (_) { return { queries: fallback, usd: 0 }; }
}

/* ---------------- brief ---------------- */

// text we are willing to print ON the image: never a bracketed placeholder, and short
export function printableOverlay(v) {
  // emoji and symbols come out as garbage in painted text: print the words only
  const t = String(v.overlay_text || '').replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '').replace(/\s+/g, ' ').trim();
  return t.length >= 3 && !/[\[\]]/.test(t) && t.length <= 70 ? t : '';
}
// the headline that gets set over the picture in the brand's own font: the on-image line, else the ad's headline
export function headlineFor(v) { return printableOverlay(v) || printableOverlay({ overlay_text: v.headline }); }

// The painter never writes the headline: models cannot reproduce a brand's typeface, so the words are added afterwards
// in its real font. What the painter must get right is the PRODUCT, the PALETTE and the MOOD, and it only can when it is
// shown the real product photos and told, in hex, which colours are the brand's.
//   refs: how many of each reference image are attached, in this order: product photos, logo, a brand post, a mood photo
export function adPrompt(run, v, { kit = {}, product = null, refs = {} } = {}) {
  const b = run.brand || {}, c = kit.colors || {}, pal = [['primary', c.primary], ['secondary', c.secondary], ['accent', c.accent], ['background', c.background], ['text', c.text]].filter(x => x[1]);
  const seen = new Set(); const palette = pal.filter(([, h]) => !seen.has(h) && seen.add(h)).map(([n, h]) => n + ' ' + h).join(', ');
  let n = 0; const at = (k) => { const from = n + 1; n += k; return k === 1 ? 'image ' + from : 'images ' + from + ' to ' + n; };
  const lines = [
    'Create ONE finished, square (1:1) photograph-style ad image for a real small direct-to-consumer brand. It is a scene with the product in it, not a graphic: the headline is added separately afterwards.',
    'BRAND: ' + str(b.name || run.input.brand.name, 60) + ' · sells ' + str(b.sells || b.niche, 200) + (b.price_band && b.price_band !== 'unknown' ? ' · price band ' + b.price_band : ''),
    refs.product ? 'PRODUCT (most important): ' + at(refs.product) + ' show the REAL product' + (product ? ' "' + str(product.title, 60) + '"' : '') + ' and its real packaging. Show exactly this product: the same shape, colours, packaging design, labels and any lettering printed on it. Do NOT redesign it, do NOT invent a different box, bag, label or logo, and do not make up words on it; where the reference shows lettering, keep it as it is.'
      : 'PRODUCT: no product photo is available, so depict the product described above in a plain, believable way and put NO brand name, logo or lettering on it.',
    refs.logo ? 'LOGO: ' + at(refs.logo) + ' is the brand\'s real logo. Use it only if it fits naturally (small, e.g. on packaging or a corner), exactly as given: never redraw, restyle or invent a logo.' : 'LOGO: use no logo or brand name anywhere.',
    palette ? 'COLOURS (the brand\'s exact palette): ' + palette + '. Build the backdrop, surfaces and props from these colours only; the product itself keeps its real colours.' : '',
    'MOOD AND THEME: ' + str([b.tone_of_voice, (b.voice_traits || []).join(', '), kit.personality && kit.personality.tone && ('feels ' + kit.personality.tone + ', ' + (kit.personality.energy || '') + ' energy')].filter(x => x && x !== 'unknown').join('; '), 220) + '. The picture should look the way that voice sounds.',
    'AD ANGLE: ' + v.angle + (v.audience ? ' · for ' + v.audience : ''),
    'SCENE (follow it, but never at the expense of the product rules above): ' + str(v.creative_direction, 400),
    refs.brand ? 'STYLE: ' + at(refs.brand) + (refs.brand > 1 ? ' are' : ' is') + ' from the brand\'s own Instagram: take the lighting, styling and overall feel from ' + (refs.brand > 1 ? 'them' : 'it') + ', not the product or people.' : '',
    refs.mood ? 'MOOD ONLY: ' + at(refs.mood) + ' is a stock photo for atmosphere. Never copy it or anything in it.' : '',
    'TEXT: put absolutely no words, letters, numbers, logos or watermarks in the picture (except what is already printed on the real product). Keep the top 38% of the frame one calm, plain, completely empty backdrop (no stripes, bands, props or horizon line)' + (c.background ? ' in the brand colour ' + c.background : '') + ', blending softly into the scene, with nothing in it: the headline is set there.',
    'PEOPLE: do not show a recognisable face. If a person helps the scene, show only hands or a cropped torso.',
    'RULES: original image; no other company\'s logos; no prices, discounts, ratings or medical/results claims; keep the product centred with safe margins for the Instagram/Facebook feed crop.',
  ];
  return lines.filter(Boolean).join('\n');
}

/* ---------------- Nano Banana via OpenRouter ---------------- */

export async function toDataUrl(url, { fetchImpl = fetch, max = 2500000, sleepMs = (ms) => new Promise(r => setTimeout(r, ms)) } = {}) {
  // stock sites throttle bursts of downloads (Pixabay answers 429): wait a little and try again, twice
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (r.status === 429 || r.status >= 500) { if (attempt < 2) { await sleepMs(1200 * (attempt + 1)); continue; } return null; }
      if (!r.ok) return null;
      let type = String(r.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^image\/(jpeg|png|webp)$/.test(type)) type = 'image/jpeg';
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 500 || buf.length > max) return null;
      return 'data:' + type + ';base64,' + buf.toString('base64');
    } catch (_) { return null; }
  }
  return null;
}

export class ImageSetupError extends Error { constructor(m) { super(m); this.code = 'ai_setup'; } }

// -> { data (base64), mime, model, usd }
export async function paintAd({ prompt, refs = [], deadline = Date.now() + 50000, fetchImpl = fetch } = {}) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) throw new ImageSetupError('No LLM key yet: add OPENROUTER_API_KEY to .env (openrouter.ai/keys).');
  let lastErr = null;
  const tried = [];
  for (const model of models()) {
    if (!model.startsWith('google/')) continue; // house rule: Google models only
    const left = deadline - Date.now();
    if (left < 6000) break;
    const body = {
      model, provider: GOOGLE, modalities: ['image', 'text'], image_config: { aspect_ratio: '1:1' },
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...refs.map(u => ({ type: 'image_url', image_url: { url: u } }))] }],
    };
    let j = null, status = 0, raw = '';
    for (let attempt = 0; attempt < 4; attempt++) { // 429 / 5xx: back off and retry, up to 3 times
      try {
        const r = await fetchImpl(BASE + '/chat/completions', {
          method: 'POST', headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'x-title': 'Metacrok' },
          body: JSON.stringify(body), signal: AbortSignal.timeout(Math.max(5000, deadline - Date.now())),
        });
        status = r.status; raw = await r.text();
        try { j = JSON.parse(raw); } catch (_) { j = null; }
      } catch (e) { lastErr = e; status = 0; break; }
      if (status !== 429 && status < 500) break;
      if (attempt < 3 && deadline - Date.now() > 8000) await new Promise(res => setTimeout(res, 1000 * 2 ** attempt)); else break;
    }
    if (!status) { tried.push(model + ': no answer'); continue; }
    if (status === 401) throw new ImageSetupError('OpenRouter rejected the API key. Check OPENROUTER_API_KEY.');
    if (status === 402) throw new ImageSetupError('OpenRouter account is out of credits. Top up at openrouter.ai/credits.');
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    const imgs = msg && (msg.images || []);
    const url = imgs && imgs[0] && ((imgs[0].image_url && imgs[0].image_url.url) || imgs[0].url);
    const m = typeof url === 'string' && url.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
    if (status === 200 && m) {
      const u = j.usage || {};
      const upstream = Number(u.cost_details && u.cost_details.upstream_inference_cost) || 0; // BYOK: cost reads 0, Google bills upstream
      const usd = Number(u.cost) || Number(j.cost) || (u.is_byok ? upstream : 0) || upstream;
      return { data: m[2], mime: m[1], model, usd: Math.round(usd * 1e6) / 1e6, usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 }, tried };
    }
    tried.push(model + ': ' + status + ' ' + str((j && j.error && j.error.message) || 'no image', 60).replace(/\s+/g, ' '));
    lastErr = new Error('image model ' + model + ' gave no image (' + status + '): ' + str((j && j.error && j.error.message) || (msg && msg.content) || raw, 140));
  }
  throw lastErr || new Error('No image model available');
}

export { addCost };
