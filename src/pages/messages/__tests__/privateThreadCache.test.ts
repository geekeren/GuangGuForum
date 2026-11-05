import { beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptPrivateMessageRequest, getMessageCompose, getMessageConversations, getMessageThread, getUserProfile, sendPrivateMessage } from 'guanggu-forum-api';
import MessageThreadPage, { emptyThread } from '../thread';
import { PrivatePageState } from '../privateState';
import { privateMessageMemory } from '../privateMemory';
import { privateMessageFileCache } from '../../../utils/privateMessageFileCache';

const runtime = vi.hoisted(() => ({ page: null as any, params: { cid: '11' } as Record<string, string>, state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], effectCursor: 0, work: [] as any[], listener: null as any, account: 'fixture-user' }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = initial; return [runtime.state[i], (next: any) => { runtime.state[i] = next; }]; },
  useRef: (initial: any) => { const i = runtime.refCursor++; if (!(i in runtime.refs)) runtime.refs[i] = { current: initial }; return runtime.refs[i]; },
  useCallback: (fn: any, deps: any[]) => {
    const i = runtime.refCursor++; const old = runtime.refs[i];
    if (!old || deps.some((value, index) => value !== old.deps[index])) runtime.refs[i] = { deps, fn };
    return runtime.refs[i].fn;
  },
  useEffect: (fn: any, deps: any[]) => { const i = runtime.effectCursor++; const old = runtime.effects[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) runtime.work.push(() => { old?.cleanup?.(); runtime.effects[i] = { deps, cleanup: fn() }; }); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { useRouter: () => ({ params: runtime.params }), getCurrentInstance: () => ({ page: { getOpenerEventChannel: () => ({ on: (_: any, listener: any) => { runtime.listener = listener; }, off: () => { runtime.listener = null; } }) } }), navigateTo: vi.fn(), getRandomValues: vi.fn(async () => ({ randomValues: new Uint8Array(16).buffer })) } }));
vi.mock('guanggu-forum-api', () => ({ getMessageThread: vi.fn(), getMessageCompose: vi.fn(), getMessageConversations: vi.fn(), getUserProfile: vi.fn(), sendPrivateMessage: vi.fn(), acceptPrivateMessageRequest: vi.fn() }));
vi.mock('../usePrivatePage', () => ({ usePrivatePage: () => runtime.page }));
vi.mock('../../../utils/privateMessageFileCache', () => ({ privateMessageFileCache: { get: vi.fn(), put: vi.fn(), protect: vi.fn(() => () => {}) } }));
vi.mock('../../../utils/currentUser', () => ({ subscribeCurrentAccount: () => () => {} }));
vi.mock('../PrivateMessageComposer', () => ({ default: ({ disabled, limit, onSend, onChange }: any) => ({ type: 'Textarea', props: { disabled, maxlength: limit, onSend, onChange } }) }));
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../../components/ThemePage', () => ({ default: ({ children }: any) => children }));
vi.mock('../../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../../components/Loading', () => ({ default: 'Loading' }));
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  if (typeof tree.type === 'function') return all(tree.type(tree.props));
  return [tree, ...all(tree.props?.children)];
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function thread(state = 'active') { return { id: 11, peer: { uid: 8, username: 'peer', display_name: 'Fixture', avatar: '' }, state, incoming_request: state === 'pending', blocked: false, can_reopen: false, source: null, messages: [{ id: 1, seq: 1, mine: false, text: 'fixture body', state: 'active', created: '' }], has_more: false }; }
const empty = emptyThread;
function render() {
  runtime.cursor = runtime.refCursor = runtime.effectCursor = 0;
  const snapshot = runtime.page.store.snapshot(); runtime.page.snapshot = snapshot; runtime.page.data = snapshot.data; runtime.page.ready = snapshot.visible && snapshot.uid > 0;
  const nodes = all(MessageThreadPage()); runtime.work.splice(0).forEach(effect => effect()); return nodes;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.state = []; runtime.refs = []; runtime.work = []; runtime.params = { cid: '11' }; runtime.account = 'fixture-user'; runtime.listener = null;
  privateMessageMemory.accountChanged('signed-out'); vi.mocked(privateMessageFileCache.get).mockReset(); vi.mocked(privateMessageFileCache.put).mockReset(); vi.mocked(privateMessageFileCache.protect).mockClear();
  vi.mocked(getUserProfile).mockReset().mockResolvedValue({ username: 'fixture-user', avatarUrl: '' } as any); vi.mocked(getMessageThread).mockReset(); vi.mocked(getMessageCompose).mockReset(); vi.mocked(getMessageConversations).mockReset().mockResolvedValue({ items: [], next_cursor: null }); vi.mocked(sendPrivateMessage).mockReset().mockResolvedValue({ conversation_id: 11 }); vi.mocked(acceptPrivateMessageRequest).mockReset().mockResolvedValue(undefined);
  const store = new PrivatePageState(empty, () => runtime.account); store.activate('fixture-user'); store.bindUid(7);
  privateMessageMemory.authorize(7); runtime.page = { store, username: 'fixture-user', loading: false, error: false, identityError: false, refresh: vi.fn() };
});

describe('actual private thread completed-file hydration and fresh permissions', () => {
  it('cached active thread remains readonly when fresh GET fails; manual successful GET restores send', async () => {
    vi.mocked(privateMessageFileCache.get).mockReturnValue(thread()); const first = deferred<any>(); const retry = deferred<any>();
    vi.mocked(getMessageThread).mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise).mockReturnValue(new Promise(() => {}));
    const store = runtime.page.store; store.bindUid(7, false); render(); expect(privateMessageFileCache.get).not.toHaveBeenCalled(); expect(getMessageThread).not.toHaveBeenCalled();
    store.bindUid(7, true); render(); expect(privateMessageFileCache.get).toHaveBeenCalledWith(7, 'thread:11', 1);
    expect(store.snapshot().data.threadsByCid[11]?.permissionsFresh ?? false).toBe(false); expect(store.snapshot().data.threadsByCid[11].loading).toBe(true); expect(privateMessageFileCache.put).not.toHaveBeenCalled();
    first.reject({ code: 'NETWORK' }); await flush(); let nodes = render(); store.update(value => ({ ...value, draft: 'fixture draft' }));
    nodes.find(node => node.type === 'Textarea').props.onSend(); expect(sendPrivateMessage).not.toHaveBeenCalled(); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
    nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); retry.resolve(thread()); await flush(); nodes = render();
    expect(store.snapshot().data.threadsByCid[11]?.permissionsFresh ?? false).toBe(true); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(false);
    expect(privateMessageFileCache.put).toHaveBeenCalledWith(7, 'thread:11', thread(), 1);
    nodes.find(node => node.type === 'Textarea').props.onSend(); await flush(); expect(sendPrivateMessage).toHaveBeenCalledTimes(1);
  });
  it('cached incoming request cannot accept after GET failure and refreshed blocked thread remains disabled', async () => {
    vi.mocked(privateMessageFileCache.get).mockReturnValue(thread('pending')); const pending = deferred<any>(); vi.mocked(getMessageThread).mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ ...thread('pending'), blocked: true });
    render(); pending.reject({ code: 'NETWORK' }); await flush(); let nodes = render();
    nodes.find(node => node.props.className?.split(' ').includes('privateMessageButton')).props.onClick(); expect(acceptPrivateMessageRequest).not.toHaveBeenCalled();
    nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); await flush(); nodes = render();
    expect(nodes.some(node => node.props.className === 'privateAcceptRequest')).toBe(false); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
  });
  it('hide invalidates late GET so it cannot persist completed files or permissions', async () => {
    const pending = deferred<any>(); vi.mocked(getMessageThread).mockReturnValue(pending.promise); render();
    runtime.page.store.hide(); pending.resolve(thread()); await flush(); expect(privateMessageFileCache.put).not.toHaveBeenCalled(); expect(runtime.page.store.snapshot().data.threadsByCid[11]?.permissionsFresh ?? false).toBe(false);
  });
  it('API-normalized new compose ID zero uses the fresh qualification and 120 limit, not cached permissions', async () => {
    runtime.params = { to: '8' }; const compose = deferred<any>(); vi.mocked(getMessageCompose).mockReturnValue(compose.promise);
    render(); expect(runtime.page.store.snapshot().data.threadsByCid[11]?.permissionsFresh ?? false).toBe(false);
    compose.resolve({ peer: thread().peer, conversation_id: 0, source: null, can_initiate: true, qualification_message: '' }); await flush();
    const nodes = render(); const input = nodes.find(node => node.type === 'Textarea');
    expect(input.props.maxlength).toBe(120); expect(input.props.disabled).toBe(false); expect(runtime.page.store.snapshot().data.composeFresh).toBe(true);
    expect(getMessageThread).not.toHaveBeenCalled(); expect(privateMessageFileCache.get).not.toHaveBeenCalled(); expect(privateMessageFileCache.put).not.toHaveBeenCalled(); expect(sendPrivateMessage).not.toHaveBeenCalled();
  });
  it.each([null, { id: 14, title: 'canonical', url: '/t/14' }])('fresh new compose accepts input and explicitly sends only canonical source with a secure retry key (%s)', async source => {
    runtime.params = { to: '8', source: '99' };
    vi.mocked(getMessageCompose).mockResolvedValue({ peer: thread().peer, conversation_id: 0, source, can_initiate: true, qualification_message: '' });
    const failed = deferred<any>(); vi.mocked(sendPrivateMessage).mockReturnValueOnce(failed.promise).mockResolvedValue({ conversation_id: 11 });
    render(); await flush(); let nodes = render();
    nodes.find(node => node.type === 'Textarea').props.onChange(' fixture new request '); nodes = render();
    expect(runtime.page.store.snapshot().data.draft).toBe(' fixture new request ');
    expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(false);
    nodes.find(node => node.type === 'Textarea').props.onSend(); nodes.find(node => node.type === 'Textarea').props.onSend(); await flush();
    expect(sendPrivateMessage).toHaveBeenCalledTimes(1);
    const first = vi.mocked(sendPrivateMessage).mock.calls[0][0];
    expect(first).toEqual({ recipientId: 8, ...(source ? { sourceId: 14 } : {}), text: 'fixture new request', clientKey: expect.stringMatching(/^[0-9a-f]{32}$/) });
    failed.reject({ code: 'SERVER' }); await flush(); expect(runtime.page.store.snapshot().data.draft).toBe(' fixture new request ');
    nodes = render(); nodes.find(node => node.type === 'Textarea').props.onSend(); await flush();
    expect(sendPrivateMessage).toHaveBeenCalledTimes(2); expect(vi.mocked(sendPrivateMessage).mock.calls[1][0]).toEqual(first);
    expect(runtime.page.store.snapshot().data.draft).toBe('');
  });
  it('group discovery retains multiple CID with equal message IDs and accepts only the explicit fresh request inside chat', async () => {
    runtime.params = { cid: '11', peer: '8' };
    const conversation = (id: number) => ({ id, peer: thread().peer, unread: 1, state: 'active', preview: '', updated: '' });
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [conversation(11), conversation(12)], next_cursor: 'bucket0' }).mockResolvedValueOnce({ items: [conversation(12)], next_cursor: 'bucket1' });
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(conversationId === 12 ? 'pending' : 'active'), id: conversationId, messages: [{ ...thread().messages[0], text: `body${conversationId}` }] }));
    render(); await flush(); const nodes = render();
    expect(Object.keys(runtime.page.store.snapshot().data.threadsByCid)).toEqual(['11', '12']);
    expect(nodes.filter(node => node.props.className === 'privateMessageText').map(node => node.props.children)).toEqual(['body12', 'body11']);
    expect(nodes.filter(node => node.props.id?.startsWith('private-message-')).map(node => node.props.id)).toEqual(['private-message-12-1', 'private-message-11-1']);
    const scroll = nodes.find(node => node.type === 'ScrollView');
    expect(all(scroll).some(node => node.props.className === 'privateAcceptRequest')).toBe(true);
    all(scroll).find(node => node.props.className?.split(' ').includes('privateMessageButton')).props.onClick(); await flush();
    expect(acceptPrivateMessageRequest).toHaveBeenCalledWith({ conversationId: 12 });
    expect(getMessageConversations).toHaveBeenCalledTimes(4);
  });
  it('manual history discovery uses independent cursors, keeps older known CID after first refresh and never stores combined pages', async () => {
    runtime.params = { cid: '11', peer: '8' }; const conversation = (id: number) => ({ id, peer: thread().peer, unread: 0, state: 'active', preview: '', updated: '' });
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [conversation(11)], next_cursor: 'zero' }).mockResolvedValueOnce({ items: [], next_cursor: 'one' })
      .mockResolvedValueOnce({ items: [conversation(13)], next_cursor: 'zero' }).mockRejectedValueOnce({ code: 'NETWORK' })
      .mockResolvedValue({ items: [conversation(11)], next_cursor: null });
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(), id: conversationId }));
    render(); await flush(); let nodes = render(); const more = nodes.find(node => node.props.children === '加载更多会话记录'); more.props.onClick(); await flush();
    expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 0, cursor: 'zero' }); expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 1, cursor: 'one' });
    expect(runtime.page.store.snapshot().data.buckets[0].cursor).toBeNull(); expect(runtime.page.store.snapshot().data.known.map((value: any) => value.id)).toEqual([13, 11]);
    expect(vi.mocked(privateMessageFileCache.put).mock.calls.filter(call => String(call[1]).startsWith('list:'))).toHaveLength(2);
    nodes = render(); expect(nodes.some(node => node.props.children === '会话记录尚未全部加载，已发现的记录仍可查看')).toBe(true);
    expect(nodes.some(node => node.props.children === '刷新' && node.props.onClick)).toBe(false);
    // The remaining failed-bucket retry still refreshes its own lane without dropping discovered CIDs.
    nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); await flush();
    expect(getMessageConversations).toHaveBeenLastCalledWith({ bucket: 1, cursor: 'one' });
    expect(runtime.page.store.snapshot().data.known.map((value: any) => value.id)).toEqual([13, 11]);
  });
  it('event retains post-pagination CID only after fresh UID and rejects account mismatch, hide and peer-mismatched thread', async () => {
    runtime.params = { cid: '11', peer: '8' }; const store = runtime.page.store; store.bindUid(7, false);
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(), id: conversationId, peer: conversationId === 99 ? { ...thread().peer, uid: 9 } : thread().peer }));
    render(); const listener = runtime.listener;
    const event = { account: 'fixture-user', uid: 7, peerUid: 8, conversations: [{ id: 99, peer: thread().peer, unread: 0, state: 'active', preview: '', updated: '' }] };
    listener(event); expect(getMessageThread).not.toHaveBeenCalled();
    listener({ ...event, uid: 10 }); store.bindUid(7, true); render(); await flush(); expect(getMessageThread).not.toHaveBeenCalledWith({ conversationId: 99 });
    listener(event); await flush(); expect(store.snapshot().data.threadsByCid[99].thread).toBeUndefined(); expect(store.snapshot().data.threadsByCid[99].permissionsFresh).toBe(false);
    expect(vi.mocked(privateMessageFileCache.put).mock.calls.some(call => call[1] === 'thread:99')).toBe(false);
    runtime.account = 'other-account'; listener({ ...event, conversations: [{ ...event.conversations[0], id: 100 }] });
    expect(store.snapshot().visible).toBe(false); expect(store.snapshot().data.threadsByCid[100]).toBeUndefined();
  });
  it('multiple active CID require visible target choice and each CID owns freshness and before cursor', async () => {
    runtime.params = { cid: '11', peer: '8' }; const conversation = (id: number) => ({ id, peer: thread().peer, unread: 0, state: 'active', preview: '', updated: '' });
    vi.mocked(getMessageConversations).mockResolvedValue({ items: [conversation(11), conversation(12)], next_cursor: null });
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId, before }: any) => ({ ...thread(), id: conversationId,
      messages: [{ ...thread().messages[0], id: before ? 2 : 1, seq: before ? 3 : conversationId }], has_more: !before }));
    render(); await flush(); let nodes = render(); expect(nodes.some(node => node.props.className === 'privateThreadSendTargets')).toBe(true);
    nodes.find(node => node.props.className?.includes('privateThreadSendTarget ') && String(node.props.children).includes('11')).props.onClick();
    runtime.page.store.update((value: any) => ({ ...value, draft: 'target draft' })); nodes = render();
    nodes.find(node => node.type === 'Textarea').props.onSend(); await flush(); expect(sendPrivateMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 11, text: 'target draft' }));
    nodes = render(); const segments = nodes.filter(node => node.props.className === 'privateThreadSegment');
    all(segments[0]).find(node => node.props.children === '加载更早消息').props.onClick(); await flush();
    expect(getMessageThread).toHaveBeenCalledWith({ conversationId: 12, before: 12 });
    expect(runtime.page.store.snapshot().data.threadsByCid[11].thread.messages).toHaveLength(1);
  });
  it('stale selected CID cannot borrow another active CID permissions or silently redirect the retained draft', async () => {
    runtime.params = { cid: '11', peer: '8' }; const conversation = (id: number) => ({ id, peer: thread().peer, unread: 0, state: 'active', preview: '', updated: '' });
    vi.mocked(getMessageConversations).mockResolvedValue({ items: [conversation(11), conversation(12)], next_cursor: null });
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(), id: conversationId }));
    render(); await flush(); runtime.page.store.update((value: any) => ({ ...value, selectedCid: 11, targetChosen: true, draft: 'retain target', threadsByCid: { ...value.threadsByCid, 11: { ...value.threadsByCid[11], permissionsFresh: false } } }));
    let nodes = render(); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
    nodes.find(node => node.type === 'Textarea').props.onSend(); expect(sendPrivateMessage).not.toHaveBeenCalled();
    expect(runtime.page.store.snapshot().data.draft).toBe('retain target');
    nodes.find(node => node.props.className?.includes('privateThreadSendTarget ') && String(node.props.children).includes('12')).props.onClick(); nodes = render();
    nodes.find(node => node.type === 'Textarea').props.onSend(); await flush(); expect(sendPrivateMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 12, text: 'retain target' }));
  });
  it('CID older response without progress stops further pagination and never restores stale permissions', async () => {
    vi.mocked(getMessageThread).mockResolvedValue({ ...thread(), has_more: true }); render(); await flush();
    runtime.page.store.update((value: any) => ({ ...value, threadsByCid: { ...value.threadsByCid, 11: { ...value.threadsByCid[11], permissionsFresh: false } } }));
    let nodes = render(); nodes.find(node => node.props.children === '加载更早消息').props.onClick(); await flush();
    expect(getMessageThread).toHaveBeenLastCalledWith({ conversationId: 11, before: 1 });
    expect(runtime.page.store.snapshot().data.threadsByCid[11].thread.has_more).toBe(false); expect(runtime.page.store.snapshot().data.threadsByCid[11].permissionsFresh).toBe(false);
    nodes = render(); expect(nodes.some(node => node.props.children === '加载更早消息')).toBe(false);
  });
  it('valid opener metadata before UID verification applies only to the same fresh generation, late hidden event cannot add CID', async () => {
    runtime.params = { cid: '11', peer: '8' }; const store = runtime.page.store; store.bindUid(7, false);
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(), id: conversationId }));
    render(); const listener = runtime.listener;
    const event = { account: 'fixture-user', uid: 7, peerUid: 8, conversations: [{ id: 88, peer: thread().peer, unread: 0, state: 'active', preview: 'strip body', updated: '' }] };
    listener(event); expect(store.snapshot().data.threadsByCid[88]).toBeUndefined();
    store.bindUid(7, true); render(); await flush(); expect(getMessageThread).toHaveBeenCalledWith({ conversationId: 88 });
    expect(store.snapshot().data.known.find((item: any) => item.id === 88).preview).toBe('');
    store.hide(); listener({ ...event, conversations: [{ ...event.conversations[0], id: 89 }] }); expect(store.snapshot().data.threadsByCid[89]).toBeUndefined();
  });
  it.each(['pending', 'blocked'])('previously selected CID changing from active to %s never borrows another active target', async state => {
    runtime.params = { cid: '11', peer: '8' }; const conversation = (id: number) => ({ id, peer: thread().peer, unread: 0, state: 'active', preview: '', updated: '' });
    vi.mocked(getMessageConversations).mockResolvedValue({ items: [conversation(11), conversation(12)], next_cursor: null });
    vi.mocked(getMessageThread).mockImplementation(async ({ conversationId }: any) => ({ ...thread(), id: conversationId }));
    render(); await flush(); render();
    runtime.page.store.update((value: any) => ({ ...value, selectedCid: 11, targetChosen: true, draft: 'retained', threadsByCid: { ...value.threadsByCid,
      11: { ...value.threadsByCid[11], thread: { ...value.threadsByCid[11].thread, state, blocked: state === 'blocked' } } } }));
    const nodes = render(); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
    nodes.find(node => node.type === 'Textarea').props.onSend(); expect(sendPrivateMessage).not.toHaveBeenCalled(); expect(runtime.page.store.snapshot().data.draft).toBe('retained');
  });
  it('compose existing CID with a different returned peer is rejected and never cached or sendable', async () => {
    runtime.params = { to: '8' }; vi.mocked(getMessageCompose).mockResolvedValue({ peer: thread().peer, conversation_id: 11, source: null, can_initiate: true, qualification_message: '' });
    vi.mocked(getMessageThread).mockResolvedValue({ ...thread(), peer: { ...thread().peer, uid: 9 } });
    render(); await flush(); const nodes = render();
    expect(runtime.page.store.snapshot().data.threadsByCid[11].thread).toBeUndefined(); expect(privateMessageFileCache.put).not.toHaveBeenCalled();
    expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true); nodes.find(node => node.type === 'Textarea').props.onSend(); expect(sendPrivateMessage).not.toHaveBeenCalled();
  });
  it('navbar owns peer identity and current state; each message avatar uses its actual sender without usernames', async () => {
    vi.mocked(getMessageThread).mockResolvedValue({ ...thread('pending'), messages: [thread().messages[0], { ...thread().messages[0], id: 2, seq: 2, mine: true }] });
    render(); await flush(); const nodes = render(); const navbar = nodes.find(node => node.type === 'Navbar');
    expect(all(navbar).some(node => node.props.className === 'privateThreadNavPeer')).toBe(true);
    expect(all(navbar).find(node => node.props.className === 'privateThreadNavState').props.children).toBe('等待接受请求');
    expect(nodes.some(node => node.props.className === 'privateThreadPeer')).toBe(false);
    const avatars = nodes.filter(node => node.props.className === 'privateMessageSenderAvatar'); expect(avatars).toHaveLength(2);
    expect(avatars.map(node => node.props.username)).toEqual(['peer', 'fixture-user']); expect(avatars[1].props.src).toBe(''); expect(avatars.every(node => node.props.size === 48)).toBe(true);
  });
  it('blocked flag takes priority over active state in the navbar and disables sending', async () => {
    vi.mocked(getMessageThread).mockResolvedValue({ ...thread(), blocked: true }); render(); await flush(); const nodes = render();
    expect(nodes.find(node => node.props.className === 'privateThreadNavState').props.children).toBe('会话不可用');
    expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
  });
  it('own avatar GET starts only after verified identity, rejects wrong username and drops hidden late results', async () => {
    const pending = deferred<any>(); vi.mocked(getUserProfile).mockReturnValue(pending.promise); runtime.page.store.bindUid(7, false); render(); expect(getUserProfile).not.toHaveBeenCalled();
    runtime.page.store.bindUid(7, true); render(); expect(getUserProfile).toHaveBeenCalledWith({ username: 'fixture-user' }, { cache: false });
    runtime.page.store.hide(); pending.resolve({ username: 'fixture-user', avatarUrl: 'https://avatar.invalid/late.png' }); await flush(); expect(runtime.page.store.snapshot().data.selfAvatar).toBeUndefined();
  });
  it('own avatar uses confirmed current account image, never a different profile or peer image', async () => {
    vi.mocked(getUserProfile).mockResolvedValue({ username: 'fixture-user', avatarUrl: 'https://avatar.invalid/self.png' } as any); vi.mocked(getMessageThread).mockResolvedValue({ ...thread(), messages: [{ ...thread().messages[0], mine: true }] });
    render(); await flush(); const nodes = render(); expect(nodes.find(node => node.props.className === 'privateMessageSenderAvatar').props.src).toBe('https://avatar.invalid/self.png');
  });
  it('compose remains fresh GET only and is never hydrated or persisted', async () => {
    runtime.params = { to: '8' }; vi.mocked(getMessageCompose).mockResolvedValue({ peer: thread().peer, conversation_id: 0, source: null, can_initiate: false, qualification_message: 'fixture qualification' });
    render(); await flush(); const nodes = render(); expect(getMessageCompose).toHaveBeenCalledWith({ recipientId: 8 });
    expect(privateMessageFileCache.get).not.toHaveBeenCalled(); expect(privateMessageFileCache.put).not.toHaveBeenCalled(); expect(nodes.find(node => node.type === 'Textarea').props.disabled).toBe(true);
  });
});
