import type { MessageConversation, MessagePeer } from 'guanggu-forum-api';

export interface PrivateBucketState {
  items: MessageConversation[];
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  retryMore: boolean;
  completed: boolean;
}
export const emptyPrivateBucket = (): PrivateBucketState => ({ items: [], cursor: null, loading: false,
  loadingMore: false, error: '', retryMore: false, completed: false });
export const emptyPrivateBuckets = (): Record<0 | 1, PrivateBucketState> => ({ 0: emptyPrivateBucket(), 1: emptyPrivateBucket() });
export const PRIVATE_BUCKETS = [0, 1] as const;
export const PRIVATE_GROUP_EVENT = 'privateMessageGroup';

export interface PrivateGroupNavigation {
  account: string;
  uid: number;
  peerUid: number;
  conversations: MessageConversation[];
}

/** Navigation carries only completed contact/CID metadata, not message previews or permissions. */
export function privateGroupNavigation(account: string, uid: number, peerUid: number, items: readonly MessageConversation[]): PrivateGroupNavigation {
  return { account, uid, peerUid, conversations: items.map(item => ({ ...item, peer: { ...item.peer }, preview: '' })) };
}

/** Never use event metadata as identity verification or conversation authorization. */
export function validatedPrivateGroupNavigation(value: unknown, account: string, peerUid: number): PrivateGroupNavigation | undefined {
  if (!value || typeof value !== 'object') return;
  const event = value as PrivateGroupNavigation;
  if (!account || event.account !== account || !Number.isSafeInteger(event.uid) || event.uid <= 0 || event.peerUid !== peerUid || !Array.isArray(event.conversations)) return;
  const items: MessageConversation[] = [];
  for (const item of event.conversations) {
    const peer: MessagePeer | undefined = item?.peer;
    if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || peer?.uid !== peerUid ||
      typeof peer.username !== 'string' || typeof peer.display_name !== 'string' || typeof peer.avatar !== 'string' ||
      typeof item.updated !== 'string' || typeof item.state !== 'string') continue;
    items.push({ id: item.id, peer: { uid: peer.uid, username: peer.username, display_name: peer.display_name, avatar: peer.avatar },
      updated: item.updated, state: item.state, unread: 0, preview: '' });
  }
  return { account, uid: event.uid, peerUid, conversations: items };
}
