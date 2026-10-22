---
name: metacrok
description: Eats ads, spits out better ones. Your niche told as a year-in-review story in drenched colour fields.
colors:
  night: "#0E0D0C"
  night-2: "#171513"
  night-3: "#211E1B"
  paper: "#FFF8EF"
  soft: "#D9D0C3"
  dim: "#A39A8E"
  line: "rgba(255,248,239,.14)"
  line-strong: "rgba(255,248,239,.26)"
  tangerine: "#F58545"
  magenta: "#C21F6B"
  violet: "#8134AF"
  mint: "#9FE6C5"
  cobalt: "#2B47F5"
  pink: "#DD2A7B"
  open: "#FFC24B"
  err: "#FF7A6B"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(64px, 19vw, 250px)"
    fontWeight: 800
    lineHeight: 0.8
    letterSpacing: "-0.04em"
    fontVariation: "'opsz' 96, 'wdth' 75"
  headline:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(40px, 9.4vw, 124px)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.035em"
    fontVariation: "'opsz' 96, 'wdth' 80"
  title:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 3.6vw, 42px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.025em"
    fontVariation: "'opsz' 72, 'wdth' 85"
  sentence:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(26px, 5.4vw, 54px)"
    fontWeight: 500
    lineHeight: 1.42
    letterSpacing: "-0.02em"
    fontVariation: "'opsz' 60, 'wdth' 92"
  body:
    fontFamily: "'Funnel Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'ss01'"
  lede:
    fontFamily: "'Funnel Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(16px, 1.6vw, 19px)"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Funnel Sans', ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1
  number:
    fontFamily: "'Spline Sans Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "inherit"
    fontWeight: 500
    letterSpacing: "-0.01em"
    fontFeature: "'tnum'"
  number-hero:
    fontFamily: "'Spline Sans Mono', ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "clamp(40px, 9vw, 72px)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
rounded:
  hairline: "3px"
  control: "10px"
  field: "14px"
  panel: "18px"
  card: "20px"
  pill: "99px"
spacing:
  gutter-sm: "16px"
  gutter-md: "24px"
  gutter-lg: "4vw"
  measure: "1240px"
  chapter-top-sm: "56px"
  chapter-top-md: "72px"
  chapter-top-lg: "96px"
components:
  button-primary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-ink:
    backgroundColor: "{colors.night}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "48px"
  button-feed:
    backgroundColor: "{colors.tangerine}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "0 44px"
    height: "58px"
  pill-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  status-open:
    backgroundColor: "{colors.open}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  placeholder-mark:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.night}"
    rounded: "{rounded.hairline}"
    padding: "0 2px"
  input-field:
    backgroundColor: "{colors.night-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.field}"
    padding: "14px 16px"
  card-variant:
    backgroundColor: "{colors.night-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.card}"
  chapter-rail-link-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "8px 13px"
---

# Design System: metacrok

## Overview

**Creative North Star: "The Year-in-Review of Your Niche"**

metacrok tells a founder's competitive landscape the way a streaming service tells you your year: one finding per screen, each on its own drenched colour field, stated in enormous condensed type, with the data that proves it underneath. The ground is near-black night; the story moves through tangerine, magenta, violet, mint and cobalt fields, and one colour, a warm yellow, is held back to mean exactly one thing: space nobody owns.

The system is typographic first. Bricolage Grotesque, pushed narrow on its width axis and large on its optical-size axis, carries every finding as a punchline that fills the field edge to edge. Funnel Sans does the explaining at reading size; Spline Sans Mono appears only where a value is counted. Charts are honest about their sources: what was observed is drawn solid, what the AI inferred is drawn dashed. The gator mascot supplies the play; the data drawing supplies the seriousness.

The world explicitly refuses the category default: a sidebar dashboard of KPI cards and charts on white. There is no sidebar, no white app canvas, no grid of metric tiles. Density lives inside a chapter, never across the page.

**Key Characteristics:**
- Full-bleed colour chapters on a night ground, one finding each.
- Condensed display type at poster scale; text in Funnel Sans; numbers in mono.
- Yellow is reserved for open space; mint marks blanks the founder fills.
- Observed data solid, AI inference dashed.
- Pills and soft rounded panels; no hard edges, no hard shadows.
- One authored motion moment per surface.

## Colors

A night ground with five saturated chapter fields and two semantic highlights, each with a single job.

### Primary
- **Gator Tangerine** (`tangerine`): the brand's opening field. Landing hero and close, the Feed title, the first Chew stage, the Verdict chapter, the primary Feed button, the Regenerate button, focus underline on sentence blanks, caret colour. Also competitor identity 1 and the "what rivals pay to say" bars. Ink on it is night.

### Secondary (chapter fields)
- **Deep Magenta** (`magenta`): the Loudest chapter field and Chew "pull" stage; one of the three variant creative tiles. Ink on it is paper.
- **Story Violet** (`violet`): the Map chapter field and Chew "analyze" stage; default variant creative tile. Ink is paper.
- **Fresh Mint** (`mint`): the Audiences chapter field and Chew "synthesize" stage. Ink is night. Mint is also the placeholder highlight (see Named Rules) and the "fixed" confirmation text on corrected ads.
- **Electric Cobalt** (`cobalt`): the You-vs-them chapter field and the final Chew stages (generate, done); one variant creative tile; competitor identity 3. Ink is paper.

### Tertiary (semantic)
- **Open-Ground Yellow** (`open`): opportunity only. Used for the open-word highlight inside findings, the open quadrant on the positioning map (at 55% fill opacity, labelled "open ground"), the "open" audience status chip, "only you" chips and solo bars, and the highlighted angle rows that only the founder uses. Ink on it is always night.
- **Brand Pink** (`pink`): competitor identity 2 and the text selection colour. Not a chapter field (the field is the deeper magenta).
- **Alarm Coral** (`err`): error text, error log lines and the run-error border.

### Neutral
- **Night** (`night`): page ground, ink on light fields, the founder's own marks ("you") on the map and in the dot matrix, the target audience row.
- **Night 2 / Night 3** (`night-2`, `night-3`): raised surfaces on night: inputs, suggestion rows, variant cards, the Every-ad chapter field (night-2), ad tiles and tags (night-3).
- **Paper** (`paper`): ink on dark fields; the primary button; the active step and chapter link; the map's card ground.
- **Soft** (`soft`): secondary text on night (ledes, why-it-works, labels).
- **Dim** (`dim`): tertiary text, placeholders, inactive steps and rail links, metadata.
- **Line / Line Strong** (`line`, `line-strong`): hairline borders and dividers on night; strong for inputs, pills and ghost controls.

Inside a chapter, a `--quiet` tone is derived as 74% of the chapter's ink mixed into its field, so secondary text always belongs to the field it sits on.

### Named Rules
**The Yellow Means Open Rule.** `open` marks space nobody owns and nothing else: no buttons, no warnings, no decoration. If a yellow element does not point at an opportunity, it is wrong.

**The Mint Blank Rule.** Bracketed placeholders in generated copy (ratings, counts, offers the founder must supply) are highlighted in mint, never yellow. A blank is the founder's to fill; it is not open space.

**The Identity Order Rule.** Competitors take identity colours in input order: rival one tangerine, rival two pink, rival three cobalt. The founder is always ink (night squares, night dots, night rings). On the dot matrix rival dots take the chapter ink and the founder's columns take night on a lifted column.

**The One Field, One Finding Rule.** Each chapter owns exactly one field colour, and its ink flips (night on tangerine and mint, paper on magenta, violet and cobalt). Never set two fields side by side inside one chapter.

## Typography

**Display Font:** Bricolage Grotesque (variable: opsz 12–96, wdth 75–100, wght 200–800), falling back to the system sans
**Body Font:** Funnel Sans (wght 300–800), stylistic set 1 on, falling back to the system sans
**Label/Mono Font:** Spline Sans Mono (wght 400–600), for counted values

**Character:** A narrow, characterful grotesque shouting the finding at poster scale over a calm, slightly quirky text face; the mono is a quiet instrument readout for every number.

### Hierarchy
- **Display** (800, clamp 64–250px, line-height 0.8, wdth 75): the Chew stage word (SNIFFING, FEEDING, CHEWING, DIGESTING, SPITTING, FRESH OUT) and the landing headline (clamp 64–236px). Scaled down by script to fit one line.
- **Headline** (800, clamp 40–124px, line-height 0.9, wdth 80): every chapter finding. The Verdict finding grows to clamp 56–168px to fill its field; long findings step down to clamp 34–80px so they stay a headline, not a paragraph. `text-wrap: balance`.
- **Title** (800, clamp 26–42px, line-height ~0.95, wdth 82–85): audience names, variant card angles (set lowercase), creative hooks, outro heading.
- **Sentence** (500, clamp 26–54px, line-height 1.42, wdth 92): the Feed form written as one sentence, inputs inheriting the face.
- **Body** (400, 16px, line-height 1.5): default text. Chapter ledes run clamp 16–19px at 62ch max.
- **Label** (500–600, 12–15px): steps, chapter rail, pills, tags, status chips, buttons (600, 15px).
- **Number** (Spline Sans Mono, tabular): percentages, day counts, distances, counts, run clock, cost readout; the Chew progress percentage at clamp 40–72px.

### Named Rules
**The Mono Counts Rule.** Spline Sans Mono is for values that are counted or measured. It never sets a heading or a sentence.

**The Condensed Punchline Rule.** Findings are always Bricolage at weight 800 with a narrow width axis (75–85) and negative tracking (-0.025 to -0.04em). Never set a finding in Funnel Sans, and never at body size.

## Layout

Each chapter is a full-bleed field whose content shares one left edge: horizontal padding is `max(var(--g), (100% - 1240px) / 2)`, where the gutter `--g` is 16px on phones, 24px from 600px, and 4vw from 900px. The landing's `.field` sections use the same formula (gutter 16px, then 4vw from 700px), so landing and results line up on the same measure. Chapter vertical padding steps 56/64px → 72/84px → 96/110px across the breakpoints.

The Verdict chapter is at least one viewport tall (minus the chrome) and pins its finding to the bottom of the field on desktop. The app header (56px, 60px from 900px) and the chapter rail stay sticky; anchor jumps account for both via `scroll-padding-top`.

Breakpoints: 600px and 900px in the app; 700px on the landing. On phones the Feed submit button becomes a sticky bottom bar with a fade; from 900px it sits inline. Inside chapters, content goes two-column from 900px (map + legend, audiences, you-vs-them, three variant cards); the every-ad wall goes 2 → 3 → auto-fill columns of at least 200px. Wide tables scroll horizontally inside a bleed wrapper rather than squeezing.

Map SVG labels are enlarged below 600px so they stay legible as the square map scales down.

## Elevation & Depth

Depth comes from colour, not shadow. Chapters are flat fields; surfaces on night lift by stepping to night-2 and night-3 with a hairline border. Shadows appear only on layers that genuinely float above the page, and they are soft and dark.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 14px 40px rgba(0,0,0,.45)`): the pending-changes bar.
- **Popover** (`box-shadow: 0 18px 50px rgba(0,0,0,.5)`): the cost readout panel.
- **Tip** (`box-shadow: 0 10px 30px rgba(0,0,0,.3)`): the map tooltip; the toast uses `0 12px 30px rgba(0,0,0,.35)`.
- **Flyer** (`box-shadow: 0 12px 26px rgba(0,0,0,.25)`): ad thumbnails flying across the Chew stage; the gator there takes a matching drop-shadow.
- **Live glow** (`box-shadow: 0 0 0 4px rgba(87,214,160,.18)`): the live-data dot only.

The sticky header and chapter rail use translucent night (90–92%) with a 12px backdrop blur.

### Named Rules
**The Flat Field Rule.** Nothing inside a chapter field casts a shadow. If a surface needs separation inside a field, change its colour (night panel on mint, paper map card on violet).

## Shapes

Soft, friendly geometry throughout. Every button, step, rail link, pill, tag and status chip is a full pill (99px). Panels and fields round at 14px; audience rows, the map card and floating bars at 18px; variant cards at 20px; small controls at 9–12px; highlights (open words, placeholder marks, solo labels) at about 3px so they read as a marker stroke, not a chip. Dots are circles; the founder's new ads on the map are rounded squares (28px, 7px radius) carrying their number, which keeps "yours" distinct from "theirs" by shape as well as colour.

Borders are hairlines (1px line on night, 1.5px on pills and outlines). Ghost buttons draw their outline as an inset 1.5px currentColor ring so they adopt the field's ink.

**The Dashed Is Inferred Rule.** A dashed stroke means the AI inferred it: estimated map positions (dash 3 2, night stroke), the dashed legend chip, and inferred audience rows (1.5px dashed border). Once the founder edits audiences, the rows go solid. Observed data is never dashed.

## Components

### Buttons
Confident pills that take the field's ink.
- **Shape:** full pill (99px), 48px minimum height (54px on the landing, 58px for the Feed submit).
- **Primary:** paper fill, night ink, 600 15px Funnel Sans, 0 22px padding.
- **Ink:** night fill, paper ink, for use on light fields (tangerine, mint).
- **Feed / Regenerate:** tangerine fill, night ink; the one action that starts or restarts the gator.
- **Ghost:** transparent with an inset 1.5px currentColor ring.
- **Hover / Active:** lift 1px (2px on the landing) and press down 1px, 0.2s on the house ease `cubic-bezier(.16,1,.3,1)`. Disabled drops to 55% opacity with a progress cursor.
- **Focus:** a 2px currentColor outline offset 3px, global.

### Chips and Pills
- **Goal pills:** 1.5px line-strong outline, 11px 18px padding; checked fills paper with night ink.
- **Status chips:** 600 12px, 1.5px currentColor outline; "open" fills yellow. "your target" sits beside the audience name.
- **Tags:** night-3 fill, soft ink; the hot tag inverts to paper.

### Cards / Containers
- **Variant card:** night-2, 1px line border, 20px radius, holding a mock Instagram post on paper (14px radius, platform system font and greys to read as Instagram's own chrome) with a square creative tile in violet, magenta or cobalt.
- **Audience row:** 18px radius, 20px padding, dashed when inferred, solid when founder-edited; the recommended target inverts to a night panel with paper ink.
- **Ad tile (every ad):** night-3, 14px radius, square thumbnail with a mono day-count pill; set-aside ads drop to 42% opacity and greyscale.

### Inputs / Fields
- **Sentence blanks:** inherit the display sentence face, transparent with a 2px line-strong underline that turns tangerine on focus; width follows content (`field-sizing: content`).
- **Boxed fields:** night-2 (or night on cards), 1px line-strong border, 14px radius (10px on small inputs); focus swaps the border to paper. On mint, the audience editor uses paper inputs with a night focus border.
- **Errors:** coral text under the field; the run error is a night-2 panel with a coral border.

### Navigation
- **App header:** sticky 56/60px translucent night with blur, wordmark (Bricolage 800, wdth 85), a three-step progress list (Feed, Chew, Fresh out) where the current step is a paper pill, and a live/demo data indicator dot.
- **Chapter rail:** sticky under the header, horizontally scrollable pills in dim; hover brightens to paper; the active chapter fills paper.
- **Landing nav:** fixed, transparent over the tangerine hero with a night CTA pill, turning solid translucent night once the hero scrolls away.

### Dot Matrix (signature)
Angles down, brands across. Each cell is a dot whose diameter grows with the square root of the share, with the mono percentage beneath. Rival columns use the chapter ink; the founder's columns (Instagram, three new ads) use night dots on a lifted paper-tinted column. Rows the founder alone uses get a yellow highlight on the angle name and a note.

### Positioning Map (signature)
A square SVG on a paper card (18px radius): rational ↔ emotional by value-led ↔ premium. Rival ads are circles in their identity colour sized by days running, paper-stroked when observed and night-dashed when estimated; Instagram posts are night rings; new ads are numbered night squares. The emptiest quadrant, when nearly empty, fills yellow and is labelled "open ground". Hover or focus dims everything else to 18% and shows a night tooltip.

### Chew Stage (signature)
A full-viewport field whose colour moves through tangerine → magenta → violet → mint → cobalt as the run advances (0.9s background transition), with the stage word at display scale drawn twice: a 22% ghost and a solid copy revealed left to right by `clip-path` as progress climbs. While chewing, the letters bob in a staggered loop. Ad thumbnails fly in on the gator's side.

### Pending-Changes Bar
A fixed night bar (18px radius, float shadow) that appears once the founder sets an ad aside, fixes a read or edits audiences, carrying the count and the tangerine Regenerate button. One place for all corrections.

## Do's and Don'ts

### Do:
- **Do** give each chapter one full-bleed field and one finding at headline scale, with its ink flipped to suit the field.
- **Do** use `max(var(--g), (100% - 1240px) / 2)` for chapter and section padding so every child shares one left edge.
- **Do** reserve yellow (`#FFC24B`) for open space: open words, the open quadrant, "open" audiences, "only you" angles.
- **Do** highlight placeholders in mint, with night ink.
- **Do** draw AI-inferred data dashed and observed data solid, and say so in the legend.
- **Do** keep competitor identity in input order (tangerine, pink, cobalt) and the founder in night.
- **Do** set every counted value in Spline Sans Mono with tabular figures.
- **Do** limit each surface to one authored motion moment (landing headline rise; Chew field colour and word fill), start it from a visible state, and honour reduced motion.

### Don't:
- **Don't** build a sidebar dashboard of KPI cards and charts on a white canvas; that is the category default this world refuses.
- **Don't** use yellow for buttons, warnings, decoration or placeholders.
- **Don't** set kickers or eyebrows above headings; the finding is the first line. Format and stage information live in tags and labels after the heading.
- **Don't** put shadows inside chapter fields or use hard offset shadows anywhere.
- **Don't** show the cost readout to founders; it is a developer tool behind `?dev=1`.
- **Don't** set headings in mono or Funnel Sans, or numbers in Bricolage.
- **Don't** animate an entrance from invisible; a throttled or skipped animation must still leave the content on screen.
