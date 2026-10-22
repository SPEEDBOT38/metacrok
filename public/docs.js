const CODE = {
  start: 'npm install\nnpm start',
  code: 'claude mcp add metacrok -- node /absolute/path/to/metacrok/mcp/bin.js',
  desktop: '{\n  "mcpServers": {\n    "metacrok": {\n      "command": "node",\n      "args": ["/absolute/path/to/metacrok/mcp/bin.js"],\n      "env": { "METACROK_URL": "http://localhost:3000" }\n    }\n  }\n}',
  other: '# any MCP client, stdio transport\ncommand: node /absolute/path/to/metacrok/mcp/bin.js\nenv:     METACROK_URL=http://localhost:3000'
};
const CLIENTS = [
  ['code', 'Claude Code', 'One command. Restart your session to pick it up.'],
  ['desktop', 'Claude Desktop', 'Paste into claude_desktop_config.json, then restart Claude Desktop.'],
  ['other', 'Other clients', 'METACROK_URL defaults to http://localhost:3000. Point it at a deployed copy to skip running locally.']
];
const TOOLS = [
  { name: 'metacrok_status', cat: 'Start', cost: 'free', what: 'Is it reachable, is live Ad Library pulling connected, runs done, average cost.', params: [], ex: 'metacrok_status({})' },
  { name: 'metacrok_suggest_rivals', cat: 'Start', cost: '< $0.01', what: 'Five real rivals for a brand, with handle and website.', params: [['brand_name', 'string', 'Or brand_url.'], ['country', 'string', 'IN, US, GB, AE, AU, CA, SG or ALL.']], ex: 'metacrok_suggest_rivals({\n  brand_url: "beminimalist.co",\n  country: "IN"\n})' },
  { name: 'metacrok_start_run', cat: 'Run', cost: '$0.03–0.10', what: 'Starts a run and drives it for up to wait_seconds. Returns the report if done.', params: [['brand_name | brand_url', 'string · required', 'One of the two.'], ['rivals', 'array · 1–3', 'Name, @handle, Facebook page link, or { name, hint }. A hint is the best way to match the right page.'], ['goal', 'string', 'cold traffic, retargeting, product launch, sale or offer.'], ['wait_seconds', 'number', 'Default 50, max 240.'], ['demo', 'boolean', 'Fictional ads, no rivals needed.']], ex: 'metacrok_start_run({\n  brand_url: "beminimalist.co",\n  rivals: [\n    "Dot & Key",\n    { name: "Mamaearth", hint: "mamaearth.in" }\n  ],\n  goal: "cold traffic"\n})' },
  { name: 'metacrok_wait_for_run', cat: 'Run', cost: 'part of run', what: 'Keeps a run moving. Idempotent. Returns the report when done.', params: [['run_id', 'string · required', ''], ['wait_seconds', 'number', 'Default 50, max 240.']], ex: 'metacrok_wait_for_run({ run_id: "abc123xyz9" })' },
  { name: 'metacrok_get_report', cat: 'Read', cost: 'free', what: 'Verdict, matched rivals, angle mix, map distances, audiences, you vs them, ads.', params: [['run_id', 'string · required', ''], ['section', 'string', 'all, verdict, rivals, angles, map, audiences, you_vs_them, variants.'], ['format', 'string', 'markdown (default) or json.']], ex: 'metacrok_get_report({\n  run_id: "abc123xyz9",\n  section: "map",\n  format: "json"\n})' },
  { name: 'metacrok_get_variants', cat: 'Read', cost: 'free', what: 'The three ads with a paste-ready block and [placeholders].', params: [['run_id', 'string · required', '']], ex: 'metacrok_get_variants({ run_id: "abc123xyz9" })' },
  { name: 'metacrok_list_ads', cat: 'Read', cost: 'free', what: 'Every rival ad that was read, with ids for the control tool.', params: [['run_id', 'string · required', '']], ex: 'metacrok_list_ads({ run_id: "abc123xyz9" })' },
  { name: 'metacrok_tweak_variant', cat: 'Edit', cost: '~$0.001', what: 'Rewrites one ad from an instruction.', params: [['run_id', 'string · required', ''], ['idx', 'number · 1–3', 'Which ad.'], ['instruction', 'string · required', 'e.g. “shorter, mention fragrance-free”.']], ex: 'metacrok_tweak_variant({\n  run_id: "abc123xyz9",\n  idx: 1,\n  instruction: "punchier hook"\n})' },
  { name: 'metacrok_control_ad', cat: 'Edit', cost: 'free', what: 'Exclude, restore, correct or clear one rival ad. Applies on regenerate.', params: [['run_id', 'string · required', ''], ['ad_id', 'string · required', 'From metacrok_list_ads.'], ['action', 'string · required', 'exclude, restore, correct, clear.'], ['angle | note', 'string', 'For correct.']], ex: 'metacrok_control_ad({\n  run_id: "abc123xyz9",\n  ad_id: "a_14",\n  action: "correct",\n  angle: "launch"\n})', warn: 'At least 3 ads must stay in. Needs a finished run.' },
  { name: 'metacrok_edit_audiences', cat: 'Edit', cost: 'free', what: 'Replace the inferred audiences (1–6) and pick a target. null resets.', params: [['run_id', 'string · required', ''], ['audiences', 'array | null', '[{ name, who?, need? }]'], ['target', 'string', 'Must be one of the audiences.']], ex: 'metacrok_edit_audiences({\n  run_id: "abc123xyz9",\n  audiences: [{ name: "The label reader" }],\n  target: "The label reader"\n})' },
  { name: 'metacrok_regenerate', cat: 'Edit', cost: 'a few cents', what: 'Re-runs synthesis and writing on the kept ads.', params: [['run_id', 'string · required', '']], ex: 'metacrok_regenerate({ run_id: "abc123xyz9" })', warn: 'Replaces the three ads and discards tweaks.' }
];
const ENDPOINTS = [
  ['GET', '/api/status', 'Live-pull status, seed brands, runs done, average run cost.'],
  ['POST', '/api/suggest', 'AI-suggested rivals for a brand.', '{ brand_name?, brand_url?, country }'],
  ['POST', '/api/runs/create', 'Starts a run. Returns { id }. Notes (max 400 chars) are the only source of claims the ads may make.', '{ brand_name | brand_url, brand_ig?, competitors[≤3],\n  goal?, country?, notes?, mode?: "auto" | "seed" }'],
  ['POST', '/api/runs/advance', 'Does the next ~45s of work. busy: true means another call holds the run; retry shortly.', '{ id }'],
  ['GET', '/api/runs/get?id=ID&ads=1', 'The whole run: status, competitors, synthesis, variants, icp, cost. ads=1 adds every rival ad and Instagram post.'],
  ['POST', '/api/tweak', 'Rewrites one ad.', '{ run_id, idx: 0–2, instruction }'],
  ['POST', '/api/runs/control', 'Exclude, restore, correct or clear an ad. Stored until regenerate.', '{ run_id, ad_id, action, angle?, note? }'],
  ['POST', '/api/runs/icp', 'Replace audiences and pick a target. null returns to the inferred ones.', '{ id, audiences: [{ name, who?, need? }] | null, target? }'],
  ['POST', '/api/runs/regenerate', 'Re-runs synthesis and writing on kept ads. Then drive with advance.', '{ id }']
];
const NAV = [
  ['GET STARTED', [['overview', 'Overview'], ['quickstart', 'Quickstart'], ['flow', 'How a run works']]],
  ['MCP SERVER', [['tools', 'Tools'], ['rules', 'House rules']]],
  ['REFERENCE', [['api', 'HTTP API'], ['trouble', 'Troubleshooting']]]
];

/* ---------- render ---------- */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const st = { client: 'code', open: 'metacrok_start_run', q: '', cat: 'All' };
  let toastT;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1400); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch (_) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('Copied'); };

  // sidebar
  $('#side').innerHTML = NAV.map(([title, items]) => '<div class="ng"><p class="px8 gt">' + title + '</p>' + items.map(([id, l]) => '<button data-go="' + id + '">' + l + '</button>').join('') + '</div>').join('');

  // quickstart
  $('#code-start').textContent = CODE.start;
  function client() {
    $('#client-tabs').innerHTML = CLIENTS.map(([k, l]) => '<button class="ctab' + (st.client === k ? ' on' : '') + '" data-client="' + k + '">' + l + '</button>').join('');
    $('#client-code').textContent = CODE[st.client];
    $('#client-note').textContent = CLIENTS.find(c => c[0] === st.client)[2];
  }
  client();

  // flow
  const stages = ['brand', 'pull', 'analyze', 'synthesize', 'generate', 'done'];
  $('#stages').innerHTML = stages.map((n, i) => '<li><span class="stg' + (i === stages.length - 1 ? ' done' : '') + '"><span class="px7">' + (i + 1) + '</span>' + n + '</span>' + (i < stages.length - 1 ? '<span class="arr">→</span>' : '') + '</li>').join('');
  $('#flowsteps').innerHTML = [['metacrok_status', 'Check it’s reachable and live pulling is on.'], ['metacrok_start_run', 'Start and drive for up to 50s.'], ['metacrok_wait_for_run', 'Repeat until the report comes back.'], ['metacrok_get_report', 'Read the verdict, map and ads.']]
    .map(([t, w], i) => '<div class="box"><span class="px8 s">STEP ' + (i + 1) + '</span><code style="align-self:flex-start">' + t + '</code><span class="m2">' + w + '</span></div>').join('');

  // tools
  function tools() {
    const q = st.q.trim().toLowerCase();
    const list = TOOLS.filter(t => (st.cat === 'All' || t.cat === st.cat) && (!q || (t.name + ' ' + t.what).toLowerCase().includes(q)));
    $('#tool-cats').innerHTML = ['All', 'Start', 'Run', 'Read', 'Edit'].map(c => '<button class="pill' + (st.cat === c ? ' on' : '') + '" data-cat="' + c + '">' + c + '</button>').join('');
    $('#toollist').innerHTML = list.map((t) => {
      const open = st.open === t.name, free = t.cost === 'free';
      return '<div class="trow' + (open ? ' open' : '') + '"><button class="thead" data-tool="' + t.name + '"><span style="display:flex;flex-direction:column;gap:3px;min-width:0"><b class="tn">' + t.name + '</b><span class="m2" style="font-size:14px">' + esc(t.what) + '</span></span><span class="cost ' + (free ? 'free' : '') + '">' + esc(t.cost) + '</span><span class="chev">' + (open ? '−' : '+') + '</span></button>' +
        (open ? '<div class="tbody">' + (t.params.length ? '<div class="params">' + t.params.map(([n, ty, d]) => '<div class="prm"><span style="display:flex;flex-direction:column;gap:2px"><b class="pn">' + esc(n) + '</b><span style="font-size:12px;color:' + (ty.includes('required') ? 'var(--orange)' : 'var(--dim)') + '">' + esc(ty) + '</span></span><span class="m2">' + esc(d) + '</span></div>').join('') + '</div>' : '') +
          (t.warn ? '<p class="warn">' + esc(t.warn) + '</p>' : '') +
          '<div class="cbox sm"><div class="ch"><span class="mono6">example call</span><button class="cp" data-copy-tool="' + t.name + '">Copy</button></div><pre>' + esc(t.ex) + '</pre></div></div>' : '') + '</div>';
    }).join('') + (list.length ? '' : '<p style="padding:20px 16px;color:var(--mute)">No tool matches “' + esc(st.q) + '”.</p>');
  }
  tools();

  // rules, api, limits, trouble
  $('#rules-list').innerHTML = [['Waiting is normal.', 'Driving calls stop at wait_seconds and say the run is still working. Call metacrok_wait_for_run again. Progress notifications keep client timeouts from firing.'], ['Honest failures.', 'A rival that can’t be found is reported as not found, with the pages the search returned instead. Metacrok never swaps in another brand.'], ['[Placeholders] are on purpose.', 'Ratings, offers and founder stories stay bracketed for the founder to fill. Metacrok doesn’t invent them.'], ['Days running is a hint.', 'Spend and ROAS aren’t public. Longevity is a signal, not proof.'], ['Nothing gets posted.', 'Metacrok never touches an ad account. Your agent hands the ads back for review.']]
    .map(([k, v]) => '<li class="rule"><b>' + esc(k) + '</b><span>' + esc(v) + '</span></li>').join('');
  $('#endpoints').innerHTML = ENDPOINTS.map(([m, p, d, b]) => '<article class="box" style="gap:8px;padding:14px 16px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="meth" style="background:' + (m === 'GET' ? 'var(--teal)' : 'var(--orange)') + '">' + m + '</span><b class="path">' + esc(p) + '</b></div><p class="m2" style="font-size:15px">' + esc(d) + '</p>' + (b ? '<pre class="body">' + esc(b) + '</pre>' : '') + '</article>').join('');
  $('#limits').innerHTML = [['Runs', '12'], ['Controls', '200'], ['Audience edits', '120'], ['Regenerate', '12'], ['Tweaks', '40']].map(([k, v]) => '<div class="box" style="padding:12px 14px;border-radius:8px;gap:6px"><b class="px y" style="font-size:15px">' + v + '</b><span class="m2" style="font-size:14px">' + k + '</span></div>').join('');
  $('#trouble-list').innerHTML = [['Can’t reach Metacrok at …', 'Run npm start, or set METACROK_URL.'], ['live_ad_library: false', 'Set APIFY_TOKEN, or pass demo: true.'], ['AI setup error (412)', 'Set OPENROUTER_API_KEY.'], ['429', 'Hourly limit reached. Wait, or raise RUNS_PER_HOUR locally.'], ['Rival NOT FOUND', 'Pass its website or Facebook page link as the hint.']]
    .map(([k, v]) => '<div class="tro"><b>' + esc(k) + '</b><span class="m2">' + esc(v) + '</span></div>').join('');

  // events
  const go = (id) => { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' }); };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.client) { st.client = t.dataset.client; return client(); }
    if (t.dataset.cat) { st.cat = t.dataset.cat; return tools(); }
    if (t.dataset.tool) { st.open = st.open === t.dataset.tool ? '' : t.dataset.tool; return tools(); }
    if (t.dataset.copyTool) return copy(TOOLS.find(x => x.name === t.dataset.copyTool).ex);
    if (t.dataset.copy === 'start') return copy(CODE.start);
    if (t.dataset.copy === 'client') return copy(CODE[st.client]);
  });
  $('#tool-q').addEventListener('input', (e) => { st.q = e.target.value; tools(); });
  const spy = () => {
    let cur = 'overview';
    for (const [, items] of NAV) for (const [id] of items) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
    $$('#side button').forEach(b => b.classList.toggle('on', b.dataset.go === cur));
  };
  window.addEventListener('scroll', spy, { passive: true }); spy();
  if (location.hash) setTimeout(() => go(location.hash.slice(1)), 150);
})();
