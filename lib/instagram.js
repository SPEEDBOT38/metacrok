// lib/instagram.js — the founder's own Instagram (and any rival given as an @handle), pulled with
// Apify's official apify/instagram-post-scraper. Contract checked 2026-10-22: input { username: [],
// resultsLimit, skipPinnedPosts, dataDetailLevel }, output rows with shortCode, ownerUsername, caption,
// displayUrl, url, type, likesCount, commentsCount, timestamp; a failed handle comes back as an {error} row.
import { api } from './hatchable.js';
import { str } from './util.js';

const ACTOR = 'apify~instagram-post-scraper';
export const IG_POSTS_PER_HANDLE = 12;
export const IG_GIVE_UP_MS = 150000;

// "@glow.co", "glow.co", "instagram.com/glow.co/" -> "glow.co"; anything else -> null
export function igHandle(s) {
  const t = String(s || '').trim();
  const url = t.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i);
  if (url) return url[1].toLowerCase();
  const at = t.match(/^@([A-Za-z0-9._]{1,30})$/);
  return at ? at[1].toLowerCase() : null;
}

// The founder's handle first, then rivals that were given as handles.
export function igHandles(run) {
  const brand = run.input && run.input.brand && run.input.brand.ig;
  const rivals = ((run.input && run.input.competitors) || []).map(c => c.ig).filter(Boolean);
  return { brand: brand || null, all: [...new Set([brand, ...rivals].filter(Boolean))] };
}

export async function startIgPull(handles) {
  const r = await api.apify.post('/acts/' + ACTOR + '/runs', {
    query: { timeout: '140' },
    body: { username: handles, resultsLimit: IG_POSTS_PER_HANDLE, skipPinnedPosts: true, dataDetailLevel: 'basicData' },
  });
  if (r.status >= 300 || !r.body || !r.body.data) throw new Error('Instagram pull failed to start (' + r.status + ')');
  return { runId: r.body.data.id, datasetId: r.body.data.defaultDatasetId, startedAt: Date.now() };
}

export function normalizePost(it, brandHandle) {
  if (!it || it.error || !(it.shortCode || it.id)) return null;
  const handle = String(it.ownerUsername || '').toLowerCase();
  return {
    id: String(it.shortCode || it.id),
    handle,
    is_brand: !!brandHandle && handle === brandHandle,
    caption: str(it.caption, 1500),
    image_url: it.displayUrl || null,
    url: it.url || null,
    post_type: str(it.type, 20) || null,
    likes: Number.isFinite(Number(it.likesCount)) && Number(it.likesCount) >= 0 ? Number(it.likesCount) : null,
    comments: Number.isFinite(Number(it.commentsCount)) ? Number(it.commentsCount) : null,
    posted_at: it.timestamp || null,
  };
}
