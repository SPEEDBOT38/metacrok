# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo D2C founders (India first; one- or two-person teams) who run their own Meta ads with no marketing hire, spending under ₹1 lakh a month. They handle media buying, creative and copy themselves. Today they lose 3 to 5 hours a week scrolling and logging competitor ads in the Meta Ad Library without knowing which angles convert. Freelancers and small agencies are a later segment.

The job: understand their competitive ad landscape fast, find an angle and an audience nobody owns, and leave with ad copy they can paste into Ads Manager.

## Product Purpose

Metacrok turns a brand and up to three competitors into a marketing read of the niche and three differentiated ad variants. It reads the founder's site (and Instagram), pulls the competitors' live Meta Ad Library ads, reads every ad (hook, angle, offer, format, audience), maps where the niche is crowded and where it is empty, and writes three variants in the founder's voice. Success: the founder sees in under two minutes how their brand differs from rivals, which customer and angle to go after, and has three review-ready variants.

## Positioning

From competitor ads straight to differentiated copy, grounded in what has run longest, with the whitespace shown as a map. Saving tools (Foreplay, AdSpy, PiPiAds) stop at saving ads, mostly serve agencies, and charge per seat or credit. Metacrok never claims spend, ROAS or revenue, never writes to the ad account, and refuses to invent claims.

## Operating Context

- One run: Feed (brand, competitors, goal, notes) → Chew (live progress, ~40 to 90 s) → Fresh out (results). Runs are shareable and resumable at `/app?run=<id>`.
- Founders review, correct (set ads aside, fix a read, edit the inferred ICPs) and regenerate, then paste variants into Meta Ads Manager by hand.
- Used on laptop and phone; often opened from a shared link.

## Capabilities and Constraints

- Data: Meta Ad Library via Apify (ads, start date, variant count, images, copy); founder site read; founder Instagram posts via Apify (confirmed 2026-10-22, to be built); Google models only via OpenRouter, pinned to Google infrastructure.
- Analysis available per ad: hook, angle (12 fixed angles), offer, format, why it works, days running, variant count. To be added: inferred audience (ICP) and positioning coordinates.
- ICPs are inferred from rival ads and labelled as inference; the founder can edit them (confirmed 2026-10-22).
- Performance signals are longevity and variant count only, shown as hints, never proof.
- Claims guardrail: no invented ratings, certifications, offers, founder stories, competitor wording or names; placeholders instead.
- Every serverless call must finish under 60 s (Vercel target). Static HTML/CSS/JS frontend, no framework.
- Undecided: pricing (flat monthly is the hypothesis), deployment date.

## Brand Commitments

- Name: metacrok. Tagline: "eats ads, spits out better ones". Mascot: a gator (three poses in `public/img/`).
- Brand colours: #F58545 orange, #DD2A7B pink, #8134AF purple, #FFC24B yellow, #1A1A1A charcoal; gradient orange → pink → purple.
- Voice: playful gator metaphors (feed, chew, fresh out) over a serious, honest product.
- The user asked on 2026-10-22 for a typography-led, premium revamp with more colour, referencing designeverywhere.co's typography category.

## Evidence on Hand

- Validation report: `C:\Users\divya\Downloads\Metacrok Problem Statement Validation.docx` (G2/Capterra reviews, practitioner threads). Summary in `MVP-SPEC.md` section 13.
- Real runs: live Meta ads for Minimalist, Dot & Key, Mamaearth stored in `.data/`.
- No customers, testimonials, press or usage numbers exist yet. Do not fabricate any.

## Product Principles

1. Show the landscape, then the answer: the founder should see where rivals crowd before reading the copy.
2. Honest signals only: longevity and variant count as hints; never spend or ROAS.
3. The founder stays in control: every AI read, audience and variant can be corrected, and nothing is published for them.
4. Differentiate, never copy: the product exists to escape the Same-Claim Trap.
5. Fast to value: one sitting, no sign-up, under two minutes to a usable result.
