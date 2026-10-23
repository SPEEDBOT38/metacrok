# Hyperframes Composition Brief: metacrok

## Objective
Create a short launch-style brag video for metacrok ("eats ads, spits out better ones").

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 21.0 seconds

## Source Material
- Project root: `C:\Users\divya\OneDrive\Documents\Hirotoma\metacrok`
- Primary files read: `public/index.html`, `public/app.css` (palette), `public/app.js` (flow states), `README.md`, `PRODUCT.md`, `public/assets/game/*` sprites
- Product name: metacrok
- Tagline / strongest claim: "Eats ads. Spits out better ones."
- Key UI or visual moment to recreate: the feed form (brand + rival chips + orange "Feed the croc" CTA), the chew/progress state, the finding panel with yellow-highlight verdict + stat chips, and the three sample ad cards (white card, avatar dot, "Sponsored", big color block with lowercase Oxanium line, footer bar with CTA) — all as rendered on the site.
- Copy that must appear verbatim:
  - "Eats ads." / "Spits out better ones." (hero; scene 1 echo line is "your rivals ran 45 ads." — connective, free)
  - "Feed the croc"
  - "Feed. Chew. Fresh out." (scene 3 pixel label uses "CHEWING"; the three chew lines paraphrase the site's how-it-works copy)
  - "nobody in skincare explains how the ingredients work."
  - "30 rival ads read" · "47% shout pain points" · "0 teach"
  - "Not all dark circles are the same." / "Stubborn pigmentation? Here's why." / "Skincare without the markup."
  - "Hungry?"
  - "eats ads, spits out better ones"
  - "90 seconds, no sign-up" (site: "No sign-up. Name your rivals and get your story in about 90 seconds.")
- Fictional stand-ins: rival brand names shown are invented skincare brands (glowrite, dewdrop co., lumaskin) and the sample cards use the site's own fictional "glowandco" brand — the site itself labels its sample numbers as fictional.
- Product asset files to use (copy from the project): `public/assets/game/crocRun1.png`, `crocRun2.png`, `crocChompOpen.png`, `crocChompBite.png`, `public/assets/logo-white.png`

## Creative Direction
- Tone preset: `default`
- Creative direction: "arcade gator devouring your rivals' ad strategies — pixel HUD energy over real product UI"
- Interpretation: playful and fast; chomp scenes carry arcade energy (Press Start 2P HUD, hard shadows), product scenes are faithful recreations with room to read.
- Angle: a pixel-HUD croc eats a pile of rival ad cards, chews (the app's real progress step), and spits out three finished ads — the product's own Feed → Chew → Fresh out arc played straight.
- Hook: croc chomps a tilted stack of rival ad cards while the HUD counter spins 0000 → 0045; line lands: "your rivals ran 45 ads."
- Outro / punchline: giant "Hungry?" on arcade blue, croc chases a stray card, lockup lands on strong cues, hard end.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Real competitor brand names (use the fictional stand-ins above)

## Visual Identity
- Background: #0B192C (deep navy; panels #12243C; arcade blue #1150AB; finding panel #0B192C on orange #F7862A)
- Text: #F5F8FC (muted #C9D6E6, faint #9FB3CC)
- Accent: #F7862A orange CTA (hard offset shadow #0B192C / #9A4A12), #FFD23A/#FFDE59 yellow highlight, #37B7C3 teal outlines, #7CD2FF light-blue pixel labels
- Display font: Oxanium 800 lowercase, tight letter-spacing, hard offset text-shadow — NOT bundled: @font-face to `assets/fonts/oxanium-*.woff2` (700 + 800)
- Body font: Funnel Sans — NOT bundled: @font-face to `assets/fonts/funnelsans-*.woff2` (400/500/700)
- Pixel accent: Press Start 2P — NOT bundled: @font-face to `assets/fonts/pressstart2p-400.woff2`
- Visual references from the project: croc game sprites, "ADS CHOMPED" pixel HUD, ad card layout, stat chips, yellow highlight treatment

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary (root 0–21.0s):
1. The chomp (hook) — 0–3.5s — ad-card stack slides in, croc CHOMPS twice, HUD ticks 0000→0045, line: "your rivals ran 45 ads."
2. Feed the croc — 3.5–7.0s — feed panel: type "glowandco", rival chips pop in one by one, cursor clicks "Feed the croc"
3. Chew — 7.0–12.0s — three status lines check in one by one, progress bar fills, ad cards stream past the croc, counter climbs 0045→0128
4. Fresh out — 12.0–17.5s — verdict line with yellow highlight, three stat chips, three ad cards slide in one by one
5. Hungry? (outro) — 17.5–21.0s — giant "Hungry?", croc chase, lockup: logo + tagline + "FEED THE CROC · 90 SECONDS · NO SIGN-UP"

## Audio
- Audio role: dense rhythmic layer under arcade scenes, confident bed under product scenes
- Audio arc: full energy from 0s, duck under the scene-4 verdict, back up for the cards, hard end on the logo chomp
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (bundled, most upbeat; tone `default`) — copy to `assets/music/`
- Music treatment: data-start 0, volume ~0.32, fade-out over the last ~0.4s; duck to ~0.12 during 12.0–13.0s (verdict) via a second automation or a low-volume overlapping segment, then restore
- Music cue guidance: bundled preset at `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json` — 120.19 BPM, beat grid ≈ every 0.5s from 3.02; strong cues at 17.02, 17.52, 18.52, 20.02 (also 16.02, 21.01…). Strong-cue locks: 17.52 ("Hungry?" slam), 18.52 (lockup lands), 20.02 (final chomp/logo hit). Beat-grid snaps: scene-2 chips 5.03/5.53/6.03, click 6.52; scene-3 lines 7.52/8.52/9.52; scene-4 chips 13.02/13.52/14.02, cards 14.02/15.02/16.02 (1s apart, each card holds to scene end).
- Audio-reactive treatment: subtle; HUD counter glow and ad-card presence may breathe with RMS/bass. No waveform/equalizer visuals.
- Audio-coupled moments:
  - Scene 1 bites — chunky impact hits, counter ticks
  - Scene 2 typing — randomized keyboard keypress ticks; chips — pop/drop; CTA — click
  - Scene 3 — counter ticks + line-check blips on the beat grid
  - Scene 4 — card arrivals soft whoosh/card-place on beat grid; verdict gets a brief music duck, no SFX on the line itself
  - Scene 5 — one final chomp impact on the logo hit
- SFX selection guidance: use the skill's `assets/sfx/sfx-analysis.md`; prefer low HF-risk for repeated moments; rotate 2 takes of the chomp so bites don't sound robotic; keep total SFX count moderate (~8-10)
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, volume after the animation exists
- Audio files: music + chosen SFX copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the Hyperframes domain skills — the consolidated `hyperframes` skill (contract, format, motion, sound, launch type), `hyperframes-animation`, and `hyperframes-cli` (lint/check/snapshot/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview, do not run the `story.md` storyline-selection loop, and do not route into the generic promo workflow — the storyboard above is the creative contract. Prefer native Hyperframes conventions for all implementation details.

Requirements:
- Show real product material: the croc sprites, the HUD, the feed/chew/result UI recreations, the three ad cards, the logo (`assets/img/logo-white.png` from the project).
- Keep all text readable (scene-4 card lines have reading floors: card 1 ≈ 2.1s, cards 2-3 ≈ 1.3s settled).
- Total 21.0s (root `data-duration="21"`).
- Include the music/SFX layer per the Audio section.
- Fonts are not bundled: add `@font-face` for Oxanium, Funnel Sans, Press Start 2P from local `assets/fonts/` (files provided by /brag build step).
- Run `hyperframes check` before render — brag's single gate. Render locally, keep everything local.
