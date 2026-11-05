import { describe, expect, it } from 'vitest';
import { API_CACHE_VERSIONS, createApiCacheEntry, readApiCacheEntry } from '../../../packages/guanggu-forum-api/src/cacheVersions';

describe('private message error contract cache version', () => {
  it('invalidates the send version that lost content rejection errors', () => {
    expect(API_CACHE_VERSIONS.sendPrivateMessage).toBe(2);
    expect(readApiCacheEntry('sendPrivateMessage', {
      apiVersions: { sendPrivateMessage: 1 }, data: { conversation_id: 11 },
    })).toBeNull();
    const value = { conversation_id: 11 };
    expect(readApiCacheEntry('sendPrivateMessage', createApiCacheEntry('sendPrivateMessage', value))).toBe(value);
  });

  it('keeps unrelated message and comment contracts unchanged', () => {
    expect(API_CACHE_VERSIONS.getMessageSummary).toBe(1);
    expect(API_CACHE_VERSIONS.getMessageCompose).toBe(2);
    expect(API_CACHE_VERSIONS.getTopicDetail).toBe(5);
    expect(API_CACHE_VERSIONS.createNewComment).toBe(3);
  });
});
