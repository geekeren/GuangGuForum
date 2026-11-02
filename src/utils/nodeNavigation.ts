import { getNodeNavigation, NodeGroup, createApiCacheEntry, readApiCacheEntry } from "guanggu-forum-api";
import { cacheService, CacheCategory } from "./CacheService";

const CACHE_KEY = "node_navigation";
export const NODE_NAVIGATION_REVALIDATE_INTERVAL = 24 * 60 * 60 * 1000;
let pendingRefresh: Promise<NodeGroup[]> | null = null;

function hasGroups(groups: unknown): groups is NodeGroup[] {
  return Array.isArray(groups) && groups.length > 0 && groups.every(group =>
    group && typeof group.category === "string" && Array.isArray(group.nodes) &&
    group.nodes.every(node => node && typeof node.name === "string" && typeof node.slug === "string"),
  ) && groups.some(group => group.nodes.length > 0);
}

export function getCachedNodeNavigation(): NodeGroup[] {
  const cached = cacheService.get<unknown>(CACHE_KEY);
  const groups = readApiCacheEntry<unknown>("getNodeNavigation", cached);
  if (hasGroups(groups)) return groups;
  if (cached !== null) cacheService.remove(CACHE_KEY);
  return [];
}

export function cacheNodeNavigation(groups: NodeGroup[]) {
  if (!hasGroups(groups)) return;
  const entry = createApiCacheEntry("getNodeNavigation", groups);
  if (entry) cacheService.set(CACHE_KEY, entry, { category: CacheCategory.Node });
}

function refreshNodeNavigation(): Promise<NodeGroup[]> {
  if (pendingRefresh) return pendingRefresh;
  // The navigation cache owns revalidation; do not receive stale HTML from the API cache.
  const pending = Promise.resolve().then(() => getNodeNavigation(undefined, { cache: false })).then(groups => {
    if (!hasGroups(groups)) throw new Error("板块列表加载失败，请重试");
    cacheNodeNavigation(groups);
    return groups;
  }).finally(() => {
    if (pendingRefresh === pending) pendingRefresh = null;
  });
  pendingRefresh = pending;
  return pending;
}

export interface NodeNavigationOptions {
  force?: boolean;
}

/** Consumers render getCachedNodeNavigation() first, then apply this periodic refresh. */
export function fetchAndCacheNodeNavigation(options?: NodeNavigationOptions): Promise<NodeGroup[]> {
  const cached = getCachedNodeNavigation();
  const createdAt = cacheService.getMeta(CACHE_KEY)?.createdAt;
  if (!options?.force && cached.length && createdAt !== undefined && Number.isFinite(createdAt) &&
    Date.now() >= createdAt && Date.now() - createdAt < NODE_NAVIGATION_REVALIDATE_INTERVAL) {
    return Promise.resolve(cached);
  }
  return refreshNodeNavigation().catch(error => {
    if (cached.length) return cached;
    throw error;
  });
}
