import { getNodeNavigation, NodeGroup } from "guanggu-forum-api";
import { cacheService, CacheCategory } from "./CacheService";

const CACHE_KEY = "node_navigation";

export function getCachedNodeNavigation(): NodeGroup[] {
  return cacheService.get<NodeGroup[]>(CACHE_KEY) || [];
}

export function cacheNodeNavigation(groups: NodeGroup[]) {
  cacheService.set(CACHE_KEY, groups, { category: CacheCategory.Node });
}

export function fetchAndCacheNodeNavigation(): Promise<NodeGroup[]> {
  return getNodeNavigation().then((groups) => {
    cacheNodeNavigation(groups);
    return groups;
  });
}
