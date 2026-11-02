import catalog from '../data/stickers.json';

export interface Sticker { name: string; url: string; description: string; filename: string }
export const STICKERS: Sticker[] = catalog;
export const MAX_COMMENT_ATTACHMENTS = 5;
const stickerPaths = new Set(STICKERS.map(sticker => new URL(sticker.url).pathname));

export function isCustomStickerUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://i0.hdslb.com');
    return /^https?:$/.test(url.protocol) &&
      (url.hostname === 'hdslb.com' || url.hostname.endsWith('.hdslb.com')) &&
      stickerPaths.has(url.pathname);
  } catch {
    return false;
  }
}

export function buildStickerComment(value: string, selected: Sticker[]): string {
  const images = selected.slice(0, MAX_COMMENT_ATTACHMENTS).map(sticker => `![${sticker.name}](${sticker.url})`).join('\n\n');
  return images ? [value, images].filter(Boolean).join('\n\n') : value;
}
