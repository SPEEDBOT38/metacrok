/* metacrok app — 1 FEED -> 2 CHEW -> 3 FRESH OUT */
(function () {
  'use strict';
  const API = (window.__HATCHABLE__ && window.__HATCHABLE__.api) || '/api';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shownSearch = location.search; // the run on screen; a hash-only change (subnav anchors) must not reload
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const marks = (s) => esc(s).replace(/\[([^\]]{1,60})\]/g, '<mark title="fill this in">[$1]</mark>');
  const usd = (n, d = 4) => '$' + (Number(n) || 0).toFixed(d);
  const DEV = /[?&]dev=1/.test(location.search) || (() => { try { return localStorage.getItem('metacrok-dev') === '1'; } catch (_) { return false; } })();

  async function api(path, opts) {
    const o = opts || {};
    const res = await fetch(API + path, {
      method: o.body ? 'POST' : 'GET',
      headers: o.body ? { 'content-type': 'application/json' } : {},
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
    let j = null;
    try { j = await res.json(); } catch (_) {}
    if (!res.ok) { const e = new Error((j && j.error) || ('Request failed (' + res.status + ')')); e.status = res.status; throw e; }
    return j;
  }

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* ---- page + step indicator ---- */
  const ORDER = ['feed', 'chew', 'fresh'];
  function setStep(step) {
    const at = ORDER.indexOf(step);
    $$('.steps li').forEach((li, i) => {
      if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      li.classList.toggle('done', i < at);
    });
    document.title = { feed: 'Feed the gator', chew: 'Chewing…', fresh: 'Fresh out' }[step] + ' — metacrok';
  }

  /* ================= PAGE 1 · FEED ================= */
  api('/status').then(s => {
    const el = $('#pull-mode');
    if (s.live_pull) { el.className = 'mode live'; $('span', el).textContent = 'live ad library'; el.title = 'Live Meta Ad Library pull is on'; }
    else { el.className = 'mode seed'; $('span', el).textContent = 'demo seed'; el.title = 'Live pull off (' + (s.live_reason || 'not connected') + '): runs use the demo seed'; }
  }).catch(() => { $('#pull-mode').hidden = true; });

  // the blanks in the sentence grow with what's typed (field-sizing where supported, size= elsewhere)
  if (!CSS.supports('field-sizing', 'content')) {
    $$('.blank input').forEach(i => { const f = () => { i.size = Math.max(4, (i.value || i.placeholder).length); }; i.addEventListener('input', f); f(); });
  }

  const qs = new URLSearchParams(location.search);
  if (qs.get('brand')) {
    const b = qs.get('brand');
    if (/\.|@/.test(b)) $('#f-url').value = b; else $('#f-name').value = b;
  }

  $('#btn-demo-names').addEventListener('click', () => {
    ['glowritual', 'dewdrift', 'barebae'].forEach((n, k) => { $$('.f-comp')[k].value = n; });
    toast('Demo brands loaded (fictional skincare pack)');
  });

  $('#btn-suggest').addEventListener('click', async () => {
    const name = $('#f-name').value.trim(), url = $('#f-url').value.trim();
    const box = $('#suggestions'), btn = $('#btn-suggest');
    if (!name && !url) { $('#ob-error').textContent = 'Add your brand name or website first, so he knows whose rivals to sniff out.'; $('#f-name').focus(); return; }
    $('#ob-error').textContent = '';
    btn.disabled = true; btn.textContent = 'Sniffing around (≈20s)…';
    box.hidden = false; box.innerHTML = '<p class="hint">Searching the web for D2C brands in your niche…</p>';
    try {
      const r = await api('/suggest', { body: { brand_name: name, brand_url: url, country: $('#f-country').value } });
      box.innerHTML = '<p class="hint">Niche: <b>' + esc(r.niche || 'your category') + '</b>. Pick up to 3.</p>' +
        r.competitors.map(c => '<button type="button" class="sug" aria-pressed="false" data-label="' + esc(c.name) + '">' +
          '<span class="tick">✓</span><span><b>' + esc(c.name) + '</b> <span class="mono">' + esc(c.instagram || c.website || '') + '</span><small>' + esc(c.why) + '</small></span></button>').join('');
      $$('.sug', box).forEach(b => b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') === 'true';
        if (!on && $$('.sug[aria-pressed="true"]', box).length >= 3) { toast('Three is the limit. Unpick one first.'); return; }
        b.setAttribute('aria-pressed', String(!on));
        const names = $$('.sug[aria-pressed="true"]', box).map(x => x.dataset.label);
        $$('.f-comp').forEach((inp, k) => { inp.value = names[k] || ''; });
      }));
    } catch (e) {
      box.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
    } finally {
      btn.disabled = false; btn.textContent = 'Not sure? Let him sniff out 5';
    }
  });

  function formPayload() {
    return {
      brand_name: $('#f-name').value.trim(),
      brand_url: $('#f-url').value.trim(),
      brand_ig: $('#f-ig').value.trim(),
      competitors: $$('.f-comp').map(i => i.value.trim()).filter(Boolean),
      goal: ($('input[name="goal"]:checked') || {}).value,
      notes: $('#f-notes').value.trim(),
      country: $('#f-country').value,
      mode: $('#f-demo').checked ? 'seed' : 'auto',
    };
  }

  $('#ob-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const p = formPayload(), err = $('#ob-error');
    if (!p.brand_name && !p.brand_url) { err.textContent = 'Tell him your brand name or website.'; $('#f-name').focus(); return; }
    if (!p.competitors.length && p.mode !== 'seed') { err.textContent = 'Name at least one competitor, or let him sniff some out.'; $$('.f-comp')[0].focus(); return; }
    err.textContent = '';
    const btn = $('#btn-feed'); btn.disabled = true; btn.textContent = 'Opening wide…';
    try { await startRun(p); }
    catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Feed him'; }
  });

  /* ================= PAGE 2 · CHEW ================= */
  let lastPayload = null;
  const S = { id: null, since: 0, adsShown: false, done: false, run: null, clockT: null, ads: null, word: '' };

  async function startRun(p) {
    lastPayload = p;
    const r = await api('/runs/create', { body: p });
    history.pushState({}, '', '/app?run=' + r.id);
    shownSearch = location.search;
    openRun(r.id);
  }

  const STAGE_WORD = { brand: 'SNIFFING', pull: 'FEEDING', analyze: 'CHEWING', synthesize: 'DIGESTING', generate: 'SPITTING', done: 'FRESH OUT' };
  const STAGE_LABEL = { brand: 'reading your page', pull: 'pulling live competitor ads', analyze: 'reading every ad and your Instagram', synthesize: 'finding what works + the whitespace', generate: 'writing in your voice', done: 'done' };

  function fitTitle() {
    const box = $('.sc-title'), w = $('#scene-word'), f = $('#scene-fill');
    if (!box || !box.clientWidth) return;
    w.style.fontSize = f.style.fontSize = '';
    const fs = parseFloat(getComputedStyle(w).fontSize);
    const need = w.scrollWidth, have = box.clientWidth;
    if (need > have) w.style.fontSize = f.style.fontSize = Math.floor(fs * have / need * 0.98) + 'px';
  }
  window.addEventListener('resize', () => { clearTimeout(fitTitle._t); fitTitle._t = setTimeout(fitTitle, 120); });

  function setWord(stage) {
    $('#scene').dataset.stage = stage;
    const word = STAGE_WORD[stage] || 'FEEDING';
    if (S.word !== word) {
      S.word = word;
      $('#scene-word').textContent = word;
      $('#scene-fill').innerHTML = [...word].map((c, i) => '<span class="lt" style="animation-delay:' + (i * 0.09) + 's">' + esc(c) + '</span>').join('');
      fitTitle();
    }
    const chewing = stage === 'analyze' || stage === 'synthesize';
    $('#scene-fill').classList.toggle('chewing', chewing && !reduceMotion);
    const src = chewing ? '/img/gator-sit.webp' : '/img/gator-chomp.webp';
    if (!$('#scene-gator').src.endsWith(src)) $('#scene-gator').src = src;
  }

  function openRun(id, again) {
    Object.assign(S, { id, since: 0, adsShown: !!again, done: false, ads: null, word: '' }); // again = a regenerate: don't replay the ads flying in
    $('#onboard').hidden = true; $('#run').hidden = false; $('#results').hidden = true;
    $('#run').classList.remove('finished');
    delete $('#results').dataset.rendered;
    $('#run-error').hidden = true; $('#log').innerHTML = ''; $('#log-final').innerHTML = '';
    setStep('chew');
    window.scrollTo(0, 0);
    setWord('brand');
    driveAdvance(id);
    pollLoop(id);
  }

  async function driveAdvance(id) {
    let fails = 0;
    while (S.id === id && !S.done) {
      try {
        const r = await api('/runs/advance', { body: { id } });
        fails = 0;
        if (r.busy) await sleep(1500);
        if (r.status && r.status !== 'running') break;
      } catch (e) {
        fails++;
        if (fails >= 4) { showError('Lost the connection to the gator: ' + e.message); break; }
        await sleep(1500 * fails);
      }
    }
  }

  async function pollLoop(id) {
    let fails = 0;
    while (S.id === id) {
      try {
        const r = await api('/runs/get?id=' + encodeURIComponent(id) + '&since=' + S.since + (!S.ads ? '&ads=1' : ''));
        fails = 0;
        render(r);
        if (r.status !== 'running') { S.done = true; break; }
      } catch (e) {
        fails++;
        if (e.status === 404) { showError(e.message); S.done = true; break; }
        if (fails >= 6) { showError('Can’t reach the run: ' + e.message); break; }
      }
      await sleep(1200);
    }
  }

  function render(r) {
    S.run = r;
    $('#rb-brand').textContent = (r.brand && r.brand.name) || r.input.brand.name || r.input.brand.url;
    const comps = (r.competitors && r.competitors.length ? r.competitors : r.input.competitors).map(c => c.name);
    $('#rb-comps').textContent = comps.join(', ') || 'demo competitors';
    if (r.source) {
      const live = r.source === 'live', b = $('#rb-source');
      b.hidden = false; b.textContent = live ? 'live ad library' : (r.source === 'seed-saved' ? 'saved seed' : 'demo seed');
      b.className = 'badge ' + (live ? 'live' : 'seed');
    }
    tickClock(r);
    if (r.logs && r.logs.length) {
      const ol = $('#log'), fin = $('#log-final');
      for (const l of r.logs) {
        const li = document.createElement('li'); li.className = l.kind; li.textContent = l.line;
        ol.appendChild(li); fin.appendChild(li.cloneNode(true));
        S.since = Math.max(S.since, l.id);
      }
      while (ol.children.length > 10) ol.removeChild(ol.firstChild); // the full log lives in the results
    }
    setWord(r.status === 'done' ? 'done' : r.stage);
    const pct = r.progress || 0;
    $('#pct').textContent = pct + '%';
    $('#rule').style.transform = 'scaleX(' + (pct / 100) + ')';
    $('#scene-fill').style.clipPath = 'inset(0 ' + Math.max(0, 100 - pct) + '% 0 0)';
    $('#stage-label').textContent = STAGE_LABEL[r.stage] || '';
    if (r.angles) S.angles = r.angles;
    if (r.status === 'done') S.pending = r.controls_pending || 0;
    if (r.ads && r.ads.length) {
      S.ads = r.ads;
      if (!S.adsShown) { S.adsShown = true; if (r.status === 'running') flyAds(r.ads); }
    }
    renderCost(r);
    if (r.status === 'error') showError(r.error || 'Something went wrong.');
    if (r.ig_posts) S.igPosts = r.ig_posts;
    if (r.status === 'done' && r.variants && !$('#results').dataset.rendered) {
      if (r.ads) renderResults(r);
      else api('/runs/get?id=' + encodeURIComponent(r.id) + '&since=999999999&ads=1').then(full => {
        S.ads = full.ads || S.ads; S.igPosts = full.ig_posts || S.igPosts; S.angles = full.angles || S.angles;
        renderResults({ ...r, ...full, logs: [] });
      }).catch(() => renderResults(r));
    }
  }

  function elapsed(r) {
    const end = r.finished_at ? new Date(r.finished_at).getTime() : Date.now();
    return (end - new Date(r.created_at).getTime()) / 1000;
  }
  function tickClock(r) {
    clearInterval(S.clockT);
    const f = () => { $('#rb-clock').textContent = elapsed(r).toFixed(1) + 's'; };
    f();
    if (!r.finished_at && r.status === 'running') S.clockT = setInterval(f, 100);
  }

  function showError(msg) {
    $('#run-error').hidden = false;
    $('#run-error-msg').textContent = msg;
    clearInterval(S.clockT);
  }
  $('#btn-retry-demo').addEventListener('click', async () => {
    const r = S.run;
    const p = lastPayload || (r && {
      brand_name: r.input.brand.name, brand_url: r.input.brand.url, competitors: r.input.competitors.map(c => c.input || c.name),
      goal: r.input.goal, notes: r.input.notes, country: r.input.country,
    }) || {};
    p.mode = 'seed';
    if (!p.competitors || !p.competitors.length) p.competitors = ['glowritual', 'dewdrift', 'barebae'];
    try { await startRun(p); } catch (e) { toast(e.message); }
  });

  /* ---- ads fly into the gator ---- */
  const HUES = { peach: ['#f7b267', '#f4845f'], blush: ['#f9a8c9', '#c94f7c'], gold: ['#ffd56b', '#e8a33d'], violet: ['#b08cff', '#6a3bd1'], ember: ['#ff9a5a', '#c2410c'], ink: ['#3a3a40', '#111114'], teal: ['#7bdff2', '#2a7f9e'], sun: ['#ffe066', '#f59e0b'], clay: ['#d9a07a', '#8a4b2d'], rose: ['#ff8fab', '#d6336c'], sky: ['#9ad1ff', '#3b82f6'], mint: ['#b2f7a3', '#43aa8b'], slate: ['#94a3b8', '#334155'] };
  function hashStr(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }
  function thumbStyle(a) {
    if (a.image_url) return 'background-image:url(' + String(a.image_url).replace(/[()'"\s]/g, encodeURIComponent) + ')';
    const h = HUES[a.hue] || HUES[['peach', 'violet', 'teal', 'mint', 'rose', 'gold'][Math.abs(hashStr(a.id)) % 6]];
    return 'background:linear-gradient(135deg,' + h[0] + ',' + h[1] + ')';
  }

  function flyAds(ads) {
    if (reduceMotion) return;
    const scene = $('#scene'), gator = $('#scene-gator'), box = $('#flyers');
    const sr = scene.getBoundingClientRect(), gr = gator.getBoundingClientRect();
    const mouth = { x: gr.left - sr.left + gr.width * 0.28, y: gr.top - sr.top + gr.height * 0.3 };
    const crumbs = $('#crumbs'); crumbs.style.left = mouth.x + 'px'; crumbs.style.top = mouth.y + 'px';
    const fw = sr.width < 600 ? 88 : 120, fh = sr.width < 600 ? 80 : 108;
    ads.slice(0, sr.width < 600 ? 12 : 18).forEach((a, i) => {
      const el = document.createElement('div');
      el.className = 'flyer';
      el.innerHTML = '<div class="th" style="' + thumbStyle(a) + '"></div><p>' + esc(a.competitor) + ' · ' + (a.days_running || 0) + 'd</p>';
      // they fly in the gator's lane (right side, upper half), never across the numbers and the log
      const x0 = sr.width * 0.5 + Math.random() * Math.max(10, sr.width * 0.5 - fw), y0 = 40 + Math.random() * Math.max(10, sr.height * 0.4 - fh);
      el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; el.style.opacity = 0;
      box.appendChild(el);
      const dx = mouth.x - x0 - fw / 2, dy = mouth.y - y0 - fh / 2, rot = Math.random() * 16 - 8;
      const anim = el.animate([
        { opacity: 0, transform: 'rotate(' + rot + 'deg) scale(.9)' },
        { opacity: 1, offset: 0.15, transform: 'rotate(' + rot + 'deg) scale(1)' },
        { opacity: 1, offset: 0.82, transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(18deg) scale(.45)' },
        { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(24deg) scale(.05)' },
      ], { duration: 1400, delay: i * 240, easing: 'cubic-bezier(.55,0,.75,.6)', fill: 'forwards' });
      anim.onfinish = () => { el.remove(); chomp(); };
    });
  }
  function chomp() {
    $('#scene-gator').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06,.86)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-in-out' });
    const cols = ['#F58545', '#DD2A7B', '#8134AF', '#FFC24B'], box = $('#crumbs');
    for (let i = 0; i < 8; i++) {
      const c = document.createElement('div'); c.className = 'crumb'; c.style.background = cols[i % 4]; box.appendChild(c);
      c.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: 'translate(' + (Math.random() * 160 - 80) + 'px,' + (Math.random() * 130 - 100) + 'px) rotate(' + (Math.random() * 360) + 'deg) scale(.4)', opacity: 0 }],
        { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => c.remove();
    }
  }

  /* ================= PAGE 3 · FRESH OUT: the story ================= */
  const COMP_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)'];
  const cap = (s) => { const t = String(s || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
  const listJoin = (a) => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
  const round2 = (n) => (Math.round(n * 100) / 100).toFixed(2);
  function adById(id) { return (S.ads || []).find(a => a.id === id); }
  function brandName(r) { return (r.brand && r.brand.name) || r.input.brand.name || 'your brand'; }
  function compNames(r) { return (r.competitors && r.competitors.length ? r.competitors : r.input.competitors || []).map(c => c.name); }
  function compColor(r, name) { const i = compNames(r).indexOf(name); return COMP_COLORS[(i < 0 ? 0 : i) % COMP_COLORS.length]; }
  function keptAds() { return (S.ads || []).filter(a => !a.excluded && a.analysis); }
  function angleOf(x) { return (x.correction && x.correction.angle) || (x.analysis && x.analysis.angle) || x.angle || null; }
  function firstSentence(s, max) {
    const t = String(s || '').trim(); const m = t.match(/^.+?[.!?](?=\s|$)/);
    let f = m ? m[0] : t; max = max || 180;
    return f.length > max ? f.slice(0, max).replace(/\s+\S*$/, '') + '…' : f;
  }
  // share of each angle in a set of items, weighted (ads count by how long they ran)
  function shares(items, w) {
    const out = {}; let tot = 0;
    for (const x of items) { const a = angleOf(x); if (!a) continue; const k = w ? w(x) : 1; out[a] = (out[a] || 0) + k; tot += k; }
    for (const k in out) out[k] = tot ? out[k] / tot * 100 : 0;
    return out;
  }
  const W = (a) => a.weight || 1;
  function brandPosts() { return (S.igPosts || []).filter(p => p.is_brand && p.analysis); }

  /* ---- 1 · the verdict ---- */
  function chVerdict(r) {
    const syn = r.synthesis || {}, niche = syn.niche || {};
    // the verdict is the open space, said short; the full read sits under it
    const ws = String(niche.whitespace || '');
    const open = String(niche.headline_open || (niche.underused_angles || [])[0] || '').replace(/[.]+$/, '');
    $('#v-head').innerHTML = open ? 'Nobody owns <span class="open-word">' + esc(open) + '</span> yet.' : esc(firstSentence(ws, 90) || 'Here is what your rivals are saying.');
    const over = (niche.overused_angles || []).slice(0, 3);
    $('#v-sub').textContent = [ws, over.length ? 'Your rivals lean on ' + listJoin(over) + '.' : ''].filter(Boolean).join(' ');
    const ads = keptAds(), pulled = Number(((r.cost || {}).pull || {}).ads) || 0;
    const long30 = ads.filter(a => (a.days_running || 0) >= 30).length;
    $('#run-summary').innerHTML = [
      brandName(r) + ' vs ' + listJoin(compNames(r)),
      'Read ' + ads.length + ' ads' + (pulled > ads.length ? ' (the strongest of ' + pulled + ' the Ad Library returned)' : ''),
      long30 + ' ran 30+ days (a hint, not proof)',
      (brandPosts().length ? brandPosts().length + ' of your Instagram posts' : ''),
      elapsed(r).toFixed(0) + 's',
      usd((r.cost || {}).total_usd, 3),
    ].filter(Boolean).map(s => '<span>' + esc(s) + '</span>').join('');
    const note = $('#seed-note');
    if (r.source && r.source !== 'live') {
      note.hidden = false;
      note.innerHTML = r.source === 'seed' ?
        '<b>Demo ads.</b> These rival ads are a fictional sample pack, not your real rivals. Connect Apify for a live pull. The ads are still written for ' + esc(brandName(r)) + '.' :
        '<b>Saved ads.</b> Rival ads come from an earlier saved pull, not a fresh one.';
    } else note.hidden = true;
  }

  /* ---- 2 · loudest: who says what, as a dot matrix ---- */
  function chLoud(r) {
    const ads = keptAds(), names = compNames(r);
    const niche = shares(ads, W);
    const top = Object.entries(niche).sort((a, b) => b[1] - a[1])[0];
    $('#loud-head').textContent = top ? '“' + cap(top[0]) + '” is ' + Math.round(top[1]) + '% of what they say.' : 'What they say.';
    const posts = brandPosts(), vars = r.variants || [];
    const cols = names.map(n => ({ label: n, s: shares(ads.filter(a => a.competitor === n), W), rival: true }));
    if (posts.length) cols.push({ label: 'Your Instagram', s: shares(posts), you: true });
    if (vars.length) cols.push({ label: 'Your 3 new ads', s: shares(vars), you: true });
    $('#loud-sub').textContent = 'Share of each rival’s ads by angle, weighted by how long each ad has run' +
      (posts.length ? ', beside your own Instagram and the three new ads.' : ', beside the three new ads.');
    const angles = [...new Set(cols.flatMap(c => Object.keys(c.s)))].sort((a, b) => (niche[b] || 0) - (niche[a] || 0));
    const dot = (v, you) => v > 0.5 ? '<span class="dot' + (you ? ' you' : '') + '" style="width:' + (8 + Math.sqrt(v) * 4.6).toFixed(1) + 'px;height:' + (8 + Math.sqrt(v) * 4.6).toFixed(1) + 'px"></span><span class="val num">' + Math.round(v) + '%</span>' : '';
    const rows = angles.map(a => {
      const rivals = cols.filter(c => c.rival).reduce((s, c) => s + (c.s[a] || 0), 0);
      const yours = cols.filter(c => c.you).reduce((s, c) => s + (c.s[a] || 0), 0);
      const only = rivals < 0.5 && yours > 0.5;
      return '<tr' + (only ? ' class="open"' : '') + '><th scope="row"><span>' + esc(a) + '</span></th>' +
        cols.map(c => '<td' + (c.you ? ' class="colyou"' : '') + '>' + dot(c.s[a] || 0, c.you) + '</td>').join('') + '</tr>';
    }).join('');
    const anyOnly = angles.some(a => cols.filter(c => c.rival).every(c => !(c.s[a] > 0.5)) && cols.some(c => c.you && c.s[a] > 0.5));
    $('#loud').innerHTML = '<table class="matrix"><thead><tr><th>Angle</th>' + cols.map(c => '<th class="col" scope="col">' + esc(c.label) + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table>' +
      (anyOnly ? '<p class="legend-note"><span class="open-word">Highlighted</span> rows are angles only you use.</p>' : '');
  }

  /* ---- 3 · the map: where every ad sits, and how far apart ---- */
  const quadName = (x, y) => (x < 0 ? 'rational' : 'emotional') + ', ' + (y < 0 ? 'value-led' : 'premium') + ' corner';
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  function nearestRival(p, ads) {
    let best = null;
    for (const a of ads) { if (!a.pos) continue; const d = dist(p, a.pos); if (!best || d < best.d) best = { d, a }; }
    return best;
  }
  function apart(d) { return d < 0.35 ? 'say nearly the same thing' : d < 0.7 ? 'overlap a lot' : d < 1.1 ? 'differ' : 'are far apart'; }
  function chMap(r) {
    const ads = keptAds().filter(a => a.pos), names = compNames(r), vars = (r.variants || []).filter(v => v.pos), posts = brandPosts().filter(p => p.pos);
    const SZ = 600, PAD = 46, span = SZ - PAD * 2;
    const X = (x) => PAD + (x + 1) / 2 * span, Y = (y) => PAD + (1 - (y + 1) / 2) * span;
    // where the rivals' weight sits, by quadrant
    const q = { '-1,-1': 0, '1,-1': 0, '-1,1': 0, '1,1': 0 }; let tot = 0, cx = 0, cy = 0;
    for (const a of ads) { const k = (a.pos.x < 0 ? -1 : 1) + ',' + (a.pos.y < 0 ? -1 : 1); q[k] += W(a); tot += W(a); cx += a.pos.x * W(a); cy += a.pos.y * W(a); }
    cx /= tot || 1; cy /= tot || 1;
    const emptiest = Object.entries(q).sort((a, b) => a[1] - b[1])[0];
    const openQ = tot && emptiest[1] / tot < 0.12 ? emptiest[0].split(',').map(Number) : null;
    const crowdQ = Object.entries(q).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    $('#map-head').innerHTML = ads.length ? 'Rivals crowd the ' + esc(quadName(crowdQ[0], crowdQ[1])) + '.' + (openQ ? ' The <span class="open-word">' + esc(quadName(openQ[0], openQ[1])) + '</span> is open.' : '') : 'The map.';
    const est = ads.filter(a => a.pos.estimated).length;
    $('#map-sub').textContent = 'Each dot is one rival ad, sized by how long it has run. Dots close together say similar things; far apart, different things. Squares are your three new ads' +
      (posts.length ? '; rings are your Instagram posts.' : '.') + (est ? ' Dashed dots: position estimated from the ad’s angle.' : '');
    const quad = (qx, qy) => {
      const isOpen = openQ && openQ[0] === qx && openQ[1] === qy;
      const x0 = qx < 0 ? PAD : SZ / 2, y0 = qy > 0 ? PAD : SZ / 2;
      return '<rect class="quad' + (isOpen ? ' open' : '') + '" x="' + x0 + '" y="' + y0 + '" width="' + span / 2 + '" height="' + span / 2 + '" rx="10"/>' +
        (isOpen ? '<text class="qlab" x="' + (x0 + 12) + '" y="' + (y0 + 24) + '">open ground</text>' : '');
    };
    const dots = ads.slice().sort((a, b) => (b.days_running || 0) - (a.days_running || 0)).map(a =>
      '<circle class="ad' + (a.pos.estimated ? ' est' : '') + '" tabindex="0" role="button" aria-label="' + esc(a.competitor + ', ' + (a.days_running || 0) + ' days, ' + (angleOf(a) || '')) + '" data-ad="' + esc(a.id) + '" cx="' + X(a.pos.x).toFixed(1) + '" cy="' + Y(a.pos.y).toFixed(1) + '" r="' + (5 + Math.min(14, Math.sqrt(a.days_running || 1) * 0.7)).toFixed(1) + '" fill="' + compColor(r, a.competitor) + '" fill-opacity=".88" stroke="' + (a.pos.estimated ? 'var(--night)' : 'var(--paper)') + '" stroke-width="1.5"/>').join('');
    const rings = posts.map(p => '<circle class="ig" cx="' + X(p.pos.x).toFixed(1) + '" cy="' + Y(p.pos.y).toFixed(1) + '" r="7"/>').join('');
    const yours = vars.map((v, i) => '<g class="you-v" tabindex="0" role="button" aria-label="Your ad ' + (i + 1) + '" data-var="' + i + '"><rect class="you-mark" x="' + (X(v.pos.x) - 14).toFixed(1) + '" y="' + (Y(v.pos.y) - 14).toFixed(1) + '" width="28" height="28" rx="7"/><text class="you-lab" text-anchor="middle" x="' + X(v.pos.x).toFixed(1) + '" y="' + (Y(v.pos.y) + 4.5).toFixed(1) + '">' + (i + 1) + '</text></g>').join('');
    $('#map').innerHTML = '<svg viewBox="0 0 ' + SZ + ' ' + SZ + '" role="img" aria-label="Positioning map of rival ads">' +
      quad(-1, 1) + quad(1, 1) + quad(-1, -1) + quad(1, -1) +
      '<line class="axis" x1="' + PAD + '" y1="' + SZ / 2 + '" x2="' + (SZ - PAD) + '" y2="' + SZ / 2 + '"/><line class="axis" x1="' + SZ / 2 + '" y1="' + PAD + '" x2="' + SZ / 2 + '" y2="' + (SZ - PAD) + '"/>' +
      '<text class="axlab" x="' + PAD + '" y="' + (SZ / 2 - 8) + '">Rational</text><text class="axlab" text-anchor="end" x="' + (SZ - PAD) + '" y="' + (SZ / 2 - 8) + '">Emotional</text>' +
      '<text class="axlab" text-anchor="middle" x="' + SZ / 2 + '" y="' + (PAD - 14) + '">Premium-led</text><text class="axlab" text-anchor="middle" x="' + SZ / 2 + '" y="' + (SZ - PAD + 26) + '">Value-led</text>' +
      dots + rings + yours + '</svg>';
    // legend
    const counts = Object.fromEntries(names.map(n => [n, ads.filter(a => a.competitor === n).length]));
    $('#map-legend').innerHTML = names.map(n => '<div class="lg"><i style="background:' + compColor(r, n) + '"></i>' + esc(n) + ' <span class="num">' + counts[n] + '</span></div>').join('') +
      '<div class="lg"><i class="yours"></i>Your three new ads</div>' +
      (posts.length ? '<div class="lg"><i style="border:1.6px solid var(--paper);background:transparent"></i>Your Instagram posts</div>' : '') +
      (openQ ? '<div class="lg"><i class="openchip"></i>Open ground: almost no rival ads</div>' : '') +
      (est ? '<div class="lg"><i class="est"></i>Estimated position</div>' : '');
    // distances: rival to rival, and each new ad to its nearest rival
    const cent = names.map(n => { const m = ads.filter(a => a.competitor === n); const w = m.reduce((s, a) => s + W(a), 0) || 1;
      return { n, p: { x: m.reduce((s, a) => s + a.pos.x * W(a), 0) / w, y: m.reduce((s, a) => s + a.pos.y * W(a), 0) / w }, k: m.length }; }).filter(c => c.k);
    const pairs = [];
    for (let i = 0; i < cent.length; i++) for (let j = i + 1; j < cent.length; j++) {
      const d = dist(cent[i].p, cent[j].p);
      pairs.push('<div class="row"><span>' + esc(cent[i].n) + ' ↔ ' + esc(cent[j].n) + '</span><span class="num">' + round2(d) + '</span><small>Their ads ' + apart(d) + '.</small></div>');
    }
    const vrows = vars.map((v, i) => { const nr = nearestRival(v.pos, ads); if (!nr) return '';
      return '<div class="row"><span>Your ad ' + (i + 1) + ' · ' + esc(v.angle) + '</span><span class="num">' + round2(nr.d) + '</span><small>Nearest rival ad: ' + esc(nr.a.competitor) + ', “' + esc((nr.a.analysis.hook && nr.a.analysis.hook.line) || nr.a.headline || '') + '”</small></div>'; }).join('');
    $('#map-dist').innerHTML = (pairs.length ? '<h3>How far apart the rivals are</h3>' + pairs.join('') : '') + (vrows ? '<h3>How far your new ads stand from them</h3>' + vrows : '') +
      '<p class="basis">Distance on the map, 0 = the same message, 2.8 = opposite corners.</p>';
    bindMap(r, ads, vars);
  }
  function bindMap(r, ads, vars) {
    const map = $('#map'), tip = $('#map-tip');
    const show = (el) => {
      $$('.hot', map).forEach(x => x.classList.remove('hot'));
      if (!el) { map.classList.remove('dim'); tip.hidden = true; return; }
      el.classList.add('hot'); map.classList.add('dim');
      if (el.dataset.ad) {
        const a = adById(el.dataset.ad), others = ads.filter(x => x.competitor !== a.competitor), nr = nearestRival(a.pos, others);
        tip.innerHTML = '<b>' + esc(a.competitor) + '</b> · <span class="num">' + (a.days_running || 0) + 'd</span> · ' + esc(angleOf(a) || '') + '<br>“' + esc((a.analysis.hook && a.analysis.hook.line) || a.headline || '') + '”' +
          (nr ? '<br>Closest ad from another rival: ' + esc(nr.a.competitor) + ', <span class="num">' + round2(nr.d) + '</span> away.' : '');
      } else {
        const i = Number(el.dataset.var), v = vars[i], nr = nearestRival(v.pos, ads);
        tip.innerHTML = '<b>Your ad ' + (i + 1) + '</b> · ' + esc(v.angle) + '<br>“' + esc(v.headline || '') + '”' + (nr ? '<br>Nearest rival ad is <span class="num">' + round2(nr.d) + '</span> away (' + esc(nr.a.competitor) + ').' : '');
      }
      tip.hidden = false;
    };
    map.onmouseover = (e) => { const el = e.target.closest('.ad,.you-v'); if (el) show(el); };
    map.onmouseleave = () => show(null);
    map.onclick = (e) => show(e.target.closest('.ad,.you-v'));
    map.onfocusin = (e) => { const el = e.target.closest('.ad,.you-v'); if (el) show(el); };
    map.onfocusout = () => show(null);
  }

  /* ---- 4 · audiences: who they talk to, and who nobody does ---- */
  function chAud(r) {
    const syn = r.synthesis || {}, list = syn.audiences || [], names = compNames(r);
    $('#ch-aud').hidden = !list.length;
    $('.chapters a[href="#ch-aud"]').hidden = !list.length;
    if (!list.length) return;
    const founder = !!(r.icp && r.icp.audiences);
    const open = list.find(a => a.status === 'open');
    const rec = syn.recommended_audience;
    $('#aud-head').innerHTML = open ? 'Nobody is talking to <span class="open-word">' + esc(open.name) + '</span>.' : 'Aim at ' + esc(rec || list[0].name) + '.';
    $('#aud-sub').textContent = (founder ? 'Your audiences.' : 'Inferred from who each rival ad speaks to.') + ' Bars show how much of each rival’s advertising aims at that audience.';
    $('#aud').innerHTML = list.map(a => {
      const target = a.name === rec;
      return '<article class="aud-row' + (founder ? ' founder' : '') + (target ? ' target' : '') + '">' +
        '<h3>' + esc(a.name) + ' <span class="status' + (a.status === 'open' ? ' open' : '') + '">' + esc(a.status || 'inferred') + '</span>' + (target ? ' <span class="status">your target</span>' : '') + '</h3>' +
        (a.who ? '<p>' + esc(a.who) + '</p>' : '') + (a.need ? '<p class="need">Wants: ' + esc(a.need) + '</p>' : '') +
        '<div class="aud-bars">' + names.map(n => { const v = Math.max(0, Math.min(100, Number((a.share || {})[n]) || 0));
          return '<div class="abar"><span>' + esc(n) + '</span><span class="track"><i style="width:' + v + '%;background:' + (target ? 'var(--paper)' : compColor(r, n)) + '"></i></span><span class="num">' + Math.round(v) + '%</span></div>'; }).join('') + '</div>' +
        '</article>';
    }).join('');
    $('#aud-basis').textContent = founder ? 'You edited these. Dashed would mean inferred.' : 'Dashed: inferred by the AI. Edit them if they’re off.';
    $('#btn-aud-edit').textContent = 'Edit audiences';
  }
  function audEditor(r) {
    const syn = r.synthesis || {};
    const list = (r.icp && r.icp.audiences) || (syn.audiences || []).map(a => ({ name: a.name, who: a.who, need: a.need }));
    const target = (r.icp && r.icp.target) || syn.recommended_audience;
    const row = (a, i) => '<div class="erow"><input class="name" value="' + esc(a.name) + '" maxlength="40" aria-label="Audience name" placeholder="Audience name">' +
      '<input class="who" value="' + esc(a.who || '') + '" maxlength="120" aria-label="Who they are" placeholder="Who they are">' +
      '<input class="need" value="' + esc(a.need || '') + '" maxlength="100" aria-label="What they want" placeholder="What they want">' +
      '<div class="ctl"><label class="tgt"><input type="radio" name="aud-target"' + (a.name === target ? ' checked' : '') + '> Target this one</label><button type="button" class="linkish" data-rm="' + i + '">Remove</button></div></div>';
    $('#aud').innerHTML = '<div class="aud-edit">' + list.map(row).join('') + '</div>';
    $('#aud-basis').innerHTML = '<button type="button" class="linkish" id="aud-add">Add an audience</button> · <button type="button" class="linkish" id="aud-cancel">Cancel</button>' + (r.icp ? ' · <button type="button" class="linkish" id="aud-reset">Back to inferred</button>' : '');
    $('#btn-aud-edit').textContent = 'Save audiences';
    const rows = () => $$('.aud-edit .erow');
    $('#aud-add').onclick = () => { if (rows().length >= 6) return toast('Six audiences is the limit.'); $('.aud-edit').insertAdjacentHTML('beforeend', row({ name: '', who: '', need: '' }, rows().length)); };
    $('#aud-cancel').onclick = () => { S.audEditing = false; chAud(S.run); };
    if ($('#aud-reset')) $('#aud-reset').onclick = () => saveAud(null);
    $('.aud-edit').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) b.closest('.erow').remove(); };
  }
  async function saveAud(audiences, target) {
    const b = $('#btn-aud-edit'); b.disabled = true;
    try {
      const res = await api('/runs/icp', { body: { id: S.id, audiences, target } });
      S.run.icp = res.icp; S.pending = res.pending; S.audEditing = false;
      chAud(S.run); renderChanges();
      toast(audiences ? 'Saved. Regenerate to aim the ads at them.' : 'Back to the inferred audiences. Regenerate to apply.');
    } catch (e) { toast(e.message); }
    b.disabled = false;
  }
  $('#btn-aud-edit').addEventListener('click', () => {
    if (!S.audEditing) { S.audEditing = true; audEditor(S.run); return; }
    const rows = $$('.aud-edit .erow');
    const audiences = rows.map(r => ({ name: $('.name', r).value.trim(), who: $('.who', r).value.trim(), need: $('.need', r).value.trim() })).filter(a => a.name);
    const t = rows.find(r => $('input[type=radio]', r).checked);
    saveAud(audiences, t ? $('.name', t).value.trim() : null);
  });

  /* ---- 5 · you vs them ---- */
  function chYou(r) {
    const syn = r.synthesis || {}, y = syn.you_vs_them;
    $('#ch-you').hidden = !y; $('.chapters a[href="#ch-you"]').hidden = !y;
    if (!y) return;
    const posts = brandPosts(), ads = keptAds();
    $('#you-head').textContent = firstSentence(y.gap || y.summary, 170);
    $('#you-sub').textContent = y.summary || '';
    const mine = shares(posts), theirs = shares(ads, W);
    const bar = (label, v, cls, solo) => '<div class="vbar' + (solo ? ' solo' : '') + '"><span>' + esc(label) + '</span><span class="track"><i class="' + cls + '" style="width:' + Math.max(2, v) + '%"></i></span><span class="num">' + Math.round(v) + '%</span></div>';
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const left = posts.length ?
      '<div><h3>Your Instagram, last ' + posts.length + ' posts</h3>' + top(mine).map(([k, v]) => bar(k, v, '', !(theirs[k] > 0.5))).join('') + '</div>' :
      '<div><h3>What your site leans on</h3><div class="chips">' + (y.you_lean_on || []).map(a => '<span class="chip">' + esc(a) + '</span>').join('') + '</div></div>';
    const right = '<div><h3>What rivals pay to say</h3>' + top(theirs).map(([k, v]) => bar(k, v, 'theirs')).join('') + '</div>';
    const only = (y.only_you || []).length ? '<div><h3>Only you</h3><div class="chips">' + y.only_you.map(a => '<span class="chip open">' + esc(a) + '</span>').join('') + '</div></div>' : '';
    const thumb = (src, label) => '<div class="t"' + (src ? ' style="background-image:url(\'' + esc(String(src).replace(/'/g, '%27')) + '\')"' : '') + '><span class="num">' + esc(label) + '</span></div>';
    const grids = posts.length ? '<div class="grids"><div><h3>Your grid</h3><div class="grid3">' + posts.slice(0, 6).map(p => thumb(p.image_url, (p.likes != null ? p.likes + ' likes' : esc(p.post_type || '')))).join('') + '</div></div>' +
      '<div><h3>Their longest-running ads</h3><div class="grid3">' + ads.slice().sort((a, b) => (b.days_running || 0) - (a.days_running || 0)).slice(0, 6).map(a => thumb(a.image_url, (a.days_running || 0) + 'd')).join('') + '</div></div></div>' :
      '<p class="basis">' + (r.ig && r.ig.state === 'done' && !posts.length ? 'Instagram came back empty for @' + esc(r.ig.brand || '') + '. ' : '') + 'Compared from your website. Add your Instagram handle on the next run to compare your grid against their ads.</p>';
    $('#you').innerHTML = '<div class="vs">' + left + right + '</div>' + only + grids;
  }

  /* ---- 6 · your three ads ---- */
  function variantCard(v, r) {
    const brand = brandName(r);
    const insp = v.inspired_by || {};
    const src = adById(insp.ad_id);
    const longText = (v.primary_text || '').length > 140;
    return '<article class="card" data-idx="' + v.idx + '" aria-label="Ad ' + (v.idx + 1) + ': ' + esc(v.angle) + '">' +
      '<div class="card-head"><h3>' + esc(v.angle) + '</h3><span class="num">ad ' + (v.idx + 1) + (v.version > 1 ? ' · v' + v.version : '') + '</span></div>' +
      '<div class="ig">' +
        '<div class="ig-top"><div class="ig-av">' + esc(brand.charAt(0).toUpperCase()) + '</div><div><b>' + esc(brand) + '</b><small>Sponsored</small></div></div>' +
        '<div class="ig-text' + (longText ? ' clamp' : '') + '">' + marks(v.primary_text) + '</div>' +
        (longText ? '<button type="button" class="ig-more">… more</button>' : '') +
        '<div class="creative"><div class="hook">' + esc(v.format) + ' · ' + esc(v.placement) + '</div><h4>' + marks(v.overlay_text || v.headline) + '</h4></div>' +
        '<div class="ig-bar"><div><b>' + marks(v.headline) + '</b><small>' + marks(v.description) + '</small></div><span class="ig-cta">' + esc(v.cta) + '</span></div>' +
      '</div>' +
      '<div class="meta">' +
        '<div class="tagrow">' + (v.audience ? '<span class="tag hot">for ' + esc(v.audience) + '</span>' : '') + (v.hook_type ? '<span class="tag">' + esc(v.hook_type) + ' hook</span>' : '') + '</div>' +
        (v.why_this_angle ? '<p class="why">' + esc(v.why_this_angle) + '</p>' : '') +
        '<div class="dir"><b>Creative direction</b>' + esc(v.creative_direction) + '</div>' +
        (insp.competitor ? '<div class="stats">Structure borrowed from ' + esc(insp.competitor) + (src ? ', an ad running <b>' + (src.days_running || 0) + ' days</b>' : '') + (insp.what_we_borrowed ? '. ' + esc(insp.what_we_borrowed) : '') + '</div>' : '') +
        '<div class="actions"><button class="go" data-act="copy">Copy</button><button data-act="tweak" aria-expanded="false">Tweak</button><span class="soon">You review, then paste into Ads Manager. Metacrok never touches your ad account.</span></div>' +
        '<div class="tweak"><div class="presets">' + ['shorter', 'more aggressive', 'more playful', 'more premium', 'add urgency'].map(p => '<button type="button" data-preset="' + p + '">' + p + '</button>').join('') + '</div>' +
        '<form><input maxlength="240" placeholder="or type it: make it about the 10% serum" aria-label="Tweak instruction"><button>Go</button></form></div>' +
      '</div></article>';
  }

  function copyText(v) {
    return [v.primary_text, '', 'Headline: ' + v.headline, 'Description: ' + v.description, 'CTA: ' + v.cta, '', 'Creative: ' + v.creative_direction, 'Text on image: ' + (v.overlay_text || ''), 'Angle: ' + v.angle].join('\n');
  }

  function bindCards() {
    $$('#cards .card').forEach(w => {
      if (w.dataset.bound) return; w.dataset.bound = '1';
      const idx = Number(w.dataset.idx);
      const get = () => S.run.variants.find(v => v.idx === idx);
      const more = $('.ig-more', w);
      if (more) more.addEventListener('click', () => { $('.ig-text', w).classList.remove('clamp'); more.remove(); });
      $('[data-act="copy"]', w).addEventListener('click', async () => {
        const txt = copyText(get());
        try { await navigator.clipboard.writeText(txt); } catch (_) {
          const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        }
        toast('Copied. Paste it into Ads Manager.');
      });
      const tb = $('[data-act="tweak"]', w), panel = $('.tweak', w);
      tb.addEventListener('click', () => { const o = panel.classList.toggle('open'); tb.setAttribute('aria-expanded', String(o)); });
      const run = async (instruction) => {
        if (!instruction) return;
        w.classList.add('busy');
        try {
          const nv = await api('/tweak', { body: { run_id: S.id, idx, instruction } });
          const i = S.run.variants.findIndex(v => v.idx === idx); S.run.variants[i] = nv;
          const tmp = document.createElement('div'); tmp.innerHTML = variantCard(nv, S.run);
          w.replaceWith(tmp.firstChild); bindCards();
          toast('Spat out v' + nv.version + ' (' + usd(nv.cost_usd) + ')');
          refreshCost();
        } catch (e) { toast(e.message); w.classList.remove('busy'); }
      };
      $$('[data-preset]', panel).forEach(b => b.addEventListener('click', () => run(b.dataset.preset)));
      $('form', panel).addEventListener('submit', (e) => { e.preventDefault(); run($('input', panel).value.trim()); });
    });
  }

  function renderResults(r) {
    $('#results').dataset.rendered = '1';
    $('#results').hidden = false;
    $('#run').classList.add('finished');
    setStep('fresh');
    S.igPosts = r.ig_posts || S.igPosts || [];
    chVerdict(r); chLoud(r); chMap(r); chAud(r); chYou(r);
    // a long finding steps down a size so it never runs past five lines
    $$('.find').forEach(h => h.classList.toggle('long', h.textContent.length > 95));
    $('#cards').innerHTML = r.variants.map(v => variantCard(v, r)).join('');
    bindCards();
    renderAdsGrid();
    watchSubnav();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---- the founder's say over what the gator ate: set an ad aside, or fix its read ---- */
  function renderAdsGrid() {
    const all = (S.ads || []).slice().sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const kept = all.filter(a => !a.excluded).length;
    $('#ads-count').textContent = kept + ' ads · longest-running first' + (all.length > kept ? ' · ' + (all.length - kept) + ' set aside' : '');
    $('#ads').innerHTML = all.map(a => {
      const an = a.analysis || {}, fix = a.correction || null;
      const angle = (fix && fix.angle) || an.angle, why = (fix && fix.note) || an.why_it_works;
      const th = a.image_url ?
        '<img src="' + esc(a.image_url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' :
        '<span class="seedtxt">' + esc(a.headline || '') + '</span>';
      const opts = '<option value="">Keep this angle</option>' + (S.angles || []).map(x => '<option' + (fix && fix.angle === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
      const ctl = a.excluded ? '<button type="button" data-ctl="restore">Restore</button>' :
        '<button type="button" data-ctl="exclude">Set aside</button><button type="button" data-ctl="fix">Wrong read?</button>' + (fix ? '<button type="button" data-ctl="clear">Undo fix</button>' : '');
      return '<article class="ad' + (a.excluded ? ' off' : '') + '" data-ad="' + esc(a.id) + '"><div class="th" style="' + (a.image_url ? '' : thumbStyle(a)) + '">' + th +
        '<span class="days' + ((a.days_running || 0) >= 60 ? ' hot' : '') + '">' + (a.days_running || 0) + 'd' + (a.variants > 1 ? ' · ' + a.variants + 'v' : '') + '</span></div>' +
        '<div class="bd"><div class="who">' + esc(a.competitor) + (angle ? ' · ' + esc(angle) : '') + (a.excluded ? ' · set aside' : '') + '</div>' +
        (an.hook ? '<b>“' + esc(an.hook.line) + '”</b>' : '<b>' + esc(a.headline) + '</b>') +
        (why ? '<span class="why">' + esc(why) + '</span>' : '') +
        (fix ? '<span class="fixed">corrected by you</span>' : '') +
        (a.ad_library_url ? '<a href="' + esc(a.ad_library_url) + '" target="_blank" rel="noopener">View ad ↗</a>' : '') +
        '<div class="ctl">' + ctl + '</div>' +
        '<form class="fixf" hidden><select name="angle" aria-label="Angle">' + opts + '</select><input name="note" maxlength="200" placeholder="What the ad actually does (optional)" value="' + esc((fix && fix.note) || '') + '"><button>Save fix</button></form>' +
        '</div></article>';
    }).join('');
    renderChanges();
  }

  // one bar for every pending change: ads set aside, reads fixed, audiences edited
  function renderChanges() {
    const n = S.pending || 0;
    $('#changes').hidden = !n;
    $('#changes-n').textContent = n + ' change' + (n === 1 ? '' : 's');
  }

  async function control(id, action, extra, btn) {
    if (btn) btn.disabled = true;
    try {
      const r = await api('/runs/control', { body: { run_id: S.id, ad_id: id, action, ...extra } });
      const a = adById(id);
      if (a) { a.excluded = r.excluded; a.correction = r.correction; }
      S.pending = r.pending;
      renderAdsGrid();
    } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
  }

  $('#ads').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctl]'); if (!b) return;
    const card = b.closest('.ad'), id = card.dataset.ad, kind = b.dataset.ctl;
    if (kind === 'fix') { const f = $('.fixf', card); f.hidden = !f.hidden; return; }
    control(id, kind, {}, b); // exclude | restore | clear
  });
  $('#ads').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, card = f.closest('.ad');
    control(card.dataset.ad, 'correct', { angle: f.angle.value, note: f.note.value.trim() }, $('button', f));
  });
  $('#btn-regen').addEventListener('click', async () => {
    const b = $('#btn-regen'); b.disabled = true;
    try {
      await api('/runs/regenerate', { body: { id: S.id } });
      S.pending = 0;
      openRun(S.id, true);
    } catch (e) { toast(e.message); }
    b.disabled = false;
  });

  // the chapter you are reading is the last one whose top has passed under the rail
  function watchSubnav() {
    const links = $$('.chapters a').filter(a => !a.hidden);
    const pairs = links.map(a => [a, document.querySelector(a.getAttribute('href'))]).filter(p => p[1]);
    let current = null;
    const update = () => {
      const line = $('.chapters').getBoundingClientRect().bottom + 24;
      let on = pairs[0];
      for (const p of pairs) if (p[1].getBoundingClientRect().top <= line) on = p;
      if (on && on[0] !== current) {
        current = on[0];
        links.forEach(a => a.classList.toggle('on', a === current));
        const rail = $('.chapters');
        rail.scrollTo({ left: current.offsetLeft - rail.clientWidth / 2 + current.clientWidth / 2, behavior: 'smooth' });
      }
    };
    window.removeEventListener('scroll', watchSubnav._f);
    watchSubnav._f = () => { if (!watchSubnav._raf) watchSubnav._raf = requestAnimationFrame(() => { watchSubnav._raf = 0; update(); }); };
    window.addEventListener('scroll', watchSubnav._f, { passive: true });
    window.addEventListener('scrollend', update);
    update();
  }

  $('#lead').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/lead', { body: { email: $('#lead-email').value, run_id: S.id } }); $('#lead-msg').textContent = 'Got it. He’ll be in touch.'; $('#lead').hidden = true; }
    catch (err) { $('#lead-msg').textContent = err.message; }
  });

  /* ================= dev console ================= */
  function renderCost(r) {
    const c = r.cost || {};
    const btn = $('#dev-toggle'); btn.hidden = !DEV; // a developer readout: hidden unless ?dev=1 or localStorage metacrok-dev=1
    btn.textContent = usd(c.total_usd, 3) + ' this run';
    const row = (label, b, extra) => b ? '<tr><td>' + label + (b.model ? '<br><small>' + esc(b.model) + '</small>' : '') + '</td><td>' + (b.calls || '–') + '</td><td>' + ((b.in || 0) + (b.out || 0)).toLocaleString() + '</td><td>' + usd(b.usd) + '</td></tr>' + (extra || '') : '';
    const pull = c.pull, an = c.analysis || {};
    const readAds = Math.max(1, (S.ads || []).length - (an.cached || 0));
    const perAd = an.usd ? an.usd / readAds : null;
    const scale = perAd != null ? (45 * perAd + (c.synthesis ? c.synthesis.usd : 0) + (c.generation ? c.generation.usd : 0) + (c.brand ? c.brand.usd : 0) + 45 * 0.75 / 1000) : null;
    const t = c.timings || {};
    $('#dev-body').innerHTML =
      '<table><tr><th>step</th><th>calls</th><th>tokens</th><th>usd</th></tr>' +
      row('brand read', c.brand) +
      (pull ? '<tr><td>ad pull<br><small>' + esc(pull.source === 'apify' ? (pull.actor || 'apify') + ' · ' + pull.ads + ' ads' : 'seed (no scrape)') + '</small></td><td>1</td><td>' + (pull.ads || 0) + ' ads</td><td>' + usd(pull.usd) + '</td></tr>' : '') +
      row('vision read', c.analysis, an.cached ? '<tr><td colspan="4"><small>' + an.cached + ' ads from cache ($0) · ' + (an.images || 0) + ' images sent</small></td></tr>' : '') +
      (c.instagram ? '<tr><td>instagram pull</td><td>1</td><td>posts</td><td>' + usd(c.instagram.usd) + '</td></tr>' : '') +
      row('synthesis', c.synthesis) + row('generation', c.generation) + row('tweaks', c.tweaks) +
      '<tr class="tot"><td>total</td><td></td><td></td><td>' + usd(c.total_usd) + '</td></tr></table>' +
      (perAd != null ? '<p>Vision read ≈ <b>' + usd(perAd, 5) + '</b> per ad. A full live run (3 × 15 ads) costs about <b>' + usd(scale, 3) + '</b>.</p>' : '') +
      (Object.keys(t).length ? '<p><small>Timeline: ' + Object.entries(t).map(([k, v]) => k + ' ' + v + 's').join(' → ') + '</small></p>' : '') +
      '<p><small>Metered API cost where available. Each ad is analysed once, then cached. <a href="' + API + '/runs/get?id=' + esc(r.id) + '&ads=1" target="_blank" rel="noopener">Raw run JSON</a></small></p>';
  }
  async function refreshCost() { try { const r = await api('/runs/get?id=' + S.id + '&since=999999999'); S.run.cost = r.cost; renderCost(r); } catch (_) {} }
  $('#dev-toggle').addEventListener('click', () => { const d = $('#dev'); d.hidden = !d.hidden; $('#dev-toggle').setAttribute('aria-expanded', String(!d.hidden)); });
  $('#dev-close').addEventListener('click', () => { $('#dev').hidden = true; $('#dev-toggle').setAttribute('aria-expanded', 'false'); });

  /* ---- resume a run from the URL ---- */
  const rid = qs.get('run');
  if (rid && /^[a-z0-9]{6,20}$/.test(rid)) openRun(rid);
  else setStep('feed');
  window.addEventListener('popstate', () => { if (location.search !== shownSearch) location.reload(); });
})();