/* metacrok app: FEED -> CHEW -> FRESH OUT (croc design) */
(function () {
  'use strict';
  const API = '/api';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ph = (s) => esc(s).replace(/\[([^\]]{1,60})\]/g, '<mark class="ph" title="fill this in">[$1]</mark>');
  const usd = (n, d = 3) => '$' + (Number(n) || 0).toFixed(d);
  const cap = (s) => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  const listJoin = (a) => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const r2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  const isKnown = (s) => s && !/^(unknown|n\/a|none)$/i.test(String(s).trim());
  const firstSentence = (s, max) => { const t = String(s || '').trim(); const m = t.match(/^.+?[.!?](?=\s|$)/); const f = m ? m[0] : t; max = max || 160; return f.length > max ? f.slice(0, max).replace(/\s+\S*$/, '') + '…' : f; };
  const root = $('#root');

  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(API + path, { method: o.body ? 'POST' : 'GET', headers: o.body ? { 'content-type': 'application/json' } : {}, body: o.body ? JSON.stringify(o.body) : undefined });
    let j = null; try { j = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error((j && j.error) || ('Request failed (' + res.status + ')')); e.status = res.status; throw e; }
    return j;
  }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2200); }
  async function copy(txt, msg) {
    try { await navigator.clipboard.writeText(txt); } catch (_) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(msg || 'Copied');
  }

  const COLORS = ['#F7862A', '#B48CF0', '#37B7C3'];
  const ART = ['#7C4BC8', '#B8532A', '#2170CA', '#1F7A6B', '#B0396A', '#4C5B9A'];
  const GOALS = [['cold traffic', 'cold traffic'], ['retargeting', 'retargeting'], ['product launch', 'a launch'], ['sale or offer', 'a sale']];
  const MARKETS = [['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AE', 'UAE'], ['AU', 'Australia'], ['CA', 'Canada'], ['SG', 'Singapore'], ['ALL', 'All markets']];
  const STAGES = [
    { k: 'brand', word: 'sniffing', desc: 'Reading your site and Instagram.' },
    { k: 'pull', word: 'pulling', desc: 'Fetching your rivals’ live Meta ads.' },
    { k: 'analyze', word: 'chewing', desc: 'Reading every ad: hook, angle, offer, audience.' },
    { k: 'synthesize', word: 'digesting', desc: 'Mapping where they crowd and where nobody stands.' },
    { k: 'generate', word: 'spitting', desc: 'Writing three ads for the open space.' },
  ];

  /* ---------------- state ---------------- */
  const F = { url: '', name: '', ig: '', rivals: [], rivalInput: '', showSuggest: false, sug: null, niche: '', goal: 'cold traffic', notes: '', market: 'IN', demo: false, error: '', busy: false };
  const S = { screen: 'feed', id: null, run: null, ads: [], igPosts: [], angles: [], pending: 0, tab: 'you', sel: 0, mapSel: null, layers: { rival: true, post: true, new: true }, filter: 'All', since: 0, logs: [], done: false, tweak: '', lastPayload: null, clockT: null, versions: {}, img: {} };

  /* ---------------- header ---------------- */
  function renderSteps() {
    const items = [['feed', 'Feed'], ['chew', 'Chew'], ['results', 'Fresh out']];
    $('#steps').innerHTML = items.map(([k, l], i) => {
      const can = k === 'feed' || (k === 'chew' && S.id && S.screen === 'chew') || (k === 'results' && S.run && S.run.status === 'done');
      return '<li><button class="step' + (S.screen === k ? ' on' : '') + '" data-act="go" data-k="' + k + '"' + (can ? '' : ' disabled') + '><span class="px8">' + (i + 1) + '</span>' + l + '</button></li>';
    }).join('');
    document.title = { feed: 'Feed the croc', chew: 'Chewing…', results: 'Fresh out' }[S.screen] + ' — metacrok';
  }
  api('/status').then(s => {
    const el = $('#pull-mode');
    if (s.live_pull) { el.className = 'live'; $('span', el).textContent = 'live ad library'; }
    else { el.className = 'live seed'; $('span', el).textContent = 'demo only'; el.title = 'Live pull off (' + (s.live_reason || 'not connected') + '): runs use demo ads'; }
  }).catch(() => { $('#pull-mode').hidden = true; });

  /* ================= FEED ================= */
  const brandOf = () => F.name || (F.url ? F.url.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[./]/)[0] : '');
  const goalText = () => (GOALS.find(g => g[0] === F.goal) || [0, F.goal])[1];

  function feedHTML() {
    const pill = (on) => on ? ' on' : '';
    return '<main class="feed"><div class="col">' +
      '<div><h1 class="big-h">feed the croc.</h1><p style="margin-top:16px;font-size:18px;color:var(--soft);max-width:48ch">Three quick answers. He reads your rivals’ live Meta ads, maps where they crowd, and writes three ads for the space nobody owns.</p></div>' +
      '<section class="card"><div class="sec-n"><span class="px y">1-1</span><h2>your brand</h2></div>' +
        '<label class="fld"><span>Website</span><input class="in" data-f="url" value="' + esc(F.url) + '" placeholder="yourstore.com" inputmode="url"></label>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">' +
          '<label class="fld"><span>Brand name</span><input class="in" data-f="name" value="' + esc(F.name) + '" placeholder="We’ll read it from your site"></label>' +
          '<label class="fld"><span>Instagram <span class="px8" style="color:var(--green);margin-left:4px">RECOMMENDED</span></span><input class="in" data-f="ig" value="' + esc(F.ig) + '" placeholder="@handle"></label></div>' +
        '<p style="font-size:14px;color:var(--mute)">We read your last 12 posts to learn who you already talk to (your ICP) and how you sound. Without it we only use your site.</p></section>' +
      '<section class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="sec-n"><span class="px y">1-2</span><h2>your rivals</h2></div><span class="px s" id="rival-count">' + F.rivals.length + '/3</span></div>' +
        '<div class="row">' + F.rivals.map((r, i) => '<span class="chip"><i style="background:' + COLORS[i % 3] + '"></i>' + esc(r.name) + '<button data-act="rm-rival" data-i="' + i + '" aria-label="Remove ' + esc(r.name) + '">×</button></span>').join('') + '</div>' +
        (F.rivals.length < 3 ? '<div style="display:flex;gap:8px"><input class="in" data-f="rivalInput" data-enter="add-rival" value="' + esc(F.rivalInput) + '" placeholder="Brand name, @handle or Facebook page link"><button class="btn mid" style="height:50px" data-act="add-rival">Add</button></div>' : '') +
        '<button class="btn teal" style="align-self:flex-start" data-act="suggest"' + (F.sug === 'loading' ? ' disabled' : '') + '>' + (F.sug === 'loading' ? 'Sniffing around (about 20s)…' : 'Not sure? Find my rivals') + '</button>' +
        (F.showSuggest ? '<div style="border:2px solid var(--line);border-radius:8px;overflow:hidden">' + (F.sug === 'loading' ? '<p class="sug m">Searching the web for D2C brands in your niche…</p>' :
          F.sug && F.sug.error ? '<p class="sug err">' + esc(F.sug.error) + '</p>' :
          (F.niche ? '<p class="sug m" style="font-size:13px">Niche: <b style="color:var(--paper)">' + esc(F.niche) + '</b>. Pick up to 3.</p>' : '') +
          (F.sug || []).map((c, i) => { const on = F.rivals.some(r => r.name.toLowerCase() === c.name.toLowerCase()); return '<div class="sug"><div><b>' + esc(c.name) + '</b><small>' + esc([c.instagram || c.website, c.why].filter(Boolean).join(' · ')) + '</small></div><button class="btn sm" style="' + (on ? 'background:var(--line);color:var(--mute)' : 'background:var(--paper);color:var(--night)') + '" data-act="pick-sug" data-i="' + i + '">' + (on ? 'Added' : '+ Add') + '</button></div>'; }).join('')) + '</div>' : '') +
      '</section>' +
      '<section class="card"><div class="sec-n"><span class="px y">1-3</span><h2>the ads are for</h2></div>' +
        '<div class="row" role="radiogroup">' + GOALS.map(([v, l]) => '<button class="pill' + pill(F.goal === v) + '" style="height:42px;padding:0 16px;font-size:15px" role="radio" aria-checked="' + (F.goal === v) + '" data-act="goal" data-v="' + v + '">' + l + '</button>').join('') + '</div>' +
        '<label class="fld"><span>What makes your product different, and anything to avoid <span style="color:var(--mute);font-weight:400">optional</span></span><textarea class="in" data-f="notes" rows="2" maxlength="400" placeholder="10% niacinamide, fragrance-free · never discount · no emoji">' + esc(F.notes) + '</textarea></label>' +
        '<label style="display:flex;align-items:center;gap:10px;font-size:14px;color:var(--soft)">Ad Library market <select class="in" data-f="market">' + MARKETS.map(([v, l]) => '<option value="' + v + '"' + (F.market === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
      '</section></div>' +
      '<aside class="aside"><div class="croc-box"><div class="croc-sky"><img id="croc-img" src="/assets/game/' + (F.rivals.length ? 'crocChompOpen' : 'crocRun1') + '.png" alt=""><div class="hud"><span class="px8 s" style="letter-spacing:1px">ON THE MENU</span><span class="y" style="font:14px \'Press Start 2P\',monospace" id="menu-count">' + F.rivals.length + ' RIVALS</span></div></div><div class="grass"></div>' +
        '<div class="says"><p>I run <em id="sum-name"></em>. I’m up against <em id="sum-rivals"></em>. These ads are for <em id="sum-goal"></em>.</p><p style="font-size:14px;color:var(--mute)">About 90 seconds. Nothing is posted for you.</p></div></div>' +
        (F.demo ? '<p class="dash" style="font-size:13px">Demo mode: fictional skincare rivals, no live pull. <button class="link" style="font-size:13px" data-act="live">Use live data</button></p>' : '') +
        '<p class="err" id="feed-err">' + esc(F.error) + '</p>' +
        '<button class="btn big" id="btn-feed" data-act="feed"' + (F.busy ? ' disabled' : '') + '>' + (F.busy ? 'opening wide…' : 'feed him →') + '</button>' +
        '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:14px;color:var(--mute)"><button class="link" data-act="demo">Fill with demo brands</button><span>No sign-up</span></div></aside></main>';
  }
  function feedSummary() {
    const b = brandOf(), rv = F.rivals.map(r => r.name);
    const set = (id, t) => { const e = $('#' + id); if (e) e.textContent = t; };
    set('sum-name', b ? cap(b) : 'your brand');
    set('sum-rivals', rv.length ? rv.join(rv.length > 2 ? ', ' : ' and ') : 'your rivals');
    set('sum-goal', goalText());
    set('menu-count', rv.length + ' RIVALS'); set('rival-count', rv.length + '/3');
    const img = $('#croc-img'); if (img) img.src = '/assets/game/' + (rv.length ? 'crocChompOpen' : 'crocRun1') + '.png';
    const btn = $('#btn-feed'); if (btn) btn.style.opacity = (F.url || F.name) && (rv.length || F.demo) ? 1 : 0.6;
  }
  function showFeed() { S.screen = 'feed'; clearInterval(S.clockT); root.innerHTML = feedHTML(); feedSummary(); renderSteps(); window.scrollTo(0, 0); }

  function addRival(name, hint) {
    name = String(name || '').trim();
    if (!name || F.rivals.length >= 3 || F.rivals.some(r => r.name.toLowerCase() === name.toLowerCase())) return false;
    F.rivals.push({ name, hint: hint || '' }); F.error = ''; F.demo = false; return true;
  }
  async function suggest() {
    if (!F.name && !F.url) { F.error = 'Add your brand name or website first, so he knows whose rivals to sniff out.'; showFeed(); return; }
    F.error = ''; F.showSuggest = true; F.sug = 'loading'; showFeed();
    try { const r = await api('/suggest', { body: { brand_name: F.name, brand_url: F.url, country: F.market } }); F.sug = r.competitors || []; F.niche = r.niche || ''; }
    catch (e) { F.sug = { error: e.message }; }
    showFeed();
  }
  function payload() {
    return { brand_name: F.name.trim(), brand_url: F.url.trim(), brand_ig: F.ig.trim(), competitors: F.rivals.map(r => ({ name: r.name, hint: r.hint || '' })), goal: F.goal, notes: F.notes.trim(), country: F.market, mode: F.demo ? 'seed' : 'auto' };
  }
  async function startRun(p) {
    S.lastPayload = p;
    const r = await api('/runs/create', { body: p });
    history.pushState({}, '', '/app?run=' + r.id);
    shownSearch = location.search;
    openRun(r.id);
  }
  async function feed() {
    const p = payload();
    if (!p.brand_name && !p.brand_url) { F.error = 'Tell him your brand name or website.'; return showFeed(); }
    if (!p.competitors.length && p.mode !== 'seed') { F.error = 'Add at least one rival, or tap “Find my rivals”.'; return showFeed(); }
    F.error = ''; F.busy = true; showFeed();
    try { await startRun(p); } catch (e) { F.error = e.message; }
    F.busy = false;
    if (S.screen === 'feed') showFeed();
  }

  /* ================= CHEW ================= */
  let shownSearch = location.search;
  function chewHTML() {
    return '<main class="chew"><div class="sky"><croc-game base="/assets/game/" autopilot="on"></croc-game><div class="hudrow">' +
      '<div class="hud"><span class="px8 s">ADS READ</span><span class="y" style="font:14px \'Press Start 2P\',monospace" id="h-ads">00</span></div>' +
      '<div class="hud"><span class="px8 s">STAGE</span><span class="y" style="font:14px \'Press Start 2P\',monospace" id="h-stage">1/5</span></div>' +
      '<div class="hud"><span class="px8 s">TIME</span><span class="y" style="font:14px \'Press Start 2P\',monospace" id="h-clock">0S</span></div></div></div>' +
      '<div class="chew-body"><div style="display:flex;flex-direction:column;gap:22px"><div>' +
        '<p style="font:600 15px \'Funnel Sans\',sans-serif;color:var(--mute)"><b style="color:var(--paper)" id="c-brand"></b> vs <span id="c-rivals"></span></p>' +
        '<h1 class="stage-h" id="c-word">sniffing</h1><p style="margin-top:12px;font-size:18px;color:var(--soft)" id="c-desc"></p></div>' +
        '<div style="display:flex;align-items:center;gap:14px"><div class="blocks" id="c-blocks">' + '<i></i>'.repeat(20) + '</div><span class="px y" style="font-size:14px;min-width:60px;text-align:right" id="c-pct">0%</span></div>' +
        '<ol class="stages" id="c-stages"></ol>' +
        '<div class="runerr" id="c-err" hidden><p class="err" id="c-errmsg"></p><div class="row"><button class="btn" data-act="retry-live">Try live again</button><button class="btn ghost" data-act="retry-demo">Run on demo ads</button><button class="btn ghost" data-act="go" data-k="feed">Back to the form</button></div><div id="rescue" style="display:flex;flex-direction:column;gap:10px"></div></div></div>' +
      '<div class="klog"><p class="px s" style="margin-bottom:12px">KITCHEN LOG</p><ol id="c-log"></ol></div></div></main>';
  }
  function elapsed(r) { const end = r.finished_at ? new Date(r.finished_at).getTime() : Date.now(); return (end - new Date(r.created_at).getTime()) / 1000; }

  function openRun(id, again) {
    Object.assign(S, { id, run: null, done: false, since: 0, logs: [], screen: 'chew', pending: 0 });
    if (!again) { S.ads = []; S.igPosts = []; S.tab = 'you'; S.sel = 0; S.mapSel = null; S.filter = 'All'; }
    root.innerHTML = chewHTML(); renderSteps(); window.scrollTo(0, 0);
    paintChew({ stage: 'brand', progress: 0, input: { brand: {}, competitors: [] }, created_at: new Date().toISOString() });
    driveAdvance(id); pollLoop(id);
  }
  async function driveAdvance(id) {
    let fails = 0;
    while (S.id === id && !S.done) {
      try {
        const r = await api('/runs/advance', { body: { id } }); fails = 0;
        if (r.busy) await sleep(1500);
        if (r.status && r.status !== 'running') break;
      } catch (e) { fails++; if (fails >= 4) { chewError('Lost the connection to the croc: ' + e.message); break; } await sleep(1500 * fails); }
    }
  }
  async function pollLoop(id) {
    let fails = 0;
    while (S.id === id) {
      try {
        const r = await api('/runs/get?id=' + encodeURIComponent(id) + '&since=' + S.since + '&ads=1'); fails = 0;
        S.run = r; S.ads = r.ads || S.ads; S.angles = r.angles || S.angles; S.igPosts = r.ig_posts || S.igPosts;
        if (S.screen === 'chew') paintChew(r);
        if (r.status === 'done') { S.done = true; S.pending = r.controls_pending || 0; await finish(r); break; }
        if (r.status === 'error') { S.done = true; chewError(r.error || 'Something went wrong.'); break; }
      } catch (e) {
        fails++;
        if (e.status === 404) { chewError(e.message); S.done = true; break; }
        if (fails >= 6) { chewError('Can’t reach the run: ' + e.message); break; }
      }
      await sleep(1200);
    }
  }
  /* ---- rescue: the rivals had no ads, so offer real ones instead of a dead end ---- */
  const basePayload = () => {
    const r = S.run && S.run.input;
    return S.lastPayload ? { ...S.lastPayload } : r ? { brand_name: r.brand.name, brand_url: r.brand.url, brand_ig: r.brand.ig || '', goal: r.goal, notes: r.notes, country: r.country, mode: 'auto' } : {};
  };
  const NO_ADS = /no active ads|found no active|nobody was advertising|direct competitor/i;
  async function rescue() {
    const box = $('#rescue'); if (!box) return;
    const p = basePayload();
    const already = S.run && S.run.input && S.run.input.market;
    box.innerHTML = '<p style="font-size:14px;color:var(--soft)">' + (already ? 'The market search didn’t help either.' : 'Looking for real rivals that sell what you sell…') + '</p>';
    if (already) { box.innerHTML += '<p style="font-size:14px;color:var(--mute)">Paste a rival’s Facebook page link or its Ad Library link in place of its name on the first screen.</p>'; return; }
    try {
      const r = await api('/suggest', { body: { brand_name: p.brand_name, brand_url: p.brand_url, country: p.country } });
      S.rescueList = r.competitors || [];
      box.innerHTML = '<p class="px s" style="margin-top:4px">REAL RIVALS WE FOUND</p><div class="row">' + S.rescueList.map((c, i) =>
        '<label class="chip" style="padding:0 12px 0 10px;gap:8px"><input type="checkbox" data-resc="' + i + '"' + (i < 3 ? ' checked' : '') + '><span>' + esc(c.name) + '</span>' + (c.website ? '<small style="color:#5B6B7E">' + esc(c.website) + '</small>' : '') + '</label>').join('') + '</div>' +
        '<div class="row"><button class="btn" data-act="rescue-run">Run with the ticked ones</button><button class="btn ghost" data-act="rescue-market">Use whoever advertises in my category</button></div>' +
        '<p style="font-size:13px;color:var(--mute)">Not every rival advertises on Meta, so some may still come back empty. “Whoever advertises” reads the Ad Library for your product category and keeps the real brands.</p>';
    } catch (e) {
      box.innerHTML = '<div class="row"><button class="btn" data-act="rescue-market">Use whoever advertises in my category</button></div><p style="font-size:13px;color:var(--mute)">' + esc(e.message) + '</p>';
    }
  }
  function chewError(msg) { if (S.screen !== 'chew') return; const e = $('#c-err'); if (!e) return; e.hidden = false; $('#c-errmsg').textContent = msg; clearInterval(S.clockT); if (NO_ADS.test(msg)) rescue(); }
  function paintChew(r) {
    if (!$('#c-word')) return;
    const comps = (r.competitors && r.competitors.length ? r.competitors : (r.input && r.input.competitors) || []).map(c => c.name);
    $('#c-brand').textContent = (r.brand && r.brand.name) || (r.input && r.input.brand && (r.input.brand.name || r.input.brand.url)) || 'your brand';
    $('#c-rivals').textContent = comps.length ? comps.join(', ') : 'demo rivals';
    const idx = Math.max(0, STAGES.findIndex(s => s.k === r.stage));
    $('#c-word').textContent = STAGES[idx].word; $('#c-desc').textContent = STAGES[idx].desc;
    const pct = Math.max(0, Math.min(100, r.progress || 0));
    $$('#c-blocks i').forEach((b, i) => b.classList.toggle('on', i < Math.round(pct / 5)));
    $('#c-pct').textContent = pct + '%'; $('#h-stage').textContent = (idx + 1) + '/5';
    $('#h-ads').textContent = String(((r.ads || []).length) || Number(((r.cost || {}).pull || {}).ads) || 0).padStart(2, '0');
    $('#c-stages').innerHTML = STAGES.map((s, i) => '<li class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"><span class="px8">' + (i < idx ? 'DONE' : i === idx ? 'NOW' : '···') + '</span><b>' + s.word + '</b></li>').join('');
    if (r.logs && r.logs.length) for (const l of r.logs) { S.logs.push(l); S.since = Math.max(S.since, l.id); }
    $('#c-log').innerHTML = S.logs.slice(-9).reverse().map(l => '<li class="' + esc(l.kind || '') + '"><span>' + (l.t != null ? esc(l.t) : '·') + '</span><span>' + esc(l.line) + '</span></li>').join('');
    clearInterval(S.clockT);
    const f = () => { const c = $('#h-clock'); if (c) c.textContent = Math.round(elapsed(r)) + 'S'; };
    f(); if (r.created_at && !r.finished_at && r.status === 'running') S.clockT = setInterval(f, 500);
  }
  async function finish(r) {
    if (!r.ads) { try { const full = await api('/runs/get?id=' + encodeURIComponent(r.id) + '&since=999999999&ads=1'); S.run = { ...r, ...full }; S.ads = full.ads || []; S.igPosts = full.ig_posts || []; S.angles = full.angles || []; } catch (_) {} }
    S.run.logs = S.logs; S.versions = {};
    showResults();
  }

  /* ================= RESULTS: data helpers ================= */
  const runNames = () => ((S.run.competitors && S.run.competitors.length ? S.run.competitors : S.run.input.competitors) || []).map(c => c.name);
  const colorOf = (n) => COLORS[Math.max(0, runNames().indexOf(n)) % 3];
  const angleOf = (x) => (x.correction && x.correction.angle) || (x.analysis && x.analysis.angle) || x.angle || null;
  const W = (a) => a.weight || 1;
  const kept = () => S.ads.filter(a => !a.excluded && a.analysis);
  const brandPosts = () => (S.igPosts || []).filter(p => p.is_brand && p.analysis);
  const brandName = () => (S.run.brand && S.run.brand.name) || S.run.input.brand.name || brandOf() || 'your brand';
  const hookOf = (a) => (a.analysis && a.analysis.hook && a.analysis.hook.line) || a.headline || '';
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  function shares(items, w) {
    const out = {}; let tot = 0;
    for (const x of items) { const a = angleOf(x); if (!a) continue; const k = w ? w(x) : 1; out[a] = (out[a] || 0) + k; tot += k; }
    for (const k in out) out[k] = tot ? out[k] / tot * 100 : 0;
    return out;
  }
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n || 1);
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const synth = () => S.run.synthesis || {};
  const auds = () => synth().audiences || [];
  const targetName = () => (S.run.icp && S.run.icp.target) || synth().recommended_audience;
  const openPhrase = () => { const n = synth().niche || {}; return String(n.headline_open || (n.underused_angles || [])[0] || '').replace(/[.]+$/, ''); };
  const distWord = (d) => d < 0.35 ? ['says the same thing', '#FF7A6B'] : d < 0.7 ? ['close: tweak it', '#F7862A'] : ['clearly different', '#3DBA4E'];

  /* ================= RESULTS: screens ================= */
  function showResults() {
    S.screen = 'results'; clearInterval(S.clockT);
    const r = S.run;
    S.sel = Math.min(S.sel, Math.max(0, (r.variants || []).length - 1));
    root.innerHTML = resultsHTML(); renderSteps(); renderFloat();
    window.scrollTo(0, 0);
  }
  function rerender(scrollTabs) {
    root.innerHTML = resultsHTML(); renderFloat();
    if (scrollTabs) { const t = $('#tabs'); if (t) window.scrollTo(0, t.offsetTop - 64); }
  }
  function renderFloat() {
    let el = $('#changes'); if (el) el.remove();
    if (S.screen !== 'results' || !S.pending) return;
    const d = document.createElement('div'); d.id = 'changes'; d.className = 'changes';
    d.innerHTML = '<p><b>' + S.pending + (S.pending === 1 ? ' change' : ' changes') + '</b> not applied yet. Regenerating replaces the three ads.</p><button class="btn" data-act="regen">Regenerate</button>';
    document.body.appendChild(d);
  }

  function resultsHTML() {
    const r = S.run, syn = synth(), niche = syn.niche || {}, open = openPhrase();
    const ads = kept(), posts = brandPosts(), y = syn.you_vs_them, over = (niche.overused_angles || []).slice(0, 3);
    const live = (r.competitors || []).filter(c => c.source === 'live');
    const nrm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const notes = live.map(c => c.ads_kept
      ? '<div class="note"><b>' + esc(c.name) + '</b> · ' + c.ads_kept + ' ads' + (c.page_name && nrm(c.page_name) !== nrm(c.name) ? ' from the page “' + esc(c.page_name) + '”' : '') + '</div>'
      : '<div class="note miss"><b>' + esc(c.name) + '</b> · ' + (c.fb ? 'its Facebook page (' + esc(c.fb) + ') has no active ads in ' + esc(r.input.country || 'IN') + ' right now' + ((r.input.country || 'IN') !== 'ALL' ? ', so try the All markets setting' : '') + '.' : 'no active Meta ads found, so it is not in this analysis.' + (!c.site && (c.candidates || []).length ? ' The search only turned up ' + esc(c.candidates.join(', ')) + ', which ' + (c.candidates.length === 1 ? 'is' : 'are') + ' not the same brand.' : '') + ' If you know its Facebook page, paste the page link or its Ad Library link in place of its name.') + '</div>').join('') +
      (r.source && r.source !== 'live' ? '<div class="note"><b>' + (r.source === 'seed' ? 'Demo ads.' : 'Saved ads.') + '</b> ' + (r.source === 'seed' ? 'These rival ads are a fictional sample pack, not your real rivals.' : 'Rival ads come from an earlier saved pull, not a fresh one.') + ' The ads are still written for ' + esc(brandName()) + '.</div>' : '');
    const tabs = [['you', 'You', posts.length ? String(posts.length) : '–'], ['rivals', 'Rivals', String(runNames().length)], ['map', 'The map', '·'], ['ads', 'Your ads', String((r.variants || []).length)], ['eaten', 'Ads eaten', String(S.ads.length)]];
    const cards = [
      ['YOU', y ? firstSentence(y.gap || y.summary, 110) : 'Compared from your website.', posts.length ? 'From ' + posts.length + ' Instagram posts' : 'From your website', 'you'],
      ['RIVALS', over.length ? 'Your rivals lean on ' + listJoin(over) + '.' : 'Here is what your rivals say.', 'From ' + ads.length + (r.source === 'live' ? ' live Meta ads' : ' demo ads'), 'rivals'],
      ['THE GAP', open ? 'Nobody owns ' + open + '. Your new ads sit there.' : 'Your new ads aim at the open space.', 'See how far apart everyone is', 'map'],
    ];
    return '<main style="padding-bottom:120px"><section class="hero">' +
      '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center"><p style="font:600 15px \'Funnel Sans\',sans-serif"><b>' + esc(brandName()) + '</b> vs ' + esc(listJoin(runNames()) || 'demo rivals') + '</p>' +
        '<div class="row"><button class="btn night" data-act="share">Copy share link</button><button class="btn outline-n" data-act="go" data-k="feed">Feed him again</button></div></div>' +
      '<h1' + (open.length > 26 ? ' class="long"' : '') + '>' + (open ? 'nobody owns <mark>' + esc(open) + '</mark> yet.' : esc(firstSentence(niche.whitespace, 80) || 'here is what your rivals say.')) + '</h1>' +
      '<p class="lede">' + esc([niche.whitespace, over.length ? 'Your rivals lean on ' + listJoin(over) + '.' : ''].filter(Boolean).join(' ')) + '</p>' +
      (notes ? '<div class="notes">' + notes + '</div>' : '') +
      '<div class="cards3">' + cards.map(([l, t, b, k]) => '<button class="sumcard" data-act="tab" data-k="' + k + '"><span style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="px s">' + l + '</span><span style="font:600 13px \'Funnel Sans\',sans-serif;color:var(--orange)">See →</span></span><b>' + esc(t) + '</b><span style="font-size:13px;color:var(--mute)">' + esc(b) + '</span></button>').join('') + '</div></section>' +
      '<nav class="tabs" id="tabs">' + tabs.map(([k, l, c]) => '<button class="tab' + (S.tab === k ? ' on' : '') + '" data-act="tab" data-k="' + k + '">' + l + '<span>' + c + '</span></button>').join('') + '</nav>' +
      ({ you: tabYou, rivals: tabRivals, map: tabMap, ads: tabAds, eaten: tabEaten }[S.tab] || tabYou)() +
      '<p class="foot"><span>Run cost ' + usd((r.cost || {}).total_usd) + ' · ' + Math.round(elapsed(r)) + 's · days running is a hint, not proof: Meta does not share spend.</span></p></main>';
  }

  /* ---- You ---- */
  function tabYou() {
    const r = S.run, y = synth().you_vs_them, posts = brandPosts(), b = r.brand || {};
    const aud = auds().find(a => a.name === targetName()) || auds()[0];
    const edited = !!(r.icp && r.icp.audiences);
    const mine = shares(posts), theirs = shares(kept(), W);
    const ig = (r.input.brand.ig || (r.ig && r.ig.brand) || '').replace(/^@?/, '@');
    const attrs = [aud && aud.need ? ['WANTS', aud.need] : null, aud ? ['STATUS', aud.status === 'open' ? 'Nobody else aims here.' : (aud.status || 'inferred')] : null,
      isKnown(b.price_band) ? ['PRICE', b.price_band] : null, isKnown(b.target_buyer) ? ['BUYER', b.target_buyer] : null].filter(Boolean);
    const words = [...(b.proof_points || []), ...(b.offers || [])].filter(isKnown).slice(0, 6);
    const icp = aud ? '<article class="icp' + (edited ? ' edited' : '') + '"><div class="top-i"><span class="tag">YOUR ICP · ' + (edited ? 'EDITED' : 'INFERRED') + '</span></div><div class="bd">' +
      '<div><h3>' + esc(aud.name) + '</h3>' + (aud.who ? '<p style="margin-top:6px;font-size:16px;color:#37506E">' + esc(aud.who) + '</p>' : '') + '</div>' +
      (attrs.length ? '<div class="attrs">' + attrs.map(([k, v]) => '<div><p class="k">' + k + '</p><p>' + esc(v) + '</p></div>').join('') + '</div>' : '') +
      (words.length ? '<div><p class="px8" style="color:var(--blue);margin-bottom:8px">WORDS THAT LAND</p><div class="row words">' + words.map(w => '<span>' + esc(w) + '</span>').join('') + '</div></div>' : '') +
      '<div class="row" style="align-items:center"><button class="btn night" data-act="edit-aud">Edit audiences</button><span style="font-size:13px;color:#5B6B7E">' + (posts.length ? 'Based on ' + posts.length + ' posts and your site' : 'Based on your site and the rival ads') + '</span></div></div></article>' : '';
    const angleBars = posts.length ? top(mine, 5).map(([k, v]) => '<div class="bar3"><span>' + esc(k) + '</span><b style="width:' + Math.max(2, v) + '%"></b><span class="px y">' + Math.round(v) + '%</span></div>').join('')
      : '<div class="row">' + ((y && y.you_lean_on) || []).map(a => '<span class="vchip">' + esc(a) + '</span>').join('') + '</div>';
    const fm = {}; posts.forEach(p => { const k = p.post_type || 'post'; fm[k] = (fm[k] || 0) + 1; });
    const FC = ['#37B7C3', '#7CD2FF', '#37506E'];
    const fmArr = Object.entries(fm).sort((a, b) => b[1] - a[1]).map(([n, c], i) => ({ n, pct: Math.round(c / posts.length * 100), c: FC[i % 3] }));
    const liked = posts.slice().sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);
    const voice = [...(b.voice_traits || []), b.tone_of_voice].filter(isKnown).slice(0, 6);
    const right = '<div style="display:flex;flex-direction:column;gap:16px">' +
      '<div class="sidec"><p class="px s">WHAT YOU POST</p>' + (posts.length || (y && (y.you_lean_on || []).length) ? angleBars : '<p style="font-size:14px;color:var(--mute)">No Instagram posts were available. ' + (r.ig && r.ig.state === 'done' && r.ig.brand ? 'Instagram came back empty for @' + esc(r.ig.brand) + '. ' : '') + 'Add your handle on the next run to compare your grid against their ads.</p>') + '</div>' +
      (posts.length || voice.length ? '<div class="sidec">' + (posts.length ? '<p class="px s">FORMATS</p><div class="stack">' + fmArr.map(f => '<span style="width:' + f.pct + '%;background:' + f.c + '"></span>').join('') + '</div><div class="row" style="gap:14px;font-size:14px;color:var(--soft)">' + fmArr.map(f => '<span style="display:flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:2px;background:' + f.c + '"></i>' + esc(f.n) + ' ' + f.pct + '%</span>').join('') + '</div>' : '') +
        (voice.length ? '<p class="px s" style="margin-top:6px">HOW YOU SOUND</p><div class="row">' + voice.map(v => '<span class="vchip">' + esc(v) + '</span>').join('') + '</div>' : '') + '</div>' : '') +
      (liked.length ? '<div class="sidec"><p class="px s">MOST-LIKED POSTS</p><div class="posts">' + liked.map(p => '<div style="display:flex;flex-direction:column;gap:6px"><div class="thumb"' + (p.image_url ? ' style="background-image:url(\'' + esc(String(p.image_url).replace(/'/g, '%27')) + '\')"' : '') + '>' + (p.likes != null ? '<span>♥ ' + esc(p.likes) + '</span>' : '') + '</div><span style="font-size:13px;color:var(--soft);line-height:1.3">' + esc(firstSentence(p.caption || (p.analysis && p.analysis.hook && p.analysis.hook.line) || '', 60)) + '</span><span style="font-size:12px;color:var(--teal)">' + esc(angleOf(p) || '') + '</span></div>').join('') + '</div></div>' : '') + '</div>';
    return '<section class="pane"><div class="pane-h"><h2>' + esc(aud ? 'your people: ' + aud.name.toLowerCase() + '.' : 'who you already talk to.') + '</h2><p>From <b style="color:var(--paper)">' + esc(posts.length ? ig : 'your website') + '</b> · ' + (posts.length ? 'last ' + posts.length + ' posts and your site' : 'your site') + ', read by AI. Dashed means inferred: edit it if it’s wrong.</p></div>' +
      '<div class="two">' + icp + right + '</div>' +
      (y && y.summary ? '<div class="callout">' + esc(y.summary) + '</div>' : '') +
      '<div class="nextrow"><button class="btn paper" data-act="tab" data-k="rivals">Next: your rivals →</button></div></section>';
  }

  /* ---- Rivals ---- */
  function tabRivals() {
    const r = S.run, ads = kept(), names = runNames(), syn = synth(), list = auds(), posts = brandPosts();
    const byRival = (n) => ads.filter(a => a.competitor === n);
    const sh = (n) => shares(byRival(n), W);
    const offerPct = (as) => as.length ? Math.round(as.filter(a => angleOf(a) === 'offer' || (a.analysis && a.analysis.offer)).length / as.length * 100) : 0;
    const mostCommon = (arr) => { const c = {}; arr.filter(Boolean).forEach(x => { c[x] = (c[x] || 0) + 1; }); return (top(c, 1)[0] || [''])[0]; };
    const days = (as) => as.map(a => a.days_running || 0);
    const crowded = list.filter(a => a.status === 'crowded');
    const youTop = posts.length ? top(shares(posts), 1)[0] : null;
    const tgt = list.find(a => a.name === targetName()) || list[0];
    const topAud = (n) => (list.slice().sort((a, b) => ((b.share || {})[n] || 0) - ((a.share || {})[n] || 0))[0] || {}).name || '–';
    const rows = [
      ['Main angle', ...names.map(n => { const t = top(sh(n), 1)[0]; return t ? t[0] + ' · ' + Math.round(t[1]) + '%' : '–'; }), youTop ? youTop[0] + ' · ' + Math.round(youTop[1]) + '%' : '–'],
      ['Hook style', ...names.map(n => mostCommon(byRival(n).map(a => a.analysis.hook && a.analysis.hook.type)) || '–'), posts.length ? mostCommon(posts.map(p => p.analysis.hook && p.analysis.hook.type)) || '–' : '–'],
      ['Uses discounts', ...names.map(n => offerPct(byRival(n)) + '% of ads'), posts.length ? offerPct(posts) + '% of posts' : '–'],
      ['Formats', ...names.map(n => { const c = {}; byRival(n).forEach(a => { const f = a.analysis.format; if (f) c[f] = (c[f] || 0) + 1; }); return top(c, 2).map(x => x[0]).join(', ') || '–'; }), (() => { const c = {}; posts.forEach(p => { c[p.post_type || 'post'] = (c[p.post_type || 'post'] || 0) + 1; }); return top(c, 2).map(x => x[0]).join(', ') || '–'; })()],
      ['Longest-running', ...names.map(n => Math.max(0, ...days(byRival(n))) + ' days'), 'no ads yet'],
      ['Who they target', ...names.map(topAud), tgt ? tgt.name : '–'],
    ];
    const cols = '170px repeat(' + (names.length + 1) + ',minmax(0,1fr))';
    const matrixCols = 'minmax(200px,1.6fr) repeat(' + (names.length + 1) + ',minmax(0,1fr)) 120px';
    const has = (a, n) => ((a.share || {})[n] || 0) >= 20;
    return '<section class="pane"><div class="pane-h"><h2>' + esc(crowded.length ? 'they’re fighting over ' + crowded[0].name.toLowerCase() + '.' : 'what your rivals are saying.') + '</h2><p>' + ads.length + (r.source === 'live' ? ' live Meta ads' : ' demo ads') + ' from ' + names.length + ' rivals, weighted by days running. Longevity is a hint, not proof: Meta doesn’t share spend.</p></div>' +
      '<div class="stat4"><div><b>' + ads.length + '</b><span>ads read</span></div><div><b>' + Math.round(avg(days(ads))) + 'D</b><span>average time running</span></div>' +
      '<div><b>' + (() => { const s = shares(ads, W); return Math.round((s.offer || 0) + (s['pain point'] || 0)); })() + '%</b><span>lead with a discount or a pain point</span></div>' +
      '<div><b>' + ((syn.niche || {}).underused_angles || []).length + '</b><span>angles no rival uses</span></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:14px"><h3 class="disp" style="font-size:clamp(24px,2.6vw,32px);line-height:1;font-weight:800">side by side</h3><div class="tbl"><div>' +
        '<div class="tr" style="grid-template-columns:' + cols + '"><span></span>' + names.map(n => '<span class="head"><i style="width:10px;height:10px;border-radius:2px;background:' + colorOf(n) + '"></i>' + esc(n) + '</span>').join('') + '<span class="head you"><i style="width:10px;height:10px;border-radius:2px;background:var(--teal)"></i>You</span></div>' +
        rows.map(([k, ...cells]) => '<div class="tr" style="grid-template-columns:' + cols + '"><span class="k">' + k + '</span>' + cells.map((c, i) => '<span' + (i === cells.length - 1 ? ' class="you"' : '') + '>' + esc(c) + '</span>').join('') + '</div>').join('') + '</div></div></div>' +
      '<div class="grid-auto" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))">' + names.map(n => {
        const as = byRival(n), s = sh(n), t2 = top(s, 2), hk = mostCommon(as.map(a => a.analysis.hook && a.analysis.hook.type));
        const long = as.slice().sort((a, b) => (b.days_running || 0) - (a.days_running || 0)).slice(0, 3);
        const icps = list.filter(a => ((a.share || {})[n] || 0) >= 25).sort((a, b) => b.share[n] - a.share[n]).slice(0, 2);
        return '<article class="rcard"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><h3><i style="background:' + colorOf(n) + '"></i>' + esc(n) + '</h3><span class="px8 s">' + as.length + ' ADS · AVG ' + Math.round(avg(days(as))) + 'D</span></div>' +
          '<p style="color:var(--soft)">' + (t2.length ? 'Leans on ' + t2.map(([k, v]) => esc(k) + ' (' + Math.round(v) + '%)').join(' and ') + (hk ? ', opening with ' + esc(hk) + ' hooks' : '') + '.' : 'Not enough ads read to say.') + '</p>' +
          '<div><p class="lab">LONGEST-RUNNING</p><div class="posts">' + long.map(a => '<div style="display:flex;flex-direction:column;gap:6px"><div class="thumb sq"' + (a.image_url ? ' style="background-image:url(\'' + esc(String(a.image_url).replace(/'/g, '%27')) + '\')"' : '') + '><span>' + (a.days_running || 0) + 'D</span></div><span style="font-size:13px;line-height:1.3">“' + esc(firstSentence(hookOf(a), 70)) + '”</span></div>').join('') + '</div></div>' +
          (icps.length ? '<div style="border-top:2px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:10px"><p class="lab" style="margin:0">WHO THEIR ADS TARGET · INFERRED</p>' + icps.map(a => { const others = names.filter(o => o !== n && has(a, o)); return '<div class="icpmini"><div><b>' + esc(a.name) + '</b><small style="color:' + (others.length ? '#F7862A' : '#3DBA4E') + '">' + (others.length ? 'shared with ' + esc(others.join(', ')) : 'low overlap') + '</small></div><p style="font-size:14px;color:var(--soft)">' + esc(a.who || '') + '</p></div>'; }).join('') + '</div>' : '') + '</article>';
      }).join('') + '</div>' +
      (list.length ? '<div style="display:flex;flex-direction:column;gap:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h3 class="disp" style="font-size:clamp(24px,2.6vw,32px);line-height:1;font-weight:800">who everyone targets</h3><button class="btn teal" data-act="edit-aud">Edit audiences</button></div><div class="tbl"><div>' +
        '<div class="tr" style="grid-template-columns:' + matrixCols + ';font:600 13px \'Funnel Sans\',sans-serif;color:var(--mute)"><span>Audience</span>' + names.map(n => '<span style="text-align:center;padding:12px">' + esc(n) + '</span>').join('') + '<span style="text-align:center;padding:12px">You</span><span>Status</span></div>' +
        list.map(a => { const nr = names.filter(n => has(a, n)).length, isYou = a.name === (tgt && tgt.name), only = isYou && !nr;
          return '<div class="tr" style="grid-template-columns:' + matrixCols + (only ? ';background:var(--navy2)' : '') + '"><span class="disp" style="font-weight:700;font-size:16px"><span' + (only ? ' class="hl" style="padding:0 .2em;border-radius:3px"' : '') + '>' + esc(a.name) + '</span></span>' +
            names.map((n, i) => '<span><i class="sqg" style="' + (has(a, n) ? 'background:' + COLORS[i % 3] : 'box-shadow:inset 0 0 0 2px var(--line)') + '"></i></span>').join('') + '<span><i class="sqg" style="' + (isYou ? 'background:var(--teal)' : 'box-shadow:inset 0 0 0 2px var(--line)') + '"></i></span>' +
            '<span><span class="chipst' + (only ? ' open' : '') + '">' + (only ? 'only you' : nr === 0 ? 'open' : nr === 1 ? 'one rival' : 'crowded') + '</span></span></div>'; }).join('') + '</div></div></div>' : '') +
      '<div class="nextrow"><button class="btn paper" data-act="tab" data-k="map">Next: see the map →</button></div></section>';
  }

  /* ---- Map ---- */
  function mapModel() {
    const ads = kept().filter(a => a.pos), vars = (S.run.variants || []).filter(v => v.pos), posts = brandPosts().filter(p => p.pos);
    const nodes = [
      ...ads.map(a => ({ id: 'r' + a.id, kind: 'rival', ad: a, rival: a.competitor, pos: a.pos, days: a.days_running || 0, hook: hookOf(a), angle: angleOf(a) })),
      ...posts.map((p, i) => ({ id: 'p' + i, kind: 'post', pos: p.pos, hook: firstSentence(p.caption || (p.analysis.hook && p.analysis.hook.line) || 'Instagram post', 80), angle: angleOf(p) })),
      ...vars.map(v => ({ id: 'n' + v.idx, kind: 'new', n: v.idx + 1, v, pos: v.pos, hook: v.overlay_text || v.headline, angle: v.angle })),
    ];
    const rivals = nodes.filter(n => n.kind === 'rival');
    const nearest = (node, k, pool) => (pool || rivals).filter(o => o.id !== node.id).map(o => ({ o, d: dist(node.pos, o.pos) })).sort((a, b) => a.d - b.d).slice(0, k);
    return { nodes, rivals, nearest };
  }
  function tabMap() {
    const r = S.run, m = mapModel(), names = runNames();
    if (!m.rivals.length) return '<section class="pane"><div class="pane-h"><h2>the map.</h2><p>No ad positions were available for this run.</p></div></section>';
    if (!m.nodes.find(n => n.id === S.mapSel)) S.mapSel = (m.nodes.find(n => n.kind === 'new') || m.rivals[0]).id;
    const sel = m.nodes.find(n => n.id === S.mapSel), near = m.nearest(sel, 3), nearIds = new Set(near.map(n => n.o.id));
    const X = (x) => 7 + (x + 1) / 2 * 86, Y = (y) => 7 + (1 - (y + 1) / 2) * 86;
    // where the rivals' weight sits, by quadrant
    const q = { '-1,-1': 0, '1,-1': 0, '-1,1': 0, '1,1': 0 }; let tot = 0;
    for (const n of m.rivals) { q[(n.pos.x < 0 ? -1 : 1) + ',' + (n.pos.y < 0 ? -1 : 1)] += W(n.ad); tot += W(n.ad); }
    const ranked = Object.entries(q).sort((a, b) => b[1] - a[1]);
    const openK = tot && ranked[3][1] / tot < 0.12 ? ranked[3][0] : null;
    const qn = (k) => { const [x, y] = k.split(',').map(Number); return (x < 0 ? 'facts' : 'feelings') + ' · ' + (y < 0 ? 'value' : 'premium'); };
    const quad = (k) => { const [x, y] = k.split(',').map(Number); return '<div class="q' + (openK === k ? ' open' : '') + (y > 0 ? '' : ' b') + (x > 0 ? ' r' : '') + '" style="left:' + (x < 0 ? 0 : 50) + '%;top:' + (y > 0 ? 0 : 50) + '%"><em>' + (openK === k ? 'open ground' : qn(k)) + '</em></div>'; };
    const vis = m.nodes.filter(n => S.layers[n.kind]);
    const lines = S.layers.rival ? near.map(({ o, d }) => { const x1 = X(sel.pos.x), y1 = Y(sel.pos.y), x2 = X(o.pos.x), y2 = Y(o.pos.y); return '<i class="ln" style="left:' + x1 + '%;top:' + y1 + '%;width:' + Math.hypot(x2 - x1, y2 - y1) + '%;transform:rotate(' + Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI + 'deg)"></i><span class="dl" style="left:' + (x1 + x2) / 2 + '%;top:' + (y1 + y2) / 2 + '%">' + r2(d) + '</span>'; }).join('') : '';
    const dots = vis.map(n => {
      const isSel = n.id === sel.id, isNear = nearIds.has(n.id), dim = !(isSel || isNear || n.kind === 'new');
      const base = n.kind === 'rival' ? { size: Math.min(26, 10 + Math.sqrt(n.days) * 0.8), r: '50%', bg: colorOf(n.rival), lab: '' } : n.kind === 'post' ? { size: 16, r: '50%', bg: '#0F2036', lab: '' } : { size: 30, r: '5px', bg: '#F5F8FC', lab: n.n };
      const ring = n.kind === 'post' ? 'inset 0 0 0 3px #37B7C3' : n.kind === 'rival' ? '0 0 0 1.5px #0F2036' : '0 3px 0 #37506E';
      return '<button class="n" data-act="pick-node" data-id="' + esc(n.id) + '" title="' + esc(n.kind === 'new' ? 'Your new ad ' + n.n : n.hook) + '" style="left:' + X(n.pos.x) + '%;top:' + Y(n.pos.y) + '%;width:' + base.size + 'px;height:' + base.size + 'px;border-radius:' + base.r + ';background:' + base.bg + ';box-shadow:' + (isSel ? ring + ',0 0 0 4px #F5F8FC' : ring) + ';opacity:' + (dim ? 0.38 : 1) + ';z-index:' + (isSel ? 5 : n.kind === 'new' ? 4 : 2) + (n.pos.estimated && n.kind === 'rival' ? ';outline:1.5px dashed #0B192C;outline-offset:-3px' : '') + '">' + base.lab + '</button>';
    }).join('');
    let verdict, vw;
    if (sel.kind === 'rival') { const d = near[0] ? near[0].d : 9; vw = distWord(d); verdict = d < 0.35 ? 'Nearly identical to another rival ad.' : 'Sits apart from most rival ads.'; }
    else { const d = near[0] ? near[0].d : 9; vw = distWord(d); verdict = r2(d) + ' from the nearest rival ad: ' + vw[0] + '.'; }
    const kind = sel.kind === 'rival' ? (sel.rival.toUpperCase() + ' AD · ' + sel.days + ' DAYS') : sel.kind === 'post' ? 'YOUR INSTAGRAM POST' : 'YOUR NEW AD ' + sel.n;
    // group distances
    const cent = names.map(n => { const as = m.rivals.filter(x => x.rival === n); const w = as.reduce((s, a) => s + W(a.ad), 0) || 1; return { n, k: as.length, p: { x: as.reduce((s, a) => s + a.pos.x * W(a.ad), 0) / w, y: as.reduce((s, a) => s + a.pos.y * W(a.ad), 0) / w } }; }).filter(c => c.k);
    const gd = [];
    for (let i = 0; i < cent.length; i++) for (let j = i + 1; j < cent.length; j++) gd.push([cent[i].n + ' ↔ ' + cent[j].n, dist(cent[i].p, cent[j].p)]);
    const postN = m.nodes.filter(n => n.kind === 'post'), newN = m.nodes.filter(n => n.kind === 'new');
    if (postN.length) gd.push(['Your posts ↔ nearest rival ad', avg(postN.map(p => m.nearest(p, 1)[0].d))]);
    if (newN.length) gd.push(['Your new ads ↔ nearest rival ad', avg(newN.map(p => m.nearest(p, 1)[0].d))]);
    const est = m.rivals.filter(n => n.pos.estimated).length;
    const layers = [['rival', 'Rival ads', '#F7862A', '50%', 'none'], ['post', 'Your posts', 'transparent', '50%', 'inset 0 0 0 2px #37B7C3'], ['new', 'Your new ads', '#F5F8FC', '2px', 'inset 0 0 0 2px #0B192C']].filter(l => l[0] !== 'post' || postN.length);
    return '<section class="pane"><div class="pane-h"><h2>' + (openK ? 'how far apart everyone really is.' : 'how far apart everyone really is.') + '</h2><p>Every ad and post is a dot. Close dots say the same thing (hook, angle, offer, audience). Far dots don’t. Tap any dot to see its nearest neighbours.' + (openK ? ' The ' + qn(openK) + ' corner is open.' : '') + '</p></div>' +
      '<div class="row">' + layers.map(([k, l, c, rad, ring]) => '<button class="pill' + (S.layers[k] ? ' on' : '') + '" data-act="layer" data-k="' + k + '"><i style="width:10px;height:10px;border-radius:' + rad + ';background:' + c + ';box-shadow:' + ring + '"></i>' + l + '</button>').join('') + '</div>' +
      '<div class="mapwrap"><div class="map">' + Object.keys(q).map(quad).join('') +
        '<span class="ax" style="left:10px;top:50%;transform:translateY(-50%)">RATIONAL</span><span class="ax" style="right:10px;top:50%;transform:translateY(-50%)">EMOTIONAL</span><span class="ax" style="left:50%;top:8px;transform:translateX(-50%)">PREMIUM-LED</span><span class="ax" style="left:50%;bottom:22px;transform:translateX(-50%)">VALUE-LED</span>' +
        lines + dots + '</div>' +
      '<aside style="display:flex;flex-direction:column;gap:14px"><div class="sidec"><p class="px s">' + esc(kind) + '</p><h3>' + esc(sel.kind === 'new' ? sel.hook : '“' + sel.hook + '”') + '</h3><p style="font-size:14px;color:var(--mute)">' + (sel.kind === 'post' ? 'From your last posts' : 'Angle: ' + esc(sel.angle || '')) + '</p>' +
        '<div class="verdict" style="background:' + vw[1] + '">' + esc(verdict) + '</div><p class="px s" style="margin-top:4px">NEAREST RIVAL ADS</p>' +
        near.map(({ o, d }) => '<button class="near" data-act="pick-node" data-id="' + esc(o.id) + '"><span style="font-size:14px"><i style="background:' + colorOf(o.rival) + '"></i>“' + esc(firstSentence(o.hook, 70)) + '”</span><span class="px y">' + r2(d) + '</span></button>').join('') + '</div>' +
      '<div class="sidec" style="gap:10px"><p class="px s">GROUP DISTANCES</p>' + gd.map(([k, d]) => { const w = distWord(d); return '<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--line)"><span style="font-size:14px">' + esc(k) + '<span style="display:block;font-size:12px;color:' + w[1] + '">' + w[0] + '</span></span><b class="y" style="font:10px \'Press Start 2P\',monospace">' + r2(d) + '</b></div>'; }).join('') + '<p style="font-size:12px;color:var(--dim)">0 = same message · 2.8 = opposite corners. Positions are AI estimates' + (est ? '; dashed dots are placed from the ad’s angle' : '') + '.</p></div></aside></div>' +
      '<div class="nextrow"><button class="btn paper" data-act="tab" data-k="ads">Next: your three ads →</button></div></section>';
  }

  /* ---- Ads ---- */
  /* ---- ad image: the brand's real product + colours, headline set in the brand's own font ---- */
  const fontsLoaded = new Set();
  function ensureFont(family) {
    if (!family || fontsLoaded.has(family)) return;
    fontsLoaded.add(family);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap';
    document.head.appendChild(l);
  }
  const fontCss = (f) => f ? "'" + String(f).replace(/'/g, '') + "', system-ui, sans-serif" : 'system-ui, sans-serif';
  function overlayHtml(im) {
    const o = im && im.overlay; if (!o || !o.text) return '';
    ensureFont(o.font);
    return '<div class="ovl" style="font-family:' + esc(fontCss(o.font)) + ';color:' + esc(o.color || '#fff') + '">' + esc(o.text) + '</div>';
  }
  function imagePanel(v) {
    const im = (S.run.images || []).find(i => i.idx === v.idx), st = S.img[v.idx] || {}, busy = st.state === 'busy';
    const credit = im && (im.photos || []).length ? '<p style="font-size:12px;color:var(--mute)">Mood photo from <a href="' + (im.photos[0].source === 'Pexels' ? 'https://www.pexels.com' : 'https://pixabay.com') + '" target="_blank" rel="noopener">' + esc(im.photos[0].source || 'Pixabay') + '</a>: ' + im.photos.map(p => '<a href="' + esc(p.page) + '" target="_blank" rel="noopener">' + esc(p.photographer) + '</a>').join(', ') + '.</p>' : '';
    const k = im && im.kit || {}, cols = k.colors || {};
    const swatches = [['primary', cols.primary], ['secondary', cols.secondary], ['background', cols.background], ['text', cols.text]].filter(x => x[1]).filter((x, i, a) => a.findIndex(y => y[1] === x[1]) === i);
    const kitRow = im ? '<div class="kit">' + swatches.map(([n, h]) => '<span title="' + esc(n + ' ' + h) + '"><i style="background:' + esc(h) + '"></i>' + esc(h) + '</span>').join('') +
      (k.fonts && (k.fonts.heading || k.fonts.body) ? '<span>Aa ' + esc([k.fonts.heading, k.fonts.body].filter((x, i, a) => x && a.indexOf(x) === i).join(' + ')) + '</span>' : '') + '</div>' : '';
    const real = im ? (k.product ? 'Painted from your real “' + esc(k.product) + '” photo' + (k.logo_used ? ' and logo' : '') + '. ' : 'No product photo found on your site, so the product is drawn from the description with no logo or lettering. ') : '';
    return '<div class="imgp"><p class="px s">AD IMAGE</p>' +
      (im ? '<div class="imgov"><img src="' + esc(im.url) + '" alt="Painted image for ad ' + (v.idx + 1) + '">' + overlayHtml(im) + '</div>' + kitRow +
        (im.variant_version !== (v.version || 1) ? '<p style="font-size:13px;color:var(--yellow)">Painted for an earlier version of this ad. Make a new one to match the rewrite.</p>' : '') +
        '<p style="font-size:12px;color:var(--mute)">' + real + (im.overlay ? 'Headline set in ' + esc(im.overlay.font || 'your brand font') + '. ' : 'No headline: the ad has no short on-image line without a [placeholder]. ') + (im.pexels_note ? esc(im.pexels_note) + '. ' : '') + 'Painted by Nano Banana · ' + usd(im.usd) + '</p>' + credit
        : '<p style="font-size:14px;color:var(--soft)">Paint this ad from your real product photos, brand colours and fonts. Takes about 20 seconds.</p>') +
      (st.error ? '<p class="err" style="font-size:14px">' + esc(st.error) + '</p>' : '') +
      '<div class="row"><button class="btn sm" style="height:40px"' + (busy ? ' disabled' : '') + ' data-act="img-make" data-i="' + v.idx + '">' + (busy ? 'Painting…' : im ? 'Make a new one' : 'Make the image') + '</button>' +
      (im ? '<button class="btn mid sm" style="height:40px" data-act="img-dl" data-i="' + v.idx + '">Download</button>' : '') + '</div></div>';
  }
  // the downloadable ad: the painted picture with the headline drawn in the brand's font, exactly as the preview shows it
  async function composeAd(idx) {
    const im = (S.run.images || []).find(i => i.idx === idx); if (!im) return null;
    const img = new Image(); img.crossOrigin = 'anonymous'; img.src = im.url; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    const o = im.overlay;
    if (o && o.text) {
      ensureFont(o.font); const px = Math.round(W * 0.082);
      try { await document.fonts.load(px + 'px "' + o.font + '"', o.text); } catch (_) {}
      g.font = px + 'px ' + fontCss(o.font); g.fillStyle = o.color || '#fff'; g.textAlign = 'center'; g.textBaseline = 'top';
      const words = o.text.split(' '), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > W * 0.88 && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, W / 2, H * 0.07 + i * px * 1.08));
    }
    return await new Promise(res => c.toBlob(res, 'image/png'));
  }
  async function downloadAd(idx) {
    try {
      const blob = await composeAd(idx); if (!blob) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'metacrok-ad-' + (idx + 1) + '.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { toast('Could not build the download: ' + e.message); }
  }
  async function makeImage(idx) {
    S.img[idx] = { state: 'busy' }; rerender();
    try {
      const r = await api('/images', { body: { run_id: S.id, idx } });
      S.run.images = [...(S.run.images || []).filter(i => i.idx !== idx), r].sort((a, b) => a.idx - b.idx);
      S.img[idx] = {};
      toast('Ad ' + (idx + 1) + ' painted · ' + usd(r.cost_usd));
    } catch (e) { S.img[idx] = { error: e.message }; }
    if (S.screen === 'results') rerender();
  }

  const imgOf = (idx) => (S.run.images || []).find(i => i.idx === idx);
  function tabAds() {
    const r = S.run, vars = r.variants || [], v = vars[S.sel];
    if (!v) return '<section class="pane"><div class="pane-h"><h2>your ads.</h2><p>No ads were written for this run.</p></div></section>';
    const m = mapModel(), nodeV = m.nodes.find(n => n.id === 'n' + v.idx), nr = nodeV ? m.nearest(nodeV, 1)[0] : null, insp = v.inspired_by || {};
    const src = S.ads.find(a => a.id === insp.ad_id);
    const brand = brandName(), handle = (r.input.brand.ig || brand).replace(/^@/, '').replace(/\s+/g, '').toLowerCase();
    const fields = [['Primary text', v.primary_text, 300], ['Headline', v.headline, 40], ['Description', v.description, 30], ['Button', v.cta, 0]];
    const w = nr ? distWord(nr.d) : null;
    return '<section class="pane"><div class="pane-h"><h2>three ads for the open space.</h2><p><mark class="ph">[Brackets]</mark> are yours to fill. We never invent ratings, offers or stories. Review, then paste into Ads Manager.</p></div>' +
      '<div class="row" style="align-items:center"><button class="btn" data-act="img-all"' + ([0, 1, 2].some(i => (S.img[i] || {}).state === 'busy') ? ' disabled' : '') + '>Make images for all ' + vars.length + '</button><span style="font-size:13px;color:var(--mute)">Each image is painted by Nano Banana from your real product photos, brand colours and fonts, about 3 to 4 cents per ad.</span></div>' +
      '<div class="grid-auto">' + vars.map((x, i) => '<button class="vbtn' + (i === S.sel ? ' on' : '') + '" data-act="sel-var" data-i="' + i + '"><div class="vhead"><span class="px y">AD ' + (x.idx + 1) + ' · V' + (x.version || 1) + '</span><span style="font:600 13px \'Funnel Sans\',sans-serif;color:var(--soft)">' + esc(x.angle) + '</span></div>' +
        '<div class="fb"><div class="who"><i></i><div><b>' + esc(handle) + '</b><small>Sponsored</small></div></div><p class="pt">' + esc(String(x.primary_text || '').replace(/\[([^\]]+)\]/g, '[$1]')) + '</p>' + (imgOf(x.idx) ? '<div class="art pic" style="background:url(' + esc(imgOf(x.idx).url) + ') center/cover">' + overlayHtml(imgOf(x.idx)) + '</div>' : '<div class="art" style="background:' + ART[(x.idx + (x.angle || '').length) % ART.length] + '">' + esc(x.overlay_text || x.headline) + '</div>') + '' +
        '<div class="bar"><div style="min-width:0"><b>' + esc(x.headline) + '</b><span class="d">' + esc(x.description) + '</span></div><span class="cta">' + esc(x.cta) + '</span></div></div></button>').join('') + '</div>' +
      '<div class="detail"><div class="col-g"><div class="row" style="align-items:center;gap:12px"><span class="px y">AD ' + (v.idx + 1) + '</span><h3 class="disp" style="font-size:30px;line-height:1;font-weight:800">' + esc(v.angle) + '</h3>' + (v.audience ? '<span style="font:600 12px \'Funnel Sans\',sans-serif;padding:4px 10px;border-radius:4px;background:var(--paper);color:var(--night)">for ' + esc(v.audience) + '</span>' : '') + '</div>' +
        fields.map(([l, t, max], i) => '<div class="field"><div class="fh"><span>' + l + (max ? ' <span class="px8" style="color:' + (String(t || '').length > max ? 'var(--red)' : 'var(--dim)') + ';margin-left:6px">' + String(t || '').length + '/' + max + '</span>' : '') + '</span><button class="btn mid sm" data-act="copy-field" data-i="' + i + '" style="height:32px">Copy</button></div><p>' + ph(t) + '</p></div>').join('') +
        '<button class="btn sm" style="align-self:flex-start;height:40px" data-act="copy-all">Copy the whole ad</button></div>' +
      '<div class="col-g" style="gap:18px">' + imagePanel(v) +
        (v.why_this_angle ? '<div><p class="lab">WHY THIS ANGLE</p><p style="color:var(--soft)">' + esc(v.why_this_angle) + '</p></div>' : '') +
        '<div><p class="lab">CREATIVE DIRECTION</p><p style="color:var(--soft)">' + esc(v.creative_direction) + '</p></div>' +
        (insp.competitor ? '<div class="dash">Structure borrowed from <b style="color:var(--paper)">' + esc(insp.competitor) + (src ? ', an ad running ' + (src.days_running || 0) + ' days' : '') + '</b>. Words are ours.' + (insp.what_we_borrowed ? ' ' + esc(insp.what_we_borrowed) : '') + '</div>' : '') +
        (nr ? '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:8px;background:var(--night)"><span style="font-size:14px;color:var(--soft)">Nearest rival ad <b class="y" style="font:10px \'Press Start 2P\',monospace;margin:0 6px">' + r2(nr.d) + '</b> away · <b style="color:' + w[1] + '">' + w[0] + '</b></span><button class="btn teal sm" style="height:34px" data-act="see-map" data-id="n' + v.idx + '">See on map</button></div>' : '') +
        '<div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--line);padding-top:16px"><p class="px s">TWEAK THIS AD</p><div class="row">' + ['shorter', 'punchier hook', 'more playful', 'for retargeting'].map(p => '<button class="pill" style="height:34px;padding:0 12px;font-size:13px" data-act="preset" data-v="' + p + '">' + p + '</button>').join('') + '</div>' +
        '<div style="display:flex;gap:8px"><input class="in" id="tweak-in" style="height:46px;font-size:15px" maxlength="240" value="' + esc(S.tweak) + '" placeholder="e.g. mention it’s fragrance-free"><button class="btn" data-act="rewrite">Rewrite</button></div><p style="font-size:13px;color:var(--mute)">Rewrites only this ad. Earlier versions are kept.</p></div></div></div>' +
      '</section>';
  }

  /* ---- Eaten ---- */
  function tabEaten() {
    const names = runNames(), all = S.ads.slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const list = all.filter(a => S.filter === 'All' || a.competitor === S.filter);
    return '<section class="pane"><div class="pane-h"><h2>every ad he ate.</h2><p>Longest-running first. Don’t trust a read? Set an ad aside or fix it. Nothing changes until you regenerate.</p></div>' +
      '<div class="row">' + ['All', ...names].map(f => '<button class="pill' + (S.filter === f ? ' on' : '') + '" data-act="filter" data-v="' + esc(f) + '">' + esc(f) + '</button>').join('') + '</div>' +
      '<div class="eaten">' + list.map(a => {
        const an = a.analysis || {}, fix = a.correction, angle = (fix && fix.angle) || an.angle, why = (fix && fix.note) || an.why_it_works;
        return '<article class="ead' + (a.excluded ? ' off' : '') + '"><div class="im"' + (a.image_url ? ' style="background-image:url(\'' + esc(String(a.image_url).replace(/'/g, '%27')) + '\')"' : '') + '>' + (a.image_url ? '' : '<span>' + esc(firstSentence(a.headline || a.body || '', 80)) + '</span>') + '<span class="days">' + (a.days_running || 0) + 'D' + (a.variants > 1 ? ' · ' + a.variants + 'V' : '') + '</span></div>' +
          '<div class="bd"><span><i style="background:' + colorOf(a.competitor) + '"></i>' + esc(a.competitor) + ' · <b style="color:' + (fix ? 'var(--mint)' : 'var(--paper)') + '">' + esc(angle || '') + '</b>' + (a.excluded ? ' · set aside' : '') + '</span>' +
          '<b>“' + esc(hookOf(a)) + '”</b><p>' + esc(why || '') + '</p>' +
          (a.ad_library_url ? '<a href="' + esc(a.ad_library_url) + '" target="_blank" rel="noopener" style="font-size:13px;color:var(--sky)">View ad ↗</a>' : '') +
          '<div class="row" style="margin-top:6px"><button class="btn ghost sm" data-act="aside" data-id="' + esc(a.id) + '">' + (a.excluded ? 'Restore' : 'Set aside') + '</button>' + (a.excluded ? '' : '<button class="btn ghost sm" data-act="fix" data-id="' + esc(a.id) + '">Wrong read?</button>') + (fix ? '<button class="btn ghost sm" data-act="unfix" data-id="' + esc(a.id) + '">Undo fix</button>' : '') + '</div></div></article>';
      }).join('') + '</div></section>';
  }

  /* ================= modals ================= */
  const modal = $('#modal');
  const closeModal = () => { modal.innerHTML = ''; M.kind = null; };
  const M = { kind: null, id: null, angle: '', note: '', target: '' };
  function fixModal(id) {
    const a = S.ads.find(x => x.id === id); if (!a) return;
    M.kind = 'fix'; M.id = id; M.angle = (a.correction && a.correction.angle) || angleOf(a) || ''; M.note = (a.correction && a.correction.note) || '';
    modal.innerHTML = '<div class="modal" data-act="close-modal"><div data-stop="1"><div style="display:flex;justify-content:space-between;align-items:start;gap:12px"><div><p class="px s">FIX THE READ</p><h3>“' + esc(hookOf(a)) + '”</h3><p style="font-size:14px;color:var(--mute);margin-top:4px">' + esc(a.competitor) + ' · read as <b>' + esc((a.analysis || {}).angle || '') + '</b></p></div><button class="x" data-act="close-modal" aria-label="Close">×</button></div>' +
      '<div><p style="font:600 14px \'Funnel Sans\',sans-serif;color:var(--soft);margin-bottom:8px">What angle is it really?</p><div class="row" id="fix-angles">' + (S.angles || []).map(x => '<button class="pill' + (M.angle === x ? ' on' : '') + '" style="height:36px;padding:0 12px;font-size:13px" data-act="fix-angle" data-v="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div></div>' +
      '<label class="fld"><span>What does it actually do? <span style="color:var(--mute);font-weight:400">optional</span></span><textarea class="in" id="fix-note" rows="2" maxlength="200" placeholder="It’s really a launch teaser, not an offer">' + esc(M.note) + '</textarea></label>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn" data-act="save-fix">Save fix</button></div></div></div>';
  }
  function audRow(a, i, target) {
    return '<div class="erow"><input class="in n" value="' + esc(a.name) + '" maxlength="40" aria-label="Audience name" placeholder="Audience name"><input class="in w" value="' + esc(a.who || '') + '" maxlength="120" aria-label="Who they are" placeholder="Who they are"><input class="in d" value="' + esc(a.need || '') + '" maxlength="100" aria-label="What they want" placeholder="What they want">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><label style="font-size:14px;display:flex;gap:6px;align-items:center"><input type="radio" name="aud-t"' + (a.name && a.name === target ? ' checked' : '') + '> Target this one</label><button class="link" data-act="aud-rm">Remove</button></div></div>';
  }
  function audModal() {
    const r = S.run, list = (r.icp && r.icp.audiences) || auds().map(a => ({ name: a.name, who: a.who, need: a.need })), target = targetName();
    M.kind = 'aud';
    modal.innerHTML = '<div class="modal" data-act="close-modal"><div data-stop="1"><div style="display:flex;justify-content:space-between;align-items:start;gap:12px"><div><p class="px s">YOUR AUDIENCES</p><h3>Who are the ads for?</h3><p style="font-size:14px;color:var(--mute);margin-top:4px">Replace the inferred audiences with your own and pick one to aim at. Takes effect when you regenerate.</p></div><button class="x" data-act="close-modal" aria-label="Close">×</button></div>' +
      '<div id="aud-list" style="display:flex;flex-direction:column;gap:10px">' + list.map((a, i) => audRow(a, i, target)).join('') + '</div>' +
      '<div class="row" style="justify-content:space-between;align-items:center"><div class="row"><button class="link" data-act="aud-add">Add an audience</button>' + (r.icp ? '<button class="link" data-act="aud-reset">Back to inferred</button>' : '') + '</div><div class="row"><button class="btn ghost" data-act="close-modal">Cancel</button><button class="btn" data-act="aud-save">Save audiences</button></div></div></div></div>';
  }

  /* ================= actions ================= */
  async function control(id, action, extra) {
    try {
      const r = await api('/runs/control', { body: { run_id: S.id, ad_id: id, action, ...extra } });
      const a = S.ads.find(x => x.id === id); if (a) { a.excluded = r.excluded; a.correction = r.correction; }
      S.pending = r.pending; return true;
    } catch (e) { toast(e.message); return false; }
  }
  async function act(name, el, ev) {
    const d = el.dataset;
    switch (name) {
      case 'go': if (d.k === 'feed') return showFeed(); if (d.k === 'results' && S.run && S.run.status === 'done') return showResults(); if (d.k === 'chew' && S.id) return; return;
      case 'add-rival': if (addRival(F.rivalInput)) F.rivalInput = ''; return showFeed();
      case 'rm-rival': F.rivals.splice(Number(d.i), 1); return showFeed();
      case 'suggest': return suggest();
      case 'pick-sug': { const c = F.sug[Number(d.i)], at = F.rivals.findIndex(r => r.name.toLowerCase() === c.name.toLowerCase()); if (at >= 0) F.rivals.splice(at, 1); else if (!addRival(c.name, c.website || c.instagram || '')) toast('Three rivals is the limit. Remove one first.'); return showFeed(); }
      case 'goal': F.goal = d.v; return showFeed();
      case 'demo': Object.assign(F, { name: 'Acme Glow', url: '', ig: '', rivals: ['glowritual', 'dewdrift', 'barebae'].map(n => ({ name: n, hint: '' })), demo: true, error: '' }); toast('Demo brands loaded (fictional skincare pack)'); return showFeed();
      case 'live': F.demo = false; return showFeed();
      case 'feed': return feed();
      case 'rescue-run': {
        const picked = $$('[data-resc]').filter(x => x.checked).map(x => S.rescueList[Number(x.dataset.resc)]).filter(Boolean);
        if (!picked.length) return toast('Tick at least one rival.');
        const p = { ...basePayload(), mode: 'auto', competitors: picked.map(c => ({ name: c.name, hint: c.website || c.instagram || '' })) }; delete p.market;
        el.disabled = true; try { await startRun(p); } catch (e) { toast(e.message); el.disabled = false; } return;
      }
      case 'rescue-market': { const p = { ...basePayload(), mode: 'auto', competitors: [], market: true }; el.disabled = true; try { await startRun(p); } catch (e) { toast(e.message); el.disabled = false; } return; }
      case 'retry-live': { const p = { ...(S.lastPayload || payload()), mode: 'auto' }; try { await startRun(p); } catch (e) { toast(e.message); } return; }
      case 'retry-demo': { const p = { ...(S.lastPayload || payload()), mode: 'seed' }; if (!p.competitors || !p.competitors.length) p.competitors = ['glowritual', 'dewdrift', 'barebae'].map(n => ({ name: n, hint: '' })); try { await startRun(p); } catch (e) { toast(e.message); } return; }
      case 'share': return copy(location.href, 'Share link copied');
      case 'tab': S.tab = d.k; return rerender(true);
      case 'sel-var': S.sel = Number(d.i); return rerender();
      case 'see-map': S.mapSel = d.id; S.tab = 'map'; return rerender(true);
      case 'pick-node': S.mapSel = d.id; return rerender();
      case 'layer': S.layers[d.k] = !S.layers[d.k]; return rerender();
      case 'filter': S.filter = d.v; return rerender();
      case 'preset': S.tweak = d.v; return rerender();
      case 'copy-field': { const v = S.run.variants[S.sel], f = [v.primary_text, v.headline, v.description, v.cta][Number(d.i)]; return copy(f, 'Copied'); }
      case 'copy-all': { const v = S.run.variants[S.sel]; return copy([v.primary_text, '', 'Headline: ' + v.headline, 'Description: ' + v.description, 'CTA: ' + v.cta, '', 'Creative: ' + v.creative_direction, 'Text on image: ' + (v.overlay_text || ''), 'Angle: ' + v.angle].join('\n'), 'Copied. Paste it into Ads Manager.'); }
      case 'img-make': return makeImage(Number(d.i));
      case 'img-dl': return downloadAd(Number(d.i));
      case 'img-all': return void (await Promise.all((S.run.variants || []).map(v => makeImage(v.idx))));
      case 'rewrite': {
        const inp = $('#tweak-in'), text = ((inp && inp.value) || S.tweak).trim(); if (!text) return toast('Say how to change it first');
        el.disabled = true; el.textContent = 'Rewriting…';
        try { const nv = await api('/tweak', { body: { run_id: S.id, idx: S.sel, instruction: text } }); const i = S.run.variants.findIndex(v => v.idx === S.sel); S.run.variants[i] = { ...S.run.variants[i], ...nv }; S.tweak = ''; toast('Ad ' + (S.sel + 1) + ' rewritten · v' + nv.version); }
        catch (e) { toast(e.message); }
        return rerender();
      }
      case 'aside': { const a = S.ads.find(x => x.id === d.id); el.disabled = true; if (await control(d.id, a && a.excluded ? 'restore' : 'exclude')) { rerender(); renderFloat(); } else el.disabled = false; return; }
      case 'unfix': if (await control(d.id, 'clear')) rerender(); return;
      case 'fix': return fixModal(d.id);
      case 'fix-angle': M.angle = d.v; $$('#fix-angles .pill').forEach(b => b.classList.toggle('on', b.dataset.v === M.angle)); return;
      case 'save-fix': { const note = ($('#fix-note').value || '').trim(); if (!M.angle && !note) return toast('Pick an angle or say what the ad does.'); const id = M.id; closeModal(); if (await control(id, 'correct', { angle: M.angle, note })) { toast('Fix saved'); rerender(); } return; }
      case 'close-modal': if (ev.target.closest('[data-stop]') && !el.classList.contains('x') && el.tagName !== 'BUTTON') return; return closeModal();
      case 'edit-aud': return audModal();
      case 'aud-add': { const l = $('#aud-list'); if ($$('.erow', l).length >= 6) return toast('Six audiences is the limit.'); l.insertAdjacentHTML('beforeend', audRow({ name: '' }, 0, '')); return; }
      case 'aud-rm': el.closest('.erow').remove(); return;
      case 'aud-reset': return saveAud(null);
      case 'aud-save': { const rows = $$('#aud-list .erow'); const list = rows.map(r => ({ name: $('.n', r).value.trim(), who: $('.w', r).value.trim(), need: $('.d', r).value.trim() })).filter(a => a.name); const t = rows.find(r => $('input[type=radio]', r).checked); if (!list.length) return toast('Add at least one audience.'); return saveAud(list, t ? $('.n', t).value.trim() : null); }
      case 'regen': { el.disabled = true; try { await api('/runs/regenerate', { body: { id: S.id } }); S.pending = 0; renderFloat(); S.tab = 'ads'; openRun(S.id, true); } catch (e) { toast(e.message); el.disabled = false; } return; }
    }
  }
  async function saveAud(audiences, target) {
    try {
      const res = await api('/runs/icp', { body: { id: S.id, audiences, target } });
      S.run.icp = res.icp; S.pending = res.pending; closeModal(); rerender();
      toast(audiences ? 'Saved. Regenerate to aim the ads at them.' : 'Back to the inferred audiences. Regenerate to apply.');
    } catch (e) { toast(e.message); }
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.classList.contains('modal') && e.target !== b) return; // backdrop click only
    if (b.disabled) return;
    act(b.dataset.act, b, e);
  });
  document.addEventListener('input', (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f || !(f in F)) return;
    F[f] = e.target.value; if (f !== 'rivalInput') { F.error = ''; if (f === 'url' || f === 'name') { /* keep demo flag until rivals change */ } }
    if (f === 'market') return; feedSummary();
  });
  document.addEventListener('change', (e) => { const f = e.target.dataset && e.target.dataset.f; if (f === 'market') F.market = e.target.value; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) { e.preventDefault(); act(e.target.dataset.enter, e.target, e); }
    if (e.key === 'Escape' && M.kind) closeModal();
  });
  window.addEventListener('popstate', () => { if (location.search !== shownSearch) location.reload(); });

  /* ---------------- start ---------------- */
  const qs = new URLSearchParams(location.search);
  if (qs.get('brand')) { const b = qs.get('brand'); if (/\.|@/.test(b)) F.url = b; else F.name = b; }
  const rid = qs.get('run');
  if (rid && /^[a-z0-9]{6,20}$/.test(rid)) openRun(rid); else showFeed();
})();
