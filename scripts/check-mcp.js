// scripts/check-mcp.js — the MCP server end to end, with no network: a stub Metacrok behind the real server,
// talked to through an in-memory MCP transport. Run: node scripts/check-mcp.js
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../mcp/server.js';
import { createClient, MetacrokError } from '../mcp/client.js';
import { buildReport } from '../mcp/report.js';

const ad = (id, competitor, x, y, extra = {}) => ({ id, competitor, pos: { x, y }, days_running: 40, weight: 1, analysis: { angle: 'offer', hook: { line: id + ' hook' } }, ...extra });
const RUN = {
  id: 'abc123', status: 'done', stage: 'done', source: 'live', input: { goal: 'cold traffic', country: 'IN' },
  brand: { name: 'Acme' }, cost: { total_usd: 0.05 },
  competitors: [{ name: 'A', source: 'live', ads_kept: 2 }, { name: 'B', source: 'live', ads_kept: 0, candidates: ['Other Co'] }],
  ads: [ad('a1', 'A', -0.8, -0.8), ad('a2', 'A', -0.7, -0.6), ad('a3', 'A', 0.7, -0.7), ad('a4', 'A', -0.6, 0.8, { excluded: true })],
  synthesis: { niche: { headline_open: 'Quiet premium proof' }, audiences: [{ name: 'Skeptics' }] },
  variants: [{ idx: 0, angle: 'authority', primary_text: 'Hello [your rating]', headline: 'H', cta: 'Shop Now', pos: { x: 0.8, y: 0.8 } }],
};

// stub Metacrok: records calls; advance flips a run from running to done after two steps
const calls = [];
let steps = 0;
const stub = {
  base: 'http://stub',
  status: async () => ({ live_pull: true, runs_done: 3, avg_run_usd: 0.04 }),
  suggest: async () => ({ niche: 'skincare', competitors: [{ name: 'A', instagram: 'a_ig', why: 'x' }] }),
  createRun: async (b) => { calls.push(['create', b]); return { id: 'abc123' }; },
  getRun: async () => (steps >= 2 ? RUN : { ...RUN, status: 'running', stage: 'pull', progress: 30 }),
  drive: async (id, o) => { while (steps < 2 && o.timeoutMs > 0) { steps++; if (o.onProgress) await o.onProgress({ stage: 'pull', progress: steps * 20 }); } return { done: steps >= 2 }; },
  control: async (b) => { calls.push(['control', b]); return { ok: true, ad_id: b.ad_id, excluded: b.action === 'exclude', pending: 1 }; },
  icp: async (b) => { calls.push(['icp', b]); return { ok: true, icp: b.audiences && { audiences: b.audiences, target: b.target }, pending: 1 }; },
  regenerate: async (id) => { calls.push(['regen', id]); steps = 2; return { ok: true }; },
  tweak: async (b) => { calls.push(['tweak', b]); return { idx: b.idx, version: 2, angle: 'authority', primary_text: 'shorter' }; },
};

const server = createServer({ client: stub });
const [a, b] = InMemoryTransport.createLinkedPair();
const mcp = new Client({ name: 'check', version: '0' });
await Promise.all([server.connect(a), mcp.connect(b)]);
const call = async (name, args) => { const r = await mcp.callTool({ name, arguments: args }); return { ...r, t: r.content[0].text }; };

// ---- surface ----
const names = (await mcp.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(names, ['metacrok_control_ad', 'metacrok_edit_audiences', 'metacrok_get_report', 'metacrok_get_variants', 'metacrok_list_ads', 'metacrok_regenerate',
  'metacrok_start_run', 'metacrok_status', 'metacrok_suggest_rivals', 'metacrok_tweak_variant', 'metacrok_wait_for_run']);
assert.equal((await mcp.listResourceTemplates()).resourceTemplates[0].uriTemplate, 'metacrok://runs/{run_id}/report');
assert.equal((await mcp.listPrompts()).prompts[0].name, 'competitor_teardown');

// ---- input rules ----
let r = await call('metacrok_start_run', { rivals: ['A'] });
assert.ok(r.isError && /brand_name or a brand_url/.test(r.t), 'needs a brand');
r = await call('metacrok_start_run', { brand_url: 'acme.co' });
assert.ok(r.isError && /at least one rival/.test(r.t), 'needs a rival unless demo');
assert.equal(calls.length, 0, 'bad input never reaches Metacrok');

// ---- a run: start waits, then returns the report ----
r = await call('metacrok_start_run', { brand_url: 'acme.co', rivals: ['A', { name: 'B', hint: 'b.in' }], wait_seconds: 5 });
assert.ok(!r.isError, r.t);
assert.deepEqual(calls[0][1].competitors, ['A', { name: 'B', hint: 'b.in' }]);
assert.equal(calls[0][1].mode, 'auto');
assert.match(r.t, /Quiet premium proof/);
assert.match(r.t, /No active Meta ads were found for "B"/, 'a missing rival is a warning, never swapped');

// ---- report maths: the set-aside ad is out, new ad sits in the open quadrant ----
const rep = buildReport(RUN);
assert.equal(rep.longevity.ads_read, 3);
assert.equal(rep.map.new_ads[0].nearest_rival_ad.rival, 'A');
assert.equal(rep.map.open_quadrant, 'emotional, premium-led');
assert.equal(rep.rivals.find((x) => x.name === 'B').found, false);

// ---- read tools ----
r = await call('metacrok_get_variants', { run_id: 'abc123' });
assert.match(r.t, /\[your rating\]/);
r = await call('metacrok_list_ads', { run_id: 'abc123' });
assert.equal(JSON.parse(r.t).shown, 3, 'set-aside ads hidden by default');
r = await call('metacrok_list_ads', { run_id: 'abc123', include_set_aside: true });
assert.equal(JSON.parse(r.t).shown, 4);
r = await call('metacrok_get_report', { run_id: 'abc123', section: 'map', format: 'json' });
assert.ok(JSON.parse(r.t).map.rival_distances, 'section json');
r = await call('metacrok_get_report', { run_id: 'bad' });
assert.ok(r.isError, 'bad run id rejected by schema');

// ---- founder controls + regenerate ----
r = await call('metacrok_control_ad', { run_id: 'abc123', ad_id: 'a1', action: 'exclude' });
assert.equal(JSON.parse(r.t).set_aside, true);
r = await call('metacrok_edit_audiences', { run_id: 'abc123', audiences: [{ name: 'Skeptics' }], target: 'Skeptics' });
assert.equal(JSON.parse(r.t).unapplied_changes, 1);
r = await call('metacrok_regenerate', { run_id: 'abc123' });
assert.ok(calls.some((c) => c[0] === 'regen'));
r = await call('metacrok_tweak_variant', { run_id: 'abc123', ad: 1, instruction: 'shorter' });
assert.equal(calls.find((c) => c[0] === 'tweak')[1].idx, 0, 'ad 1 is index 0');

// ---- a failed run and an unreachable app say so plainly ----
const bad = createServer({ client: { ...stub, getRun: async () => ({ ...RUN, status: 'error', error: 'Nothing else was swapped in' }) } });
const [c, d] = InMemoryTransport.createLinkedPair();
const mcp2 = new Client({ name: 'check2', version: '0' });
await Promise.all([bad.connect(c), mcp2.connect(d)]);
r = await mcp2.callTool({ name: 'metacrok_get_report', arguments: { run_id: 'abc123' } });
assert.ok(r.isError && /Nothing else was swapped in/.test(r.content[0].text));

const down = createClient({ baseUrl: 'http://x', fetchImpl: async () => { throw new Error('boom'); } });
await assert.rejects(down.status(), (e) => e instanceof MetacrokError && /npm start/.test(e.message));

// ---- drive(): loops advance until the run leaves "running" ----
let n = 0;
const fake = async (url) => ({ ok: true, status: 200, json: async () => (url.includes('advance') ? { status: ++n < 3 ? 'running' : 'done' } : { stage: 's', progress: 1 }) });
const out = await createClient({ fetchImpl: fake, sleep: async () => {} }).drive('abc123', { timeoutMs: 5000 });
assert.deepEqual([out.done, n], [true, 3]);

// a dropped connection mid-run is retried, not fatal
let blips = 0, m2 = 0;
const flaky = async (url) => {
  if (url.includes('advance') && blips++ < 2) throw Object.assign(new Error('reset'), { cause: { code: 'ECONNRESET' } });
  return { ok: true, status: 200, json: async () => (url.includes('advance') ? { status: ++m2 < 2 ? 'running' : 'done' } : {}) };
};
const out2 = await createClient({ fetchImpl: flaky, sleep: async () => {} }).drive('abc123', { timeoutMs: 5000 });
assert.equal(out2.done, true, 'drive survives two dropped connections');

// if driving fails for good, the agent still gets the run id back to resume with
const broken = createServer({ client: { ...stub, createRun: async () => ({ id: 'zzz999' }), drive: async () => { throw new MetacrokError('Can\'t reach Metacrok', 0); } } });
const [e1, e2] = InMemoryTransport.createLinkedPair();
const mcp3 = new Client({ name: 'check3', version: '0' });
await Promise.all([broken.connect(e1), mcp3.connect(e2)]);
r = await mcp3.callTool({ name: 'metacrok_start_run', arguments: { brand_url: 'acme.co', rivals: ['A'] } });
assert.ok(r.isError && /run_id "zzz999"/.test(r.content[0].text), 'failed drive returns the run id');

console.log('mcp checks passed');
process.exit(0);
