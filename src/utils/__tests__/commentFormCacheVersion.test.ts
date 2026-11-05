import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { API_CACHE_VERSIONS, createApiCacheEntry, readApiCacheEntry } from '../../../packages/guanggu-forum-api/src/cacheVersions';

describe('comment form parsing cache version', () => {
  it('exports the existing typed login failure without replacing client error semantics', () => {
    const barrel = readFileSync(resolve(process.cwd(), 'packages/guanggu-forum-api/src/index.ts'), 'utf8');
    expect(barrel).toMatch(/export\s*\{[^}]*\bLoginRequiredError\b[^}]*\}\s*from\s*["']\.\/client["']/);
  });
  it('invalidates token-only version 3 and layout-misclassified version 4 topic results', () => {
    expect(API_CACHE_VERSIONS.getTopicDetail).toBe(5);
    expect(readApiCacheEntry('getTopicDetail', {
      apiVersions: { getTopicDetail: 3 },
      data: { createCommentXSRF: 'synthetic-old-token' },
    })).toBeNull();
    expect(readApiCacheEntry('getTopicDetail', {
      apiVersions: { getTopicDetail: 4 },
      data: { createCommentXSRF: '', createCommentStatus: 'form-unavailable' },
    })).toBeNull();
    const detail = { createCommentXSRF: 'synthetic-current-token', createCommentStatus: 'ready' };
    expect(readApiCacheEntry('getTopicDetail', createApiCacheEntry('getTopicDetail', detail))).toBe(detail);
  });

  it('invalidates the old comment submission version after restoring the tid form field', () => {
    expect(API_CACHE_VERSIONS.createNewComment).toBe(3);
    expect(readApiCacheEntry('createNewComment', {
      apiVersions: { createNewComment: 2 },
      data: { moderated: false },
    })).toBeNull();
    const result = { moderated: false };
    expect(readApiCacheEntry('createNewComment', createApiCacheEntry('createNewComment', result))).toBe(result);
  });

  it('does not invalidate unrelated reading APIs', () => {
    for (const api of ['getRecentTopics', 'getNodeTopics', 'getUserProfile'] as const) {
      const value = { synthetic: api };
      expect(readApiCacheEntry(api, createApiCacheEntry(api, value))).toBe(value);
    }
    // Other independently versioned reading APIs may evolve without bumping the comment form contract.
    expect(API_CACHE_VERSIONS.getMessageSummary).toBe(1);
    expect(API_CACHE_VERSIONS.getRecentlyViewedTopics).toBe(1);
  });
});
