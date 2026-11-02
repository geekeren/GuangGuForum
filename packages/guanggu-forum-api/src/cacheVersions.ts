/** Bump an API's version whenever its parsing, processing or result schema changes. */
export const API_CACHE_VERSIONS = {
  getRecentTopics: 1,
  getTopicDetail: 2,
  getNodeTopics: 1,
  getHotNodes: 1,
  getNodeNavigation: 1,
  getUserProfile: 1,
  getUserFavorites: 1,
  getRecentlyViewedTopics: 1,
  clearRecentlyViewedTopics: 1,
  fetchLinkSummary: 1,
  getNotifications: 1,
  getHotTopics: 1,
  getHotTopicMetadata: 1,
  getHotTopicCategory: 1,
  getDiscoveryData: 1,
  resolveSearchNode: 1,
  getInterestTopics: 1,
  getSearchNodes: 1,
  searchTopics: 1,
  resolveSearchResult: 1,
  login: 1,
  logout: 1,
  getLoginXsrfCode: 1,
  createNewComment: 2,
  createTopic: 1,
  commentUpvote: 1,
  getImageHostSettings: 1,
  bindImageHostToken: 1,
  unbindImageHostToken: 1,
  uploadImage: 1,
};

export type CacheApi = keyof typeof API_CACHE_VERSIONS;
type CacheOwner = CacheApi | readonly CacheApi[];

// These APIs share processing code; a change to that parser invalidates its consumers too.
const DEPENDENCIES: Partial<Record<CacheApi, readonly CacheApi[]>> = {
  getNodeTopics: ['getRecentTopics'],
  getHotTopics: ['getRecentTopics'],
};

export interface ApiCacheEntry<T> {
  apiVersions: Record<string, number>;
  data: T;
}

export function getApiCacheVersions(owner: CacheOwner): Record<string, number> | null {
  const versions: Record<string, number> = {};
  const visit = (api: CacheApi): boolean => {
    if (Object.prototype.hasOwnProperty.call(versions, api)) return true;
    const version = Object.prototype.hasOwnProperty.call(API_CACHE_VERSIONS, api) ? API_CACHE_VERSIONS[api] : undefined;
    if (!Number.isSafeInteger(version) || version! <= 0) return false;
    versions[api] = version!;
    return (DEPENDENCIES[api] || []).every(visit);
  };
  const apis = typeof owner === 'string' ? [owner] : owner;
  return Array.isArray(apis) && apis.length > 0 && apis.every(visit) ? versions : null;
}

export function createApiCacheEntry<T>(owner: CacheOwner, data: T): ApiCacheEntry<T> | null {
  const apiVersions = getApiCacheVersions(owner);
  return apiVersions ? { apiVersions, data } : null;
}

/** Missing/unknown versions and unversioned legacy values are always cache misses. */
export function readApiCacheEntry<T>(owner: CacheOwner, value: unknown): T | null {
  const expected = getApiCacheVersions(owner);
  if (!expected || !value || typeof value !== 'object') return null;
  const entry = value as Partial<ApiCacheEntry<T>>;
  const actual = entry.apiVersions;
  if (!actual || typeof actual !== 'object' || Array.isArray(actual)
    || Object.keys(actual).length !== Object.keys(expected).length
    || !Object.entries(expected).every(([api, version]) => Object.prototype.hasOwnProperty.call(actual, api) && actual[api] === version)
    || !Object.prototype.hasOwnProperty.call(entry, 'data')) return null;
  return entry.data ?? null;
}
