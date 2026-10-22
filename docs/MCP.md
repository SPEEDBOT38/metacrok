# Metacrok MCP server

Lets an AI agent (Claude Desktop, Claude Code, any MCP client) run Metacrok and read the results: which rival pages were matched, where rivals crowd, where the open space is, and the three ads written for it.

The server is a thin layer over Metacrok's [HTTP API](API.md). It never publishes anything to an ad account.

## Setup

**Fastest: Claude Code in this repo.** The repo ships a `.mcp.json` that points the server at the live app (https://metacrok.vercel.app). Run `npm install`, open `claude` in the repo, and approve the `metacrok` server when asked. Nothing to run locally.

**Against your own copy:**

1. Start Metacrok (the MCP server talks to it over HTTP):
   ```bash
   npm install
   npm start
   ```
2. Point your client at the MCP server (stdio), with `METACROK_URL` set to your copy.

**Claude Code**
```bash
claude mcp add metacrok -- node /absolute/path/to/metacrok/mcp/bin.js
```

**Claude Desktop** (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "metacrok": {
      "command": "node",
      "args": ["/absolute/path/to/metacrok/mcp/bin.js"],
      "env": { "METACROK_URL": "http://localhost:3000" }
    }
  }
}
```

`METACROK_URL` defaults to `http://localhost:3000`. Set it to use a deployed copy. Use the port you started Metacrok on (`PORT`, see `.env.example`).

## Typical flow

1. `metacrok_status`: is it reachable, is live Ad Library pulling connected?
2. `metacrok_suggest_rivals` (optional): five real rivals with handle/website.
3. `metacrok_start_run`: starts and keeps the run moving for up to `wait_seconds` (default 50). Returns the report if done.
4. `metacrok_wait_for_run`: repeat until the report comes back. A run only advances while something calls it, so the server drives it for you during these calls.
5. `metacrok_get_report`, `metacrok_get_variants`, `metacrok_list_ads` to read.
6. Optional founder controls: `metacrok_control_ad`, `metacrok_edit_audiences`, then `metacrok_regenerate` to apply. `metacrok_tweak_variant` rewrites one ad.

## Tools

| Tool | What it does | Cost |
|---|---|---|
| `metacrok_status` | Reachability, live-pull status, runs done, average cost | free |
| `metacrok_suggest_rivals` | AI-suggested rivals for a brand | < $0.01 |
| `metacrok_start_run` | Start and drive a run. Needs `brand_name` or `brand_url`, and 1 to 3 `rivals` unless `demo: true` | ~$0.03 to $0.10 live; less for demo |
| `metacrok_wait_for_run` | Keep a run moving; idempotent; returns the report when done | part of the run |
| `metacrok_get_report` | Verdict, matched rivals, angle mix, map distances, audiences, you-vs-them, ads. `section`: all, verdict, rivals, angles, map, audiences, you_vs_them, variants. `format`: markdown or json | free |
| `metacrok_get_variants` | The three ads with a paste-ready block and placeholders | free |
| `metacrok_list_ads` | Every rival ad that was read (ids for the control tool) | free |
| `metacrok_tweak_variant` | Rewrite ad 1 to 3 from an instruction | ~$0.001 |
| `metacrok_control_ad` | `exclude`, `restore`, `correct` (angle and/or note), `clear`. Applies on regenerate | free |
| `metacrok_edit_audiences` | Replace inferred audiences (1 to 6) and pick a target; `null` resets | free |
| `metacrok_regenerate` | Re-run synthesis and writing on the kept ads. **Replaces the three ads, discarding tweaks** | a few cents |

`rivals` entries are a brand name, an `@handle`, a Facebook page link (an exact match), or `{ "name": "...", "hint": "their website or Instagram" }`. Giving a hint is the best way to get the right Meta Ad Library page.

There is also a resource, `metacrok://runs/{run_id}/report` (markdown), and a prompt, `competitor_teardown`.

## Behaviour worth knowing

- **Waiting.** Calls that drive a run stop at `wait_seconds` (max 240) and say it is still working; call `metacrok_wait_for_run` again. If your client sends a progress token, progress notifications are emitted so request timeouts do not fire.
- **Honest failures.** A rival that cannot be found is reported as not found, with the pages the search returned instead. Metacrok never substitutes another brand. A failed run returns its reason as a tool error.
- **Placeholders.** Ads contain `[bracketed]` text the founder must fill in (ratings, offers, founder stories). Metacrok does not invent those.
- **Days running is a hint, not proof.** Spend and ROAS are not public.
- **Limits.** Runs are limited per visitor per hour (`RUNS_PER_HOUR`, default 12). Controls and regenerate have their own limits. Controls need a finished run and at least 3 ads kept.

## Troubleshooting

| Message | Fix |
|---|---|
| "Can't reach Metacrok at ... Is it running?" | `npm start`, or set `METACROK_URL` |
| `live_ad_library: false` in status | Set `APIFY_TOKEN`; otherwise use `demo: true` |
| AI setup error (412) | Set `OPENROUTER_API_KEY` |
| 429 | Hourly limit reached; wait or raise `RUNS_PER_HOUR` locally |
| Rival "NOT FOUND" | Pass its website or Facebook page link as the hint |

Logs go to stderr only; stdout carries the protocol.

## Tests

```bash
node scripts/check-mcp.js
```
Runs the real server against a stub Metacrok over an in-memory transport (no network, no cost). `npm run check` includes it.
