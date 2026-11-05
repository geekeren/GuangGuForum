import { cacheService, CacheCategory } from "./CacheService";

const STORAGE_KEY = "commentSortAsc";
const listeners = new Set<(ascending: boolean) => void>();

export function readCommentSortAscending(): boolean {
  return cacheService.get<unknown>(STORAGE_KEY) === true;
}

export function writeCommentSortAscending(ascending: boolean): boolean {
  if (!cacheService.set(STORAGE_KEY, ascending, { category: CacheCategory.System })) return false;
  for (const listener of listeners) listener(ascending);
  return true;
}

export function subscribeCommentSort(listener: (ascending: boolean) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
