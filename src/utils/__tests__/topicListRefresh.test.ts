import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import React from 'react';
import { document } from '@tarojs/runtime';
import { render as renderNative, unmountComponentAtNode } from '@tarojs/react';
import { createRequire } from 'node:module';
import { getNodeTopics, getRecentTopics, type TopicSummary } from 'guanggu-forum-api';
import TopicList from '../../pages/home/topics/topicList';
import HomeTopics from '../../pages/home/topics';
import NodeTopics from '../../pages/node/topicList';
import { fetchAndCacheNodeNavigation } from '../nodeNavigation';

const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0, effects: [] as any[], refs: [] as any[], refCursor: 0, theme: 'light' }));
vi.mock('react', async original => ({
  ...await original<any>(),
  useState(initial: any) {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === 'function' ? initial() : initial;
    return [harness.values[index], (next: any) => {
      harness.values[index] = typeof next === 'function' ? next(harness.values[index]) : next;
    }];
  },
  useRef: (initial: any) => { const index = harness.refCursor++; return harness.refs[index] ??= { current: initial }; },
  useEffect: (effect: any) => { harness.effects.push(effect); },
}));
vi.mock('@tarojs/components', () => Object.fromEntries(['OpenContainer', 'ScrollView', 'ShareElement', 'Text', 'View', 'Image'].map(name => [name, name])));
vi.mock('@tarojs/taro', () => ({
  default: { getDeviceInfo: vi.fn(() => ({ platform: 'ios' })), createSelectorQuery: vi.fn(), eventCenter: { on: vi.fn(), off: vi.fn() }, nextTick: vi.fn(), showNavigationBarLoading: vi.fn(), hideNavigationBarLoading: vi.fn(), showToast: vi.fn() },
  useReady: vi.fn(), useRouter: () => ({ params: { node: 'water' } }),
}));
vi.mock('guanggu-forum-api', () => ({
  getHotNodes: vi.fn(), getNodeTopics: vi.fn(), getRecentTopics: vi.fn(),
  createApiCacheEntry: vi.fn(), readApiCacheEntry: vi.fn(), URLS: { TOPIC_DETAIL: '/t/:tid' },
}));
vi.mock('../../hooks/usePageRenderer', () => ({ PageRendererContext: {}, usePageRenderer: () => 'webview', usePageScrollViewType: () => undefined }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: harness.theme }) }));
vi.mock('../../hooks/useDataWithCache', () => ({ useDataWithCache: () => ({ request: vi.fn() }) }));
vi.mock('../nodeNavigation', () => ({ fetchAndCacheNodeNavigation: vi.fn(), getCachedNodeNavigation: () => [] }));
vi.mock('../CacheService', () => ({ cacheService: { get: vi.fn() }, CacheCategory: {} }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../components/PullDownRefresh', () => ({ default: 'PullDownRefresh' }));
vi.mock('../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../components/SearchEntry', () => ({ default: 'SearchEntry' }));
vi.mock('../../components/PinnedTopicCard', () => ({ default: 'PinnedTopicCard' }));

function makeList(getTopics: any, extra = {}) {
  const list = new TopicList({ getTopics, ...extra }, {});
  list.updateTopicIndex = vi.fn();
  list.setState = vi.fn((next: any, callback?: () => void) => {
    const patch = typeof next === 'function' ? next(list.state) : next;
    list.state = { ...list.state, ...patch }; callback?.();
  }) as any;
  return list;
}
function deferred() {
  let resolve!: (value: any[]) => void;
  const promise = new Promise<any[]>(done => { resolve = done; });
  return { promise, resolve };
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
beforeEach(() => {
  vi.clearAllMocks(); harness.values = []; harness.cursor = 0; harness.effects = []; harness.refs = []; harness.refCursor = 0;
  vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([]);
  harness.theme = 'light';
  vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'ios' } as any);
});

describe('desktop viewport sizing without resize remounts', () => {
  it.each([0, 400, '100%'])('forwards actual ScrollView height %s without adding px', height => {
    const list = makeList(vi.fn(), { style: { height } });
    list.setState({ topics: [{ link: '/t/1', title: 'Fixture sizing topic', username: 'fixture-account', category: '水', lastUpdated: '', userLink: '/u/fixture-account', userAvatarUrl: '', commentCount: '' }] });
    expect(elements(list.render()).find(node => node.type === 'ScrollView').props.style).toEqual({ height });
  });
  it.each(['windows', 'mac'])('uses flex height and stable list keys on %s', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const first = HomeTopics({});
    const firstList = elements(first).find(node => node.type === TopicList);
    expect(firstList.props.style).toEqual({ height: '100%' });
    harness.effects[2]();
    expect(Taro.nextTick).not.toHaveBeenCalled();
    expect(elements(first).find(node => node.props?.id === 'tab_0').props.style.lineHeight).toBe('27px');
    expect(elements(first).find(node => node.props?.id === 'tab_0').props.style.boxShadow).toBe('0 2px 6px rgba(31, 105, 255, 0.15)');
    harness.cursor = 0; harness.refCursor = 0;
    const nextList = elements(HomeTopics({})).find(node => node.type === TopicList);
    expect(nextList.key).toBe(firstList.key);
    expect(harness.values[0]).toBe(0);
    elements(first).find(node => node.props?.id === 'tab_1').props.onClick();
    harness.cursor = 0; harness.refCursor = 0;
    expect(elements(HomeTopics({})).find(node => node.props?.className === 'tab-scroll').props.scrollIntoView).toBe('tab_1');
    expect(Taro.createSelectorQuery).not.toHaveBeenCalled();
    harness.theme = 'dark'; harness.cursor = 0; harness.refCursor = 0;
    expect(elements(HomeTopics({})).find(node => node.props?.id === 'tab_1').props.style.lineHeight).toBe('26px');
  });
});

describe('pagination preserves the owning native scroll subtree', () => {
  function syntheticTopic(tid: number): TopicSummary {
    return { link: `/t/${tid}`, title: `Synthetic topic ${tid}`, username: 'synthetic', category: '水', lastUpdated: '', userLink: '/u/synthetic', userAvatarUrl: '', commentCount: '' };
  }
  // Render the real TopicList JSX through the installed Taro reconciler. The
  // synthetic leaf hosts avoid images/network; runtime DOM/payloads stay real.
  function nativeTree(tree: any, flattenFooter = false): any {
    if (Array.isArray(tree)) return tree.map(child => nativeTree(child, flattenFooter));
    if (!tree || typeof tree !== 'object') return tree;
    const { children, ...props } = tree.props;
    if (flattenFooter && props.className === 'topicListLoadingHost') return nativeTree(children, true);
    const tag = tree.type === 'ScrollView' ? 'scroll-view' : 'view';
    const nativeChildren = tree.props.topic ? tree.props.topic.link : nativeTree(children, flattenFooter);
    return React.createElement(tag, { ...props, ...(tree.key === null ? {} : { key: tree.key }) },
      ...(Array.isArray(nativeChildren) ? nativeChildren : [nativeChildren]));
  }
  function nativeNodes(node: any): any[] { return [node, ...node.childNodes.flatMap(nativeNodes)]; }
  it('demonstrates the previous direct-sibling loading deletion replaces the native parent children array', () => {
    const list = makeList(vi.fn()); list.setState({ topics: [syntheticTopic(1)], loading: false });
    const root = document.createElement('root') as any;
    try {
      renderNative(nativeTree(list.render(), true), root, () => {});
      const scroll = nativeNodes(root).find(node => node.nodeName === 'scroll-view');
      const parentChildrenPath = `${scroll.parentNode._path}.cn`;
      root.updatePayloads = [];
      list.setState({ loading: true }); renderNative(nativeTree(list.render(), true), root, () => {});
      expect(root.updatePayloads.some((payload: any) => payload.path === parentChildrenPath)).toBe(false);
      root.updatePayloads = [];
      list.setState({ loading: false }); renderNative(nativeTree(list.render(), true), root, () => {});
      expect(root.updatePayloads.some((payload: any) => payload.path === parentChildrenPath)).toBe(true);
      expect(nativeNodes(root).find(node => node.nodeName === 'scroll-view')).toBe(scroll);
    } finally { unmountComponentAtNode(root); }
  });
  it('keeps an idle footer host empty and free from authored spacing or height', () => {
    const list = makeList(vi.fn());
    list.setState({ topics: [syntheticTopic(1)], loading: false });
    const host = elements(list.render()).find(node => node.props?.className === 'topicListLoadingHost');
    expect(host.props.children).toBe(false); expect(host.props.style).toBeUndefined();
    const requireProject = createRequire(`${process.cwd()}/package.json`);
    const values: Record<string, string> = {};
    requireProject('postcss').parse(requireProject('sass').compile('src/pages/home/topics/topicList/index.scss').css).walkRules((rule: any) => {
      if (rule.selectors.includes('.topicListLoadingHost')) rule.walkDecls((decl: any) => { values[decl.prop] = decl.value; });
    });
    expect(values).toEqual({ margin: '0', padding: '0', 'min-height': '0', flex: 'none' });
  });
  it.each(['skyline', 'webview'])('isolates both pagination loading edges from the %s ScrollView children array', async renderer => {
    const firstTopics = [syntheticTopic(1), syntheticTopic(2)];
    const page = deferred();
    const getTopics = vi.fn().mockResolvedValueOnce(firstTopics).mockReturnValueOnce(page.promise);
    const list = makeList(getTopics, { style: { height: 400 } });
    list.context = renderer;
    await list.refreshTopics(false);
    elements(list.render()).find(node => node.type === 'ScrollView').props.onScroll({ detail: { scrollTop: 900 } });
    const root = document.createElement('root') as any;
    try {
      renderNative(nativeTree(list.render()), root, () => {});
      const scroll = nativeNodes(root).find(node => node.nodeName === 'scroll-view');
      const firstItems = scroll.childNodes.slice(1).map((node: any) => node.sid);
      const parentChildrenPath = `${scroll.parentNode._path}.cn`;
      const height = scroll.style.height;
      root.updatePayloads = [];
      const pending = list.listReachBottom();
      renderNative(nativeTree(list.render()), root, () => {});
      expect(nativeNodes(root).find(node => node.nodeName === 'scroll-view')).toBe(scroll);
      expect(root.updatePayloads.some((payload: any) => payload.path === parentChildrenPath)).toBe(false);
      expect(scroll.style.height).toBe(height);
      expect(list.state.scrollTop).toBeUndefined();
      root.updatePayloads = [];
      page.resolve([syntheticTopic(3), syntheticTopic(4)]); await pending;
      renderNative(nativeTree(list.render()), root, () => {});
      expect(nativeNodes(root).find(node => node.nodeName === 'scroll-view')).toBe(scroll);
      expect(scroll.childNodes.slice(1, 3).map((node: any) => node.sid)).toEqual(firstItems);
      expect(scroll.childNodes).toHaveLength(5);
      expect(root.updatePayloads.some((payload: any) => payload.path === parentChildrenPath)).toBe(false);
      expect(scroll.style.height).toBe(height);
      expect(list.state.scrollTop).toBeUndefined();
      expect(getTopics).toHaveBeenLastCalledWith(2, { cache: false });
      const oldRefresh = getTopics.mock.calls[0][1].onRefresh;
      oldRefresh([syntheticTopic(99)]);
      expect(list.state.topics.map(topic => topic.link)).toEqual(['/t/1', '/t/2', '/t/3', '/t/4']);
    } finally { unmountComponentAtNode(root); }
  });
  it.each(['skyline', 'webview'])('retains the %s native viewport and zero-gap host through pagination failure and retry', async renderer => {
    const retry = deferred();
    const getTopics = vi.fn().mockResolvedValueOnce([syntheticTopic(1)])
      .mockRejectedValueOnce(new Error('synthetic offline')).mockReturnValueOnce(retry.promise);
    const list = makeList(getTopics, { style: { height: '100%' } }); list.context = renderer;
    await list.refreshTopics(false);
    elements(list.render()).find(node => node.type === 'ScrollView').props.onScroll({ detail: { scrollTop: 500 } });
    const root = document.createElement('root') as any;
    try {
      renderNative(nativeTree(list.render()), root, () => {});
      const scroll = nativeNodes(root).find(node => node.nodeName === 'scroll-view');
      const host = nativeNodes(root).find(node => node.className === 'topicListLoadingHost');
      const parentChildrenPath = `${scroll.parentNode._path}.cn`;
      const assertStable = () => {
        expect(nativeNodes(root).find(node => node.nodeName === 'scroll-view')).toBe(scroll);
        expect(nativeNodes(root).find(node => node.className === 'topicListLoadingHost')).toBe(host);
        expect(root.updatePayloads.some((payload: any) => payload.path === parentChildrenPath)).toBe(false);
        expect(scroll.style.height).toBe('100%'); expect(list.state.scrollTop).toBeUndefined();
      };
      root.updatePayloads = [];
      const failed = list.listReachBottom(); renderNative(nativeTree(list.render()), root, () => {}); assertStable();
      expect(host.childNodes).toHaveLength(1);
      await failed; renderNative(nativeTree(list.render()), root, () => {}); assertStable();
      expect(host.childNodes).toHaveLength(0);
      root.updatePayloads = [];
      const pending = list.listReachBottom(); renderNative(nativeTree(list.render()), root, () => {}); assertStable();
      expect(host.childNodes).toHaveLength(1);
      retry.resolve([syntheticTopic(2)]); await pending; renderNative(nativeTree(list.render()), root, () => {}); assertStable();
      expect(host.childNodes).toHaveLength(0);
      expect(getTopics.mock.calls.slice(1).map(call => call[0])).toEqual([2, 2]);
    } finally { unmountComponentAtNode(root); }
  });
});

describe('returning to topic lists after publishing', () => {
  it.each(['  列表昵称 😀  ', '   ', undefined])('renders optional author display name without changing avatar identity (%s)', displayName => {
    const list = makeList(vi.fn());
    list.setState({ topics: [{ link: '/t/13', title: 'Fixture topic', username: 'fixture-account', userLink: '/u/fixture-account', displayName, userAvatarUrl: '', category: '水', lastUpdated: '', commentCount: '' }] });
    const item = elements(list.render()).find(node => node.props?.topic?.link === '/t/13');
    const component = typeof item.type === 'function' ? item.type : item.type.type;
    const nodes = elements(component(item.props));
    expect(nodes.find(node => node.props.className === 'userName').props.children).toBe(displayName?.trim() || 'fixture-account');
    expect(nodes.find(node => node.type === 'UserAvatar').props.username).toBe('fixture-account');
    expect(list.state.topics[0].username).toBe('fixture-account');
  });
  it('returns a refreshed list to the latest topics and releases controlled scroll position after scrolling', async () => {
    const getTopics = vi.fn().mockResolvedValue([{ link: '/t/1' }]);
    const list = makeList(getTopics);
    await list.scrollToTop();
    expect(getTopics).toHaveBeenCalledWith(1, { cache: false, onRefresh: expect.any(Function) });
    expect(list.state).toMatchObject({ loadingPage: 1, scrollTop: 0 });
    list.render().props.children[0].props.onScroll({ detail: { scrollTop: 100 } });
    expect(list.state.scrollTop).toBeUndefined();
    expect(Taro.hideNavigationBarLoading).toHaveBeenCalledOnce();
  });

  it('retains the active home sorting tab when refreshTopics is emitted', () => {
    HomeTopics({});
    harness.values[0] = 1;
    harness.values[3] = { 0: true, 1: true };
    const cleanup = harness.effects[3]();
    expect(Taro.eventCenter.on).toHaveBeenCalledWith('refreshTopics', expect.any(Function));
    vi.mocked(Taro.eventCenter.on).mock.calls[0][1]();
    expect(harness.values[0]).toBe(1);
    expect(harness.values[3]).toEqual({ 0: true, 1: true });
    expect(harness.values[4]).toBe(1);
    expect(harness.values[6]).toBe(1);
    harness.cursor = 0; harness.refCursor = 0;
    const lists = elements(HomeTopics({})).filter(element => element.type === TopicList);
    expect(lists.every(element => element.props.freshOnMount)).toBe(true);
    const options = { cache: false };
    lists[1].props.getTopics(1, options);
    expect(getRecentTopics).toHaveBeenCalledWith({ type: 'latest', page: 1 }, options);
    cleanup();
    expect(Taro.eventCenter.off).toHaveBeenCalled();
  });

  it('warms node navigation on every home mount even with a cache and catches offline failures', async () => {
    vi.mocked(fetchAndCacheNodeNavigation).mockRejectedValue(new Error('offline'));
    HomeTopics({});
    harness.effects[0]();
    harness.effects[0]();
    await Promise.resolve();
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledTimes(2);
  });

  it('consumes publication freshness per sorting tab and keeps later remounts cache-first', () => {
    const render = () => {
      harness.cursor = 0; harness.refCursor = 0;
      return elements(HomeTopics({})).filter(element => element.type === TopicList);
    };
    HomeTopics({});
    harness.values[3] = { 0: true, 1: true };
    harness.effects[3]();
    const publish = vi.mocked(Taro.eventCenter.on).mock.calls[0][1];
    publish();
    let lists = render();
    expect(lists.map(list => list.props.freshOnMount)).toEqual([true, true]);
    const oldCompletion = lists[0].props.onFreshLoad;
    lists[0].props.onFreshLoad();
    expect(render().map(list => list.props.freshOnMount)).toEqual([false, true]);
    lists[1].props.onFreshLoad();
    harness.values[4] += 1; // ordinary tab-switch remount
    expect(render().map(list => list.props.freshOnMount)).toEqual([false, false]);
    publish();
    oldCompletion(); // a delayed old generation cannot consume the next publication
    lists = render();
    expect(lists.map(list => list.props.freshOnMount)).toEqual([true, true]);
    lists[0].props.onFreshLoad();
    oldCompletion(); // nor regress consumption after a newer success
    expect(render().map(list => list.props.freshOnMount)).toEqual([false, true]);
    harness.values[3][2] = true;
    expect(render()[2].props.freshOnMount).toBe(true); // previously unopened sort still refreshes once
  });

  it('does not unmount a double-tap fresh request into a stale cache-first list', () => {
    vi.mocked(Taro.eventCenter.on).mockClear();
    const scrollToTop = vi.fn();
    HomeTopics({});
    harness.refs[1].current[0] = { scrollToTop };
    harness.cursor = 0; harness.refCursor = 0;
    const tree = elements(HomeTopics({}));
    const tab = tree.find(element => element.props?.id === 'tab_0');
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1100);
    tab.props.onClick();
    tab.props.onClick();
    expect(scrollToTop).toHaveBeenCalledOnce();
    expect(harness.values[4]).toBe(0);
    now.mockRestore();
  });

  it('marks freshness consumed only after a current successful uncached response', async () => {
    const onFreshLoad = vi.fn();
    const getTopics = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    const list = makeList(getTopics, { onFreshLoad });
    await list.refreshTopics();
    expect(onFreshLoad).not.toHaveBeenCalled();
    await list.refreshTopics();
    expect(onFreshLoad).toHaveBeenCalledOnce();
    await list.refreshTopics(false);
    expect(onFreshLoad).toHaveBeenCalledOnce();
    const pending = deferred();
    getTopics.mockReturnValueOnce(pending.promise);
    const request = list.refreshTopics();
    list.componentWillUnmount();
    pending.resolve([]);
    await request;
    expect(onFreshLoad).toHaveBeenCalledOnce();
  });

  it('applies background cache updates without snapping a browsing list back to the top', async () => {
    const getTopics = vi.fn().mockResolvedValue([{ link: '/t/1' }]);
    const list = makeList(getTopics);
    await list.refreshTopics(false);
    const options = getTopics.mock.calls[0][1];
    expect(options.cache).toBeUndefined();
    list.setState({ scrollTop: undefined });
    options.onRefresh([{ link: '/t/2' }]);
    expect(list.state.topics).toEqual([{ link: '/t/2' }]);
    expect(list.state.scrollTop).toBeUndefined();
  });

  it('uses fresh data even when a background callback arrives before the cached promise', async () => {
    const cached = deferred();
    const getTopics = vi.fn().mockReturnValue(cached.promise);
    const list = makeList(getTopics);
    const pending = list.refreshTopics(false);
    getTopics.mock.calls[0][1].onRefresh([{ link: '/t/2' }]);
    cached.resolve([{ link: '/t/1' }]);
    await pending;
    expect(list.state.topics).toEqual([{ link: '/t/2' }]);
  });

  it('ignores cached responses and callbacks after a fresh publication refresh', async () => {
    const cached = deferred();
    const getTopics = vi.fn().mockReturnValueOnce(cached.promise).mockResolvedValueOnce([{ link: '/t/2' }]);
    const list = makeList(getTopics);
    const pending = list.refreshTopics(false);
    const oldRefresh = getTopics.mock.calls[0][1].onRefresh;
    await list.scrollToTop();
    cached.resolve([{ link: '/t/1' }]);
    await pending;
    oldRefresh([{ link: '/t/1' }]);
    expect(list.state.topics).toEqual([{ link: '/t/2' }]);
  });

  it('does not append an old pagination response after resetting the list', async () => {
    const nextPage = deferred();
    const getTopics = vi.fn().mockResolvedValueOnce([{ link: '/t/1' }])
      .mockReturnValueOnce(nextPage.promise).mockResolvedValueOnce([{ link: '/t/3' }]);
    const list = makeList(getTopics);
    await list.refreshTopics(false);
    const pending = list.listReachBottom();
    await list.refreshTopics();
    nextPage.resolve([{ link: '/t/2' }]);
    await pending;
    expect(list.state).toMatchObject({ topics: [{ link: '/t/3' }], loadingPage: 1, loading: false });
  });

  it('coalesces repeated reach-bottom events and invalidates first-page cache callbacks', async () => {
    const page = deferred();
    const getTopics = vi.fn().mockResolvedValueOnce([{ link: '/t/1' }]).mockReturnValueOnce(page.promise);
    const list = makeList(getTopics);
    await list.refreshTopics(false);
    const firstRefresh = getTopics.mock.calls[0][1].onRefresh;
    const pending = list.listReachBottom();
    await list.listReachBottom();
    firstRefresh([{ link: '/t/99' }]);
    page.resolve([{ link: '/t/2' }]);
    await pending;
    expect(getTopics).toHaveBeenCalledTimes(2);
    expect(list.state.topics).toEqual([{ link: '/t/1' }, { link: '/t/2' }]);
    expect(list.state.loadingPage).toBe(2);
  });

  it('preserves existing data after refresh failure and allows retry', async () => {
    const getTopics = vi.fn().mockResolvedValueOnce([{ link: '/t/1' }])
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ link: '/t/2' }]);
    const list = makeList(getTopics);
    await list.refreshTopics(false);
    await list.refreshTopics();
    expect(list.state).toMatchObject({ topics: [{ link: '/t/1' }], loading: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '帖子列表加载失败，请重试', icon: 'none' });
    await list.refreshTopics();
    expect(list.state.topics).toEqual([{ link: '/t/2' }]);
  });

  it('releases pagination loading after a failure so the same page can be retried', async () => {
    const getTopics = vi.fn().mockResolvedValueOnce([{ link: '/t/1' }])
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ link: '/t/2' }]);
    const list = makeList(getTopics);
    await list.refreshTopics(false);
    await list.listReachBottom();
    expect(list.state).toMatchObject({ topics: [{ link: '/t/1' }], loadingPage: 1, loading: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '更多帖子加载失败，请重试', icon: 'none' });
    await list.listReachBottom();
    expect(getTopics.mock.calls.slice(1).map(call => call[0])).toEqual([2, 2]);
    expect(list.state.topics).toEqual([{ link: '/t/1' }, { link: '/t/2' }]);
  });

  it('ignores a pending request after unmount', async () => {
    const response = deferred();
    const getTopics = vi.fn().mockReturnValue(response.promise);
    const list = makeList(getTopics);
    const pending = list.refreshTopics(false);
    vi.mocked(list.setState).mockClear();
    list.componentWillUnmount();
    getTopics.mock.calls[0][1].onRefresh([{ link: '/t/1' }]);
    response.resolve([{ link: '/t/1' }]);
    await pending;
    expect(list.setState).not.toHaveBeenCalled();
  });

  it('bypasses cache on mount after a publishing refresh', async () => {
    const getTopics = vi.fn().mockResolvedValue([]);
    const list = makeList(getTopics, { freshOnMount: true });
    list.componentDidMount();
    await Promise.resolve();
    expect(getTopics).toHaveBeenCalledWith(1, { cache: false, onRefresh: expect.any(Function) });
  });

  it('forwards node freshness options to the API', () => {
    const tree = NodeTopics({ node: 'water' });
    const autoHeight = tree!.props.children[2];
    const list = autoHeight.props.children(400);
    const options = { cache: false };
    list.props.getTopics(1, options);
    expect(getNodeTopics).toHaveBeenCalledWith({ node: 'water', page: 1 }, options);
  });

  it('refreshes the originating node list and unregisters its publish listener on unmount', () => {
    const scrollToTop = vi.fn(); harness.refs[0] = { current: { scrollToTop } };
    NodeTopics({ node: 'water' });
    const cleanup = harness.effects[0]();
    vi.mocked(Taro.eventCenter.on).mock.calls[0][1]();
    expect(scrollToTop).toHaveBeenCalledOnce();
    cleanup();
    expect(Taro.eventCenter.off).toHaveBeenCalledWith('refreshTopics', expect.any(Function));
  });
});
