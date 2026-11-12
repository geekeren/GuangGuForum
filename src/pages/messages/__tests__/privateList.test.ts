import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { getMessageConversations } from 'guanggu-forum-api';
import { MessageConversationList, emptyList } from '../index';
import { PrivatePageState } from '../privateState';
import { privateMessageMemory } from '../privateMemory';
import { privateMessageFileCache } from '../../../utils/privateMessageFileCache';

const runtime = vi.hoisted(() => ({ page: null as any, account: 'fixture-user', refs: [] as any[], cursor: 0, effects: [] as any[], effectCursor: 0, work: [] as any[], state: [] as any[], stateCursor: 0, readyOverride: undefined as boolean | undefined }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.stateCursor++; if (!(i in runtime.state)) runtime.state[i] = initial; return [runtime.state[i], (next: any) => { runtime.state[i] = next; }]; },
  useRef: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.refs)) runtime.refs[i] = { current: initial }; return runtime.refs[i]; },
  useCallback: (fn: any, deps: any[]) => { const i = runtime.cursor++; const old = runtime.refs[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) runtime.refs[i] = { deps, fn }; return runtime.refs[i].fn; },
  useEffect: (fn: any, deps: any[]) => { const i = runtime.effectCursor++; const previous = runtime.effects[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) runtime.work.push(() => { previous?.cleanup?.(); runtime.effects[i] = { deps, cleanup: fn() }; }); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn() }, useDidHide: () => {} }));
vi.mock('guanggu-forum-api', () => ({ getMessageConversations: vi.fn() }));
vi.mock('../usePrivatePage', () => ({ usePrivatePage: () => runtime.page }));
vi.mock('../../../utils/currentUser', () => ({ subscribeCurrentAccount: () => () => {}, getCachedUsername: () => runtime.account }));
vi.mock('../../../utils/privateMessageFileCache', () => ({ privateMessageFileCache: { get: vi.fn(), put: vi.fn(), protect: vi.fn(() => () => {}) } }));
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../../components/ThemePage', () => ({ default: 'ThemePage' }));
vi.mock('../../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
function all(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(all); if (!tree || typeof tree !== 'object') return []; return [tree, ...all(tree.props?.children)]; }
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(''); if (typeof tree === 'string' || typeof tree === 'number') return String(tree); return tree?.props ? text(tree.props.children) : ''; }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (value: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function item(id: number, uid = 8, unread = 1) { return { id, peer: { uid, username: `peer${uid}`, display_name: `Fixture${uid}`, avatar: '' }, state: 'active', preview: `preview${id}`, updated: '', unread }; }
function render() {
  runtime.cursor = runtime.effectCursor = runtime.stateCursor = 0; const snapshot = runtime.page.store.snapshot();
  runtime.page.snapshot = snapshot; runtime.page.data = snapshot.data; runtime.page.ready = runtime.readyOverride ?? (snapshot.visible && snapshot.uid > 0);
  const nodes = all(MessageConversationList({ initialBucket: 1 })); runtime.work.splice(0).forEach(effect => effect()); return nodes;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.refs = []; runtime.work = []; runtime.state = []; runtime.account = 'fixture-user'; runtime.readyOverride = undefined;
  privateMessageMemory.accountChanged('signed-out'); vi.mocked(getMessageConversations).mockReset(); vi.mocked(Taro.navigateTo).mockReset();
  vi.mocked(privateMessageFileCache.get).mockReset(); vi.mocked(privateMessageFileCache.put).mockReset(); vi.mocked(privateMessageFileCache.protect).mockClear();
  const store = new PrivatePageState(emptyList, () => runtime.account); store.activate(runtime.account); store.bindUid(7);
  runtime.page = { store, summary: null, username: runtime.account, loading: false, identityError: false, error: false, refresh: vi.fn() };
});

describe('unified conversation list independent buckets', () => {
  it('signed-in first JSX remains blank during UID initialization, then hydrates authorized cache without waiting for refresh', async () => {
    privateMessageMemory.put(7, 'list:0', { items: [item(11)], next_cursor: null }); privateMessageMemory.put(7, 'list:1', { items: [], next_cursor: null });
    runtime.readyOverride = false; const initial = render();
    expect(initial.filter(node => node.type === 'Loading')).toHaveLength(0); expect(initial.map(text).join('')).not.toContain('暂无私信'); expect(getMessageConversations).not.toHaveBeenCalled();
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise); runtime.readyOverride = undefined; render();
    const cached = render(); expect(cached.filter(node => node.type === 'Loading')).toHaveLength(0); expect(cached.filter(node => node.props.className === 'privateConversation')).toHaveLength(1);
    expect(getMessageConversations).toHaveBeenCalledTimes(2); pending.resolve({ items: [], next_cursor: null }); await flush();
  });
  it('keeps unknown blank instead of first-page refreshing and never stacks loading over native refresh', async () => {
    const first = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(first.promise);
    render(); let nodes = render();
    expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0); expect(nodes.map(text).join('')).not.toContain('暂无私信');
    expect(nodes.some(node => node.props.children === '加载中…')).toBe(false);
    first.resolve({ items: [], next_cursor: null }); await flush();
    const second = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(second.promise);
    const pending = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh();
    nodes = render(); expect(nodes.find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0); expect(nodes.some(node => node.props.children === '加载中…')).toBe(false);
    second.resolve({ items: [item(11)], next_cursor: 'more' }); await pending; await flush();
    const more = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(more.promise);
    render().find(node => node.type === 'ScrollView').props.onScrollToLower(); nodes = render();
    expect(nodes.filter(node => node.props.className === 'privateConversation')).toHaveLength(1);
    expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0); expect(nodes.filter(node => node.props.children === '加载中…')).toHaveLength(1);
    more.resolve({ items: [], next_cursor: null }); await flush();
  });
  it('pull refresher replaces both first pages, waits for both settlements and rejects double pulls', async () => {
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [item(11)], next_cursor: 'old0' }).mockResolvedValueOnce({ items: [item(12)], next_cursor: 'old1' });
    render(); await flush();
    const first = deferred<any>(); const second = deferred<any>();
    vi.mocked(getMessageConversations).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const scroll = render().find(node => node.type === 'ScrollView')!;
    const pending = scroll.props.onRefresherRefresh(); scroll.props.onRefresherRefresh();
    expect(getMessageConversations).toHaveBeenCalledTimes(4);
    expect(vi.mocked(getMessageConversations).mock.calls.slice(2).map(call => call[0])).toEqual([{ bucket: 0 }, { bucket: 1 }]);
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    first.resolve({ items: [item(20)], next_cursor: 'new0' }); await flush();
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    second.reject({ code: 'NETWORK' }); await pending; await flush();
    const nodes = render(); expect(nodes.find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false);
    expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([item(20)]);
    expect(runtime.page.store.snapshot().data.buckets[0].cursor).toBe('new0');
    expect(nodes.some(node => node.props.className === 'privateMessageError')).toBe(true);
    expect(runtime.page.refresh).not.toHaveBeenCalled();
  });
  it('pull during automatic refresh joins both real requests instead of dropping the gesture; unverified pulls remain blocked', async () => {
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise);
    render(); const scroll = render().find(node => node.type === 'ScrollView')!;
    const pulling = scroll.props.onRefresherRefresh(); expect(getMessageConversations).toHaveBeenCalledTimes(2);
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    pending.resolve({ items: [], next_cursor: null }); await pulling; await flush();
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false);
    runtime.page.store.bindUid(7, false);
    const cached = render().find(node => node.type === 'ScrollView')!;
    expect(cached.props.refresherEnabled).toBe(false); await cached.props.onRefresherRefresh(); expect(getMessageConversations).toHaveBeenCalledTimes(2);
  });
  it('cold list verifies page UID before both file scopes and refreshes both buckets with no tabs or compose row', async () => {
    vi.mocked(privateMessageFileCache.get).mockReturnValue({ items: [item(11)], next_cursor: null });
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise);
    const store = runtime.page.store; store.bindUid(7, false); privateMessageMemory.authorize(7);
    render(); expect(privateMessageFileCache.get).not.toHaveBeenCalled(); expect(getMessageConversations).not.toHaveBeenCalled();
    store.bindUid(7, true); const nodes = render();
    expect(store.snapshot().data.buckets[0].items).toEqual([item(11)]); expect(store.snapshot().data.buckets[1].loading).toBe(false); expect(store.snapshot().data.buckets[1].completed).toBe(true);
    expect(privateMessageFileCache.get).toHaveBeenCalledWith(7, 'list:0', 1); expect(privateMessageFileCache.get).toHaveBeenCalledWith(7, 'list:1', 1);
    expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 0 }); expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 1 });
    expect(nodes.some(node => node.props.className === 'privateMessageTabs' || node.props.className === 'privateMessageSectionHeading')).toBe(false);
    expect(privateMessageFileCache.put).not.toHaveBeenCalled(); pending.resolve({ items: [], next_cursor: null }); await flush();
    expect(store.snapshot().data.buckets[0].items).toEqual([]); expect(privateMessageFileCache.put).toHaveBeenCalledTimes(2);
  });
  it.each(['empty', 'rows'] as const)('uses legal %s cache before silent automatic GETs and force-pull joins their true settlement', async kind => {
    const cached = { items: kind === 'rows' ? [item(11)] : [], next_cursor: null };
    privateMessageMemory.put(7, 'list:0', cached); privateMessageMemory.put(7, 'list:1', { items: [], next_cursor: null });
    const first = deferred<any>(), second = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    render(); let nodes = render();
    expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0); expect(nodes.map(text).join('')).not.toContain('刷新中');
    expect(runtime.page.store.snapshot().data.buckets[0].completed).toBe(true); expect(runtime.page.store.snapshot().data.buckets[0].loading).toBe(false);
    if (kind === 'rows') expect(nodes.filter(node => node.props.className === 'privateConversation')).toHaveLength(1);
    else expect(nodes.map(text).join('')).toContain('暂无私信');
    const pulling = nodes.find(node => node.type === 'ScrollView').props.onRefresherRefresh();
    expect(getMessageConversations).toHaveBeenCalledTimes(2); expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    first.resolve({ items: [item(20)], next_cursor: null }); await flush(); expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    second.reject({ code: 'NETWORK' }); await pulling; await flush(); nodes = render();
    expect(nodes.find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false); expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([item(20)]);
  });
  it('mixed empty cache and unknown bucket stays neutral without replacing cached first paint by loading or claiming empty', async () => {
    privateMessageMemory.put(7, 'list:0', { items: [], next_cursor: null });
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise); render();
    const nodes = render(); expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0);
    expect(nodes.map(text).join('')).not.toContain('私信记录尚未确认'); expect(nodes.map(text).join('')).not.toContain('暂无私信');
    expect(runtime.page.store.snapshot().data.buckets[0].completed).toBe(true); expect(runtime.page.store.snapshot().data.buckets[1].completed).toBe(false);
    pending.resolve({ items: [], next_cursor: null }); await flush(); expect(render().map(text).join('')).toContain('暂无私信');
  });
  it('cached refresh failure preserves rows and independent cursors; retry actually sends another GET', async () => {
    privateMessageMemory.put(7, 'list:0', { items: [item(11)], next_cursor: 'cache-cursor' });
    privateMessageMemory.put(7, 'list:1', { items: [], next_cursor: null });
    vi.mocked(getMessageConversations).mockRejectedValueOnce({ code: 'NETWORK' }).mockResolvedValueOnce({ items: [], next_cursor: null });
    render(); await flush(); let nodes = render();
    expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0); expect(nodes.filter(node => node.props.className === 'privateConversation')).toHaveLength(1);
    expect(runtime.page.store.snapshot().data.buckets[0].cursor).toBe('cache-cursor'); expect(runtime.page.store.snapshot().data.buckets[0].completed).toBe(true);
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [item(22)], next_cursor: null });
    await nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); await flush();
    expect(getMessageConversations).toHaveBeenCalledTimes(3); expect(getMessageConversations).toHaveBeenLastCalledWith({ bucket: 0 });
    expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([item(22)]);
  });
  it('no cache stays unknown on failure rather than inventing an empty list and can retry', async () => {
    vi.mocked(getMessageConversations).mockRejectedValue({ code: 'INVALID_RESPONSE' }); render(); await flush();
    let nodes = render(); expect(nodes.map(text).join('')).not.toContain('暂无私信'); expect(nodes.filter(node => node.type === 'Loading')).toHaveLength(0);
    expect(runtime.page.store.snapshot().data.buckets[0].completed).toBe(false);
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [], next_cursor: null });
    await nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); await flush();
    expect(getMessageConversations).toHaveBeenCalledTimes(3); expect(runtime.page.store.snapshot().data.buckets[0].completed).toBe(true);
    expect(render().map(text).join('')).not.toContain('暂无私信');
  });
  it('pull during pagination waits for continuation then issues a real first GET per bucket and waits for both', async () => {
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [item(11)], next_cursor: 'zero' }).mockResolvedValueOnce({ items: [item(12)], next_cursor: 'one' });
    render(); await flush(); const more0 = deferred<any>(), more1 = deferred<any>(), first0 = deferred<any>(), first1 = deferred<any>();
    vi.mocked(getMessageConversations).mockReturnValueOnce(more0.promise).mockReturnValueOnce(more1.promise).mockReturnValueOnce(first0.promise).mockReturnValueOnce(first1.promise);
    render().find(node => node.type === 'ScrollView').props.onScrollToLower();
    const pulling = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh(); expect(getMessageConversations).toHaveBeenCalledTimes(4);
    more0.resolve({ items: [item(13)], next_cursor: null }); await flush(); expect(getMessageConversations).toHaveBeenCalledTimes(5);
    more1.reject({ code: 'NETWORK' }); await flush(); expect(getMessageConversations).toHaveBeenCalledTimes(6);
    expect(vi.mocked(getMessageConversations).mock.calls.slice(4).map(call => call[0])).toEqual([{ bucket: 0 }, { bucket: 1 }]);
    first0.resolve({ items: [item(20)], next_cursor: null }); await flush(); expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true);
    first1.resolve({ items: [], next_cursor: null }); await pulling; await flush();
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false); expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([item(20)]);
  });
  it.each(['hide', 'account', 'uid'] as const)('queued first GET and late pagination are refused after %s changes its scope', async reason => {
    vi.mocked(getMessageConversations).mockResolvedValue({ items: [item(11)], next_cursor: 'opaque' }); render(); await flush();
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise);
    render().find(node => node.type === 'ScrollView').props.onScrollToLower(); const pulling = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh();
    if (reason === 'hide') runtime.page.store.hide();
    if (reason === 'account') runtime.account = 'other-user';
    if (reason === 'uid') runtime.page.store.bindUid(9);
    pending.resolve({ items: [item(33)], next_cursor: null }); await pulling; await flush();
    expect(getMessageConversations).toHaveBeenCalledTimes(4); expect(runtime.page.store.snapshot().data.buckets[0].items.some((value: any) => value.id === 33)).toBe(false);
    expect(render().some(node => node.type === 'ScrollView' && node.props.refresherTriggered)).toBe(false);
  });
  it('old-scope settlement cannot clear a reentered first-page flight or stop its refresher', async () => {
    const old = deferred<any>(), current0 = deferred<any>(), current1 = deferred<any>();
    vi.mocked(getMessageConversations).mockReturnValueOnce(old.promise).mockReturnValueOnce(old.promise).mockReturnValueOnce(current0.promise).mockReturnValueOnce(current1.promise);
    render(); const oldPull = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh();
    const store = runtime.page.store; store.hide(); store.activate(runtime.account); store.bindUid(7); render();
    const pulling = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh(); expect(getMessageConversations).toHaveBeenCalledTimes(4);
    old.resolve({ items: [item(99)], next_cursor: null }); await oldPull; await flush();
    expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(true); expect(store.snapshot().data.buckets[0].items).toEqual([]);
    current0.resolve({ items: [item(22)], next_cursor: null }); current1.resolve({ items: [], next_cursor: null }); await pulling; await flush();
    expect(store.snapshot().data.buckets[0].items).toEqual([item(22)]); expect(render().find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false);
  });
  it('publishes a bucket flight before synchronous subscribers can reenter the same retry', async () => {
    vi.mocked(getMessageConversations).mockRejectedValueOnce({ code: 'NETWORK' }).mockResolvedValueOnce({ items: [], next_cursor: null }); render(); await flush();
    const retry = render().find(node => node.props.className === 'privateMessageError').props.onClick;
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValueOnce(pending.promise);
    let reentered = false; const unsubscribe = runtime.page.store.subscribe(() => { if (!reentered) { reentered = true; retry(); } });
    const reading = retry(); expect(getMessageConversations).toHaveBeenCalledTimes(3); unsubscribe();
    pending.resolve({ items: [item(22)], next_cursor: null }); await reading; await flush();
    expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([item(22)]);
  });
  it('settles a real pull even when a store success/failure subscriber throws without echoing private errors', async () => {
    vi.mocked(getMessageConversations).mockResolvedValue({ items: [], next_cursor: null }); render(); await flush();
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise);
    const pulling = render().find(node => node.type === 'ScrollView').props.onRefresherRefresh();
    const unsubscribe = runtime.page.store.subscribe(() => { throw new Error('synthetic callback failure'); });
    pending.resolve({ items: [item(22)], next_cursor: null }); await pulling; unsubscribe(); await flush();
    const nodes = render(); expect(nodes.find(node => node.type === 'ScrollView').props.refresherTriggered).toBe(false);
    expect(nodes.map(text).join('')).not.toContain('synthetic callback failure');
  });
  it('deduplicates CID before peer rows and unread; preserves partial success and retries only failed bucket', async () => {
    const first = deferred<any>(); const second = deferred<any>();
    vi.mocked(getMessageConversations).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue({ items: [item(11, 8, 2), item(12, 8, 3), item(20, 9)], next_cursor: null });
    render(); first.resolve({ items: [item(11, 8, 2)], next_cursor: null }); second.reject({ code: 'NETWORK' }); await flush();
    let nodes = render(); expect(nodes.filter(node => node.props.className === 'privateConversation')).toHaveLength(1);
    expect(nodes.map(text).join('')).not.toContain('暂无私信'); nodes.find(node => node.props.className === 'privateMessageError').props.onClick(); await flush();
    expect(getMessageConversations).toHaveBeenLastCalledWith({ bucket: 1 }); nodes = render();
    expect(nodes.filter(node => node.props.className === 'privateConversation')).toHaveLength(2);
    expect(nodes.filter(node => node.props.className === 'privateMessageCount').map(text)).toEqual(['1', '5']);
  });
  it('cursors remain opaque and independent, pagination does not persist combined pages and event carries all discovered CID metadata', async () => {
    privateMessageMemory.authorize(7);
    vi.mocked(getMessageConversations).mockResolvedValueOnce({ items: [item(11)], next_cursor: 'zero/opaque' }).mockResolvedValueOnce({ items: [item(12)], next_cursor: 'one+opaque' })
      .mockResolvedValueOnce({ items: [item(13)], next_cursor: 'zero/opaque' }).mockResolvedValueOnce({ items: [item(14)], next_cursor: null });
    render(); await flush(); let nodes = render(); nodes.find(node => node.type === 'ScrollView').props.onScrollToLower(); await flush();
    expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 0, cursor: 'zero/opaque' }); expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 1, cursor: 'one+opaque' });
    expect(runtime.page.store.snapshot().data.buckets[0].cursor).toBeNull(); expect(privateMessageFileCache.put).toHaveBeenCalledTimes(2);
    const emit = vi.fn(); vi.mocked(Taro.navigateTo).mockImplementation((options: any) => { options.success({ eventChannel: { emit } }); return Promise.resolve({} as any); });
    nodes = render(); nodes.find(node => node.props.className === 'privateConversation').props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/secondary/messages/thread?cid=14&peer=8' }));
    const event = emit.mock.calls[0][1]; expect(event.conversations.map((value: any) => value.id)).toEqual([14, 13, 12, 11]);
    expect(event.conversations.every((value: any) => value.preview === '')).toBe(true);
  });
  it('hidden late pages cannot change list or write disk and delayed navigation rejects changed accounts', async () => {
    privateMessageMemory.authorize(7); const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise); render();
    runtime.page.store.hide(); pending.resolve({ items: [item(11)], next_cursor: null }); await flush(); expect(privateMessageFileCache.put).not.toHaveBeenCalled();
    expect(runtime.page.store.snapshot().data.buckets[0].items).toEqual([]);
  });
});
