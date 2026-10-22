// node scripts/check-controls.js — the founder's controls (set an ad aside, fix a read, regenerate),
// run against a throwaway embedded database so it never touches .data or a running server.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'metacrok-check-'));
const { db } = await import('../lib/hatchable.js');
const { loadRunAds, pendingChanges } = await import('../lib/pipeline.js');
const control = (await import('../api/runs/control.js')).default;
const regenerate = (await import('../api/runs/regenerate.js')).default;

for (const f of fs.readdirSync('migrations').sort()) await db.exec(fs.readFileSync(path.join('migrations', f), 'utf8'));

const call = async (handler, body) => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ body, headers: {} }, res);
  return res;
};

// a finished run of 5 ads, a minute of compute, finished a minute ago
await db.query(`INSERT INTO runs (id, input, status, stage, created_at, finished_at) VALUES ('testrun1', '{}', 'done', 'done', now() - interval '2 minutes', now() - interval '1 minute')`);
await db.query(`INSERT INTO runs (id, input, status, stage) VALUES ('testrun2', '{}', 'running', 'analyze')`);
for (let i = 1; i <= 5; i++) {
  await db.query(`INSERT INTO ads (id, source, competitor, body, headline) VALUES ($1, 'seed', 'Rival', 'body', 'head')`, ['ad' + i]);
  await db.query(`INSERT INTO run_ads (run_id, ad_id, competitor, days_running) VALUES ('testrun1', $1, 'Rival', $2)`, ['ad' + i, 10 * i]);
  await db.query(`INSERT INTO ad_analyses (ad_id, analysis) VALUES ($1, $2::jsonb)`, ['ad' + i, JSON.stringify({ angle: 'offer', why_it_works: 'original read' })]);
}
await db.query(`INSERT INTO run_ads (run_id, ad_id, competitor, days_running) VALUES ('testrun2', 'ad1', 'Rival', 5)`);

const q = { run_id: 'testrun1' };
assert.equal((await loadRunAds('testrun1')).length, 5);
assert.equal(await pendingChanges('testrun1'), 0);
assert.equal((await call(regenerate, { id: 'testrun1' })).code, 400, 'nothing to apply yet');

// setting aside hides the ad from the stages but not from the listing, and is reversible
assert.equal((await call(control, { ...q, ad_id: 'ad1', action: 'exclude' })).body.pending, 1);
assert.equal((await loadRunAds('testrun1')).length, 4);
assert.equal((await loadRunAds('testrun1', true)).length, 5);
assert.equal((await call(control, { ...q, ad_id: 'ad2', action: 'exclude' })).code, 200);
assert.equal((await call(control, { ...q, ad_id: 'ad3', action: 'exclude' })).code, 400, 'the gator needs 3 ads to learn from');

// fixing a read applies to this run only, and never touches the shared read cache
assert.equal((await call(control, { ...q, ad_id: 'ad4', action: 'correct', angle: 'humour', note: 'a meme' })).code, 200);
const fixed = (await loadRunAds('testrun1')).find(a => a.id === 'ad4');
assert.equal(fixed.analysis.angle, 'humour');
assert.equal(fixed.analysis.why_it_works, 'a meme');
assert.equal(fixed.analysis.corrected, true);
assert.equal((await db.query(`SELECT analysis->>'angle' AS a FROM ad_analyses WHERE ad_id = 'ad4'`)).rows[0].a, 'offer');
assert.equal((await loadRunAds('testrun2', true)).find(a => a.id === 'ad1').excluded, false, 'another run is unaffected');

// bad input and bad state are refused
assert.equal((await call(control, { ...q, ad_id: 'ad4', action: 'correct', angle: 'nonsense' })).code, 400);
assert.equal((await call(control, { ...q, ad_id: 'ad4', action: 'correct' })).code, 400);
assert.equal((await call(control, { ...q, ad_id: 'nope', action: 'restore' })).code, 404);
assert.equal((await call(control, { ...q, ad_id: 'ad4', action: 'burn' })).code, 400);
assert.equal((await call(control, { run_id: 'testrun2', ad_id: 'ad1', action: 'exclude' })).code, 409, 'a running run cannot be changed');
assert.equal(await pendingChanges('testrun1'), 3);

// regenerate re-opens the run at synthesis and keeps the compute clock honest
assert.equal((await call(regenerate, { id: 'testrun1' })).code, 200);
const run = (await db.query(`SELECT stage, status, finished_at, extract(epoch FROM now() - created_at)::int AS age FROM runs WHERE id = 'testrun1'`)).rows[0];
assert.equal(run.stage, 'synthesize');
assert.equal(run.status, 'running');
assert.equal(run.finished_at, null);
assert.ok(run.age >= 55 && run.age <= 70, 'the clock shows compute time, not idle time: ' + run.age);
assert.equal((await call(regenerate, { id: 'testrun1' })).code, 409, 'already re-running');

// once it finishes again nothing is pending; restoring an ad is a new pending change
await db.query(`UPDATE runs SET status = 'done', stage = 'done', finished_at = now() WHERE id = 'testrun1'`);
assert.equal(await pendingChanges('testrun1'), 0);
assert.equal((await call(control, { ...q, ad_id: 'ad1', action: 'restore' })).body.pending, 1);
assert.equal((await call(control, { ...q, ad_id: 'ad4', action: 'clear' })).body.correction, null);

// ---- the founder's audiences (ICPs) ----
const icp = (await import('../api/runs/icp.js')).default;
await db.query(`UPDATE runs SET finished_at = now() - interval '1 second' WHERE id = 'testrun1'`); // settle earlier changes
await db.query(`UPDATE run_ads SET controlled_at = NULL WHERE run_id = 'testrun1'`);
assert.equal(await pendingChanges('testrun1'), 0);
assert.equal((await call(icp, { id: 'testrun1', audiences: [] })).code, 400, 'at least one audience');
assert.equal((await call(icp, { id: 'testrun1', audiences: [{ name: 'A' }], target: 'B' })).code, 400, 'target must be in the list');
assert.equal((await call(icp, { id: 'testrun2', audiences: [{ name: 'A' }] })).code, 409, 'a running run cannot be changed');
const saved = await call(icp, { id: 'testrun1', audiences: [{ name: 'New mums', who: 'tired', need: 'one step' }, { name: 'new mums' }, { name: 'Students' }], target: 'New mums' });
assert.equal(saved.code, 200);
assert.equal(saved.body.icp.audiences.length, 2, 'duplicate names collapse');
assert.equal(saved.body.icp.target, 'New mums');
assert.equal(saved.body.pending, 1, 'an audience edit is a pending change');
assert.equal((await call(regenerate, { id: 'testrun1' })).code, 200, 'an audience edit alone can be regenerated');
await db.query(`UPDATE runs SET status = 'done', stage = 'done', finished_at = now() WHERE id = 'testrun1'`);
assert.equal((await call(icp, { id: 'testrun1', audiences: null })).body.icp, null, 'back to inferred');

// ---- map positions: the read's own, or a stable estimate from the angle ----
const { positionFor } = await import('../lib/util.js');
assert.deepEqual(positionFor({ position: { x: 2, y: -0.333 } }, 'a'), { x: 1, y: -0.33, estimated: false });
const e1 = positionFor({ angle: 'offer' }, 'ad9'), e2 = positionFor({ angle: 'offer' }, 'ad9');
assert.deepEqual(e1, e2, 'estimates are stable');
assert.ok(e1.estimated && e1.y < -0.7, 'offer sits value-led');

console.log('controls ok');
process.exit(0);
