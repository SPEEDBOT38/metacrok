// lib/util.js — small shared helpers.
import { db } from './hatchable.js';

export function newId(n = 10) {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const b of bytes) s += a[b % a.length];
  return s;
}

export function clientIp(req) {
  const h = req.headers || {};
  return String(h['cf-connecting-ip'] || h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || 'anon').trim();
}

export async function hashIp(ip) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('metacrok:' + ip));
  return Array.from(new Uint8Array(d)).slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns true if allowed. Buckets like "run:<iphash>".
export async function rateLimit(bucket, max, windowMinutes) {
  // RATE_LIMITS=off turns every per-visitor limit off (testing only: each live run, image and lookup costs real money)
  if (String(process.env.RATE_LIMITS || '').toLowerCase() === 'off') return true;
  const { rows } = await db.query(
    "SELECT count(*)::int AS n FROM rate_hits WHERE bucket = $1 AND ts > now() - ($2 || ' minutes')::interval",
    [bucket, String(windowMinutes)]
  );
  if (rows[0].n >= max) return false;
  await db.query('INSERT INTO rate_hits (bucket) VALUES ($1)', [bucket]);
  return true;
}

export async function log(runId, line, kind = 'info') {
  await db.query('INSERT INTO run_logs (run_id, kind, line) VALUES ($1, $2, $3)', [runId, kind, String(line).slice(0, 400)]);
}

export function str(v, max = 500) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normName(s) {
  return String(s || '').toLowerCase().replace(/^@/, '').replace(/https?:\/\/(www\.)?/, '').replace(/[^a-z0-9]/g, '');
}

export function looseMatch(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const k = Math.min(6, x.length, y.length);
  return k >= 4 && x.slice(0, k) === y.slice(0, k);
}

export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export function metaTag(html, names) {
  for (const n of names) {
    const re = new RegExp('<meta[^>]+(?:name|property)=["\']' + n + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
    const re2 = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:name|property)=["\']' + n + '["\']', 'i');
    const m = html.match(re) || html.match(re2);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

export function daysSince(d) {
  if (!d) return null;
  const t = new Date(d).getTime();
  if (!isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export function toBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// Where an ad sits on the positioning map: x rational (-1) to emotional (1), y value-led (-1) to
// premium-led (1). The vision read supplies it; reads cached before it existed fall back to where
// their angle usually sits, nudged by a stable hash so ads of one angle don't stack, and say so.
const ANGLE_POS = {
  aspiration: [0.7, 0.7], 'social proof': [0.2, -0.1], offer: [-0.4, -0.9], 'pain point': [0.4, -0.4],
  authority: [-0.8, 0.4], fomo: [0.5, -0.7], comparison: [-0.7, -0.3], 'founder story': [0.8, 0.5],
  'ugc testimonial': [0.5, 0], education: [-0.9, 0.2], gifting: [0.6, 0.1], humour: [0.9, -0.2],
};
const clamp1 = n => Math.max(-1, Math.min(1, Math.round(Number(n) * 100) / 100));
export function positionFor(analysis, id) {
  const p = analysis && analysis.position;
  if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) return { x: clamp1(p.x), y: clamp1(p.y), estimated: false };
  const base = ANGLE_POS[analysis && analysis.angle] || [0, 0];
  let h = 0;
  for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) | 0;
  const jx = ((h & 0xff) / 255 - 0.5) * 0.24, jy = (((h >> 8) & 0xff) / 255 - 0.5) * 0.24;
  return { x: clamp1(base[0] + jx), y: clamp1(base[1] + jy), estimated: true };
}

export const ANGLES = ['aspiration', 'social proof', 'offer', 'pain point', 'authority', 'fomo', 'comparison', 'founder story', 'ugc testimonial', 'education', 'gifting', 'humour'];

// A new ad must not sit on top of a rival ad: the whole point is the open space. Models tend to copy the position of
// the ad they borrowed structure from, so any ad closer than `min` to a rival (or to an earlier new ad) is moved to the
// nearest point that clears them, and marked adjusted. Positions stay AI estimates either way.
export function clearOfRivals(vars, rivals, min = 0.3) {
  const placed = [];
  const near = (q, others) => others.length ? Math.min(...others.map(o => Math.hypot(q.x - o.x, q.y - o.y))) : 9;
  return vars.map(v => {
    const p = v.pos && Number.isFinite(v.pos.x) ? { x: v.pos.x, y: v.pos.y } : { x: 0, y: 0 };
    const others = [...rivals, ...placed];
    if (near(p, others) >= min) { placed.push(p); return v; }
    let best = null, roomiest = null;
    for (let gx = -1; gx <= 1.0001; gx += 0.05) for (let gy = -1; gy <= 1.0001; gy += 0.05) {
      const q = { x: Math.round(gx * 100) / 100, y: Math.round(gy * 100) / 100 };
      const room = near(q, others), move = Math.hypot(q.x - p.x, q.y - p.y);
      if (!roomiest || room > roomiest.room) roomiest = { q, room };
      if (room >= min && (!best || move < best.move)) best = { q, move };
    }
    const q = (best || roomiest).q;
    placed.push(q);
    return { ...v, pos: { x: q.x, y: q.y, estimated: false, adjusted: true } };
  });
}
