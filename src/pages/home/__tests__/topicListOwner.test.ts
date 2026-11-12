import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Topics from "../topics";
import { PageScopeContext } from "../../../hooks/usePageScope";
import { getPageViewportStore } from "../../../utils/pageViewport";
import { createNativeTestRenderer } from "../../../components/DesktopLayout/__tests__/nativeTestRenderer";

const h = vi.hoisted(() => ({ current: undefined as any, queries: [] as string[], routes: [] as string[] }));
vi.mock("@tarojs/components", () => Object.fromEntries(['View','Text','Image','ScrollView','ShareElement','OpenContainer'].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({ default: {
  getCurrentInstance: () => ({ page: h.current }), getWindowInfo: () => ({ windowWidth: 1600, windowHeight: 900 }),
  getDeviceInfo: () => ({ platform: 'windows' }), nextTick: (callback: () => void) => callback(),
  showNavigationBarLoading: vi.fn(), hideNavigationBarLoading: vi.fn(), showToast: vi.fn(),
  eventCenter: { on: vi.fn(), off: vi.fn() },
} }));
vi.mock("guanggu-forum-api", () => ({
  getHotNodes: vi.fn(), URLS: { TOPIC_DETAIL: '/t/:tid' },
  getRecentTopics: vi.fn().mockResolvedValue([{ link: '/t/123', title: '真实列表数据', username: 'tester', category: '生活', commentCount: '1' }]),
  getNodeTopics: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ request: vi.fn() }) }));
vi.mock("../../../hooks/useTheme", () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock("../../../utils/nodeNavigation", () => ({ fetchAndCacheNodeNavigation: () => Promise.resolve([]) }));
vi.mock("../../../utils/CacheService", () => ({ cacheService: { get: vi.fn(), set: vi.fn() }, CacheCategory: { Topic: 'topic' } }));
vi.mock("../../../components/PullDownRefresh", async () => {
  const R = await import('react');
  return { default: R.forwardRef((props: any, _ref) => R.createElement('Refresh', props, props.children)) };
});
vi.mock("../../../components/PinnedTopicCard", () => ({ default: 'Pinned' }));
vi.mock("../../../components/UserAvatar", () => ({ default: 'UserAvatar' }));
vi.mock("../../../components/Loading", () => ({ default: 'Loading' }));
vi.mock("../../../components/ThemedIcon", () => ({ default: 'Icon' }));
function descendants(node: any): any[] { return [node, ...(node.children || []).flatMap(descendants)]; }
function page(name: string, width: number) {
  const owner = {
    route: 'pages/home/index', renderer: 'webview',
    pageRouter: { navigateTo(options: any) { h.routes.push(name); options.success({}); } },
    createSelectorQuery() {
      const callbacks: (() => void)[] = [];
      const query: any = {
        select: (selector: string) => { h.queries.push(name); return { boundingClientRect: (callback: any) => { callbacks.push(() => callback({ width, height: selector === '#list_container' ? 700 : 54 })); return query; } }; },
        selectViewport: () => ({ boundingClientRect: (callback: any) => { callbacks.push(() => callback({ width, height: 700 })); return query; } }),
        exec: () => callbacks.forEach(callback => callback()),
      };
      return query;
    },
  };
  const viewport = getPageViewportStore(owner);
  viewport.resize({ size: { windowWidth: width, windowHeight: 700 } });
  return { owner, viewport, router: { params: {}, path: '/pages/home/index', onReady: '', onHide: '', onShow: '', shareTicket: undefined, scene: undefined } };
}
beforeEach(() => { h.current = undefined; h.queries = []; h.routes = []; });
it('keeps lazily opened and remounted left sorting lists bound to the left scope when the right page is globally current', async () => {
  const left = page('left', 450), right = page('right', 650);
  h.current = right.owner;
  const renderer = createNativeTestRenderer();
  renderer.render(React.createElement(PageScopeContext.Provider, { value: left }, React.createElement(Topics, {})));
  for (let i = 0; i < 6; i++) await Promise.resolve(); renderer.flush(() => {});
  const latest = descendants(renderer.container).find(node => node.props?.id === 'tab_1');
  renderer.flush(() => latest.props.onClick());
  for (let i = 0; i < 6; i++) await Promise.resolve(); renderer.flush(() => {});
  expect(h.queries.length).toBeGreaterThan(0); expect(h.queries.every(owner => owner === 'left')).toBe(true);
  const topic = descendants(renderer.container).filter(node => node.type === 'OpenContainer').slice(-1)[0];
  await topic.props.onClick();
  expect(h.routes).toEqual(['left']);
  expect(left.viewport.getSnapshot().width).toBe(450); expect(right.viewport.getSnapshot().width).toBe(650);
  renderer.unmount();
});
