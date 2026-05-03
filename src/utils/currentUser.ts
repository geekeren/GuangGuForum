import { cacheService } from "./CacheService";

export function getCachedUsername(): string {
  return cacheService.get<string>("current_username") || "";
}
