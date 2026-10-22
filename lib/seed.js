// lib/seed.js — demo seed ads. FICTIONAL brands, written to behave like a
// real Instagram-first Indian D2C niche (long-running winners, variant
// clusters, an over-used discount angle). They guarantee the demo works
// with no network. Replace with real saved Ad Library ads via
// POST /api/admin/seed (admin) or "promote this run to seed".
import { db } from './hatchable.js';

const D = (days) => new Date(Date.now() - days * 86400000).toISOString();

const PACKS = {
  skincare: {
    label: 'skincare',
    match: /skin|serum|beauty|glow|face|spf|sunscreen|derm|hair|cosmetic|makeup|body|wellness|care/i,
    competitors: {
      glowritual: { ig: '@glowritual', ads: [
        ['Okay but WHY is nobody talking about this? 7 days of the 10% Niacinamide Glow Drops and my texture is just... gone. Not filtered. Not sponsored. Just obsessed.', 'The glow drops everyone is whispering about', 'Lightweight. Non-sticky. Dermat-tested.', 'Shop now', 'IMAGE', 148, 6, 'Mirror selfie in bathroom morning light, hand holding amber dropper bottle, text overlay "day 7 no filter"', 'ugc'],
        ['Your 3-step night routine, sorted. Cleanse. Glow Drops. Barrier Cream. That is it. That is the post.', 'Night routine in 90 seconds', 'Free shipping over ₹599', 'Shop now', 'CAROUSEL', 121, 3, 'Carousel: three products lined up on a marble sink, one per slide, numbered 1-2-3', 'routine'],
        ['"I stopped wearing foundation to work." — Priya, 27, Bengaluru. Real skin, real results, 40,000+ glow-getters.', '40,000+ glow-getters can\'t be wrong', '4.7★ from 6,200 reviews', 'Shop now', 'IMAGE', 96, 4, 'Close-up of a smiling woman, no makeup, star rating badge in corner', 'review'],
        ['Glass skin is not a filter. It is a routine. Start yours tonight.', 'Glass skin starts tonight', 'Dermat-tested • Fragrance free', 'Learn more', 'IMAGE', 74, 2, 'Glossy water-droplet texture macro shot with product bottle, soft pink gradient', 'aspiration'],
        ['Festive glow, without the festive breakout. Our Diwali edit is here — 3 bestsellers, 1 gift box.', 'The Diwali glow edit', 'Gift-ready box • Ships in 24h', 'Shop now', 'IMAGE', 18, 2, 'Gift box with diyas and marigold petals, products peeking out', 'gifting'],
        ['POV: your friends keep asking what you changed. (It is the drops. It is always the drops.)', 'The question you\'ll keep getting', 'Lightweight daily serum', 'Shop now', 'IMAGE', 33, 3, 'Text-on-image meme: group chat screenshot "what did you DO to your skin??"', 'meme'],
        ['Dull skin? Uneven tone? Big pores? One bottle. Niacinamide + zinc + rice water.', 'One bottle. Three problems.', 'Visible results in 14 days', 'Shop now', 'IMAGE', 57, 2, 'Split image: three problem icons crossed out next to the bottle', 'pain'],
        ['First order? Take 15% off your glow routine. Code GLOW15.', '15% off your first glow', 'Code GLOW15 at checkout', 'Get offer', 'IMAGE', 9, 1, 'Product flat lay on peach background with big 15% sticker', 'offer'],
        ['Made in small batches in Pune. Formulated with dermatologists. Loved by your group chat.', 'Small batch. Big glow.', 'Made in India', 'Learn more', 'IMAGE', 41, 1, 'Lab bench with founder in apron holding a beaker, warm tones', 'story'],
        ['The serum that made me delete my skincare wishlist. Linked below before it sells out again.', 'Back in stock (for now)', 'Sold out 3x this year', 'Shop now', 'IMAGE', 5, 2, 'Phone screenshot style story with "BACK IN STOCK" banner', 'fomo'],
      ]},
      dewdrift: { ig: '@dewdrift.in', ads: [
        ['FLAT 40% OFF on all sunscreens. Today only. Your skin will thank you this summer.', 'Flat 40% off sunscreens', 'Today only • Free shipping', 'Shop now', 'IMAGE', 132, 11, 'Bold yellow banner with "40% OFF" in huge type, three tubes of sunscreen', 'offer'],
        ['Buy 2, get 1 free on the entire hydration range. Stock up before the sale ends.', 'Buy 2 get 1 free', 'Ends Sunday', 'Shop now', 'IMAGE', 88, 7, 'Three blue bottles with "+1 FREE" sticker, splash of water behind', 'offer'],
        ['No white cast. No greasy feel. SPF 50 PA++++ that actually disappears on Indian skin tones.', 'The SPF that disappears', 'SPF 50 PA++++ • No white cast', 'Shop now', 'IMAGE', 110, 5, 'Before/after of sunscreen swatch rubbed into a deep skin tone forearm', 'demo'],
        ['Our bestseller, now at its lowest price ever. Only 200 units left at this price.', 'Lowest price ever', 'Only 200 left', 'Shop now', 'IMAGE', 21, 6, 'Product hero with red "LOWEST PRICE EVER" ribbon and countdown timer graphic', 'fomo'],
        ['Rated #1 sunscreen by 12,000+ Indian women. Join them.', '#1 rated by 12,000+ women', '4.6★ average rating', 'Shop now', 'IMAGE', 67, 3, 'Collage of customer selfies holding the tube, star badges', 'review'],
        ['Mega Skin Sale: up to 60% off + free gift on orders above ₹999.', 'Up to 60% off + free gift', 'Mega Skin Sale is live', 'Shop now', 'CAROUSEL', 12, 9, 'Carousel of discounted products each with a % sticker', 'offer'],
        ['Dermatologists recommend reapplying SPF every 3 hours. We made it easy with a stick you can carry anywhere.', 'SPF on the go', 'Pocket-size SPF 50 stick', 'Learn more', 'IMAGE', 45, 2, 'Hand pulling SPF stick from a tote bag in a sunny street', 'education'],
        ['Hydration that lasts 72 hours. Clinically tested. Now 30% off.', '72-hour hydration, 30% off', 'Clinically tested', 'Shop now', 'IMAGE', 30, 4, 'Moisture meter graphic next to a gel jar, water ripples', 'offer'],
        ['Summer skin kit: SPF + gel moisturiser + mist. Worth ₹1,497, yours for ₹899.', 'Summer kit at ₹899', 'Save ₹598', 'Shop now', 'IMAGE', 54, 5, 'Kit box open on beach towel with sunglasses', 'offer'],
        ['Tired of sunscreen that burns your eyes? Ours is tear-free and fragrance free.', 'SPF that doesn\'t sting', 'Fragrance free • Tear-free', 'Shop now', 'IMAGE', 26, 2, 'Woman rubbing eyes looking annoyed vs smiling, split frame', 'pain'],
      ]},
      barebae: { ig: '@barebae.co', ads: [
        ['5% Vitamin C + Ferulic acid. Stable for 12 months. We publish our lab reports, because you deserve receipts.', 'Vitamin C with receipts', 'Lab reports on every batch', 'Learn more', 'IMAGE', 162, 3, 'Clinical white background, bottle next to a printed lab report with highlighted numbers', 'authority'],
        ['Your actives cheat sheet: what NOT to mix. Save this.', 'Save this before your next routine', 'Free skincare guide', 'Learn more', 'CAROUSEL', 118, 2, 'Infographic carousel: ingredient pairs with green ticks and red crosses', 'education'],
        ['Formulated by a dermatologist who got tired of explaining marketing claims to her patients.', 'Made by a dermat who was fed up', 'Founder-led • Science-first', 'Learn more', 'IMAGE', 84, 1, 'Portrait of the founder in a white coat, text overlay quote', 'story'],
        ['Brand X: 20% Vitamin C (oxidises in 3 weeks). Us: 5% stabilised Vitamin C that actually works. Do the math.', 'More % isn\'t better', 'Stabilised formula', 'Shop now', 'IMAGE', 71, 4, 'Side-by-side comparison table: generic orange bottle vs barebae bottle', 'comparison'],
        ['Dark spots from old acne? Here is what fades them — and what is just hype.', 'Fade old acne marks (no hype)', 'Azelaic acid 10%', 'Learn more', 'IMAGE', 49, 2, 'Close-up of skin with post-acne marks, annotated arrows', 'pain'],
        ['Fragrance free. Essential-oil free. Pregnancy-safe. The boring formula your skin actually wants.', 'Boring formula. Great skin.', 'Pregnancy-safe actives', 'Shop now', 'IMAGE', 63, 2, 'Minimal product shot on grey, list of "free from" in small type', 'authority'],
        ['3 months with our Retinal serum. Unretouched. Same lighting. Same phone.', '12 weeks, unretouched', 'Retinal 0.1%', 'Shop now', 'IMAGE', 102, 5, 'Before/after side-by-side face photos, same angle, dates stamped', 'beforeafter'],
        ['We said no to influencer giveaways. We said yes to clinical trials.', 'No giveaways. Just trials.', 'Clinically tested on Indian skin', 'Learn more', 'IMAGE', 28, 1, 'Text-only poster, black type on cream, bold sans', 'authority'],
        ['Starter kit for actives beginners: gentle cleanser + niacinamide + SPF. ₹1,199.', 'Your first actives kit', 'Beginner-friendly', 'Shop now', 'IMAGE', 16, 2, 'Three products in a row with labels "step 1, 2, 3"', 'routine'],
        ['Questions about retinoids? Our dermatologist answers live on Instagram every Thursday.', 'Ask a dermat, live', 'Every Thursday, 7pm', 'Learn more', 'IMAGE', 7, 1, 'Screenshot of an Instagram live with a doctor, question bubbles', 'education'],
      ]},
    },
  },
  snacks: {
    label: 'snacks',
    match: /snack|food|chips|cookie|protein|bar|makhana|nut|drink|coffee|tea|beverage|granola|chocolate|sauce|kitchen|bake|eat|millet|healthy/i,
    competitors: {
      snakkit: { ig: '@snakkit', ads: [
        ['4.9★ from 2,130 snackers. The roasted makhana that converted my chips-every-evening husband.', '4.9★ from 2,130 snackers', 'Roasted, never fried', 'Shop now', 'IMAGE', 139, 6, 'Review screenshots stacked over a bowl of makhana', 'review'],
        ['3pm slump? 120 calories, 6g protein, zero guilt. Peri-peri makhana.', 'Beat the 3pm slump', '6g protein per pack', 'Shop now', 'IMAGE', 92, 4, 'Office desk, laptop, pack being torn open, clock showing 3pm', 'pain'],
        ['Try all 6 flavours for ₹299. Find your favourite, then subscribe and save 15%.', 'All 6 flavours for ₹299', 'Trial pack', 'Shop now', 'CAROUSEL', 64, 5, 'Six colourful packs fanned out on a yellow background', 'offer'],
        ['We roast in small batches in Nashik. No palm oil. No maida. Just makhana, spices and patience.', 'Small batch, no shortcuts', 'No palm oil • No maida', 'Learn more', 'IMAGE', 51, 1, 'Founders in a small roasting unit, sacks of makhana', 'story'],
        ['Movie night upgrade: swap the popcorn for cheddar makhana. Your friends will ask.', 'Movie night, upgraded', 'Cheddar & herbs', 'Shop now', 'IMAGE', 23, 3, 'Couch, TV glow, bowl of makhana, two friends reaching in', 'aspiration'],
        ['Chips: 540 kcal/100g, fried. Us: 410 kcal/100g, roasted, 2x protein.', 'Chips vs makhana', 'Read the label', 'Learn more', 'IMAGE', 77, 3, 'Nutrition label side-by-side comparison', 'comparison'],
        ['Last week of the monsoon sale: 25% off everything.', '25% off — last week', 'Monsoon sale', 'Shop now', 'IMAGE', 6, 4, 'Rain drops on window, packs with 25% stickers', 'offer'],
      ]},
      crunchtown: { ig: '@crunchtown.in', ads: [
        ['FLAT 30% OFF on protein chips. Use code CRUNCH30.', 'Flat 30% off protein chips', 'Code CRUNCH30', 'Get offer', 'IMAGE', 101, 8, 'Big red 30% stamp over chip packs', 'offer'],
        ['10g protein. Real crunch. Zero compromise. Gym bag essential.', '10g protein, real crunch', 'Gym bag essential', 'Shop now', 'IMAGE', 85, 4, 'Gym bag open with pack, dumbbells, sweat towel', 'aspiration'],
        ['Buy 5 get 5 free. Stock your office drawer for a month.', 'Buy 5 get 5 free', 'Limited time', 'Shop now', 'IMAGE', 40, 7, 'Office drawer full of packs, "5+5" sticker', 'offer'],
        ['Fitness coach Rohan swears by these between client sessions.', 'Coach-approved crunch', 'Trusted by 300+ trainers', 'Learn more', 'IMAGE', 58, 2, 'Fitness coach in gym holding pack, thumbs up', 'authority'],
        ['Mega Snack Sale: up to 50% off + free shaker.', 'Up to 50% off + free shaker', 'Sale ends Sunday', 'Shop now', 'CAROUSEL', 14, 6, 'Carousel of products with % badges and a shaker bottle', 'offer'],
        ['Only 100 combo boxes left at this price.', 'Only 100 left', 'Combo box', 'Shop now', 'IMAGE', 8, 3, 'Countdown graphic with combo box', 'fomo'],
        ['Your evening chai deserves a better partner than biscuits.', 'Chai\'s new best friend', 'Masala protein chips', 'Shop now', 'IMAGE', 72, 2, 'Cutting chai glass next to bowl of chips on a balcony', 'aspiration'],
      ]},
      blendco: { ig: '@blendco', ads: [
        ['First box, 20% off. Then you\'re hooked. Cold-pressed smoothie packs, ready in 60 seconds.', 'First box 20% off', 'Ready in 60 seconds', 'Get offer', 'IMAGE', 117, 5, 'Blender mid-pour, frozen fruit pouches, morning kitchen', 'offer'],
        ['"I finally eat breakfast on weekdays." Real reviews from 9,000+ subscribers.', '9,000+ subscribers', '4.8★ average', 'Learn more', 'IMAGE', 89, 3, 'Customer quote card over smoothie bowl photo', 'review'],
        ['No added sugar. No preservatives. Just frozen fruit, seeds and greens. Read our ingredient list — it is short.', 'The shortest ingredient list', 'No added sugar', 'Learn more', 'IMAGE', 66, 2, 'Ingredient list printed large on kraft paper', 'authority'],
        ['Skip the 8am chaos. Blend, sip, go.', 'Blend. Sip. Go.', 'Breakfast in 60 seconds', 'Shop now', 'IMAGE', 44, 4, 'Person running out the door holding a smoothie, keys in mouth', 'pain'],
        ['Subscribe and save 25%. Pause or cancel anytime.', 'Save 25% on subscription', 'Cancel anytime', 'Subscribe', 'IMAGE', 31, 4, 'Calendar graphic with weekly delivery boxes', 'offer'],
        ['Started in a hostel kitchen with one blender. Now 50,000 breakfasts later.', 'From a hostel kitchen', '50,000 breakfasts served', 'Learn more', 'IMAGE', 19, 1, 'Old photo of a messy hostel kitchen with a blender', 'story'],
        ['Mango season is here. Limited-run Alphonso pack drops Friday.', 'Alphonso drop: Friday', 'Limited run', 'Shop now', 'IMAGE', 4, 2, 'Golden mangoes and a yellow smoothie, "DROPS FRIDAY" sticker', 'fomo'],
      ]},
    },
  },
};

const HUES = { ugc: 'peach', routine: 'blush', review: 'gold', aspiration: 'violet', gifting: 'ember', meme: 'ink', pain: 'teal', offer: 'sun', story: 'clay', fomo: 'rose', demo: 'sky', education: 'mint', authority: 'slate', comparison: 'ink', beforeafter: 'blush' };

function packAds(packKey) {
  const p = PACKS[packKey];
  const out = [];
  for (const [name, c] of Object.entries(p.competitors)) {
    c.ads.forEach((a, i) => {
      const [body, headline, description, cta, fmt, days, vars, visual, kind] = a;
      out.push({
        id: 'seed-' + name + '-' + String(i + 1).padStart(2, '0'),
        competitor: name, page_name: name, page_id: null, ig: c.ig,
        body, headline, description, cta, display_format: fmt,
        start_date: D(days), days_running: days, variant_count: vars, collation_count: vars,
        visual_note: visual, image_url: null, hue: HUES[kind] || 'violet',
        platforms: i % 3 === 0 ? ['INSTAGRAM'] : ['FACEBOOK', 'INSTAGRAM'],
        link_url: 'https://' + name + '.example/shop',
        ad_library_url: null, source: 'seed',
      });
    });
  }
  return out;
}

export function seedPackFor(brand) {
  const hay = [brand && brand.niche, brand && brand.sells, brand && brand.category].join(' ');
  if (PACKS.snacks.match.test(hay) && !/skin|serum|beauty/i.test(hay)) return 'snacks';
  return 'skincare';
}

export function seedCompetitorNames(pack) {
  return Object.keys(PACKS[pack].competitors);
}

export function allSeedNames() {
  const o = {};
  for (const k of Object.keys(PACKS)) for (const n of Object.keys(PACKS[k].competitors)) o[n] = k;
  return o;
}

// Ads for a seed pack: DB overrides (real saved ads) win over fixtures.
export async function loadSeed(pack, names) {
  const { rows } = await db.query('SELECT competitor, ad FROM seed_ads ORDER BY id');
  if (rows.length) {
    const byComp = {};
    for (const r of rows) (byComp[r.competitor] = byComp[r.competitor] || []).push({ ...r.ad, competitor: r.competitor, source: 'seed' });
    const wanted = (names || []).filter(n => byComp[n]);
    const pick = wanted.length ? wanted : Object.keys(byComp).slice(0, 3);
    return { pack: 'custom', ads: pick.flatMap(n => byComp[n]), names: pick };
  }
  const ads = packAds(pack);
  return { pack, ads, names: seedCompetitorNames(pack) };
}