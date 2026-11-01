import { cacheService, CacheCategory } from "./CacheService";

const HISTORY_KEY = "search_history";
const HISTORY_LIMIT = 8;

export function getSearchHistory(): string[] {
  const saved = cacheService.get<unknown>(HISTORY_KEY);
  if (!Array.isArray(saved)) return [];
  return [...new Set(saved.filter((value): value is string => typeof value === "string")
    .map(value => value.trim().slice(0, 120)).filter(Boolean))].slice(0, HISTORY_LIMIT);
}

export function rememberSearch(query: string, history: string[]): string[] {
  const keyword = query.trim().slice(0, 120);
  if (!keyword) return history;
  const next = [keyword, ...history.filter(item => item !== keyword)].slice(0, HISTORY_LIMIT);
  cacheService.set(HISTORY_KEY, next, { category: CacheCategory.System, ttl: 365 * 24 * 60 * 60 * 1000 });
  return next;
}

export function clearSearchHistory() {
  cacheService.set(HISTORY_KEY, [], { category: CacheCategory.System });
}

export function splitSearchHighlight(text: string, query: string) {
  const keyword = query.trim();
  if (!keyword) return [{ text, highlighted: false }];
  const lower = text.toLocaleLowerCase(), needle = keyword.toLocaleLowerCase();
  const parts: { text: string; highlighted: boolean }[] = [];
  let cursor = 0, index = lower.indexOf(needle);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), highlighted: false });
    parts.push({ text: text.slice(index, index + keyword.length), highlighted: true });
    cursor = index + keyword.length;
    index = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return parts.length ? parts : [{ text, highlighted: false }];
}
