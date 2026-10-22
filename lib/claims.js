// lib/claims.js — code-level "no invented claims" guardrail (MVP-SPEC 9.6).
// Models ignore "don't invent" in the prompt, so every variant field is scanned and any
// claim the founder or the brand site didn't supply is swapped for a bracket placeholder.
// ponytail: regex scan + placeholder swap, no second model call. Add a model rewrite only
// if placeholders read badly in practice.

const FIELDS = ['primary_text', 'headline', 'description', 'overlay_text', 'creative_direction'];

// Text a claim may legitimately come from: the founder's notes, plus the brand profile
// only when it was read from the real site (a web-search guess is not evidence).
export function claimSource(run) {
  const b = run.brand || {};
  const from = [run.input && run.input.notes];
  if (b.read_from === 'website') from.push(b.sells, b.price_point, ...(b.offers || []), ...(b.proof_points || []));
  return from.filter(Boolean).join(' \n ').toLowerCase();
}

const digits = s => (String(s).match(/\d[\d,.]*/g) || []).map(n => n.replace(/[,.]/g, ''));
const supported = (source, phrase) => source.includes(phrase.toLowerCase());

// [name, regex, placeholder, how to judge support]: 'text' = phrase appears in source,
// 'numbers' = every number in the phrase appears in source.
const RULES = [
  ['rating', /\b\d(?:\.\d)?\s*(?:★|stars?\b)(?:\s*(?:rated|rating|from|out of)[^.!?\n]{0,30})?/gi, '[4.8★ from N reviews]', 'numbers'],
  ['review count', /\b\d[\d,]*\+?\s*(?:happy\s+)?(?:reviews?|ratings?|customers|users|buyers|orders)\b/gi, '[N reviews]', 'numbers'],
  ['percentage', /\b\d+(?:\.\d+)?\s*%/g, '[N]%', 'numbers'],
  ['price', /(?:₹|rs\.?\s?|inr\s?)\s?\d[\d,]*/gi, '[price]', 'numbers'],
  ['clinical', /\b(?:clinically|dermatolog\w*|scientifically|lab)[\s-]+(?:proven|tested|approved|recommended|backed|certified|verified)\b/gi, '[dermatologist-tested?]', 'text'],
  ['expert claim', /\b(?:experts?|doctors?|dermatolog\w*)\s+(?:agree|recommend\w*|approved?|backed?|backing|trusted)\b|\b(?:backed|approved|recommended|trusted)\s+by\s+(?:\w+\s+){0,2}(?:experts?|doctors?|dermatologists?)\b|\bdermatolog\w*\s+backing\b/gi, '[expert claim]', 'text'],
  ['certification',/\b(?:certified|fda[\s-]approved|iso[\s-]?\d*|award[\s-]winning|clinically proven)\b/gi, '[certification]', 'text'],
  ['superlative', /(?:#\s?1\b|\bnumber\s+one\b|\bbest[\s-]?sell\w*|\bguaranteed\b|\b100%\s+(?:safe|effective|natural|pure)\b)/gi, '[claim]', 'text'],
  // offers nobody announced: free shipping / samples / gifts / returns, BOGO, "ships free"
  ['offer', /\b(?:free|complimentary)\s+(?:mini\s+|travel[\s-]size\s+)?(?:shipping|delivery|returns?|samples?|gifts?|trials?|cod)\b|\b(?:ships?|shipping|delivered?)\s+free\b|\bbogo\b|\bbuy\s+(?:one|\d+)\s+get\s+(?:one|\d+)\b|\bcash\s+on\s+delivery\b|\beasy\s+returns?\b/gi, '[offer]', 'text'],
];

// First-person voice nobody supplied: the pronoun "I" (case-sensitive, so "I" the letter in
// "vitamin I" aside, it is always a person) plus the usual founder/customer-story phrases.
// A whole sentence goes: half a story reads worse than a placeholder.
const STORY = /(?<![\w'’-])I(?:['’](?:ve|m|d|ll))?(?![\w'’-])|\b[Mm]y\s+own\b|\b[Oo]ur\s+founder\b|\b[Aa]fter\s+struggling\b|\bpersonally\s+(?:curate|vet|test|select|hand)\w*/;

// Brand names: competitors are never allowed; a capitalised list after a cue word
// ("brands like A, B and C") is a stocklist nobody supplied.
// ponytail: no brand dictionary. Add one only if lists without a cue word keep slipping through.
const NAME = String.raw`[A-Z][\w+&'’-]*(?:\s+(?:of|de|the)\s+[A-Z][\w+&'’-]*|\s+[A-Z][\w+&'’-]*)*`;
const BRAND_LIST = new RegExp(String.raw`(\b(?:brands?|labels?|like|such as|including|featuring|stocking|from|than|vs\.?|versus)\b[^.!?\n]{0,40}?[\s:])(${NAME}(?:(?:,\s*(?:and\s+)?|\s+and\s+)${NAME}){2,})`, 'g');
const PLACES = /^(?:india|indian|korea|korean|japan|japanese|mumbai|delhi|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|jaipur|ahmedabad|goa|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|instagram|facebook|meta|whatsapp|amazon|flipkart)$/i;

// What a claim may be checked against, and which names may never appear.
export function claimContext(run) {
  const b = run.brand || {}, inp = run.input || {};
  const own = [b.name, inp.brand && inp.brand.name].filter(Boolean).join(' ').toLowerCase();
  const banned = [...(inp.competitors || []), ...(Array.isArray(run.competitors) ? run.competitors : [])]
    .map(c => c && c.name).filter(n => n && n.length >= 4);
  return { source: claimSource(run) + ' \n ' + own, banned: [...new Set(banned)] };
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Competitor wording: any run of GRAM words that also appears in a competitor ad's copy.
// Copying a rival's promise is the "Same-Claim Trap" the founders in the validation report fear.
const GRAM = 6;
const words = s => String(s || '').toLowerCase().replace(/\[[^\]]*\]/g, ' ').match(/[\p{L}\p{N}₹%★]+/gu) || [];
export function phraseSet(texts) {
  const set = new Set();
  for (const t of texts) { const w = words(t); for (let i = 0; i + GRAM <= w.length; i++) set.add(w.slice(i, i + GRAM).join(' ')); }
  return set;
}
const copies = (s, grams) => { const w = words(s); for (let i = 0; i + GRAM <= w.length; i++) if (grams.has(w.slice(i, i + GRAM).join(' '))) return true; return false; };

function scanText(text, ctx, flags) {
  if (!text) return text;
  const { source, banned, grams } = ctx;
  // sentence-level: invented story, or a line lifted from a competitor ad
  let out = text.split(/(?<=[.!?…])\s+/).map(s => {
    if (STORY.test(s) && !supported(source, s.slice(0, 20))) { flags.push('founder story'); return '[founder story]'; }
    if (grams.size && copies(s, grams) && !supported(source, s.slice(0, 20))) { flags.push('competitor wording'); return '[your own line]'; }
    return s;
  }).join(' ');
  // placeholders already in the text are exempt
  const parts = out.split(/(\[[^\]]*\])/);
  out = parts.map(p => {
    if (p.startsWith('[')) return p;
    for (const name of banned) {
      p = p.replace(new RegExp('\\b' + esc(name) + '\\w*', 'gi'), () => { flags.push('competitor name'); return '[competitor]'; });
    }
    p = p.replace(BRAND_LIST, (all, cue, list) => {
      const names = list.split(/,\s*(?:and\s+)?|\s+and\s+/);
      const unknown = names.filter(n => !supported(source, n) && !PLACES.test(n));
      if (unknown.length < 2) return all;
      flags.push('brand names');
      return cue + '[brand names]';
    });
    for (const [name, re, ph, how] of RULES) {
      p = p.replace(re, m => {
        const ok = how === 'text' ? supported(source, m)
          : digits(m).length > 0 && digits(m).every(d => digits(source).includes(d));
        if (ok) return m;
        flags.push(name);
        return ph;
      });
    }
    return p;
  }).join('');
  return out.replace(/(\[[^\]]+\])(?:\s*\1)+/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// Returns a copy of the variant with unsupported claims swapped out, plus what was caught.
// ctx is claimContext(run), or just the source text.
export function guardVariant(v, ctx = '') {
  const c = typeof ctx === 'string' ? { source: ctx.toLowerCase(), banned: [], grams: new Set() } : { banned: [], grams: new Set(), ...ctx };
  const flags = [];
  const out = { ...v };
  for (const f of FIELDS) out[f] = scanText(v[f], c, flags);
  return { variant: out, flagged: [...new Set(flags)] };
}
