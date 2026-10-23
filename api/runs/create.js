// POST /api/runs/create — FEED: take the founder's brand + competitors, open a run.
import { db } from '../../lib/hatchable.js';
import { newId, clientIp, hashIp, rateLimit, str } from '../../lib/util.js';
import { igHandle } from '../../lib/instagram.js';

export const access = 'public';
export const methods = ['POST'];

const GOALS = ['cold traffic', 'retargeting', 'product launch', 'sale or offer'];
const COUNTRIES = ['IN', 'US', 'GB', 'AE', 'AU', 'CA', 'SG', 'ALL'];

// "their" Instagram handle or website, kept only to recognise their Ad Library page (never to pull their posts)
function hintOf(h) {
  const t = str(h, 120);
  const ig = igHandle(t) || (/^@/.test(t) ? t.slice(1).toLowerCase() : null);
  const site = (t.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]{3,}(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:[\/?#]|$)/i) || [])[1];
  return { hint_ig: ig, site: site ? site.toLowerCase() : null };
}

function parseCompetitor(raw) {
  const hint = raw && typeof raw === 'object' ? hintOf(raw.hint) : {};
  if (raw && typeof raw === 'object') raw = raw.name;
  let s = str(raw, 200);
  if (!s) return null;
  let name = s;
  const fb = s.match(/facebook\.com\/(?:profile\.php\?id=)?([^/?#&]+)/i);
  const ig = s.match(/instagram\.com\/([^/?#]+)/i);
  // an Ad Library link or a numeric page link names the page by its ID: exact, no guessing
  const pid = (s.match(/view_all_page_id=(\d{5,})/) || [])[1] || (fb && /^\d{5,}$/.test(fb[1]) ? fb[1] : null);
  if (pid) name = hint.hint_name || 'Page ' + pid.slice(-6);
  else if (fb) name = fb[1];
  else if (ig) name = ig[1];
  name = name.replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '').replace(/\.(com|in|co|store|shop)(\/.*)?$/i, '').trim();
  if (!name) return null;
  const slug = !pid && fb && !/^(ads|pages|people|profile\.php)$/i.test(fb[1]) ? fb[1] : null; // a pasted page link is exact
  return { name: name.slice(0, 60), input: ig ? name : s, ig: igHandle(s), ...(pid ? { page_id: pid } : {}), ...(slug ? { fb: slug } : {}), ...hint }; // ig: also pull their organic posts
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
  const perHour = Number(process.env.RUNS_PER_HOUR) || 12; // each run costs real money: keep it low in production
  if (!(await rateLimit('run:' + ipHash, perHour, 60))) {
    return res.status(429).json({ error: 'The gator is full. ' + perHour + ' runs an hour per person; try again shortly.' });
  }

  const id = newId(10);
  const input = { brand: { name: brandName, url: brandUrl, ig: brandIg }, competitors: uniq, goal, notes, country, mode };
  await db.query('INSERT INTO runs (id, input, ip_hash) VALUES ($1, $2, $3)', [id, JSON.stringify(input), ipHash]);
  await db.query('INSERT INTO run_logs (run_id, kind, line) VALUES ($1, $2, $3)', [id, 'ok', 'fed: ' + (brandName || brandUrl) + ' + ' + (uniq.map(c => c.name).join(', ') || 'demo competitors')]);
  res.json({ id });
}