// mcp/client.js — a thin client for Metacrok's HTTP API (see docs/API.md).
// A run only advances while something keeps calling /api/runs/advance (the browser does it in the app),
// so drive() is the one thing here that is more than a request wrapper.

export class MetacrokError extends Error {
  constructor(message, status) { super(message); this.name = 'MetacrokError'; this.status = status; }
}

export function createClient({ baseUrl = 'http://localhost:3000', fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const base = String(baseUrl).replace(/\/+$/, '');

  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(base + '/api' + path, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new MetacrokError(`Can't reach Metacrok at ${base} (${e.cause && e.cause.code || e.message}). Is it running? Start it with "npm start", or set METACROK_URL.`, 0);
    }
    let json = null;
    try { json = await res.json(); } catch (_) { /* non-JSON error page */ }
    if (!res.ok) throw new MetacrokError((json && json.error) || `Metacrok returned ${res.status} for ${method} /api${path}`, res.status);
    return json;
  }

  const q = (o) => '?' + Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');

  return {
    base,
    status: () => call('GET', '/status'),
    suggest: (body) => call('POST', '/suggest', body),
    createRun: (body) => call('POST', '/runs/create', body),
    advance: (id) => call('POST', '/runs/advance', { id }),
    getRun: (id, { ads = true } = {}) => call('GET', '/runs/get' + q({ id, since: 999999999, ads: ads ? 1 : null })),
    tweak: (body) => call('POST', '/tweak', body),
    control: (body) => call('POST', '/runs/control', body),
    icp: (body) => call('POST', '/runs/icp', body),
    regenerate: (id) => call('POST', '/runs/regenerate', { id }),

    // Keep a run moving until it finishes or the time budget runs out. Returns the last advance() answer plus
    // whether it is done. onProgress({ stage, progress }) is called after each step so a caller can notify.
    async drive(id, { timeoutMs = 50000, onProgress } = {}) {
      const t0 = Date.now();
      let last = null, fails = 0;
      while (Date.now() - t0 < timeoutMs) {
        // a dropped connection or a 5xx mid-run is usually a blip: retry like the browser app does
        try { last = await call('POST', '/runs/advance', { id }); fails = 0; }
        catch (e) {
          if (!(e.status === 0 || e.status >= 500) || ++fails > 3) throw e;
          await sleep(1500 * fails);
          continue;
        }
        if (onProgress) {
          try { const r = await call('GET', '/runs/get' + q({ id, since: 999999999 })); await onProgress({ stage: r.stage, progress: r.progress, status: r.status }); } catch (_) { /* progress is best effort */ }
        }
        if (last.status && last.status !== 'running') return { ...last, done: true };
        await sleep(last.busy ? 1500 : 300);
      }
      return { ...last, done: false };
    },
  };
}
