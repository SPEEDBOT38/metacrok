// mcp/server.js — Metacrok as an MCP server. Every tool is a call to Metacrok's HTTP API (docs/API.md), so
// this works against your local copy or a deployed one. Nothing here writes to a founder's ad account:
// Metacrok produces copy and analysis for a human to review.
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createClient, MetacrokError } from './client.js';
import { buildReport, reportMarkdown, formatVariant } from './report.js';

export const GOALS = ['cold traffic', 'retargeting', 'product launch', 'sale or offer'];
export const COUNTRIES = ['IN', 'US', 'GB', 'AE', 'AU', 'CA', 'SG', 'ALL'];

const INSTRUCTIONS = `Metacrok reads a D2C founder's website and Instagram plus their rivals' live Meta Ad Library ads, maps where the rivals crowd (angles, positioning, audiences), and writes three ads for the open space.
Typical flow: metacrok_status, then (optional) metacrok_suggest_rivals, then metacrok_start_run, then metacrok_wait_for_run until it reports done, then metacrok_get_report. Corrections (metacrok_control_ad, metacrok_edit_audiences) only take effect after metacrok_regenerate.
A live run costs roughly $0.03 to $0.10 and takes 1 to 2 minutes. Demo runs (demo: true) use fictional rivals and are cheaper. Spend and ROAS are not public: days running is a hint, never proof. The ads contain [bracketed placeholders] the founder must fill in; never present them as final. Metacrok never publishes anything.`;

const text = (t) => ({ content: [{ type: 'text', text: t }] });
const json = (o) => text(JSON.stringify(o, null, 2));
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: e instanceof MetacrokError ? e.message : 'Unexpected error: ' + (e && e.message || e) }] });
const guard = (fn) => async (args, extra) => { try { return await fn(args, extra); } catch (e) { return fail(e); } };

// MCP progress notifications keep a client's request timeout from firing during a long drive
function progressReporter(extra) {
  const token = extra && extra._meta && extra._meta.progressToken;
  if (token == null || !extra.sendNotification) return undefined;
  let high = 0;
  return async ({ stage, progress }) => {
    high = Math.max(high, Number(progress) || 0);
    await extra.sendNotification({ method: 'notifications/progress', params: { progressToken: token, progress: high, total: 100, message: stage } });
  };
}

const runId = z.string().regex(/^[a-z0-9]{6,20}$/).describe('The run id returned by metacrok_start_run');
const waitSeconds = (d) => z.number().int().min(0).max(240).default(d).describe(`How long to keep the run moving before returning (default ${d}). If it is still running, call metacrok_wait_for_run again.`);

export function createServer({ client = createClient({ baseUrl: process.env.METACROK_URL || 'http://localhost:3000' }) } = {}) {
  const server = new McpServer({ name: 'metacrok', version: '0.1.0' }, { instructions: INSTRUCTIONS });

  // after driving a run: the finished report, an error, or a "keep waiting" note
  async function outcome(id, d) {
    const run = await client.getRun(id);
    if (run.status === 'done') return text(reportMarkdown(buildReport(run)));
    if (run.status === 'error') return { isError: true, content: [{ type: 'text', text: `Run ${id} failed: ${run.error || 'unknown error'}` }] };
    return text(`Run ${id} is still working: stage "${run.stage}", ${run.progress || 0}% done. Call metacrok_wait_for_run with run_id "${id}" to keep going.`);
  }

  server.registerTool('metacrok_status', {
    title: 'Metacrok status',
    description: 'Check that Metacrok is reachable and whether live Meta Ad Library pulls are connected. Free. Call this first.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(async () => {
    const s = await client.status();
    return json({ url: client.base, live_ad_library: !!s.live_pull, why_not_live: s.live_reason || null, runs_completed: s.runs_done, average_run_cost_usd: s.avg_run_usd, demo_rivals: s.seed_brands });
  }));

  server.registerTool('metacrok_suggest_rivals', {
    title: 'Suggest rivals',
    description: 'Ask an AI for five real rival D2C brands (with Instagram handle and website when known) for a brand. Costs well under one cent. The suggestions are a starting point: pass the ones you want to metacrok_start_run as rivals, keeping each website/Instagram as the "hint" so Metacrok finds the right Meta Ad Library page.',
    inputSchema: {
      brand_name: z.string().max(80).optional(), brand_url: z.string().max(200).optional(),
      country: z.enum(COUNTRIES).default('IN'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, guard(async ({ brand_name, brand_url, country }) => {
    if (!brand_name && !brand_url) throw new MetacrokError('Give a brand_name or brand_url.', 400);
    const r = await client.suggest({ brand_name, brand_url, country });
    return json({ niche: r.niche, rivals: (r.competitors || []).map((c) => ({ name: c.name, hint: c.instagram || c.website || undefined, why: c.why })) });
  }));

  server.registerTool('metacrok_start_run', {
    title: 'Start a run',
    description: 'Start a Metacrok analysis and keep it moving for up to wait_seconds. It reads the brand (site, and Instagram if given or found on the site), pulls up to 15 live Meta ads per rival, reads every ad, and writes three ads. A live run costs roughly $0.03 to $0.10 and takes 1 to 2 minutes; if it is not done when wait_seconds ends, call metacrok_wait_for_run. Returns the full report when finished. A rival that cannot be found is reported as not found; no other brand is substituted. Subject to a per-visitor hourly run limit.',
    inputSchema: {
      brand_name: z.string().max(80).optional().describe('The founder\'s brand. Give this or brand_url.'),
      brand_url: z.string().max(200).optional().describe('The brand\'s website, e.g. beminimalist.co. Strongly recommended: the brand profile is guessed without it.'),
      brand_instagram: z.string().max(40).optional().describe('The brand\'s Instagram handle. Optional: found on the website when omitted.'),
      rivals: z.array(z.union([z.string().max(200), z.object({ name: z.string().max(200), hint: z.string().max(120).optional().describe('Their Instagram handle or website') })])).max(3).default([])
        .describe('Up to 3 rivals: a brand name, an @handle, a Facebook page link (an exact match), or {name, hint}. Required unless demo is true.'),
      goal: z.enum(GOALS).default('cold traffic'),
      country: z.enum(COUNTRIES).default('IN').describe('Which country\'s Ad Library to read'),
      notes: z.string().max(400).optional().describe('What makes the product different (its mechanism), plus anything to say or avoid. The only source of claims the ads may make.'),
      demo: z.boolean().default(false).describe('Use the saved fictional demo ads instead of real rivals. Cheaper; for trying the tools.'),
      wait_seconds: waitSeconds(50),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guard(async (a, extra) => {
    if (!a.brand_name && !a.brand_url) throw new MetacrokError('Give a brand_name or a brand_url.', 400);
    if (!a.demo && !a.rivals.length) throw new MetacrokError('Name at least one rival, or set demo: true.', 400);
    const { id } = await client.createRun({
      brand_name: a.brand_name || '', brand_url: a.brand_url || '', brand_ig: a.brand_instagram || '',
      competitors: a.rivals, goal: a.goal, country: a.country, notes: a.notes || '', mode: a.demo ? 'seed' : 'auto',
    });
    const d = await client.drive(id, { timeoutMs: a.wait_seconds * 1000, onProgress: progressReporter(extra) });
    return outcome(id, d);
  }));

  server.registerTool('metacrok_wait_for_run', {
    title: 'Wait for a run',
    description: 'Keep a run moving (a run only advances while something calls it) for up to wait_seconds. Returns the full report when it finishes, an error if it failed, or its progress if it is still working. Safe to call repeatedly, and on a finished run it just returns the report.',
    inputSchema: { run_id: runId, wait_seconds: waitSeconds(50) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, guard(async ({ run_id, wait_seconds }, extra) => {
    const d = await client.drive(run_id, { timeoutMs: wait_seconds * 1000, onProgress: progressReporter(extra) });
    return outcome(run_id, d);
  }));

  server.registerTool('metacrok_get_report', {
    title: 'Get the report',
    description: 'The story of a finished run: the verdict (the open space nobody owns), which rival pages were matched, the angle mix, positioning-map distances (how far apart rivals are and how far the new ads stand from them), audiences, the founder\'s Instagram vs the rivals, and the three ads. Free. Use section to read one part, format "json" for structured data.',
    inputSchema: {
      run_id: runId,
      section: z.enum(['all', 'verdict', 'rivals', 'angles', 'map', 'audiences', 'you_vs_them', 'variants']).default('all'),
      format: z.enum(['markdown', 'json']).default('markdown'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(async ({ run_id, section, format }) => {
    const run = await client.getRun(run_id);
    if (run.status === 'error') return { isError: true, content: [{ type: 'text', text: `Run ${run_id} failed: ${run.error}` }] };
    if (run.status !== 'done') return text(`Run ${run_id} is not finished (stage "${run.stage}", ${run.progress || 0}%). Call metacrok_wait_for_run first.`);
    const r = buildReport(run);
    if (format === 'json') return json(section === 'all' ? r : { run: r.run, warnings: r.warnings, [section === 'angles' ? 'angle_mix' : section === 'you_vs_them' ? 'you_vs_them' : section]: r[section === 'angles' ? 'angle_mix' : section] });
    return text(reportMarkdown(r, section));
  }));

  server.registerTool('metacrok_get_variants', {
    title: 'Get the three ads',
    description: 'The three ads of a finished run, each with primary text, headline, description, CTA, creative direction, the rival ad whose structure it borrowed, and a paste_ready block. [Bracketed text] is a placeholder the founder must fill in (a rating, an offer, a founder story): Metacrok never invents those. Free.',
    inputSchema: { run_id: runId },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(async ({ run_id }) => {
    const run = await client.getRun(run_id, { ads: false });
    if (run.status !== 'done') return text(`Run ${run_id} is not finished (stage "${run.stage}"). Call metacrok_wait_for_run first.`);
    return json((run.variants || []).map(formatVariant));
  }));

  server.registerTool('metacrok_list_ads', {
    title: 'List the ads that were read',
    description: 'Every rival ad Metacrok read in a run: which rival, how long it ran, its angle, hook, audience and why it works, and whether it was set aside or corrected. Use the ad_id with metacrok_control_ad. Free.',
    inputSchema: {
      run_id: runId, rival: z.string().max(80).optional().describe('Only this rival'),
      include_set_aside: z.boolean().default(false), limit: z.number().int().min(1).max(60).default(30),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, guard(async ({ run_id, rival, include_set_aside, limit }) => {
    const run = await client.getRun(run_id);
    const ads = (run.ads || []).filter((a) => (include_set_aside || !a.excluded) && (!rival || a.competitor.toLowerCase() === rival.toLowerCase()))
      .sort((x, y) => (y.weight || 0) - (x.weight || 0)).slice(0, limit);
    return json({ shown: ads.length, ads: ads.map((a) => ({
      ad_id: a.id, rival: a.competitor, days_running: a.days_running, near_identical_versions: a.variants,
      angle: a.analysis && a.analysis.angle, hook: a.analysis && a.analysis.hook && a.analysis.hook.line, audience: a.analysis && a.analysis.audience,
      why_it_works: a.analysis && a.analysis.why_it_works, set_aside: !!a.excluded, corrected_by_founder: !!a.correction, library_url: a.ad_library_url,
    })) });
  }));

  server.registerTool('metacrok_tweak_variant', {
    title: 'Tweak one ad',
    description: 'Rewrite one of the three ads from an instruction, e.g. "shorter", "more playful", "lead with the 10% niacinamide". Keeps the angle and the brand voice, keeps version history, and applies the same rules as generation (Meta length limits, no invented claims, no copied rival wording). Costs about $0.001.',
    inputSchema: { run_id: runId, ad: z.number().int().min(1).max(3).describe('Which ad, 1 to 3'), instruction: z.string().min(1).max(240) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, guard(async ({ run_id, ad, instruction }) => {
    const v = await client.tweak({ run_id, idx: ad - 1, instruction });
    return json(formatVariant(v));
  }));

  server.registerTool('metacrok_control_ad', {
    title: 'Set aside or correct a rival ad',
    description: 'The founder\'s say over how a rival ad was read. action "exclude" sets it aside (at least 3 ads must stay), "restore" brings it back, "correct" fixes its angle and/or says what it really does, "clear" removes a correction. Takes effect only when metacrok_regenerate runs. Get ad_ids from metacrok_list_ads. Free.',
    inputSchema: {
      run_id: runId, ad_id: z.string().max(80), action: z.enum(['exclude', 'restore', 'correct', 'clear']),
      angle: z.string().max(40).optional().describe('For "correct": one of aspiration, social proof, offer, pain point, authority, fomo, comparison, founder story, ugc testimonial, education, gifting, humour'),
      note: z.string().max(200).optional().describe('For "correct": what the ad actually does'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, guard(async ({ run_id, ad_id, action, angle, note }) => {
    const r = await client.control({ run_id, ad_id, action, angle, note });
    return json({ ok: r.ok, ad_id: r.ad_id, set_aside: r.excluded, correction: r.correction, unapplied_changes: r.pending, next: 'Call metacrok_regenerate to apply.' });
  }));

  server.registerTool('metacrok_edit_audiences', {
    title: 'Edit the audiences',
    description: 'Replace the AI-inferred audiences with the founder\'s own (1 to 6, each with a name and optionally who they are and what they want) and pick the one to aim the ads at. Pass audiences: null to go back to the inferred ones. Takes effect only when metacrok_regenerate runs. Free.',
    inputSchema: {
      run_id: runId,
      audiences: z.array(z.object({ name: z.string().max(40), who: z.string().max(120).optional(), need: z.string().max(100).optional() })).min(1).max(6).nullable(),
      target: z.string().max(40).optional().describe('The name of the audience to target; must be one of audiences'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, guard(async ({ run_id, audiences, target }) => {
    const r = await client.icp({ id: run_id, audiences, target });
    return json({ ok: r.ok, audiences: r.icp && r.icp.audiences || 'back to inferred', target: r.icp && r.icp.target || null, unapplied_changes: r.pending, next: 'Call metacrok_regenerate to apply.' });
  }));

  server.registerTool('metacrok_regenerate', {
    title: 'Regenerate the ads',
    description: 'Apply the founder\'s corrections (ads set aside, reads fixed, audiences edited): re-runs only the analysis and writing steps on the ads that were kept, without pulling or reading ads again. Costs a few cents and takes under a minute. REPLACES the three ads and discards any tweaks made to them. Returns the new report when finished.',
    inputSchema: { run_id: runId, wait_seconds: waitSeconds(60) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, guard(async ({ run_id, wait_seconds }, extra) => {
    await client.regenerate(run_id);
    const d = await client.drive(run_id, { timeoutMs: wait_seconds * 1000, onProgress: progressReporter(extra) });
    return outcome(run_id, d);
  }));

  server.registerResource('run_report', new ResourceTemplate('metacrok://runs/{run_id}/report', { list: undefined }), {
    title: 'Run report', description: 'The markdown report of a finished Metacrok run.', mimeType: 'text/markdown',
  }, async (uri, { run_id }) => {
    const run = await client.getRun(String(run_id));
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: run.status === 'done' ? reportMarkdown(buildReport(run)) : `Run ${run_id} is ${run.status} (stage ${run.stage}).` }] };
  });

  server.registerPrompt('competitor_teardown', {
    title: 'Competitor teardown',
    description: 'Run Metacrok on a brand and its rivals, then explain where to stand out.',
    argsSchema: { brand_url: z.string().describe('The brand\'s website'), rivals: z.string().describe('Up to 3 rivals, comma separated') },
  }, ({ brand_url, rivals }) => ({
    messages: [{ role: 'user', content: { type: 'text', text:
      `Use Metacrok to tear down ${brand_url} against these rivals: ${rivals}.\n1. Call metacrok_status, then metacrok_start_run with brand_url and the rivals (keep calling metacrok_wait_for_run until it is done).\n2. Read the report. Tell me in plain language: the open space nobody owns, who the rivals are really talking to, how my Instagram differs from their ads, and which of the three ads you would test first and why.\n3. List every [placeholder] I must fill in, and flag any rival Metacrok could not find. Do not invent numbers: days running is a hint, not proof.` } }],
  }));

  return server;
}
