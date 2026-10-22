# Metacrok MVP: feature and technical specification

Status: draft v2 · 22 Oct 2026 · Owner: Divyam Arora · refined after problem-statement validation (section 13)
Tagline: "eats ads, spits out better ones"

---

## 1. Problem

Solo D2C founders waste 3 to 5 hours a week tracking competitor ads without knowing which angles actually convert. They end up trapped between copying competitor messaging and struggling to write original, differentiated copy.

The validation report confirms the workflow bottleneck and sharpens it. The hours go on logging ads by hand: one practitioner describes four hours in a spreadsheet for a single competitor. The real failure comes after that, in two steps:

1. **Reading performance without backend data.** Meta hides spend and ROAS, so buyers use how long an ad has run and how many variants exist as proxies. They disagree on the cutoff (14, 30 or 60 days).
2. **Escaping the "Same-Claim Trap".** Copying a rival's promise gives you the same saturated claim. Founders want to find whitespace, and they fear generic AI output that ignores what makes their own product different.

Existing ad-saving tools (Foreplay, AdSpy, PiPiAds) mostly serve agencies and media buyers, stop at saving ads, and charge by seat or by credit. MagicBrief shut down on 31 July 2026.

## 2. Product in one paragraph

The founder gives Metacrok their brand (site URL or name) and up to three competitors. Metacrok reads the brand, pulls the competitors' live Meta Ad Library ads, reads every ad, works out which angles the niche overuses and which nobody uses, and writes three new ad variants in the founder's voice, each on a different angle. The founder reviews the variants and pastes them into Ads Manager. The founder stays in control: Metacrok never publishes anything.

## 3. Target user

Solo founder or two-person team, India first, selling a physical product online, spending under ₹1 lakh a month on Meta ads, no marketing hire. Comfortable with Ads Manager, not with copywriting or competitor research.

The validation evidence supports solo D2C founders as the first segment. They handle media buying, creative and copy themselves, and cannot afford a strategist or a swipe-file tool that leaves the writing to them. Freelancers and small agencies are a later segment: agencies tend to resist automated copy because creative strategy is their billable work.

## 4. Goals and non-goals

### MVP goals
1. A founder goes from input to three usable variants in about 90 seconds (under 3 minutes at worst) with no sign-up.
2. Every variant is grounded in real competitor ads, with the source ad cited.
3. No invented claims: ratings, certifications, clinical results, discounts, founder stories and numbers appear only as placeholders unless the founder supplied them.
4. Running cost per run stays under $0.25 (measured: about $0.03 for a live run).
5. A demo mode that never breaks, so the product can be shown without live data.

### Non-goals (not in the MVP)
- Publishing to Meta (needs Marketing API app review).
- Image or video generation. The MVP writes creative direction only.
- Spend, ROAS or conversion data. The Ad Library does not expose them; never claim them.
- Accounts, saved brands, scheduled re-runs, team seats, billing.
- Languages other than English (Hinglish is a later option).
- Platforms other than Meta (Instagram placements are covered by Meta).

## 5. User flow

Three screens, one page application.

1. **Feed.** Founder enters brand (URL or name), up to three competitors (name, Instagram handle or Facebook Page URL), a goal (cold traffic, retargeting, product launch, sale or offer), a country (default India), and optional notes ("say / avoid"). A button suggests five rival brands if they have none. A toggle runs the demo seed.
2. **Chew.** Live progress screen: a stage bar, a "kitchen log" of plain-language lines, and the competitor ads flying in as they are read.
3. **Fresh out.** Tabs: Variants, What he tasted (niche analysis), Ads eaten (every ad read, with days running), Log. Each variant has a tweak control (presets plus free text) that rewrites that one variant. A cost readout shows spend and calls for the run.

A run has a shareable, resumable link: `/app?run=<id>`.

## 6. Features

### 6.1 Must have

| # | Feature | Acceptance criteria |
|---|---|---|
| F1 | Brand read | From a URL, extract niche, what is sold, price band, offers, voice traits, proof points, target buyer. If the site is thin or client-rendered, fall back to a web lookup. Output is a stored brand profile. Unknown fields are "unknown", never guessed. |
| F2 | Competitor ad pull | For each named competitor, pull active Meta Ad Library ads for the chosen country. Keep up to 15 per competitor: two thirds longest-running, one third freshest. Record days running and variant count per ad. |
| F3 | Competitor matching | Each named rival is matched to ITS OWN Ad Library page, never to another advertiser. Searching a name mostly returns other brands, so the rival's official website is searched too (taken from the Find-my-rivals pick, or looked up), and a page is accepted only if its name, its URL, or where its ads link to is the rival's. A pasted Facebook page link is an exact match. A rival that can't be found is reported by name with what the search did return and is left out; no other brand is ever substituted. If no named rival can be read, the run stops with the reason and a Try again button; the fictional demo ads run only when the founder chooses them. |
| F4 | Ad reading (vision) | For each ad, extract hook, angle, offer, format and why it works from the image and copy. Results are cached by ad id so an ad is never read twice. Ads with no image are read from copy alone. |
| F5 | Niche synthesis | Weight angles by longevity (60+ days is treated as a profitable signal) and variant count. Output: angles overused, angles nobody uses (whitespace), per-competitor pattern, three recommended angles. |
| F6 | Variant generation | Three variants, each on a different angle, in the brand's voice. Each has primary text, headline, description, CTA, overlay text, format, placement, creative direction, the source ad it borrows structure from, and a one-line reason. |
| F7 | Copy rules enforced in code | Primary text 300 characters or fewer with the hook in the first 125; headline 40 or fewer; description 30 or fewer; CTA from the allowed list (Shop now, Learn more, Sign up, Get offer, Order now, Subscribe, Book now, Get quote). Over-length text is cut at a word boundary. |
| F8 | Claims guardrail | A scan rejects or rewrites any variant that states a rating, review count, certification, clinical or expert-authority claim ("dermatologist-tested", "experts agree"), discount, free offer, percentage, or first-person founder story unless it came from the founder's input or the brand site. Replace with a bracketed placeholder such as `[4.8★ from N reviews]`. |
| F9 | Distinct angles | If fewer than three distinct angles come back, retry once with a stricter instruction; if it still fails, return the best three and flag it. |
| F10 | Variant tweak | One instruction rewrites one variant and keeps version history (v1, v2, ...). Same copy rules and claims guardrail apply. |
| F11 | Demo mode | A fixed seed of fictional, clearly labelled ads (skincare, snacks) so a full run works with no live pull. Demo results are always labelled "demo". |
| F12 | Progress and resume | Live log and progress while running; a finished or failed run reopens from its link and shows its real state. |
| F13 | Cost console | Per-stage spend, calls, model used and timings, shown on the results page. |
| F14 | Failure handling | Three consecutive failures on one stage end the run with a plain-language error and a one-click "run on demo" option. A failed live pull falls back to demo and says why. |
| F15 | Abuse limits | 12 runs per hour per visitor, daily call cap on the AI budget, and a hard timeout on every external call. |
| F16 | Competitor-wording guard | Any sentence that shares a run of 6 or more words with a pulled competitor ad is replaced by `[your own line]`, so a variant never repeats a rival's promise (the "Same-Claim Trap"). Competitor names are always blocked. |
| F17 | Honest performance signals | Longevity is shown as a hint, never as proof. The run reports ads running 30+ and 60+ days, each ad shows its days running, and the results say how many ads the Ad Library returned and how many were read. Spend, ROAS and revenue are never shown or implied. |
| F18 | Review-first output | Every variant is for review and manual paste into Ads Manager. The product never writes to a founder's ad account, and the UI says so on every variant. |
| F19 | Product mechanism input | The brand form asks what makes the product different. Variants must be anchored in it, or use a `[what makes it different]` placeholder when it is unknown. |
| F20 | Founder controls over the ad reads | On the "Ads eaten" tab each ad can be set aside (restorable) or have its angle fixed, with an optional note on what it really does. Changes are saved per run and never alter the shared read cache. A bar shows how many changes are unapplied; Regenerate re-runs only synthesis and generation on the kept ads with the fixes applied, replaces the three variants and tweaks, and takes about 10 seconds on cached reads. At least 3 ads must stay. |

### 6.2 Should have (MVP if time allows)
- Email capture on the results page (store only, no sending).
- Competitor suggestions from a lookup (five rival brands).
- Export all three variants as text for copy and paste.

### 6.3 Later
Hinglish copy, saved brands and scheduled re-pulls, Marketing API push, image generation, multi-brand, email delivery.

## 7. Inputs

| Field | Type | Rules |
|---|---|---|
| brand_name | text | Up to 80 characters. Required if no URL. |
| brand_url | text | Up to 200 characters. Required if no name. |
| competitors | list of text | Up to 3. Name, Instagram handle or Facebook Page URL. At least one unless demo mode. Duplicates removed. |
| goal | enum | cold traffic, retargeting, product launch, sale or offer. |
| country | enum | IN, US, GB, AE, AU, CA, SG, ALL. Default IN. |
| notes | text | Up to 400 characters. Treated as the only source of founder-supplied claims and "avoid" rules. |
| mode | enum | auto (live pull) or seed (demo). |

Validation happens on the server. Inputs are never trusted by the client.

## 8. Outputs

### Run result
- Brand profile (F1).
- Competitor list, matched pages, "best guess" flags.
- Ads read, each with hook, angle, offer, format, why it works, days running, variant count.
- Niche analysis (F5).
- Three variants (F6).
- Cost and timing breakdown (F13).

### Variant schema
```
angle, hook_type, format, placement,
primary_text (<=300), headline (<=40), description (<=30), cta (allowed list),
overlay_text, creative_direction,
inspired_by { competitor, ad_id, what_we_borrowed },
why_this_angle, version, history[]
```

### Output quality bar
- Three distinct angles.
- Every number, rating and claim is either from the founder's input or a placeholder.
- Voice matches the brand voice traits.
- No competitor wording or brand names copied; structure only.
- Each variant cites a real source ad.

## 9. Technical architecture

### 9.1 Shape
Static frontend plus serverless JSON API plus Postgres. No always-on server.

```
Browser (landing + app)
   │  POST /api/runs/create        open a run
   │  POST /api/runs/advance  ◄── browser loops; one bounded stage chunk per call
   │  GET  /api/runs/get           poll state, logs, ads, variants
   │  POST /api/runs/control | /api/runs/regenerate | /api/tweak | /api/suggest | /api/lead | GET /api/status
   ▼
Serverless API ──► Postgres (runs, ads, run_ads, ad_analyses, variants, run_logs, rate_hits, leads, seed_ads)
        ├──► LLM gateway (OpenRouter)  brand read, vision, synthesis, generation, tweak
        └──► Apify actor               Meta Ad Library pull (start, poll, fetch)
```

Hosting: Vercel (frontend and functions) and Postgres. Every function must return within 60 seconds, so no request does more than about 45 seconds of work.

### 9.2 Run state machine

The browser drives the run by calling `advance` repeatedly. Each call takes a row lock (58 seconds), runs one chunk of the current stage, saves progress, and releases the lock.

| Stage | Work | Notes |
|---|---|---|
| brand | Fetch site, extract profile | Web lookup fallback if page is thin |
| pull | Start actor, poll, fetch, select ads | Gives up after 210s and falls back to demo |
| analyze | Read up to 20 uncached ads per call | Batches of 5 images per model call |
| synthesize | Weighted angle stats to whitespace and 3 recommended angles | |
| generate | Three variants, retry once if angles are not distinct | |
| done | | |

Rules:
- Three consecutive failures on a stage set `status=error` with a readable message.
- `advance` on a finished or errored run returns its real status, never "busy".
- Every stage is idempotent: re-running it after a crash does not duplicate rows.

### 9.3 Data model (essentials)
- `runs`: id, stage, status, input, brand, competitors, synthesis, source (live, seed), cost, apify, error, lock_until, ip_hash.
- `ads`: one row per ad (live or seed) with copy, headline, CTA, image URL, format, start date, variant count, Ad Library URL.
- `run_ads`: ad to run, with days_running and pick reason.
- `ad_analyses`: cached vision read per ad, plus model and cost.
- `variants`: (run, idx) to data, version, history.
- `run_logs`, `rate_hits`, `leads`, `seed_ads`.

Migrations are plain SQL and safe to re-run.

### 9.4 LLM layer
- One gateway (OpenRouter) and one key. Two roles: **vision** (ad reads, brand from page text) and **writer** (synthesis, generation, tweaks).
- Google models only (`google/` IDs). Every request is pinned to Google's own infrastructure with `provider.only = [google-vertex, google-ai-studio]` and no fallbacks. The chain per role is overridable by environment variable and is repaired from the gateway's public model list (Google models only) when every entry fails.
- Fall through to the next model on: 404, 400, 403 (restricted model), 408, 429, any 5xx, a 200 with an error body, and an empty reply.
- Bad key (401) and out-of-credit (402) stop the run with a setup message. They are not retried.
- The default model is `google/gemini-3.5-flash-lite`, escalating to `google/gemini-3.7-flash`, then the free Gemma model. The 3.7 and 3.8 Flash models make reasoning mandatory (about 400 hidden tokens and 5 seconds even on a tiny task), so they get extra token headroom and serve only as the escalation.
- JSON is extracted from model replies tolerantly (code fences, leading text).
- Every call records tokens, cost, model and stop reason; malformed-output errors include the model and stop reason.
- Cost is read from `usage.cost_details.upstream_inference_cost` when a Google key is attached to the gateway (the `cost` field then reads 0). The daily quota is checked against the gateway's key endpoint, and runs degrade to demo mode if it is exhausted.

### 9.5 Ad Library pull (Apify)
- Actor: a Facebook Ads Library scraper, configurable by name.
- Memory must be 512 MB for 1 to 3 input URLs. The actor refuses larger allocations unless it gets one URL per 512 MB, and reports that refusal as a successful run containing a single error row. The pipeline must treat any row with an `error` and no ad id as a failed pull and fall back to demo with the message.
- Input: one Ad Library search URL per competitor (Page ID if known, else keyword), country, active ads only.
- Output mapping: `ad_archive_id`, `page_id`, `page_name`, `snapshot` (body, title, link description, CTA, images, cards, videos, display format), `start_date` (Unix seconds), `collation_count`, `publisher_platform`, `ad_library_url`.
- Selection: up to 15 ads per competitor, two thirds longest-running and one third freshest. Longevity and variant count are the only performance signals.
- Cost: about $0.75 per 1,000 ads. A typical run is under $0.01.

### 9.6 Copy and claims enforcement
These are code, not prompt text, because models cannot count characters and do not reliably follow "do not invent" rules.

1. **Length clip** at word boundaries: 300, 40, 30.
2. **CTA allowlist**, with a default of "Shop now".
3. **Claims scan** over primary text, headline, description, overlay text and creative direction. Flags: star ratings, review counts, percentages and prices not present in the founder input or brand profile, words such as "clinically", "dermatologist", "certified", "proven", "#1", "guaranteed", first-person founder or customer stories not supplied by the founder. Flagged text is rewritten by one targeted model call; if still flagged, the offending phrase is replaced by a placeholder.
4. **Placeholder format** is a bracket with a hint: `[4.8★ from N reviews]`, `[founder story]`, `[N]%`.

### 9.7 Security and abuse
- Public endpoints, rate limited per hashed IP (runs: 12 per hour; suggest and tweak have their own buckets).
- IPs are stored hashed. No accounts, no cookies required.
- Secrets live in environment variables only, never in the repository or the client.
- Admin endpoints (seed promotion and clearing) require the owner.
- All user-supplied text is length-limited and treated as untrusted when put into prompts.
- Hard timeout on every outbound call.

### 9.8 Configuration

| Variable | Purpose | Required |
|---|---|---|
| OPENROUTER_API_KEY | LLM gateway | Yes |
| APIFY_TOKEN | Live Ad Library pull | No. Without it, runs use demo data |
| DATABASE_URL | Postgres | Yes in production |
| OPENROUTER_TEXT_MODELS, OPENROUTER_VISION_MODELS | Override model chains | No |
| APIFY_ACTOR, APIFY_PRICE_PER_1K | Actor and cost readout | No |

### 9.9 Performance and cost targets

| Metric | Target |
|---|---|
| End-to-end run | 90 seconds typical, 180 seconds worst case |
| Single `advance` call | Under 45 seconds |
| Model cost per run | Under $0.05 on Gemini Flash Lite (measured: $0.03 for a 2-competitor live run) |
| Apify cost per run | Under $0.05 |
| Budget headroom | A $1 budget covers about 30 live runs |

Both the run time and the per-call limit depend on slow models. Synthesis and generation are the two longest stages, so each has its own reasoning-effort setting and token cap, and either may be split across two `advance` calls if it risks the limit.

### 9.10 Testing
- A check script that fails if copy limits or the CTA allowlist stop being enforced.
- A claims-guardrail test with known bad inputs ("clinically proven", "4.8★", invented founder story) that must be flagged.
- A seeded end-to-end run (demo mode, no network) that must reach `done` with three distinct angles.
- A live run against one real competitor before every release.
- Layout check at 360, 768 and 1440 pixels with real run data.

## 10. Risks and open questions

| Risk | Mitigation |
|---|---|
| Free model quality and availability change weekly | Fallback chains, auto-repair from the live list, paid fallback key |
| Competitor matched to the wrong Page | "Best guess" label, Page URL input, show matched page name |
| Models invent claims | Code-level claims scan (6.6), human review gate in the UI |
| Brand site renders client-side | Web lookup fallback, ask for Instagram handle |
| Actor changes its output or input contract | Tolerant mapping, error-row detection, actor name configurable |
| Ad Library has no ads for a small competitor | Fall back to demo with a clear label; suggest a different competitor |
| 60-second function limit | Bounded stages, stage splitting, browser-driven loop |
| Ad Library does not show every competitor ad | Say how many ads came back and how many were read; accept a Page URL for exact matches; never present the set as complete |
| Founders distrust AI reads of their rivals' ads | Show every read next to its ad; controls to set an ad aside or fix its angle (F20) |
| Demo ads do not match the founder's niche | Label as demo; add more seed packs; prefer live pull |

Open questions:
1. Which niche seed packs beyond skincare and snacks matter most for the first users?
2. Is a paid model fallback acceptable if free quotas are exhausted?
3. Should the founder be able to paste their own best ad as a reference?

## 11. Milestones

| Milestone | Definition of done |
|---|---|
| M1 Demo run | Seeded run completes with three distinct, limit-compliant variants, no network except the LLM |
| M2 Live run | One real competitor pulled, ads read, variants cite real source ads |
| M3 Guardrails | Claims scan and copy limits enforced in code with tests |
| M4 Hosted | Deployed, every function under 60 seconds, public link works for a stranger |
| M5 Pilot | Five real founders run it on their own brand and competitors; each rates the variants usable or not |

MVP is done when M1 to M4 pass and at least three of five pilot founders say they would use at least one variant.

## 12. Appendix: example

**Input**
```
brand_name: Kaya Glow
notes: "vitamin C serum, Rs 799"
competitors: ["Minimalist"]
goal: cold traffic · country: IN · mode: auto
```

**Good output (target)**
```
angle: pain-point authority · format: text-on-image · placement: IG feed
primary_text: "Pollution, humidity and dark spots can leave skin looking dull.
  Meet our vitamin C serum at ₹799. [dermatologist-tested?]"
headline: "Science for Everyday Glow" (25)
description: "Vitamin C serum at ₹799" (23)
cta: Shop now
inspired_by: Minimalist, concern-first hook
```

**Output the guardrail must catch**
```
"Clinically proven ingredients, dermatologically tested and suitable for sensitive skin."
"I built Kaya Glow after struggling with my own dark spots."
```
Neither was supplied by the founder. The first states certifications and clinical results; the second invents a founder story. Both become placeholders or are rewritten.

## 13. Validation: what founders worry about and how the MVP responds

The validation report reviewed G2 and Capterra reviews, teardowns and practitioner threads (r/FacebookAds, r/PPC, r/ecommerce, r/ClaudeAI). It confirms the problem and identifies these concerns.

| Concern | Evidence in the report | Response in the MVP |
| --- | --- | --- |
| Copying competitors backfires | "If your ads say the same thing your competitor's ads say, your ads aren't proving anything." Founders call it the Same-Claim Trap. | Whitespace analysis (F5), the competitor-wording guard (F16), and a prompt rule against repeating a saturated claim. |
| Generic AI output | Founders avoid "generic AI output" and want the ad to reflect their product's unique mechanism. | Mechanism input (F19), no-filler rules in the prompt, and no repeated phrases across variants. |
| Performance is a guess without spend data | "Duration is the only real signal." Buyers disagree on the cutoff: 14, 30 or 60 days. | Longevity and variant count as hints, reported at 30+ and 60+ days (F17). The landing page no longer says a long-running ad is "almost certainly profitable". |
| Tools that claim spend or ROAS lose trust | Buyers dismiss any tool claiming to reveal competitor spend. | Spend, ROAS and revenue are never shown or implied (F17). |
| Fear of tools writing into Ads Manager | Concern about account suspensions and budget errors from unapproved write access. | Review-first output (F18). There is no write integration and no "push to Meta" teaser. |
| The Ad Library does not show every ad | Threads such as "Meta Ad Library not showing all competitor ads". | The results say how many ads came back and how many were read (F17), and a Page URL gives an exact match (F3). |
| Saving tools stop before copy | Foreplay "does not produce finished ads". Saved ads become dead assets. | The product's core: from competitor ads to three differentiated variants (F6). |
| Credit and seat pricing | PiPiAds charges 20 credits per detailed ad view; Foreplay charges per extra seat. | No credits. Pricing to test: a flat monthly rate (hypothesis 3). The per-run cost stays visible (F13). |

### Positioning to use
- From competitor ads to three differentiated variants in about 90 seconds.
- Filtered by how long ads have run, with the hint-not-proof caveat shown.
- Find the whitespace and escape the Same-Claim Trap.

### Positioning to avoid
- Any claim of competitor spend, ROAS or revenue.
- One-click campaign launching without human review.
- "Almost certainly profitable" for long-running ads.

### Hypotheses still to test with founders
1. **Longevity threshold:** which cutoff (14, 30 or 60 days) earns trust, and does it differ by vertical?
2. **Trust in AI reads:** do founders accept the AI's read of an ad, or use the controls to correct it (F20)? Watch how often reads are fixed and which angles get changed.
3. **Pricing:** is a flat monthly rate ($39 to $79) preferred to credits?
4. **Variant count:** are three differentiated variants enough, or do founders expect many more hooks and headlines?
5. **Finished ads:** do founders expect generated images, not just copy and creative direction?
