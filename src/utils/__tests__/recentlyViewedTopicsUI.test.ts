import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import RecentlyViewedTopics from '../../components/RecentlyViewedTopics';
import { getRecentlyViewedTopics, clearRecentlyViewedTopics } from 'guanggu-forum-api';
import { clearLocalRecentlyViewedTopics, getLocalRecentlyViewedTopics } from '../recentlyViewedTopics';

const runtime = vi.hoisted(() => ({ account: 'fixture-user', state: [] as any[], cursor: 0, effects: [] as any[], effectCursor: 0, work: [] as any[], listeners: new Set<any>(), records: new Map<string, any[]>() }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = typeof initial === 'function' ? initial() : initial; return [runtime.state[i], (next: any) => { runtime.state[i] = next; }]; },
  useEffect: (fn: any, deps: any[]) => { const i = runtime.effectCursor++; const old = runtime.effects[i]; if (!old || deps.some((value, index) => value !== old.deps[index])) runtime.work.push(() => { old?.cleanup?.(); runtime.effects[i] = { deps, cleanup: fn() }; }); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Button: 'Button' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn(), showModal: vi.fn(), showToast: vi.fn() } }));
vi.mock('guanggu-forum-api', () => ({ getRecentlyViewedTopics: vi.fn(), clearRecentlyViewedTopics: vi.fn() }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => runtime.account }));
vi.mock('../recentlyViewedTopics', () => ({
  getLocalRecentlyViewedTopics: vi.fn((username: string) => runtime.records.get(username) || []),
  clearLocalRecentlyViewedTopics: vi.fn(),
  subscribeRecentlyViewedTopics: (listener: any) => { runtime.listeners.add(listener); return () => runtime.listeners.delete(listener); },
}));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline' }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
function all(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(all); if (!tree || typeof tree !== 'object') return []; return [tree, ...all(tree.props?.children)]; }
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(''); if (typeof tree === 'string' || typeof tree === 'number') return String(tree); return tree?.props ? text(tree.props.children) : ''; }
function render(username = runtime.account, active = true) {
  runtime.cursor = runtime.effectCursor = 0; const nodes = all(RecentlyViewedTopics({ username, active })); runtime.work.splice(0).forEach(effect => effect()); return nodes;
}
const record = (tid: number, title: string) => ({ tid, title, author: 'fixture-peer', avatarUrl: '/static/avatar/fixture.png', viewedAt: 1700000000000 });
function expectLocalOnly(nodes: any[]) {
  expect(nodes.some(node => node.type === 'Button')).toBe(false);
  expect(nodes.map(text).join('')).not.toMatch(/清除|服务器|同步|请求|点击重试/);
  expect(getRecentlyViewedTopics).not.toHaveBeenCalled(); expect(clearRecentlyViewedTopics).not.toHaveBeenCalled(); expect(clearLocalRecentlyViewedTopics).not.toHaveBeenCalled(); expect(Taro.showModal).not.toHaveBeenCalled();
}
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.state = []; runtime.effects = []; runtime.work = []; runtime.account = 'fixture-user'; runtime.records = new Map([['fixture-user', [record(11, 'Local fixture')]]]);
  vi.mocked(Taro.navigateTo).mockClear(); vi.mocked(Taro.showModal).mockClear(); vi.mocked(getLocalRecentlyViewedTopics).mockClear(); vi.mocked(getRecentlyViewedTopics).mockClear(); vi.mocked(clearRecentlyViewedTopics).mockClear(); vi.mocked(clearLocalRecentlyViewedTopics).mockClear();
});

describe('local-only recently viewed topics UI', () => {
  it('shows local title/avatar/time without any fetch, clear control or server notice; click opens actual topic', () => {
    const nodes = render(); expect(nodes.map(text).join('')).toContain('Local fixture');
    expect(nodes.find(node => node.type === 'UserAvatar').props).toMatchObject({ src: '/static/avatar/fixture.png', username: 'fixture-peer' });
    expect(nodes.find(node => node.props.className === 'recentViewedTime')).toBeDefined(); expectLocalOnly(nodes);
    nodes.find(node => node.props.className === 'recentViewedItem').props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=11' });
  });
  it('local record subscription updates immediately, including inactive mounted views, without network', () => {
    render('fixture-user', false); runtime.records.set('fixture-user', [record(12, 'New local fixture')]); runtime.listeners.forEach(listener => listener());
    const nodes = render('fixture-user', false); expect(nodes.map(text).join('')).toContain('New local fixture'); expectLocalOnly(nodes);
  });
  it('guest to user and user to guest scope changes never flash prior-account records before effects', () => {
    runtime.records.set('', [record(13, 'Guest fixture')]); runtime.account = ''; render();
    runtime.account = 'fixture-user'; let nodes = render(); expect(nodes.map(text).join('')).not.toContain('Guest fixture');
    nodes = render(); expect(nodes.map(text).join('')).toContain('Local fixture');
    runtime.account = ''; nodes = render(); expect(nodes.map(text).join('')).not.toContain('Local fixture');
    nodes = render(); expect(nodes.map(text).join('')).toContain('Guest fixture'); expectLocalOnly(nodes); expect(runtime.listeners.size).toBe(1);
  });
  it('empty local history displays the ordinary empty message without remote fallback', () => {
    runtime.records.clear(); const nodes = render(); expect(nodes.map(text).join('')).toContain('暂无浏览记录'); expectLocalOnly(nodes);
  });
  it('account mismatch hides data and stale row clicks cannot navigate after account changes', () => {
    const nodes = render(); const row = nodes.find(node => node.props.className === 'recentViewedItem'); runtime.account = 'other-user';
    row.props.onClick(); expect(Taro.navigateTo).not.toHaveBeenCalled(); const changed = render('fixture-user');
    expect(changed.map(text).join('')).not.toContain('Local fixture'); expectLocalOnly(changed);
  });
  it('unmount removes the local subscription', () => {
    render(); expect(runtime.listeners.size).toBe(1); runtime.effects.forEach(effect => effect.cleanup?.()); expect(runtime.listeners.size).toBe(0);
  });
});
