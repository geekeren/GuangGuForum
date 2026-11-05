import { beforeEach, expect, it, vi } from 'vitest';
import { cacheService } from '../CacheService';
import { IMAGE_COMPRESSION_KEY, isImageCompressionEnabled, setImageCompressionEnabled } from '../imageCompressionPreferences';

const storage = vi.hoisted(() => new Map<string, any>());
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => storage.get(key) ?? '',
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: Array.from(storage.keys()) }),
} }));
beforeEach(() => { vi.restoreAllMocks(); storage.clear(); });

it('defaults to on, permits disabling and survives normal cache cleanup and expiry', () => {
  expect(isImageCompressionEnabled()).toBe(true);
  expect(setImageCompressionEnabled(false)).toBe(true);
  expect(isImageCompressionEnabled()).toBe(false);
  cacheService.clearAll();
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
  cacheService.removeExpired();
  expect(isImageCompressionEnabled()).toBe(false);
  expect(setImageCompressionEnabled(true)).toBe(true);
  expect(isImageCompressionEnabled()).toBe(true);
});
it('reports a storage failure and does not change the preference', () => {
  vi.spyOn(cacheService, 'set').mockReturnValue(false);
  expect(setImageCompressionEnabled(false)).toBe(false);
  expect(isImageCompressionEnabled()).toBe(true);
});
it.each([null, 'invalid', 0, {}])('uses the safe default for invalid stored data', value => {
  cacheService.set(IMAGE_COMPRESSION_KEY, value, { category: 'system' as any });
  expect(isImageCompressionEnabled()).toBe(true);
});
