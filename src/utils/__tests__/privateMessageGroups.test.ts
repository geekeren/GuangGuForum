import { describe, expect, it } from 'vitest';
import type { MessageConversation, MessageThread, PrivateMessage } from 'guanggu-forum-api';
import { groupMessageConversations, isPrivateThreadSendable, orderMessageConversations, orderPrivateMessages, privateMessageKey } from '../privateMessageGroups';

const conversation = (id: number, uid = 8, updated = '', unread = 1, state = 'active'): MessageConversation => ({
  id, peer: { uid, username: `fixture-${uid}`, display_name: '合成用户', avatar: '' }, updated, unread, state, preview: `fixture-${id}`,
});
const message = (id: number, seq: number): PrivateMessage => ({ id, seq, mine: false, text: '合成正文', state: 'active', created: '' });
const thread = (state = 'active', blocked = false): MessageThread => ({ id: 11, peer: conversation(11).peer, state, blocked,
  incoming_request: state === 'pending', can_reopen: false, source: null, messages: [], has_more: false });

describe('UID grouped private message display policy', () => {
  it('groups both buckets by peer UID while retaining every different conversation', () => {
    const groups = groupMessageConversations([conversation(11)], [conversation(12, 8, '', 3, 'pending'), conversation(13, 9)]);
    expect(groups.length).toBe(2);
    const peer = groups.find(group => group.peer.uid === 8)!;
    expect(peer.conversations.map(item => item.id)).toEqual([12, 11]); expect(peer.unread).toBe(4);
    expect(peer.conversations.map(item => item.state)).toEqual(['pending', 'active']);
  });
  it('counts cross-bucket duplicate CID unread only once, with newest known snapshot winning', () => {
    const first = conversation(11, 8, '2026-11-05T09:00:00Z', 4);
    const second = conversation(11, 8, '2026-11-05T10:00:00Z', 2, 'pending');
    const result = groupMessageConversations([second], [first]);
    expect(result[0].conversations).toEqual([second]); expect(result[0].unread).toBe(2);
  });
  it('later snapshot wins same/unknown timestamps without interpreting relative display labels', () => {
    const first = conversation(11, 8, '昨天', 4); const second = conversation(11, 8, '刚刚', 2);
    expect(groupMessageConversations([first], [second])[0].latest).toBe(second);
  });
  it('rejects a CID attached to conflicting users instead of leaking it into either group', () => {
    const result = groupMessageConversations([conversation(11), conversation(12)], [conversation(11, 9)], [conversation(11)]);
    expect(result.length).toBe(1); expect(result[0].conversations.map(item => item.id)).toEqual([12]);
  });
  it('keeps users distinct even when display names are identical and skips unsafe identities', () => {
    const result = groupMessageConversations([conversation(11), conversation(12, 9), conversation(0), conversation(13, 0), conversation(Number.MAX_SAFE_INTEGER + 1)]);
    expect(result.map(group => group.peer.uid)).toEqual([9, 8]);
  });
  it('sorts explicit ISO timestamps by absolute time with stable CID ties, without mutating inputs', () => {
    const input = [conversation(11, 8, '2026-11-05T12:00:00+08:00'), conversation(12, 8, '2026-11-05T05:00:00Z'), conversation(13, 8, '2026-11-05T05:00:00Z')];
    expect(orderMessageConversations(input).map(item => item.id)).toEqual([13, 12, 11]);
    expect(input.map(item => item.id)).toEqual([11, 12, 13]);
  });
  it('uses deterministic CID order for ambiguous dates and leaves original display timestamps intact', () => {
    const input = [conversation(11, 8, '2026/11/05'), conversation(13, 8, '刚刚'), conversation(12, 8, '')];
    const result = orderMessageConversations(input);
    expect(result.map(item => item.id)).toEqual([13, 12, 11]); expect(result[0].updated).toBe('刚刚');
  });
  it('prefers reliable timestamp order without replacing a known date with an unparseable snapshot', () => {
    const known = conversation(11, 8, '2026-11-05T05:00:00Z');
    expect(groupMessageConversations([known], [conversation(11, 8, '昨天')])[0].latest).toBe(known);
    expect(orderMessageConversations([conversation(20), known]).map(item => item.id)).toEqual([11, 20]);
  });
  it('uses CID plus message ID so identical IDs/sequences from different conversations survive', () => {
    expect(privateMessageKey(11, message(1, 1))).toBe('11:1'); expect(privateMessageKey(12, message(1, 1))).toBe('12:1');
    const input = [message(3, 2), message(2, 1), message(1, 1)];
    expect(orderPrivateMessages(input).map(item => item.id)).toEqual([1, 2, 3]); expect(input[0].id).toBe(3);
  });
  it('never derives group send permission from another CID, cached state, pending or blocked state', () => {
    expect(isPrivateThreadSendable(thread(), true)).toBe(true);
    expect(isPrivateThreadSendable(thread(), false)).toBe(false);
    expect(isPrivateThreadSendable(thread('pending'), true)).toBe(false);
    expect(isPrivateThreadSendable(thread('active', true), true)).toBe(false);
    expect(isPrivateThreadSendable(undefined, true)).toBe(false);
    expect(isPrivateThreadSendable(thread('unknown'), true)).toBe(false);
  });
  it('returns an ordinary empty list and bounds unread counters for malformed fixtures', () => {
    expect(groupMessageConversations([], [])).toEqual([]);
    const result = groupMessageConversations([conversation(11, 8, '', Number.MAX_SAFE_INTEGER), conversation(12, 8, '', 100), conversation(13, 8, '', -1)]);
    expect(result[0].unread).toBe(Number.MAX_SAFE_INTEGER);
  });
});
