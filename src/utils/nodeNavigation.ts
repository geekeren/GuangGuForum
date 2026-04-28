import Taro from "@tarojs/taro";
import { getNodeNavigation, NodeGroup } from "guanggu-forum-api";

const CACHE_KEY = "node_navigation";

export function getCachedNodeNavigation(): NodeGroup[] {
  try {
    const stored = Taro.getStorageSync(CACHE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

export function cacheNodeNavigation(groups: NodeGroup[]) {
  try {
    Taro.setStorageSync(CACHE_KEY, JSON.stringify(groups));
  } catch {}
}

export function fetchAndCacheNodeNavigation(): Promise<NodeGroup[]> {
  return getNodeNavigation().then((groups) => {
    cacheNodeNavigation(groups);
    return groups;
  });
}
