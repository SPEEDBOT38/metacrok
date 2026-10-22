// POST /api/runs/create — FEED: take the founder's brand + competitors, open a run.
import { db } from '../../lib/hatchable.js';
import { newId, clientIp, hashIp, rateLimit, str } from '../../lib/util.js';
import { igHandle } from '../../lib/instagram.js';

export const access = 'public';
export const methods = ['POST'];

const GOALS = ['cold traffic', 'retargeting', 'product launch', 'sale or offer'];
const COUNTRIES = ['IN', 'US', 'GB', 'AE', 'AU', 'CA', 'SG', 'ALL'];

function parseCompetitor(raw) {
  let s = str(raw, 200);
  if (!s) return null;
  let name = s;
  const fb = s.match(/facebook\.com\/(?:profile\.php\?id=)?([^/?#&]+)/i);
  const ig = s.match(/instagram\.com\/([^/?#]+)/i);
  if (fb) name = fb[1];
  else if (ig) name = ig[1];
  name = name.replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\.(com|in|co|store|shop)(\/.*)?$/i, '').trim();
  if (!name) return null;
  return { name: name.slice(0, 60), input: ig ? name : s, ig: igHandle(s) }; // ig: also pull their organic posts
}

export default async function (req, res) {
  const b = req.body || {};
  const brandName = str(b.brand_name, 80);
  const brandUrl = str(b.brand_url, 200);
  const brandIg = igHandle(b.brand_ig) || igHandle(str(b.brand_ig, 40) && '@' + str(b.brand_ig, 40).replace(/^@/, '')) || igHandle(brandUrl);
  if (!brandName && !brandUrl) return res.status(400).json({ error: 'Tell the gator your brand name or website first.' });

  const mode = b.mode === 'seed' ? 'seed' : 'auto';
  const competitors = (Array.isArray(b.competitors) ? b.competitors : []).map(parseCompetitor).filter(Boolean).slice(0, 3);
  const seen = new Set();
  const uniq = competitors.filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  if (!uniq.length && mode !== 'seed') return res.status(400).json({ error: 'Name at least one competitor, or let the gator suggest some.' });

  const goal = GOALS.includes(b.goal) ? b.goal : 'cold traffic';
  const country = COUNTRIES.includes(b.country) ? b.country : 'IN';
  const notes = str(b.notes, 400);

  const ipHash = await hashIp(clientIp(req));
  if (!(await rateLimit('run:' + ipHash, 12, 60))) {
    return res.status(429).json({ error: 'The gator is full. 12 runs an hour per person; try again shortly.' });
  }

  const id = newId(10);
  const input = { brand: { name: brandName, url: brandUrl, ig: brandIg }, competitors: uniq, goal, notes, country, mode };
  await db.query('INSERT INTO runs (id, input, ip_hash) VALUES ($1, $2, $3)', [id, JSON.stringify(input), ipHash]);
  await db.query('INSERT INTO run_logs (run_id, kind, line) VALUES ($1, $2, $3)', [id, 'ok', 'fed: ' + (brandName || brandUrl) + ' + ' + (uniq.map(c => c.name).join(', ') || 'demo competitors')]);
  res.json({ id });
}