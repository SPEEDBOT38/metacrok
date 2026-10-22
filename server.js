// server.js — local host for the app: serves public/, routes /api/<path> to
// api/<path>.js (same (req, res) contract Hatchable used), runs migrations on boot.
// ponytail: plain node:http, swap for Vercel functions when deploying there.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { db } from './lib/hatchable.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Every migration is CREATE ... IF NOT EXISTS, so re-running on boot is safe.
for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) {
  await db.exec(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
}

function wrap(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.headersSent) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  return res;
}

async function readBody(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 2e6) throw new Error('body too large'); }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return raw; }
}

async function handleApi(req, res, url) {
  const rel = url.pathname.replace(/^\/api\//, '');
  if (!/^[a-z0-9/_-]+$/i.test(rel) || rel.includes('..')) return res.status(404).json({ error: 'not found' });
  const file = path.join(ROOT, 'api', rel + '.js');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  const mod = await import(pathToFileURL(file).href);
  if (mod.methods && !mod.methods.includes(req.method)) return res.status(405).json({ error: 'method not allowed' });
  req.query = Object.fromEntries(url.searchParams);
  req.body = req.method === 'GET' ? {} : await readBody(req);
  await mod.default(req, res);
}

function serveStatic(res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  else if (!path.extname(p)) p += '.html'; // /app -> app.html
  const file = path.join(ROOT, 'public', p);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}

http.createServer(async (req, res) => {
  wrap(res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(res, url);
  } catch (e) {
    console.error(req.method, url.pathname, e);
    if (!res.headersSent) res.status(500).json({ error: String(e.message || e).slice(0, 200) });
    else res.end();
  }
}).listen(PORT, () => console.log('metacrok on http://localhost:' + PORT));
