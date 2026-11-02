import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService, CacheCategory } from "../CacheService";
import { EMOJI_USAGE_KEY, getCommonEmojiUsage, recordCommentEmojiUsage } from "../emojiUsage";
import { STICKERS } from "../stickers";

const storage = vi.hoisted(() => new Map<string, any>());
vi.mock("@tarojs/taro", () => ({ default: {
  getStorageSync: (key: string) => storage.get(key) ?? "",
  setStorageSync: (key: string, value: any) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  getStorageInfoSync: () => ({ keys: Array.from(storage.keys()) }),
} }));
beforeEach(() => { storage.clear(); vi.restoreAllMocks(); });

describe('durable comment emoji usage', () => {
  it('starts empty and records emoji from both typing and panel insertion', () => {
    expect(getCommonEmojiUsage()).toEqual({ emojis: [], stickers: [] });
    expect(recordCommentEmojiUsage('你好👍👍❤', [STICKERS[0], STICKERS[1]])).toBe(true);
    const saved = cacheService.get<any>(EMOJI_USAGE_KEY);
    expect(saved.emojis).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: '👍', count: 1 }),
      expect.objectContaining({ id: '❤️', count: 1 }),
    ]));
    expect(getCommonEmojiUsage().stickers).toEqual(expect.arrayContaining([STICKERS[0], STICKERS[1]]));
    expect(getCommonEmojiUsage().stickers).toHaveLength(2);
  });
  it('ranks by frequency and then recency', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(100);
    recordCommentEmojiUsage('👍😂', [STICKERS[0]]);
    clock.mockReturnValue(200);
    recordCommentEmojiUsage('😂', [STICKERS[1]]);
    expect(getCommonEmojiUsage()).toEqual({ emojis: ['😂', '👍'], stickers: [STICKERS[1], STICKERS[0]] });
    clock.mockReturnValue(300);
    recordCommentEmojiUsage('👍', [STICKERS[0]]);
    expect(getCommonEmojiUsage()).toEqual({ emojis: ['👍', '😂'], stickers: [STICKERS[0], STICKERS[1]] });
  });
  it('uses stable filenames and resolves the current catalog URL', () => {
    recordCommentEmojiUsage('', [{ ...STICKERS[0], url: 'https://old.invalid/image.png' }]);
    expect(getCommonEmojiUsage().stickers).toEqual([STICKERS[0]]);
    expect(cacheService.get<any>(EMOJI_USAGE_KEY).stickers[0]).not.toHaveProperty('url');
  });
  it.each([null, 'broken', [], { emojis: [{ id: '👍', count: -1, lastUsed: 0 }], stickers: 'bad' }])('ignores invalid storage %j', value => {
    cacheService.set(EMOJI_USAGE_KEY, value, { category: CacheCategory.System });
    expect(getCommonEmojiUsage()).toEqual({ emojis: [], stickers: [] });
    recordCommentEmojiUsage('😂', []);
    expect(getCommonEmojiUsage().emojis).toEqual(['😂']);
  });
  it('filters unknown and duplicate records and bounds displayed sections', () => {
    cacheService.set(EMOJI_USAGE_KEY, { emojis: [
      { id: '👍', count: 2, lastUsed: 100 }, { id: '👍', count: 5, lastUsed: 200 },
      { id: 'not-emoji', count: 2, lastUsed: 100 },
    ], stickers: [] }, { category: CacheCategory.System });
    expect(getCommonEmojiUsage().emojis).toEqual(['👍']);
    STICKERS.forEach(sticker => recordCommentEmojiUsage('', [sticker]));
    recordCommentEmojiUsage('😊😂😆😋😓🍉👍👏✌️🙏💪👌😄😅😢😭😍😎', []);
    expect(getCommonEmojiUsage().emojis).toHaveLength(16);
    expect(getCommonEmojiUsage().stickers).toHaveLength(10);
  });
  it('survives ordinary cache clearing, expiry and upgrade cleanup', () => {
    recordCommentEmojiUsage('😂', [STICKERS[0]]);
    cacheService.clearAll();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 365 * 24 * 60 * 60 * 1000);
    cacheService.removeExpired();
    cacheService.clearForUpgradeOnce('emoji-usage-test');
    expect(getCommonEmojiUsage()).toEqual({ emojis: ['😂'], stickers: [STICKERS[0]] });
  });
});
