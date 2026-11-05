import { describe, expect, it } from 'vitest';
import { API_CACHE_VERSIONS, createApiCacheEntry, getApiCacheVersions, readApiCacheEntry } from '../../../packages/guanggu-forum-api/src/cacheVersions';

describe('nickname-first presentation cache versions', () => {
  it.each([
    ['getRecentTopics', 1, 2], ['getNodeTopics', 1, 2], ['getUserProfile', 2, 3],
    ['getUserFavorites', 1, 2], ['getNotifications', 1, 2], ['searchTopics', 1, 2],
  ] as const)('invalidates pre-displayName results for %s', (api, previous, current) => {
    expect(API_CACHE_VERSIONS[api]).toBe(current);
    const versions = { ...getApiCacheVersions(api), [api]: previous };
    expect(readApiCacheEntry(api, { apiVersions: versions, data: { username: 'fixture-account' } })).toBeNull();
    const value = { username: 'fixture-account', displayName: '合成昵称 👋' };
    expect(readApiCacheEntry(api, createApiCacheEntry(api, value))).toBe(value);
  });

  it('includes the updated shared list parser in dependent cache entries', () => {
    expect(getApiCacheVersions('getNodeTopics')).toEqual({ getNodeTopics: 2, getRecentTopics: 2 });
    expect(readApiCacheEntry('getHotTopics', {
      apiVersions: { getHotTopics: 1, getRecentTopics: 1 }, data: { synthetic: true },
    })).toBeNull();
  });

  it('does not invalidate unrelated form, message, or discovery contracts', () => {
    expect(API_CACHE_VERSIONS.getTopicDetail).toBe(5);
    expect(API_CACHE_VERSIONS.createNewComment).toBe(3);
    expect(API_CACHE_VERSIONS.sendPrivateMessage).toBe(2);
    expect(API_CACHE_VERSIONS.getMessageThread).toBe(1);
    expect(API_CACHE_VERSIONS.getDiscoveryData).toBe(1);
  });
});
