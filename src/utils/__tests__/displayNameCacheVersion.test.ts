import { describe, expect, it } from 'vitest';
import { API_CACHE_VERSIONS, createApiCacheEntry, getApiCacheVersions, readApiCacheEntry } from '../../../packages/guanggu-forum-api/src/cacheVersions';

describe('nickname-first presentation cache versions', () => {
  it.each([
    ['getRecentTopics', 2, 3], ['getNodeTopics', 2, 3], ['getUserProfile', 3, 4],
    ['getUserFavorites', 2, 3], ['getNotifications', 2, 3], ['searchTopics', 2, 3],
    ['getHotTopics', 1, 2], ['getInterestTopics', 1, 2],
  ] as const)('invalidates pre-displayName results for %s', (api, previous, current) => {
    expect(API_CACHE_VERSIONS[api]).toBe(current);
    const versions = { ...getApiCacheVersions(api), [api]: previous };
    expect(readApiCacheEntry(api, { apiVersions: versions, data: { username: 'fixture-account' } })).toBeNull();
    const value = { username: 'fixture-account', displayName: '合成昵称 👋' };
    expect(readApiCacheEntry(api, createApiCacheEntry(api, value))).toBe(value);
  });

  it('includes the updated shared list parser in dependent cache entries', () => {
    expect(getApiCacheVersions('getNodeTopics')).toEqual({ getNodeTopics: 3, getRecentTopics: 3 });
    expect(readApiCacheEntry('getHotTopics', {
      apiVersions: { getHotTopics: 1, getRecentTopics: 1 }, data: { synthetic: true },
    })).toBeNull();
  });

  it('invalidates composite discovery data when either nickname parser changes', () => {
    const versions = getApiCacheVersions('getDiscoveryData')!;
    expect(versions).toEqual({ getDiscoveryData: 1, getHotTopics: 2, getRecentTopics: 3, getInterestTopics: 2 });
    expect(readApiCacheEntry('getDiscoveryData', { apiVersions: { getDiscoveryData: 1 }, data: {} })).toBeNull();
    for (const api of ['getHotTopics', 'getRecentTopics', 'getInterestTopics'] as const) {
      expect(readApiCacheEntry('getDiscoveryData', { apiVersions: { ...versions, [api]: versions[api] - 1 }, data: {} })).toBeNull();
    }
    const value = { hotTopics: [{ displayName: '合成昵称' }], interestTopics: [{ displayName: '合成兴趣作者' }] };
    expect(readApiCacheEntry('getDiscoveryData', createApiCacheEntry('getDiscoveryData', value))).toBe(value);
  });

  it('does not bump unrelated form, message, or composite discovery versions', () => {
    expect(API_CACHE_VERSIONS.getTopicDetail).toBe(5);
    expect(API_CACHE_VERSIONS.createNewComment).toBe(3);
    expect(API_CACHE_VERSIONS.sendPrivateMessage).toBe(2);
    expect(API_CACHE_VERSIONS.getMessageThread).toBe(1);
    expect(API_CACHE_VERSIONS.getDiscoveryData).toBe(1);
  });
});
