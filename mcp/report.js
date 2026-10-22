// mcp/report.js — turns one run's API payload (GET /api/runs/get?ads=1) into the story the app shows:
// verdict, who was matched, angle mix, map distances, audiences, you vs them, the three ads.
// Pure functions, no network. The browser app (public/app.js) computes the same numbers for its charts;
// keep the two in step (angle weights, quadrants, distances).

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const weight = (a) => a.weight || 1;
const nrm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const angleOf = (x) => (x.correction && x.correction.angle) || (x.analysis && x.analysis.angle) || x.angle || null;

// share (percent) of each angle in a set of items; w weights an item (ads count by how long they ran)
export function shares(items, w) {
  const out = {};
  let tot = 0;
  for (const x of items) {
    const a = angleOf(x);
    if (!a) continue;
    const k = w ? w(x) : 1;
    out[a] = (out[a] || 0) + k;
    tot += k;
  }
  const pct = {};
  for (const [a, v] of Object.entries(out).sort((x, y) => y[1] - x[1])) pct[a] = tot ? round(v / tot * 100, 0) : 0;
  return pct;
}

export const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
export const quadName = (x, y) => (x < 0 ? 'rational' : 'emotional') + ', ' + (y < 0 ? 'value-led' : 'premium-led');
const apart = (d) => (d < 0.35 ? 'say nearly the same thing' : d < 0.7 ? 'overlap a lot' : d < 1.1 ? 'differ' : 'are far apart');

function nearest(p, ads) {
  let best = null;
  for (const a of ads) {
    if (!a.pos) continue;
    const d = dist(p, a.pos);
    if (!best || d < best.d) best = { d, a };
  }
  return best;
}

export function buildReport(run) {
  const ads = (run.ads || []).filter((a) => !a.excluded && a.analysis);
  const comps = run.competitors && run.competitors.length ? run.competitors : (run.input && run.input.competitors) || [];
  const names = comps.map((c) => c.name);
  const syn = run.synthesis || {};
  const niche = syn.niche || {};
  const variants = run.variants || [];
  const posts = (run.ig_posts || []).filter((p) => p.is_brand && p.analysis);
  const warnings = [];

  // ---- who was matched ----
  const rivals = comps.map((c) => ({
    name: c.name,
    found: c.source !== 'live' || c.ads_kept > 0,
    page: c.page_name || null,
    ads_read: c.ads_kept ?? ads.filter((a) => a.competitor === c.name).length,
    ads_returned_by_library: c.ads_found ?? null,
    matched_by: c.resolution || null,
    pages_the_search_returned_instead: c.candidates && c.candidates.length ? c.candidates : undefined,
  }));
  for (const r of rivals) if (!r.found) warnings.push(`No active Meta ads were found for "${r.name}", so it is not in this analysis. Rerun with its Facebook page link in place of its name to include it.`);
  if (run.source && run.source !== 'live') warnings.push('These rival ads are the fictional demo pack, not the founder\'s real rivals.');

  // ---- angle mix ----
  const angle_mix = {
    basis: 'share of ads by angle, each ad weighted by how long it has run',
    niche: shares(ads, weight),
    rivals: Object.fromEntries(names.map((n) => [n, shares(ads.filter((a) => a.competitor === n), weight)])),
    founder_instagram: posts.length ? shares(posts) : null,
    new_ads: shares(variants),
  };

  // ---- the map ----
  const mapAds = ads.filter((a) => a.pos);
  const q = { '-1,-1': 0, '1,-1': 0, '-1,1': 0, '1,1': 0 };
  let tot = 0;
  for (const a of mapAds) { q[(a.pos.x < 0 ? -1 : 1) + ',' + (a.pos.y < 0 ? -1 : 1)] += weight(a); tot += weight(a); }
  const ranked = Object.entries(q).sort((a, b) => b[1] - a[1]);
  const asQuad = (k) => { const [x, y] = k.split(',').map(Number); return quadName(x, y); };
  const emptiest = ranked[ranked.length - 1];
  const open_quadrant = tot && emptiest[1] / tot < 0.12 ? asQuad(emptiest[0]) : null;
  const cent = names.map((n) => {
    const m = mapAds.filter((a) => a.competitor === n);
    const w = m.reduce((s, a) => s + weight(a), 0) || 1;
    return { n, k: m.length, p: { x: m.reduce((s, a) => s + a.pos.x * weight(a), 0) / w, y: m.reduce((s, a) => s + a.pos.y * weight(a), 0) / w } };
  }).filter((c) => c.k);
  const rival_distances = [];
  for (let i = 0; i < cent.length; i++) for (let j = i + 1; j < cent.length; j++) {
    const d = dist(cent[i].p, cent[j].p);
    rival_distances.push({ between: [cent[i].n, cent[j].n], distance: round(d), reading: 'their ads ' + apart(d) });
  }
  const placed = variants.filter((v) => v.pos);
  const estimated = mapAds.filter((a) => a.pos.estimated).length;
  if (estimated) warnings.push(`${estimated} of ${mapAds.length} ad positions on the map are estimated from the ad's angle, not read from the creative.`);
  const map = {
    axes: { x: 'rational (-1) to emotional (1)', y: 'value-led (-1) to premium-led (1)' },
    distance_scale: '0 = the same message, about 2.8 = opposite corners',
    crowded_quadrant: tot ? asQuad(ranked[0][0]) : null,
    open_quadrant,
    rival_distances,
    new_ads: placed.map((v) => {
      const nr = nearest(v.pos, mapAds);
      return {
        ad: v.idx + 1, angle: v.angle, position: { x: v.pos.x, y: v.pos.y },
        nearest_rival_ad: nr ? { rival: nr.a.competitor, hook: (nr.a.analysis.hook && nr.a.analysis.hook.line) || nr.a.headline || null, distance: round(nr.d) } : null,
      };
    }),
  };

  // ---- audiences ----
  const audiences = {
    source: run.icp && run.icp.audiences ? 'edited by the founder' : 'inferred by AI from who each rival ad speaks to',
    target: syn.recommended_audience || null,
    list: (syn.audiences || []).map((a) => ({ name: a.name, who: a.who, wants: a.need, status: a.status, share_of_each_rivals_ads_pct: a.share || {} })),
  };

  // ---- you vs them ----
  const y = syn.you_vs_them || null;
  const you_vs_them = y ? {
    basis: y.basis === 'instagram' && posts.length ? `the founder's last ${posts.length} Instagram posts` : "the founder's website (no Instagram posts were available)",
    summary: y.summary, gap: y.gap, only_you: y.only_you || [], you_lean_on: y.you_lean_on || [], rivals_lean_on: y.they_lean_on || [],
  } : null;
  if (!y) warnings.push('No you-vs-them comparison was produced for this run.');

  const days = (a) => a.days_running || 0;
  return {
    run: {
      id: run.id, status: run.status, stage: run.stage, source: run.source,
      brand: run.brand ? { name: run.brand.name, sells: run.brand.sells, niche: run.brand.niche, read_from: run.brand.read_from } : null,
      goal: run.input && run.input.goal, country: run.input && run.input.country,
      cost_usd: run.cost && run.cost.total_usd, unapplied_changes: run.controls_pending || 0,
    },
    verdict: {
      open_space: niche.headline_open || (niche.underused_angles || [])[0] || null,
      whitespace: niche.whitespace || null,
      rivals_lean_on: niche.overused_angles || [],
      nobody_does_well: niche.underused_angles || [],
      recommended_angles: niche.recommended_angles || [],
    },
    rivals, angle_mix, map, audiences, you_vs_them,
    longevity: {
      note: 'Days running is a hint, not proof: spend and ROAS are not public.',
      ads_read: ads.length, ran_30_plus_days: ads.filter((a) => days(a) >= 30).length, ran_60_plus_days: ads.filter((a) => days(a) >= 60).length,
    },
    variants: variants.map((v) => formatVariant(v)),
    warnings,
  };
}

export function formatVariant(v) {
  return {
    ad: v.idx + 1, version: v.version, angle: v.angle, audience: v.audience || null, format: v.format, placement: v.placement,
    primary_text: v.primary_text, headline: v.headline, description: v.description, cta: v.cta,
    text_on_image: v.overlay_text || null, creative_direction: v.creative_direction,
    borrowed_from: v.inspired_by && v.inspired_by.competitor ? `${v.inspired_by.competitor}${v.inspired_by.what_we_borrowed ? ': ' + v.inspired_by.what_we_borrowed : ''}` : null,
    why_this_angle: v.why_this_angle || null,
    to_fill_in: [...new Set([v.primary_text, v.headline, v.description, v.overlay_text, v.creative_direction].join(' ').match(/\[[^\]]{1,60}\]/g) || [])],
    flagged_and_replaced: v.claims_flagged || [],
    paste_ready: [v.primary_text, '', 'Headline: ' + v.headline, 'Description: ' + v.description, 'CTA: ' + v.cta].join('\n'),
  };
}

const pctLine = (o, n = 4) => Object.entries(o || {}).slice(0, n).map(([k, v]) => `${k} ${v}%`).join(', ') || 'none';

export function reportMarkdown(r, section = 'all') {
  const want = (s) => section === 'all' || section === s;
  const out = [];
  const b = r.run.brand || {};
  out.push(`# ${b.name || 'Run'} vs ${r.rivals.map((x) => x.name).join(', ')}`);
  out.push(`Run \`${r.run.id}\` · ${r.run.status}${r.run.source && r.run.source !== 'live' ? ' · DEMO ADS' : ''} · cost $${r.run.cost_usd ?? '?'}${r.run.unapplied_changes ? ` · ${r.run.unapplied_changes} unapplied change(s), regenerate to apply` : ''}`);
  if (r.warnings.length) out.push('\n**Heads up**\n' + r.warnings.map((w) => '- ' + w).join('\n'));

  if (want('verdict')) {
    out.push('\n## Verdict');
    out.push(r.verdict.open_space ? `Nobody owns **${r.verdict.open_space}** yet.` : 'No open space was identified.');
    if (r.verdict.whitespace) out.push(r.verdict.whitespace);
    if (r.verdict.rivals_lean_on.length) out.push(`Rivals lean on: ${r.verdict.rivals_lean_on.join(', ')}.`);
    out.push(`${r.longevity.ads_read} ads read; ${r.longevity.ran_30_plus_days} ran 30+ days, ${r.longevity.ran_60_plus_days} ran 60+ (a hint, not proof).`);
  }
  if (want('rivals')) {
    out.push('\n## Who was matched');
    for (const x of r.rivals) out.push(x.found ? `- **${x.name}**: ${x.ads_read} ads read${x.matched_by ? ` from the page "${x.page}" (${x.matched_by})` : ' (demo data)'}` : `- **${x.name}**: NOT FOUND, left out.${x.pages_the_search_returned_instead ? ' The search only returned ' + x.pages_the_search_returned_instead.join(', ') + ', which are other brands.' : ''}`);
  }
  if (want('angles')) {
    out.push('\n## Angle mix (share of ads, weighted by days running)');
    for (const [n, m] of Object.entries(r.angle_mix.rivals)) out.push(`- ${n}: ${pctLine(m)}`);
    if (r.angle_mix.founder_instagram) out.push(`- **Founder's Instagram**: ${pctLine(r.angle_mix.founder_instagram)}`);
    out.push(`- **The three new ads**: ${pctLine(r.angle_mix.new_ads)}`);
  }
  if (want('map')) {
    out.push('\n## Positioning map');
    out.push(`Axes: ${r.map.axes.x}; ${r.map.axes.y}. Distance: ${r.map.distance_scale}.`);
    if (r.map.crowded_quadrant) out.push(`Rivals crowd the ${r.map.crowded_quadrant} corner.${r.map.open_quadrant ? ` The ${r.map.open_quadrant} corner is open.` : ''}`);
    for (const d of r.map.rival_distances) out.push(`- ${d.between.join(' ↔ ')}: ${d.distance} (${d.reading})`);
    for (const a of r.map.new_ads) out.push(`- New ad ${a.ad} (${a.angle}) at (${a.position.x}, ${a.position.y})` + (a.nearest_rival_ad ? `; nearest rival ad is ${a.nearest_rival_ad.rival}'s "${a.nearest_rival_ad.hook}", ${a.nearest_rival_ad.distance} away` : ''));
  }
  if (want('audiences') && r.audiences.list.length) {
    out.push(`\n## Audiences (${r.audiences.source})`);
    for (const a of r.audiences.list) out.push(`- **${a.name}** [${a.status}]${a.name === r.audiences.target ? ' ← target' : ''}: ${a.who} Wants: ${a.wants}. Rival ad share: ${Object.entries(a.share_of_each_rivals_ads_pct).map(([k, v]) => `${k} ${v}%`).join(', ') || 'n/a'}`);
  }
  if (want('you_vs_them') && r.you_vs_them) {
    const y = r.you_vs_them;
    out.push(`\n## You vs them (from ${y.basis})`);
    out.push(y.summary || '');
    if (y.gap) out.push(`Gap: ${y.gap}`);
    if (y.only_you.length) out.push(`Only you: ${y.only_you.join('; ')}`);
  }
  if (want('variants') && r.variants.length) {
    out.push('\n## The three ads');
    for (const v of r.variants) {
      out.push(`\n### Ad ${v.ad}: ${v.angle}${v.audience ? ' (for ' + v.audience + ')' : ''}${v.version > 1 ? ' · v' + v.version : ''}`);
      out.push(v.paste_ready);
      out.push(`Creative: ${v.creative_direction}${v.text_on_image ? ` · text on image: "${v.text_on_image}"` : ''}`);
      if (v.borrowed_from) out.push(`Structure borrowed from ${v.borrowed_from}`);
      if (v.to_fill_in.length) out.push(`Fill in: ${v.to_fill_in.join(' ')}`);
    }
  }
  return out.join('\n');
}
