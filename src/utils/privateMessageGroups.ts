import type { MessageConversation, MessagePeer, MessageThread, PrivateMessage } from 'guanggu-forum-api';

export interface PrivateMessageGroup {
  peer: MessagePeer;
  conversations: MessageConversation[];
  latest: MessageConversation;
  unread: number;
}

// Relative/localized upstream labels are display text, not sortable timestamps.
function timestamp(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : undefined;
}
function positive(value: number): boolean { return Number.isSafeInteger(value) && value > 0; }
function compare(a: MessageConversation, b: MessageConversation): number {
  const first = timestamp(a.updated), second = timestamp(b.updated);
  if (first !== undefined && second !== undefined && first !== second) return second - first;
  if (first !== undefined && second === undefined) return -1;
  if (first === undefined && second !== undefined) return 1;
  return b.id - a.id;
}

/** A new array; unknown dates use stable CID order rather than invented chronology. */
export function orderMessageConversations(items: readonly MessageConversation[]): MessageConversation[] {
  return [...items].sort(compare);
}

/** Display grouping only. Every server CID retains its own history and permissions. */
export function groupMessageConversations(...buckets: (readonly MessageConversation[])[]): PrivateMessageGroup[] {
  const conversations = new Map<number, MessageConversation>();
  const conflicts = new Set<number>();
  for (const bucket of buckets) for (const candidate of bucket) {
    if (!positive(candidate.id) || !positive(candidate.peer.uid) || conflicts.has(candidate.id)) continue;
    const previous = conversations.get(candidate.id);
    if (previous && previous.peer.uid !== candidate.peer.uid) {
      conversations.delete(candidate.id);
      conflicts.add(candidate.id);
      continue;
    }
    if (previous) {
      const oldTime = timestamp(previous.updated), newTime = timestamp(candidate.updated);
      if (oldTime !== undefined && (newTime === undefined || newTime < oldTime)) continue;
    }
    conversations.set(candidate.id, candidate);
  }
  const groups = new Map<number, MessageConversation[]>();
  for (const conversation of conversations.values()) {
    const current = groups.get(conversation.peer.uid) || [];
    current.push(conversation);
    groups.set(conversation.peer.uid, current);
  }
  return [...groups.values()].map(items => {
    const ordered = orderMessageConversations(items);
    const latest = ordered[0];
    const unread = ordered.reduce((sum, item) => Math.min(Number.MAX_SAFE_INTEGER,
      sum + (Number.isSafeInteger(item.unread) && item.unread > 0 ? item.unread : 0)), 0);
    return { peer: latest.peer, conversations: ordered, latest, unread };
  }).sort((a, b) => compare(a.latest, b.latest));
}

/** IDs/sequences are never globally deduplicated across conversations. */
export function privateMessageKey(cid: number, message: Pick<PrivateMessage, 'id'>): string {
  return `${cid}:${message.id}`;
}
export function orderPrivateMessages(messages: readonly PrivateMessage[]): PrivateMessage[] {
  return [...messages].sort((a, b) => a.seq - b.seq || a.id - b.id);
}

/** The caller must additionally enforce current page identity, visibility and POST locks. */
export function isPrivateThreadSendable(thread: MessageThread | undefined, permissionsFresh: boolean): boolean {
  return permissionsFresh && thread?.state === 'active' && !thread.blocked;
}
