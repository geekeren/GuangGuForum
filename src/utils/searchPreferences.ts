import type { SearchParams } from "guanggu-forum-api";
import { cacheService, CacheCategory } from "./CacheService";

export type SearchPreferences = Required<Pick<SearchParams, "scope" | "sort">>;
const STORAGE_KEY = "search_preferences";

export function getSearchPreferences(): SearchPreferences {
  const saved = cacheService.get<Partial<SearchPreferences>>(STORAGE_KEY);
  return {
    scope: saved?.scope === "title" || saved?.scope === "topic" || saved?.scope === "reply" ? saved.scope : "all",
    sort: saved?.sort === "newest" ? "newest" : "relevance",
  };
}

export function saveSearchPreferences(filters: Pick<SearchParams, "scope" | "sort">): boolean {
  return cacheService.set(STORAGE_KEY, { scope: filters.scope, sort: filters.sort }, { category: CacheCategory.System });
}
