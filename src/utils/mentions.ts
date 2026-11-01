export interface MentionDraft {
  mentions: string[];
  text: string;
}

export function parseMentionDraft(value: string, finalize = false): MentionDraft {
  const mentions: string[] = [];
  const pattern = finalize
    ? /(^|\s)@([\p{L}\p{N}_-]+)(?=\s|$)/gu
    : /(^|\s)@([\p{L}\p{N}_-]+)(?=\s)/gu;
  const text = value.replace(pattern, (_, space: string, username: string) => {
    if (!mentions.includes(username)) mentions.push(username);
    return space;
  }).replace(/^\s+/, "");
  return { mentions, text };
}

export function serializeMentionDraft(draft: MentionDraft): string {
  const prefix = draft.mentions.map((username) => `@${username}`).join(" ");
  return prefix ? `${prefix} ${draft.text}` : draft.text;
}

export function updateMentionDraft(current: MentionDraft, input: string, finalize = false): MentionDraft {
  const next = parseMentionDraft(input, finalize);
  return { mentions: [...new Set([...current.mentions, ...next.mentions])], text: next.text };
}
