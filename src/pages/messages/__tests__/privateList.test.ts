import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { getMessageConversations } from 'guanggu-forum-api';
import { MessageConversationList, emptyList } from '../index';
import { PrivatePageState } from '../privateState';
import { privateMessageMemory } from '../privateMemory';
import { privateMessageFileCache } from '../../../utils/privateMessageFileCache';

const runtime = vi.hoisted(() => ({ page: null as any, account: 'fixture-user', refs: [] as any[], cursor: 0, effects: [] as any[], effectCursor: 0, work: [] as any[] }));
vi.mock('react', () => ({
  useCallback: (fn: any, deps: any[]) => { const i = runtime.cursor++; const old = runtime.refs[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) runtime.refs[i] = { deps, fn }; return runtime.refs[i].fn; },
  useEffect: (fn: any, deps: any[]) => { const i = runtime.effectCursor++; const previous = runtime.effects[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) runtime.work.push(() => { previous?.cleanup?.(); runtime.effects[i] = { deps, cleanup: fn() }; }); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn() } }));
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
  runtime.cursor = runtime.effectCursor = 0; const snapshot = runtime.page.store.snapshot();
  runtime.page.snapshot = snapshot; runtime.page.data = snapshot.data; runtime.page.ready = snapshot.visible && snapshot.uid > 0;
  const nodes = all(MessageConversationList({ initialBucket: 1 })); runtime.work.splice(0).forEach(effect => effect()); return nodes;
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.refs = []; runtime.work = []; runtime.account = 'fixture-user';
  privateMessageMemory.accountChanged('signed-out'); vi.mocked(getMessageConversations).mockReset(); vi.mocked(Taro.navigateTo).mockReset();
  vi.mocked(privateMessageFileCache.get).mockReset(); vi.mocked(privateMessageFileCache.put).mockReset(); vi.mocked(privateMessageFileCache.protect).mockClear();
  const store = new PrivatePageState(emptyList, () => runtime.account); store.activate(runtime.account); store.bindUid(7);
  runtime.page = { store, summary: null, username: runtime.account, loading: false, identityError: false, error: false, refresh: vi.fn() };
});

describe('unified conversation list independent buckets', () => {
  it('cold list verifies page UID before both file scopes and refreshes both buckets with no tabs or compose row', async () => {
    vi.mocked(privateMessageFileCache.get).mockReturnValue({ items: [item(11)], next_cursor: null });
    const pending = deferred<any>(); vi.mocked(getMessageConversations).mockReturnValue(pending.promise);
    const store = runtime.page.store; store.bindUid(7, false); privateMessageMemory.authorize(7);
    render(); expect(privateMessageFileCache.get).not.toHaveBeenCalled(); expect(getMessageConversations).not.toHaveBeenCalled();
    store.bindUid(7, true); const nodes = render();
    expect(store.snapshot().data.buckets[0].items).toEqual([item(11)]); expect(store.snapshot().data.buckets[1].loading).toBe(true);
    expect(privateMessageFileCache.get).toHaveBeenCalledWith(7, 'list:0', 1); expect(privateMessageFileCache.get).toHaveBeenCalledWith(7, 'list:1', 1);
    expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 0 }); expect(getMessageConversations).toHaveBeenCalledWith({ bucket: 1 });
    expect(nodes.some(node => node.props.className === 'privateMessageTabs' || node.props.className === 'privateMessageSectionHeading')).toBe(false);
    expect(privateMessageFileCache.put).not.toHaveBeenCalled(); pending.resolve({ items: [], next_cursor: null }); await flush();
    expect(store.snapshot().data.buckets[0].items).toEqual([]); expect(privateMessageFileCache.put).toHaveBeenCalledTimes(2);
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
