import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalRecentlyViewedTopics, mergeRecentlyViewedTopics, recordRecentlyViewedTopic } from '../recentlyViewedTopics';

const state = vi.hoisted(() => ({ account: 'synthetic-owner', records: new Map<string, unknown>() }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => state.account }));
vi.mock('../CacheService', () => ({
  CacheCategory: { System: 'system' },
  cacheService: {
    get: (key: string) => state.records.get(key),
    set: (key: string, value: unknown) => { state.records.set(key, value); return true; },
  },
}));
const topic = (tid = '123') => ({ tid, title: 'Synthetic topic', link: `/t/${tid}`, author: 'synthetic-account', avatarUrl: '/static/avatar/synthetic.png' });
beforeEach(() => { state.account = 'synthetic-owner'; state.records.clear(); });

describe('recent history presentation metadata', () => {
  it('retains the nickname without replacing the account, topic link or original input', () => {
    const input = { ...topic(), displayName: ' 合成 昵称 👋 ' };
    expect(recordRecentlyViewedTopic(input)).toBe(true);
    expect(getLocalRecentlyViewedTopics()[0]).toMatchObject({ displayName: '合成 昵称 👋', author: 'synthetic-account', tid: '123', link: '/t/123' });
    expect(input.displayName).toBe(' 合成 昵称 👋 ');
    expect([...state.records.keys()]).toEqual(['recent_viewed_topics_v1_user_synthetic-owner']);
  });
  it('preserves legacy records and ignores invalid or blank optional nicknames', () => {
    state.records.set('recent_viewed_topics_v1_user_synthetic-owner', [topic('1'), { ...topic('2'), displayName: {} }, { ...topic('3'), displayName: '  ' }]);
    const records = getLocalRecentlyViewedTopics();
    expect(records).toHaveLength(3);
    for (const record of records) { expect(record.author).toBe('synthetic-account'); expect(record).not.toHaveProperty('displayName'); }
  });
  it('does not merge identities by nickname and retains account-scoped records', () => {
    recordRecentlyViewedTopic({ ...topic('1'), displayName: '同名' });
    recordRecentlyViewedTopic({ ...topic('2'), author: 'other-synthetic-account', displayName: '同名' });
    expect(getLocalRecentlyViewedTopics().map(record => record.tid)).toEqual(['2', '1']);
    expect(getLocalRecentlyViewedTopics().map(record => record.author)).toEqual(['other-synthetic-account', 'synthetic-account']);
    state.account = 'other-owner'; expect(getLocalRecentlyViewedTopics()).toEqual([]);
    recordRecentlyViewedTopic({ ...topic('3'), displayName: '其他昵称' });
    state.account = 'synthetic-owner'; expect(getLocalRecentlyViewedTopics().map(record => record.tid)).toEqual(['2', '1']);
  });
  it('retains display metadata when merging synthetic server and local history', () => {
    recordRecentlyViewedTopic({ ...topic('1'), displayName: '本地昵称' });
    const server = [{ ...topic('2'), displayName: '远端昵称' }];
    expect(mergeRecentlyViewedTopics(server).map(record => record.displayName)).toEqual(['本地昵称', '远端昵称']);
    expect(server[0].displayName).toBe('远端昵称');
  });
});
