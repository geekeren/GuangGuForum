import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheService, CacheCategory } from '../CacheService';
import { clearImgUrlToken, getImgUrlToken, IMAGE_HOST_TOKEN_KEY, saveImgUrlToken } from '../imageHostSettings';

const runtime = vi.hoisted(() => ({ storage: new Map<string, any>(), username: 'account-a' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => runtime.username }));
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => runtime.storage.get(key) ?? '',
  setStorageSync: (key: string, value: any) => runtime.storage.set(key, value),
  removeStorageSync: (key: string) => runtime.storage.delete(key),
  clearStorageSync: () => runtime.storage.clear(),
  getStorageInfoSync: () => ({ keys: Array.from(runtime.storage.keys()) }),
} }));
beforeEach(() => { vi.restoreAllMocks(); runtime.storage.clear(); runtime.username = 'account-a'; });

describe('local account-scoped ImgURL token settings', () => {
  it('starts empty and saves a trimmed token', () => {
    expect(getImgUrlToken()).toBe('');
    expect(saveImgUrlToken('  sample-token-a  ')).toBe(true);
    expect(getImgUrlToken()).toBe('sample-token-a');
  });
  it('isolates accounts and replaces or deletes only the current token', () => {
    saveImgUrlToken('sample-token-a');
    runtime.username = 'account-b';
    expect(getImgUrlToken()).toBe('');
    saveImgUrlToken('sample-token-b');
    runtime.username = 'account-a';
    saveImgUrlToken('replacement-token');
    expect(getImgUrlToken()).toBe('replacement-token');
    expect(clearImgUrlToken()).toBe(true);
    expect(getImgUrlToken()).toBe('');
    expect(getImgUrlToken('account-b')).toBe('sample-token-b');
  });
  it('does not save or expose a token without a logged-in account', () => {
    saveImgUrlToken('sample-token-a');
    runtime.username = '';
    expect(getImgUrlToken()).toBe('');
    expect(saveImgUrlToken('sample-token-guest')).toBe(false);
    expect(clearImgUrlToken()).toBe(false);
  });
  it.each(['', '  ', 'bad token', 'bad\ntoken', 'x'.repeat(4097)])('rejects invalid input', token => {
    expect(saveImgUrlToken(token)).toBe(false);
    expect(getImgUrlToken()).toBe('');
  });
  it.each([null, 'bad', {}, [null, {}, { username: 'account-a', token: 1 }, { username: 'account-a', token: 'bad token' }]])('ignores malformed storage', saved => {
    cacheService.set(IMAGE_HOST_TOKEN_KEY, saved, { category: CacheCategory.System });
    expect(getImgUrlToken()).toBe('');
    expect(saveImgUrlToken('sample-token-a')).toBe(true);
    expect(getImgUrlToken()).toBe('sample-token-a');
  });
  it('survives ordinary cache clearing, expiry and upgrade cleanup', () => {
    saveImgUrlToken('sample-token-a');
    cacheService.clearAll();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
    cacheService.removeExpired();
    cacheService.clearForUpgradeOnce('image-host-settings-test');
    expect(getImgUrlToken()).toBe('sample-token-a');
    cacheService.clearAll(false);
    expect(getImgUrlToken()).toBe('');
  });
  it('reports storage failures without replacing a saved token', () => {
    saveImgUrlToken('sample-token-a');
    vi.spyOn(cacheService, 'set').mockReturnValue(false);
    expect(saveImgUrlToken('replacement')).toBe(false);
    expect(clearImgUrlToken()).toBe(false);
    expect(getImgUrlToken()).toBe('sample-token-a');
  });
});
