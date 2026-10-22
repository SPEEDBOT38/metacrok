// lib/hatchable.js — local stand-in for the Hatchable SDK surface the app uses.
//   db.query(sql, params) -> { rows }    PGlite (embedded Postgres, zero setup,
//                                       persists in .data/) by default, or a real
//                                       Postgres via `pg` when DATABASE_URL is set.
//   api.apify.get/post(path, {query, body}) -> { status, body }   direct Apify REST v2.
//   config.get(name) -> env-backed values (see .env.example).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './env.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- db ---------------- */
let _db = null;

let _init = null;
const initDb = () => (_init ||= openDb()); // one init even if first requests overlap

async function openDb() {
  if (_db) return _db;
  const url = (process.env.DATABASE_URL || '').trim();
  if (url.startsWith('postgres')) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    console.log('[db] Postgres via DATABASE_URL');
    // serverless has no boot step: apply the (re-runnable) migrations on first use
    if (process.env.VERCEL) {
      for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).sort()) await pool.query(fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'));
    }
    return _db = {
      async query(sql, params = []) { const r = await pool.query(sql, params); return { rows: r.rows || [] }; },
      async exec(sql) { await pool.query(sql); },
      async close() { await pool.end(); },
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR || path.join(ROOT, '.data');
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  console.log('[db] PGlite (embedded Postgres) at ' + dir);
  return _db = {
    async query(sql, params = []) { const r = await client.query(sql, params); return { rows: r.rows || [] }; },
    async exec(sql) { await client.exec(sql); },
    async close() { await client.close(); },
  };
}

export const db = {
  async query(sql, params = []) { return (await initDb()).query(sql, params); },
  async exec(sql) { return (await initDb()).exec(sql); },
};

/* ---------------- config ---------------- */
const CONFIG_DEFAULTS = {
  apify_actor: process.env.APIFY_ACTOR || 'curious_coder~facebook-ads-library-scraper',
  apify_price_per_1k: process.env.APIFY_PRICE_PER_1K || '0.75',
};
export const config = {
  async get(name) { return CONFIG_DEFAULTS[name] != null ? CONFIG_DEFAULTS[name] : null; },
};

/* ---------------- api (Apify) ---------------- */
const APIFY_BASE = 'https://api.apify.com/v2';

function apifyToken() {
  const t = (process.env.APIFY_TOKEN || '').trim();
  if (!t) {
    const e = new Error('Apify not connected (no APIFY_TOKEN). Live Ad Library pull is off; runs use the demo seed.');
    e.code = 'SetupRequired';
    throw e;
  }
  return t;
}

async function apifyCall(method, p, { query, body } = {}) {
  const url = new URL(APIFY_BASE + p);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const r = await fetch(url, {
    method,
    headers: { authorization: 'Bearer ' + apifyToken(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  let j = null;
  try { j = await r.json(); } catch (_) {}
  return { status: r.status, ok: r.ok, body: j };
}

export const api = {
  apify: {
    get: (p, opts) => apifyCall('GET', p, opts),
    post: (p, opts) => apifyCall('POST', p, opts),
  },
};
