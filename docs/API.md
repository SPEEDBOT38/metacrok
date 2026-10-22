# Metacrok HTTP API

JSON over HTTP, served by `server.js` (port from `PORT`, default 3000). Errors are `{ "error": "message" }` with a 4xx/5xx status.

## How a run works

A run is a state machine: `brand → pull → analyze → synthesize → generate → done` (or `error`). It only moves while something calls `POST /api/runs/advance` (the web app does this in the browser; the MCP server does it in `metacrok_wait_for_run`). Each call does at most about 45 seconds of work. Call it repeatedly until `status` is not `running`.

## Endpoints

### `GET /api/status`
`{ live_pull, live_reason, seed_brands, runs_done, avg_run_usd, ... }`. `live_pull` is false when `APIFY_TOKEN` is missing.

### `POST /api/suggest`
Body `{ brand_name?, brand_url?, country }`. Returns `{ niche, competitors: [{ name, instagram?, website?, why }] }`.

### `POST /api/runs/create`
| Field | Notes |
|---|---|
| `brand_name`, `brand_url` | One required |
| `brand_ig` | Optional handle; found on the site otherwise |
| `competitors` | Up to 3: a name, `@handle`, Facebook page link, or `{ name, hint }`. Required unless `mode: "seed"` |
| `goal` | `cold traffic` (default), `retargeting`, `product launch`, `sale or offer` |
| `country` | `IN` (default), `US`, `GB`, `AE`, `AU`, `CA`, `SG`, `ALL` |
| `notes` | Max 400 chars. The only source of claims the ads may make |
| `mode` | `auto` (default; live if configured) or `seed` (fictional demo ads) |

Returns `{ id }`. Rate limited per visitor (`RUNS_PER_HOUR`, default 12).

### `POST /api/runs/advance`
Body `{ id }`. Does the next unit of work. Returns the run's `status`, plus `busy: true` if another call holds the run (retry shortly).

### `GET /api/runs/get?id=ID[&ads=1][&since=N]`
The run: `status`, `stage`, `progress`, `error`, `brand`, `competitors` (with match resolution and not-found candidates), `synthesis` (niche, audiences, you-vs-them), `variants` (the three ads), `controls_pending`, `icp`, `cost`. With `ads=1` also every rival ad (`id`, `competitor`, `days_running`, `pos`, `analysis`, `excluded`, `correction`) and Instagram posts.

### `POST /api/tweak`
Body `{ run_id, idx (0 to 2), instruction }`. Rewrites one ad; returns the new version.

### `POST /api/runs/control`
Body `{ run_id, ad_id, action, angle?, note? }`. `action`: `exclude` (at least 3 ads must remain), `restore`, `correct` (needs `angle` from the angle list and/or `note`), `clear`. Run must be `done`. Stored, not applied, until regenerate.

### `POST /api/runs/icp`
Body `{ id, audiences: [{ name, who?, need? }] | null, target? }`. 1 to 6 audiences; `null` returns to the inferred ones; `target` must be one of them. Run must be `done`.

### `POST /api/runs/regenerate`
Body `{ id }`. Re-runs synthesis and writing on the kept ads, replacing the three ads. Needs pending changes. Then drive with `advance`.

### `POST /api/lead`, `POST /api/admin/seed`
Landing-page signup and demo-seed admin. Not used by the MCP server.

## Rate limits (per visitor, per hour)
Runs 12 (`RUNS_PER_HOUR`), controls 200, audience edits 120, regenerate 12, tweaks 40. A 429 means wait.
