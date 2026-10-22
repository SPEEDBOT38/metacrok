# Metacrok

An AI ad agent for solo D2C founders: it eats ads, spits out better ones.

Give it your brand (site, optionally Instagram) and up to three rivals. Metacrok pulls the rivals' live Meta Ad Library ads, reads every one, maps where they crowd (angles, positioning, audiences), compares them with your own Instagram, and writes three ads for the space nobody owns. It never publishes anything: you review and paste.

- Product and feature spec: [MVP-SPEC.md](MVP-SPEC.md)
- Use it from an AI agent: [docs/MCP.md](docs/MCP.md)
- HTTP API: [docs/API.md](docs/API.md)
- Design: [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md), screenshots in [screenshots/](screenshots/)

## Run it

Requires Node 24.

```bash
npm install
cp .env.example .env   # then fill in the keys below
npm start
```

Open the URL it prints. Without `APIFY_TOKEN` runs use a fictional demo pack, so you can try everything for free.

| Variable | Needed for |
|---|---|
| `OPENROUTER_API_KEY` | All AI steps. Google models only, via OpenRouter, pinned to Google infrastructure |
| `APIFY_TOKEN` | Live Meta Ad Library and Instagram pulls |
| `DATABASE_URL` | Optional Postgres. Default is embedded PGlite in `.data/` |
| `PORT` | Default 3000 |
| `RUNS_PER_HOUR` | Runs per visitor per hour (default 12). A live run costs real money |
| `OPENROUTER_TEXT_MODELS`, `OPENROUTER_VISION_MODELS`, `APIFY_ACTOR` | Optional overrides, see `.env.example` |

A live run costs roughly $0.02 to $0.10 and takes 1 to 2 minutes.

## How it works

`brand → pull → analyze → synthesize → generate → done`. A run advances one bounded step per `POST /api/runs/advance`, so any client (the browser, the MCP server) just calls it until done. Strict rival matching never substitutes a different brand: an unmatched rival is reported as not found. A claims guardrail turns invented ratings, offers and founder stories into `[placeholders]`, and enforces Meta copy limits.

Founders keep control: set aside an ad, correct how it was read, or edit the inferred audiences, then regenerate.

```
server.js          node:http server
api/               HTTP handlers
lib/               pipeline, Apify, prompts, claims guardrail, OpenRouter client
mcp/               MCP server (stdio) + HTTP client + report builder
public/            app and landing page
scripts/           tests
```

## Use it from an agent

```bash
claude mcp add metacrok -- node /absolute/path/to/metacrok/mcp/bin.js
```
Eleven tools cover the whole flow. See [docs/MCP.md](docs/MCP.md).

## Tests

```bash
npm run check
```
Copy limits, claims guardrail, rival matching, founder controls, and the MCP server (against a stub, no network).
