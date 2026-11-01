import { getRecentTopics } from "guanggu-forum-api";
import { cacheService } from "./CacheService";

export function getCachedUsername(): string {
  return cacheService.get<string>("current_username") || "";
}

let pending: Promise<string> | undefined;

export function resolveCurrentUsername(): Promise<string> {
  const username = getCachedUsername();
  if (username) return Promise.resolve(username);
  const cookies = cacheService.get<Record<string, unknown>>("cookies");
  if (!cookies || !Object.keys(cookies).length) return Promise.resolve("");
  if (!pending) {
    pending = getRecentTopics({ type: "default", page: 1 }, { cache: false })
      .then(() => getCachedUsername())
      .finally(() => { pending = undefined; });
  }
  return pending;
}
