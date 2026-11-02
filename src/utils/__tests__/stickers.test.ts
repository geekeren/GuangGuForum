import { expect, it } from 'vitest';
import { buildStickerComment, isCustomStickerUrl, STICKERS } from '../stickers';

it('puts the 18 forum stickers before category stickers', () => {
  expect(STICKERS).toHaveLength(30);
  expect(STICKERS.slice(0, 18).every(sticker => sticker.filename.startsWith('forum_'))).toBe(true);
  expect(STICKERS.slice(18).every(sticker => sticker.filename.startsWith('category_'))).toBe(true);
});
it('recognizes only catalog images, including CDN variants and query parameters', () => {
  const url = new URL(STICKERS[0].url);
  expect(isCustomStickerUrl(url.href)).toBe(true);
  expect(isCustomStickerUrl(`//i0-sgp.hdslb.com${url.pathname}?quality=80#image`)).toBe(true);
  expect(isCustomStickerUrl(`https://example.com${url.pathname}`)).toBe(false);
  expect(isCustomStickerUrl(`https://hdslb.com.evil.test${url.pathname}`)).toBe(false);
  expect(isCustomStickerUrl('https://i0.hdslb.com/bfs/new_dyn/other.png')).toBe(false);
  expect(isCustomStickerUrl('not a URL')).toBe(false);
});
it('includes all selected stickers up to five in the submitted comment', () => {
  expect(buildStickerComment('正文', STICKERS.slice(0, 7))).toBe(
    '正文\n\n' + STICKERS.slice(0, 5).map(sticker => `![${sticker.name}](${sticker.url})`).join('\n\n'),
  );
  expect(buildStickerComment('', [STICKERS[0], STICKERS[0]])).toBe(
    `![${STICKERS[0].name}](${STICKERS[0].url})\n\n![${STICKERS[0].name}](${STICKERS[0].url})`,
  );
});
it('preserves plain text and includes selected image URLs in comments', () => {
  expect(buildStickerComment('正文', [])).toBe('正文');
  const sticker = STICKERS[0];
  expect(buildStickerComment('', [sticker])).toBe(`![${sticker.name}](${sticker.url})`);
  expect(buildStickerComment('@Alice 正文', [sticker])).toBe(`@Alice 正文\n\n![${sticker.name}](${sticker.url})`);
});
