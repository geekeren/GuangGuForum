import type { RecentlyViewedTopic } from 'guanggu-forum-api';
import { cacheService, CacheCategory } from './CacheService';
import { getCachedUsername } from './currentUser';

export const MAX_RECENTLY_VIEWED_TOPICS = 200;
const key = (username: string) => `recent_viewed_topics_v1_${username ? 'user_' + encodeURIComponent(username) : 'guest'}`;
const listeners = new Set<() => void>();

function normalize(value: unknown): RecentlyViewedTopic[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.tid !== 'string' || !/^\d+$/.test(item.tid) || seen.has(item.tid)
      || typeof item.title !== 'string' || !item.title.trim()) return [];
    seen.add(item.tid);
    let avatarUrl = '';
    try {
      if (typeof item.avatarUrl === 'string' && item.avatarUrl) {
        const url = new URL(item.avatarUrl, 'https://www.guozaoke.com/');
        if (/^https?:$/.test(url.protocol)) avatarUrl = url.href;
      }
    } catch { /* Invalid avatar URLs use the default avatar. */ }
    return [{ tid: item.tid, title: item.title, link: `/t/${item.tid}`,
      avatarUrl,
      author: typeof item.author === 'string' ? item.author : undefined,
      ...(typeof item.displayName === 'string' && item.displayName.trim() ? { displayName: item.displayName.trim() } : {}),
      viewedAt: typeof item.viewedAt === 'number' && Number.isFinite(item.viewedAt) && item.viewedAt > 0 ? item.viewedAt : undefined }];
  }).slice(0, MAX_RECENTLY_VIEWED_TOPICS);
}

export function getLocalRecentlyViewedTopics(username = getCachedUsername()): RecentlyViewedTopic[] {
  return normalize(cacheService.get(key(username)));
}

function save(topics: RecentlyViewedTopic[], username: string): boolean {
  const saved = cacheService.set(key(username), topics.slice(0, MAX_RECENTLY_VIEWED_TOPICS), { category: CacheCategory.System });
  if (saved) listeners.forEach(listener => listener());
  return saved;
}

export function recordRecentlyViewedTopic(topic: RecentlyViewedTopic, username = getCachedUsername()): boolean {
  const entry = normalize([{ ...topic, viewedAt: Date.now() }])[0];
  if (!entry) return false;
  return save([entry, ...getLocalRecentlyViewedTopics(username).filter(item => item.tid !== entry.tid)], username);
}

export function mergeRecentlyViewedTopics(server: RecentlyViewedTopic[], username = getCachedUsername()): RecentlyViewedTopic[] {
  const local = getLocalRecentlyViewedTopics(username);
  const visited = local.filter(item => item.viewedAt).sort((a, b) => b.viewedAt! - a.viewedAt!);
  const merged = normalize([...visited, ...server, ...local.filter(item => !item.viewedAt)]);
  save(merged, username);
  return merged;
}

export function clearLocalRecentlyViewedTopics(username = getCachedUsername()): boolean {
  return save([], username);
}

export function subscribeRecentlyViewedTopics(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
