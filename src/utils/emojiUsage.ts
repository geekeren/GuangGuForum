import { cacheService, CacheCategory } from "./CacheService";
import { MAX_COMMENT_ATTACHMENTS, STICKERS, type Sticker } from "./stickers";

// Emoji released through 2022, without skin-tone or ZWJ combinations.
export const EMOJIS = [
  "😊", "😂", "😆", "😋", "😓", "🍉", "👍", "👏", "✌️", "🙏", "💪", "👌",
  "😄", "😅", "😢", "😭", "😍", "😎", "😒", "😜", "😮", "😤", "😳", "😔",
  "😏", "😬", "😴", "😌", "😘", "😚", "❤️", "💔", "🌹", "🌷", "🎉", "🎊",
  "🎁", "💰", "💯", "🔥", "✨", "✅", "🍻", "🍺", "☕", "🍚", "🍜", "🎂",
  "🐶", "🐱", "🐮", "🐔", "🐟", "🙈", "🤣", "🤭", "🤦", "🤝", "🤔", "🙃",
  "🥹", "🥺", "🤫", "🤗", "🥰", "🧧", "🥀", "🤩", "🤪", "🤨", "🧐", "🤯",
  "🥳", "🥲", "🫠", "🫡", "🫢", "🫣", "🫤", "🫥", "🤞", "🤟", "🤲", "🫶",
  "🧋", "🥟", "🥮", "🧨", "🪷", "🪭",
];

export const EMOJI_USAGE_KEY = "comment_emoji_usage";
type Usage = { id: string; count: number; lastUsed: number };
type SavedUsage = { emojis: Usage[]; stickers: Usage[] };

function normalize(value: unknown, allowed: Set<string>): Usage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((entry): entry is Usage => {
    if (!entry || !allowed.has(entry.id) || seen.has(entry.id)
      || !Number.isSafeInteger(entry.count) || entry.count <= 0
      || !Number.isFinite(entry.lastUsed) || entry.lastUsed < 0) return false;
    seen.add(entry.id);
    return true;
  }).map(({ id, count, lastUsed }) => ({ id, count, lastUsed }));
}

function readUsage(): SavedUsage {
  const saved = cacheService.get<Partial<SavedUsage>>(EMOJI_USAGE_KEY);
  return {
    emojis: normalize(saved?.emojis, new Set(EMOJIS)),
    stickers: normalize(saved?.stickers, new Set(STICKERS.map(sticker => sticker.filename))),
  };
}

function ranked(entries: Usage[]): Usage[] {
  return entries.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed || a.id.localeCompare(b.id));
}

export function getCommonEmojiUsage(): { emojis: string[]; stickers: Sticker[] } {
  const saved = readUsage();
  const byFilename = new Map(STICKERS.map(sticker => [sticker.filename, sticker]));
  return {
    emojis: ranked(saved.emojis).slice(0, 16).map(entry => entry.id),
    stickers: ranked(saved.stickers).slice(0, 10).map(entry => byFilename.get(entry.id)!),
  };
}

// Count each emoji once per successful comment, not draft taps or repeated characters.
export function recordCommentEmojiUsage(content: string, selected: Sticker[]): boolean {
  const saved = readUsage();
  const now = Date.now();
  const update = (entries: Usage[], id: string) => {
    const entry = entries.find(item => item.id === id);
    if (entry) {
      entry.count = Math.min(Number.MAX_SAFE_INTEGER, entry.count + 1);
      entry.lastUsed = now;
    } else entries.push({ id, count: 1, lastUsed: now });
  };
  const text = content.replace(/\uFE0F/g, "");
  const used = EMOJIS.filter(emoji => text.includes(emoji.replace(/\uFE0F/g, "")));
  used.forEach(emoji => update(saved.emojis, emoji));
  const knownStickers = new Set(selected.slice(0, MAX_COMMENT_ATTACHMENTS)
    .filter(sticker => STICKERS.some(item => item.filename === sticker.filename))
    .map(sticker => sticker.filename));
  knownStickers.forEach(filename => update(saved.stickers, filename));
  if (!used.length && !knownStickers.size) return true;
  return cacheService.set(EMOJI_USAGE_KEY, saved, { category: CacheCategory.System });
}
