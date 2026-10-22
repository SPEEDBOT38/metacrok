// lib/claude.js — one door to the LLM for the whole app, via OpenRouter, Google models only.
// One key for every role; every request is pinned to Google's own infrastructure
// (provider.only google-vertex / google-ai-studio, no fallbacks). Same contract the
// pipeline always used:
//   claude({ role, system, messages, maxTokens, tools, temperature, timeoutMs }) ->
//     { text, model, stop, usage: { in, out, searches }, usd, metered }
// Roles: 'vision' (ad reads, brand from page text) and 'writer' (synthesis,
// generation, tweaks). Chains are env-overridable and rebuilt from OpenRouter's public
// model list (google/ only) when every configured model fails.

const BASE = 'https://openrouter.ai/api/v1';
const ONLINE = process.env.OPENROUTER_ONLINE === '1'; // paid web plugin, off by default

// Google models only, served by Google's own infrastructure (see GOOGLE below). Checked live 2026-10-22.
// Cheapest model that can do the job first; the thinking models (3.7 flash, mandatory reasoning,
// ~400 hidden tokens and ~5s even on a tiny task) are the escalation, gemma free is the last resort.
const DEFAULT_TEXT = ['google/gemini-3.5-flash-lite', 'google/gemini-3.7-flash', 'google/gemma-4-31b-it:free'];
const DEFAULT_VISION = ['google/gemini-3.5-flash-lite', 'google/gemini-3.7-flash', 'google/gemma-4-31b-it:free'];
const GOOGLE = { only: ['google-vertex', 'google-ai-studio'], allow_fallbacks: false };
const THINKS = /gemini-3\.[6-9]|gemini-3\.1-pro|gemini-4/; // reasoning is mandatory: budget room for it or the reply is empty

function envList(name) { return (process.env[name] || '').split(',').map(s => s.trim()).filter(Boolean); }
const pick = (name, dflt) => { const l = envList(name); return l.length ? l : [...dflt]; };
const CHAINS = {
  writer: pick('OPENROUTER_TEXT_MODELS', DEFAULT_TEXT),
  vision: pick('OPENROUTER_VISION_MODELS', DEFAULT_VISION),
};

const resolved = {};
let discovered = null; // { at, text: [ids], vision: [ids] }

export class AiSetupError extends Error {
  constructor(msg) { super(msg); this.code = 'ai_setup'; }
}

// OpenRouter's public model list, filtered to free — used to repair a chain
// when every configured model 404s (free IDs rotate).
async function discoverFree() {
  try {
    const r = await fetch(BASE + '/models', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    // Google text models only (rule: no other vendor), newest flash first, no batch/image/audio/older generations
    const g = (j.data || []).filter(m => m.id.startsWith('google/') && !/:batch|image|lyria|customtools|gemini-2|gemma-[23]/.test(m.id)
      && ((m.architecture && m.architecture.output_modalities) || []).join() === 'text').sort((a, b) => (b.created || 0) - (a.created || 0));
    const vision = g.filter(m => ((m.architecture && m.architecture.input_modalities) || []).includes('image')).map(m => m.id);
    return { at: Date.now(), text: g.map(m => m.id), vision };
  } catch (_) { return null; }
}

// Anthropic-style content blocks -> OpenAI chat format (incl. base64 images).
function toMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of messages) {
    let c = m.content;
    if (Array.isArray(c)) {
      c = c.map(b => {
        if (b.type === 'text') return { type: 'text', text: b.text };
        if (b.type === 'image' && b.source && b.source.type === 'base64')
          return { type: 'image_url', image_url: { url: 'data:' + b.source.media_type + ';base64,' + b.source.data } };
        return null;
      }).filter(Boolean);
    }
    out.push({ role: m.role, content: c });
  }
  return out;
}

export async function claude({ role = 'writer', system, messages, maxTokens = 2000, tools, purpose = 'metacrok', timeoutMs = 50000, temperature } = {}) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) throw new AiSetupError('No LLM key yet: add OPENROUTER_API_KEY to .env (openrouter.ai/keys).');
  const wantWeb = !!(tools && tools.some(t => String(t.name || t.type || '').includes('web_search')));

  resolved[role] = null; // re-resolve each process run; chains may have changed
  let tryList = [...CHAINS[role]];
  let refreshed = false;
  let lastErr = null;

  for (let pass = 0; pass < 2; pass++) {
    for (const model of tryList) {
      // thinking models bill and spend hidden reasoning tokens inside max_tokens: give them room
      const body = { model, max_tokens: maxTokens + (THINKS.test(model) ? 1500 : 0), messages: toMessages(system, messages) };
      if (THINKS.test(model)) body.reasoning = { effort: 'low' }; // cannot be disabled, only trimmed
      if (model.startsWith('google/')) body.provider = GOOGLE; // Google's own infrastructure only, never another host
      if (temperature != null) body.temperature = temperature;
      if (wantWeb && ONLINE) { body.model = model + ':online'; body.plugins = [{ id: 'web' }]; }

      let j = null, status = 0, raw = '';
      for (let attempt = 0; attempt < 4; attempt++) { // 429 / 5xx: retry with backoff, up to 3 times
        try {
          const r = await fetch(BASE + '/chat/completions', {
            method: 'POST',
            headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'x-title': 'Metacrok' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
          status = r.status;
          raw = await r.text();
          try { j = JSON.parse(raw); } catch (_) { j = null; }
        } catch (e) { lastErr = e; status = 0; break; } // timeout or network: next model, retrying would blow the 60 s budget
        if (status !== 429 && status < 500) break;
        if (attempt < 3) await new Promise(res => setTimeout(res, 1000 * 2 ** attempt));
      }
      if (!status) continue;

      const choice = j && j.choices && j.choices[0];
      if (status === 200 && choice) {
        const msg = choice.message || {};
        const text = typeof msg.content === 'string' ? msg.content.trim()
          : Array.isArray(msg.content) ? msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() : '';
        // reasoning models can spend all of max_tokens thinking and return nothing -> next model
        if (!text) { lastErr = new Error('OpenRouter empty reply (' + model + ', ' + choice.finish_reason + ')'); continue; }
        resolved[role] = model;
        const u = j.usage || {};
        // With a BYOK Google key OpenRouter reports cost 0 and Google bills the real amount upstream.
        const upstream = Number(u.cost_details && u.cost_details.upstream_inference_cost) || 0;
        const usd = Number(u.cost) || Number(j.cost) || (u.is_byok ? upstream : 0);
        return {
          text, model, stop: choice.finish_reason,
          usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0, searches: wantWeb && ONLINE ? 1 : 0 },
          usd: Math.round(usd * 1e6) / 1e6,
          metered: u.cost != null || j.cost != null,
        };
      }

      const em = String((j && j.error && j.error.message) || (choice && choice.error && choice.error.message) || ('status ' + status + ': ' + raw.slice(0, 150)));
      if (status === 401) throw new AiSetupError('OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env (openrouter.ai/keys).');
      if (status === 402) throw new AiSetupError('OpenRouter account is out of credits. Top up at openrouter.ai/credits.');
      lastErr = new Error('OpenRouter ' + status + ' (' + body.model + '): ' + em.slice(0, 200));
      // bad id, free-tier rate cap, or upstream provider down (OpenRouter wraps upstream 429s as 502) -> next model
      // also 200 with an error body instead of choices
      // 403 = model restricted (e.g. "agentic harnesses only"), not a bad key
      if (status === 200 || status === 403 || status === 404 || status === 400 || status === 408 || status === 429 || status >= 500) continue;
      throw new Error('LLM ' + status + ': ' + em);
    }

    // every candidate failed once: rebuild the chain from the live google/ model list, retry once
    if (!refreshed) {
      refreshed = true;
      const d = await discoverFree();
      if (d && (d.vision.length || d.text.length)) {
        discovered = d;
        const extra = (role === 'vision' ? d.vision : d.text).filter(id => !tryList.includes(id)).slice(0, 3);
        if (extra.length) { tryList = [...tryList, ...extra]; continue; }
      }
    }
    break;
  }

  if (lastErr && String(lastErr.message).includes('429')) {
    throw new Error('Rate limited by Google via OpenRouter after 3 retries. Wait a minute, or set OPENROUTER_TEXT_MODELS / OPENROUTER_VISION_MODELS.');
  }
  throw lastErr || new Error('No model available for role ' + role);
}

// Pull the first JSON object/array out of a model reply.
export function extractJson(text) {
  if (!text) return null;
  let t = String(text).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const starts = [t.indexOf('{'), t.indexOf('[')].filter(i => i >= 0).sort((a, b) => a - b);
  for (const s of starts) {
    const open = t[s], close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let i = s; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) { try { return JSON.parse(t.slice(s, i + 1)); } catch (_) { break; } } }
    }
  }
  return null;
}

// Accumulate usage into a cost bucket: { usd, in, out, calls, searches, model }
export function addCost(bucket, r) {
  const b = bucket || { usd: 0, in: 0, out: 0, calls: 0, searches: 0, model: null };
  b.usd = Math.round(((b.usd || 0) + (r.usd || 0)) * 1e6) / 1e6;
  b.in += r.usage ? r.usage.in : 0;
  b.out += r.usage ? r.usage.out : 0;
  b.searches += r.usage ? r.usage.searches : 0;
  b.calls += 1;
  b.model = r.model || b.model;
  return b;
}
