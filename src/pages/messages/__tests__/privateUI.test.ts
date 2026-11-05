import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { acceptPrivateMessageRequest, sendPrivateMessage } from 'guanggu-forum-api';
import Taro from '@tarojs/taro';
import MessageThreadPage, { emptyThread } from '../thread';
import MessagesPage, { MessageConversationList, emptyList } from '../index';
import PrivateMessageEntry from '../PrivateMessageEntry';
import { PrivatePageState } from '../privateState';

const harness = vi.hoisted(() => ({ page: null as any, params: { cid: '11' } as Record<string, string>, refs: [] as any[], cursor: 0, state: [] as any[], stateCursor: 0 }));
vi.mock('react', () => ({
  useCallback: (fn: any) => fn, useEffect: () => {},
  useRef: (value: any) => { const i = harness.cursor++; if (!(i in harness.refs)) harness.refs[i] = { current: value }; return harness.refs[i]; },
  useState: (value: any) => { const i = harness.stateCursor++; if (!(i in harness.state)) harness.state[i] = value; return [harness.state[i], (next: any) => { harness.state[i] = typeof next === 'function' ? next(harness.state[i]) : next; }]; },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Textarea: 'Textarea', Input: 'Input', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { useRouter: () => ({ params: harness.params }), navigateTo: vi.fn(), getRandomValues: vi.fn(async () => ({ randomValues: new Uint8Array(16).fill(3).buffer })) } }));
vi.mock('guanggu-forum-api', () => ({ getMessageConversations: vi.fn(), getMessageSummary: vi.fn(), getMessageThread: vi.fn(), getMessageCompose: vi.fn(), sendPrivateMessage: vi.fn().mockResolvedValue({ conversation_id: 11 }), acceptPrivateMessageRequest: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../usePrivatePage', () => ({ usePrivatePage: () => harness.page }));
vi.mock('../../../utils/currentUser', () => ({ subscribeCurrentAccount: () => () => {} }));
vi.mock('../PrivateMessageComposer', () => ({ default: ({ value, limit, disabled, posting, onSend }: any) => [
  { type: 'Textarea', props: { value, maxlength: limit, disabled: disabled || posting } },
  { type: 'View', props: { className: 'privateMessageSend', onClick: onSend } },
] }));
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../../components/ThemePage', () => ({ default: ({ children }: any) => children }));
vi.mock('../../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return all(tree.type(tree.props));
  return [tree, ...all(tree.props?.children)];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
}
function render(component: () => any) { harness.cursor = 0; harness.stateCursor = 0; return all(component()); }
function setup(change = {}) {
  const initial = { thread: { id: 11, peer: { uid: 8, display_name: 'Fixture', username: 'fixture-peer', avatar: '' }, state: 'active', blocked: false, incoming_request: false, can_reopen: false, source: null,
    messages: [{ id: 1, seq: 1, mine: false, text: '<img src=x onerror=alert(1)>fixture', state: 'review', created: 'fixture-date' }], has_more: false }, compose: null,
    draft: 'fixture draft', loading: false, loadingMore: false, error: '', postError: '', posting: false, notice: '', permissionsFresh: true, ...change };
  const migrated: any = { ...emptyThread(), ...emptyList(), ...initial, composeFresh: true,
    threadsByCid: initial.thread ? { [initial.thread.id]: { thread: initial.thread, loading: false, loadingMore: false, error: '', retryMore: false, permissionsFresh: initial.permissionsFresh } } : {},
    selectedCid: initial.thread?.id || 0, buckets: { ...emptyList().buckets, 0: { ...emptyList().buckets[0], items: (initial as any).items || [], completed: true }, 1: { ...emptyList().buckets[1], completed: true } } };
  const store = new PrivatePageState(() => migrated, () => 'fixture-user'); store.activate('fixture-user'); store.bindUid(7);
  harness.page = { store, snapshot: store.snapshot(), data: migrated, summary: (initial as any).summary || null, ready: true, username: 'fixture-user', loading: false, error: false, identityError: false, refresh: vi.fn() };
  return store;
}
beforeEach(() => { harness.refs = []; harness.state = []; harness.params = { cid: '11' }; setup(); vi.mocked(sendPrivateMessage).mockClear(); vi.mocked(acceptPrivateMessageRequest).mockClear(); vi.mocked(Taro.navigateTo).mockClear(); });

describe('private UI components', () => {
  it('renders private content as safe native selectable Text, never HTML', () => {
    const nodes = render(MessageThreadPage); const body = nodes.find(node => node.props.className === 'privateMessageText');
    expect(body.type).toBe('Text'); expect(body.props.selectable).toBe(true); expect(body.props.children).toBe('<img src=x onerror=alert(1)>fixture');
    expect(nodes.some(node => node.type === 'RichText')).toBe(false); expect(nodes.map(text).join('')).toContain('审核中');
  });
  it.each(['existing', 'compose'])('shows rejected %s content inline, retains draft and does not retry automatically', async kind => {
    const draft = '  synthetic rejected draft  ';
    const store = kind === 'compose'
      ? setup({ thread: null, draft, compose: { peer: { uid: 8, username: 'fixture-peer', display_name: 'Fixture', avatar: '' }, source: null, conversation_id: 0, can_initiate: true, qualification_message: '' } })
      : setup({ draft });
    if (kind === 'compose') harness.params = { to: '8' };
    vi.mocked(sendPrivateMessage).mockRejectedValueOnce({ code: 'CONTENT_REJECTED', statusCode: 400, message: 'untrusted fixture response' });
    render(MessageThreadPage).find(node => node.props.className === 'privateMessageSend')!.props.onClick();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(sendPrivateMessage).toHaveBeenCalledTimes(1);
    expect(store.snapshot().data.draft).toBe(draft); expect(store.snapshot().data.posting).toBe(false);
    harness.page.data = store.snapshot().data;
    const nodes = render(MessageThreadPage);
    const error = nodes.find(node => node.type === 'Text' && node.props.className === 'privateMessageError' && text(node).startsWith('消息未通过检查，请修改内容后发送'));
    expect(error).toBeDefined(); expect(error!.props.onClick).toBeUndefined();
    expect(nodes.find(node => node.type === 'Textarea')!.props.value).toBe(draft);
    expect(nodes.map(text).join('')).not.toContain('untrusted fixture response');
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(sendPrivateMessage).toHaveBeenCalledTimes(1); expect(acceptPrivateMessageRequest).not.toHaveBeenCalled();
  });
  it('blocked/pending/unknown thread states disable input and never send', () => {
    for (const state of ['pending', 'blocked', 'unknown']) {
      const store = setup(); store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid, 11: { ...value.threadsByCid[11], thread: { ...value.threadsByCid[11].thread!, state } } } })); harness.page.data = store.snapshot().data;
      const nodes = render(MessageThreadPage); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
      nodes.find(node => node.props.className === 'privateMessageSend').props.onClick();
    }
    expect(sendPrivateMessage).not.toHaveBeenCalled();
  });
  it('compose qualification disables first request and preserves qualification reason and 120 limit', () => {
    setup({ thread: null, compose: { peer: { uid: 8, username: 'fixture-peer', display_name: 'Fixture', avatar: '' }, source: null, conversation_id: 0, can_initiate: false, qualification_message: 'fixture qualification' } });
    harness.params = { to: '8' }; const nodes = render(MessageThreadPage); const input = nodes.find(node => node.type === 'Textarea');
    expect(input.props.maxlength).toBe(120); expect(input.props.disabled).toBe(true); expect(nodes.map(text).join('')).toContain('fixture qualification');
  });
  it('existing active conversation uses 500 limit and only explicit acceptance button posts accept', () => {
    expect(render(MessageThreadPage).find(node => node.type === 'Textarea').props.maxlength).toBe(500);
    const store = setup(); store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid, 11: { ...value.threadsByCid[11], thread: { ...value.threadsByCid[11].thread!, state: 'pending', incoming_request: true } } } })); harness.page.data = store.snapshot().data;
    const nodes = render(MessageThreadPage); expect(acceptPrivateMessageRequest).not.toHaveBeenCalled();
    const button = nodes.find(node => node.props.className?.split(' ').includes('privateMessageButton') && text(node) === '接受请求'); button.props.onClick();
    expect(acceptPrivateMessageRequest).toHaveBeenCalledWith({ conversationId: 11 });
  });
  it('comment homepage keeps independent private navigation without embedded conversations or private requests', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/pages/home/notifications/index.tsx'), 'utf8');
    expect(source).toContain('url: APP_ROUTES.messages');
    expect(source).toContain('fetchNotifications({ page: 1 })');
    expect(source).not.toContain('MessageConversationList'); expect(source).not.toContain('getMessageSummary');
    expect(source).not.toContain('summary.requests'); expect(source).not.toContain('/pages/messages/index?bucket=1');
    expect(source).not.toContain('返回消息列表'); expect(source).not.toContain("useState<'messages' | 'replies'>");
    expect(source).not.toContain('if (requestError)');
    const nodes = render(() => PrivateMessageEntry({ active: true })); nodes.find(node => node.props.className === 'notificationPrivateEntry').props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/messages/index' });
  });
  it('embedded hub uses a single shared summary, no independent navbar/tabs and round row metadata', () => {
    setup({ items: [{ id: 11, peer: { uid: 8, username: 'fixture-peer', display_name: 'Fixture', avatar: '' }, updated: 'fixture-date', unread: 2, state: 'active', preview: 'fixture preview' }], cursor: null, summary: { unread: 2, requests: 3 } });
    const header = vi.fn(() => null); const nodes = render(() => MessageConversationList({ embedded: true, header }));
    expect(header).toHaveBeenCalledWith({ unread: 2, requests: 3 }); expect(nodes.some(node => node.type === 'Navbar')).toBe(false);
    expect(nodes.some(node => node.props.className === 'privateMessageTabs')).toBe(false);
    expect(nodes.find(node => node.props.className === 'privateConversationMeta')).toBeDefined();
    expect(nodes.find(node => node.type === 'UserAvatar').props.style.borderRadius).toBe('50%');
  });
  it.each(['  私信昵称 😀  ', '   '])('trims visible peer names in list and thread while retaining account identity (%s)', display_name => {
    const peer = { uid: 8, username: 'fixture-peer', display_name, avatar: '' };
    setup({ items: [{ id: 11, peer, updated: '', unread: 0, state: 'active', preview: '' }] });
    const listNodes = render(MessagesPage);
    expect(listNodes.find(node => node.props.className === 'privateConversationName').props.children).toBe(display_name.trim() || peer.username);
    expect(listNodes.find(node => node.type === 'UserAvatar').props.username).toBe(peer.username);
    const store = setup();
    store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid, 11: { ...value.threadsByCid[11], thread: { ...value.threadsByCid[11].thread!, peer } } } }));
    harness.page.data = store.snapshot().data;
    const threadNodes = render(MessageThreadPage);
    expect(threadNodes.find(node => node.props.className === 'privateThreadNavName').props.children).toBe(display_name.trim() || peer.username);
    expect(threadNodes.find(node => node.type === 'UserAvatar').props.username).toBe(peer.username);
    expect(sendPrivateMessage).not.toHaveBeenCalled();
  });
  it('unified list removes the redundant private/send heading and numeric form without removing navbar', () => {
    setup({ items: [], summary: null }); const nodes = render(MessagesPage);
    expect(nodes.some(node => node.props.className === 'privateMessageSectionHeading' || node.props.className === 'privateMessageNewEntry')).toBe(false);
    expect(nodes.some(node => node.type === 'Input')).toBe(false); expect(nodes.some(node => node.type === 'Navbar')).toBe(true);
  });
  it('legacy request entry renders unified list without tabs and identity failure has explicit retry', () => {
    setup({ items: [], summary: { unread: 2, requests: 3 }, cursor: null, summaryError: '' });
    harness.params = { bucket: '1' }; let nodes = render(MessagesPage); expect(nodes.map(text).join('')).toContain('会话与消息请求'); expect(nodes.some(node => node.props.className === 'privateMessageTabs')).toBe(false);
    harness.page.identityError = true; harness.page.ready = false; nodes = render(MessagesPage);
    const retry = nodes.find(node => text(node) === '私信账号校验失败，点击重试' && node.type === 'Text'); retry.props.onClick(); expect(harness.page.refresh).toHaveBeenCalledTimes(1);
  });
});
