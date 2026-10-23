# Metacrok app: user guide

Metacrok writes three ads for your brand that go after the angle your rivals aren't using. You give it your brand and up to three rivals. It reads their live Meta ads, maps where they crowd, and writes three ads for the open space. It never posts anything; you review and paste.

Live site: https://metacrok.vercel.app/app

## The three steps

Across the top, **1 Feed → 2 Chew → 3 Fresh out** shows where you are.

### 1. Feed

Fill in the form and tap **feed him →**.

- **Your brand:** your website and brand name. Add your Instagram handle too, so Metacrok can compare your posts with your rivals' ads. Without a website or brand name, the run won't start.
- **Your rivals:** add up to three by brand name, `@handle`, or Facebook page link. A Facebook page link, or the link from Meta's Ad Library for that advertiser, is the most exact match. If a rival shows as having no ads, check the market: it may advertise in another country (try "All markets"). Not sure who they are? Tap **Not sure? Find my rivals** and pick from the suggestions.
- **The ads are for:** cold traffic, retargeting, a launch or a sale.
- **What makes your product different:** optional. This is the only source of claims the ads can make, so add ratings, offers or ingredients here if you want them used.
- **Ad Library market:** the country whose Meta ads to read.

**Fill with demo brands** loads fictional rivals. Demo runs are free and show the whole flow without live data.

### 2. Chew

The run takes about 1 to 2 minutes. You'll see the stage (sniffing, pulling, chewing, digesting, spitting), progress, and a kitchen log. You don't need to keep the tab in focus, but leave it open: the page drives the run forward.

If a rival can't be found, the run says so instead of swapping in another brand. Paste that rival's Facebook page link in place of its name and run again.

If the run fails, you can **try live again**, **run on demo ads**, or go **back to the form**.

### 3. Fresh out

This is the result. Five tabs:

| Tab | What it shows |
|---|---|
| **You** | Your ideal customer, what you post, and how you sound. Edit the audience here. |
| **Rivals** | Each rival's main angle, hooks, discounts, formats, and who they target. |
| **The map** | Every ad as a dot. Close dots say the same thing; far dots are different. Open ground is an angle no one uses. |
| **Your ads** | The three new ads, with copy buttons and tweak controls. |
| **Ads eaten** | Every rival ad Metacrok read. Set one aside or fix how it was read. |

**Things to know**
- `[Brackets]` mean you fill them in. Metacrok never makes up ratings, offers or founder stories.
- "Days running" is a hint, not proof. Meta doesn't publish spend or ROAS.

## Changing the ads

Changes wait in a bar at the bottom until you tap **Regenerate**. Regenerating replaces all three ads and discards any tweaks.

- **Set aside** (Ads eaten): ignore an ad when writing. At least three ads must stay.
- **Wrong read?** (Ads eaten): choose the angle the ad really uses and add a note.
- **Edit audiences** (You or Rivals): replace the guessed audiences with your own and choose the one to aim at.
- **Tweak** (Your ads): rewrite one ad, e.g. "shorter" or "more playful". Earlier versions are kept.
- **Copy:** copies one field or the whole ad, ready for Ads Manager.
- **Make the image** (Your ads): paints the ad as a square image. It uses stock photos from Pixabay for mood, your own Instagram posts for the brand's look, and Google's Nano Banana to paint. About 3 to 4 cents and 15 seconds per image. Text appears on the image only when the ad's on-image line has no [placeholder]. Photographer credits are shown. Regenerating the ads clears the old images.

## Limits

- Each visitor can start a limited number of runs per hour (3 on the live site).
- A live run costs a few cents. Demo runs cost almost nothing.

## Run it on your own machine

Needs Node 24.

```bash
npm install
cp .env.example .env
npm start
```

Open http://localhost:3000/app (the port is `PORT` in `.env`).

Without `APIFY_TOKEN`, runs use demo ads. Without `OPENROUTER_API_KEY`, the AI steps can't run.

For the variables, see `.env.example`. To use the app from an AI agent, see [MCP.md](MCP.md). For the HTTP API, see [API.md](API.md).
