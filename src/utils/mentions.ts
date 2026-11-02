import { AI_USERNAME, AI_USER_LABEL, isAiUser } from './aiUser';

export interface MentionQuery { start: number; end: number; keyword: string }
export interface MentionSegment { text: string; start: number; end: number; username?: string }
export const AI_MENTION_USERNAME = AI_USERNAME;

/** Preserve the exact source text and UTF-16 offsets used by the native textarea. */
export function getMentionSegments(value: string): MentionSegment[] {
  const result: MentionSegment[] = [];
  const pattern = /(^|[^a-zA-Z0-9_@.\-])@([\p{L}\p{N}_-]+)(?=$|[\s，。！？、：；,.!?;:])/gu;
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index! + match[1].length;
    const end = start + match[2].length + 1;
    if (start > offset) result.push({ text: value.slice(offset, start), start: offset, end: start });
    result.push({ text: value.slice(start, end), username: match[2], start, end });
    offset = end;
  }
  if (offset < value.length) result.push({ text: value.slice(offset), start: offset, end: value.length });
  return result;
}

export function getCommentBody(value: string): string {
  return getMentionSegments(value).filter((part) => !part.username).map((part) => part.text).join("");
}

/** Only match the token at the native caret; email addresses are not mentions. */
export function getMentionQuery(text: string, cursor = text.length): MentionQuery | null {
  const end = Math.max(0, Math.min(cursor, text.length));
  const match = /@([\p{L}\p{N}_-]*)$/u.exec(text.slice(0, end));
  if (!match) return null;
  const start = end - match[1].length - 1;
  if (start > 0 && /[a-zA-Z0-9_@.\-]/.test(text[start - 1])) return null;
  return { start, end, keyword: match[1] };
}

export function getMentionCandidates(users: string[], selected: string[], query: MentionQuery): string[] {
  const keyword = query.keyword.toLocaleLowerCase();
  return [...new Set(users)].filter((name) => name && !selected.includes(name) &&
    (name.toLocaleLowerCase().includes(keyword) ||
      (isAiUser(name) && AI_USER_LABEL.replace(/\s/g, '').toLocaleLowerCase().includes(keyword))));
}

export function replaceInlineMention(value: string, query: MentionQuery, username: string) {
  // Editing inside a username replaces the rest of that token, too.
  const suffix = /^[\p{L}\p{N}_-]+/u.exec(value.slice(query.end))?.[0] || "";
  const end = query.end + suffix.length;
  const before = value.slice(0, query.start);
  const after = value.slice(end);
  const replacement = `@${username} `;
  return {
    value: before + replacement + (after.startsWith(" ") ? after.slice(1) : after),
    cursor: before.length + replacement.length,
  };
}
