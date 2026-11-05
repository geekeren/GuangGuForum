export interface CommentMentionTarget { label: string; uid: number }
export interface CommentMentionBinding {
  uid: number;
  reply_id: number;
  start: number;
  end: number;
  label: string;
}

const MAX_BINDINGS = 16;
export function verifiedMentionId(value?: string): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/** Names only label an explicit server-provided id; conflicting names never pick a winner. */
export function verifiedMentionTargets(authors: Array<{ author: string; authorUserId?: string }>): CommentMentionTarget[] {
  const identities = new Map<string, number | undefined>();
  for (const author of authors) {
    const label = author.author;
    if (!label || /[\r\n]/.test(label)) continue;
    const uid = verifiedMentionId(author.authorUserId);
    if (!identities.has(label)) identities.set(label, uid);
    else if (identities.get(label) !== uid) identities.set(label, undefined);
  }
  return [...identities].flatMap(([label, uid]) => uid === undefined ? [] : [{ label, uid }]);
}

/** Final wire offsets are UTF-16 indexes, exactly as used by the native textarea. */
export function validCommentMentionBindings(content: string, bindings: CommentMentionBinding[]): CommentMentionBinding[] {
  const result: CommentMentionBinding[] = [];
  for (const binding of [...bindings].sort((a, b) => a.start - b.start)) {
    if (!Number.isSafeInteger(binding.uid) || binding.uid <= 0 || !Number.isSafeInteger(binding.reply_id) || binding.reply_id < 0
      || !Number.isSafeInteger(binding.start) || !Number.isSafeInteger(binding.end) || binding.start < 0
      || !binding.label.startsWith('@') || binding.label.length < 2 || /[\r\n]/.test(binding.label)
      || binding.end !== binding.start + binding.label.length || content.slice(binding.start, binding.end) !== binding.label
      || (result.length && binding.start < result[result.length - 1].end)) continue;
    result.push({ ...binding });
    if (result.length === MAX_BINDINGS) break;
  }
  return result;
}

/** Shift unchanged ranges after an edit; touching a label revokes its identity binding. */
export function editCommentMentionBindings(previous: string, next: string, bindings: CommentMentionBinding[]): CommentMentionBinding[] {
  if (previous === next) return validCommentMentionBindings(next, bindings);
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let suffix = 0;
  while (suffix < previous.length && suffix < next.length
    && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  // Repeated text can explain the same change at multiple positions. Consider
  // every shortest contiguous edit, not just the rightmost common-prefix diff.
  // Keep a binding only when all those edits agree it was completely untouched.
  const retained = Math.min(start + suffix, previous.length, next.length);
  const earliestStart = Math.max(0, retained - suffix);
  const latestStart = Math.min(start, retained);
  const latestOldEnd = latestStart + previous.length - retained;
  const delta = next.length - previous.length;
  const shifted = validCommentMentionBindings(previous, bindings).flatMap(binding => {
    if (binding.end <= earliestStart) return [binding];
    if (binding.start >= latestOldEnd) return [{ ...binding, start: binding.start + delta, end: binding.end + delta }];
    return [];
  });
  return validCommentMentionBindings(next, shifted);
}
