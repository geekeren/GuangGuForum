import React from 'react';
import { readFileSync } from 'node:fs';
import { compileString } from 'sass';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getHotNodes, getHotTopics, type HotNodes } from 'guanggu-forum-api';
import DesktopLayout from '../../../components/DesktopLayout';
import { getHomeRailMode, HOME_RAIL_WIDTHS } from '../../../components/DesktopLayout/homeRailLayout';
import { createNativeTestRenderer } from '../../../components/DesktopLayout/__tests__/nativeTestRenderer';
import HomeHotNodes from '../HomeHotNodes';
import DesktopSidebar from '../DesktopSidebar';
import { useDesktopHotNodes } from '../useDesktopHotNodes';

const h = vi.hoisted(() => ({
  viewport: { width: 960, height: 300, isDesktop: false }, desktop: true, windows: true,
  listeners: new Set<() => void>(), navigation: { navigateTo: vi.fn() }, latest: undefined as any,
}));
vi.mock('../../../hooks/usePageScope', () => ({
  usePageScope: () => ({ viewport: { isDesktopClient: h.desktop, isWindowsClient: h.windows } }),
  usePageOwner: () => undefined, usePageNavigation: () => h.navigation,
}));
vi.mock('../../../hooks/useViewport', async () => {
  const R = await import('react');
  return { useViewport: () => R.useSyncExternalStore(listener => { h.listeners.add(listener); return () => { h.listeners.delete(listener); }; }, () => h.viewport) };
});
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: {} }));
vi.mock('guanggu-forum-api', () => ({ getHotNodes: vi.fn(), getHotTopics: vi.fn() }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'Icon' }));
vi.mock('../../../components/SearchEntry', () => ({ default: 'SearchEntry' }));
const renderers: ReturnType<typeof createNativeTestRenderer>[] = [];
function native() { const renderer = createNativeTestRenderer(); renderers.push(renderer); return renderer; }
function descendants(tree: any): any[] { return [tree, ...(tree.children || []).flatMap(descendants)]; }
function find(renderer: ReturnType<typeof native>, className: string) { return descendants(renderer.container).find(element => element.props?.className === className); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const node = (title: string, link = '/node/water'): HotNodes => ({ title, link });
async function settle(renderer: ReturnType<typeof native>) { for (let i = 0; i < 8; i++) await Promise.resolve(); renderer.flush(() => {}); }
function Probe({ active }: { active: boolean }) { h.latest = useDesktopHotNodes(active); return React.createElement('Probe'); }
beforeEach(() => {
  h.viewport = { width: 960, height: 300, isDesktop: false }; h.desktop = true; h.windows = true;
  h.listeners.clear(); h.latest = undefined; vi.resetAllMocks();
  vi.mocked(getHotNodes).mockResolvedValue([]); vi.mocked(getHotTopics).mockResolvedValue([]);
});
afterEach(() => { renderers.splice(0).forEach(renderer => renderer.unmount()); });

describe('owning-page desktop rail policy', () => {
  it.each([[639, 'icons', 60], [640, 'labels', 160], [750, 'labels', 160], [959, 'labels', 160], [960, 'community', 200], [1024, 'community', 200]] as const)('uses page width %s for %s/%s, not total screen width', (width, mode, railWidth) => {
    expect(getHomeRailMode(true, width)).toBe(mode);
    expect(HOME_RAIL_WIDTHS[getHomeRailMode(true, width)]).toBe(railWidth);
    expect(getHomeRailMode(false, width)).toBe('none');
    const renderer = native();
    h.viewport = { width, height: 300, isDesktop: width >= 1024 };
    renderer.render(React.createElement(DesktopLayout, { railContent: React.createElement('NodesSlot') }));
    expect(find(renderer, 'desktopRail').props.style.width).toBe(railWidth + 'px');
    expect(descendants(renderer.container).filter(element => element.type === 'NodesSlot')).toHaveLength(width >= 960 ? 1 : 0);
    if (width === 750) expect(width - railWidth).toBe(590); // e.g. 1500px desktop split into two 750px pages.
  });

  it('keeps mobile bottom-tab content and omits the rail even in a large mobile pane', () => {
    h.desktop = false; h.windows = false; h.viewport = { width: 1500, height: 900, isDesktop: true };
    const renderer = native();
    renderer.render(React.createElement(DesktopLayout, { railContent: React.createElement(HomeHotNodes, { active: true }) }, React.createElement('BottomTabs')));
    expect(find(renderer, 'desktopRail')).toBeUndefined();
    expect(descendants(renderer.container).some(element => element.type === 'BottomTabs')).toBe(true);
    expect(getHotNodes).not.toHaveBeenCalled();
  });

  it('keeps scrolling nav and popular nodes above a separate, fixed bottom publish action at short heights', () => {
    const renderer = native();
    renderer.render(React.createElement(DesktopLayout, { railContent: React.createElement('NodesSlot') }));
    const rail = find(renderer, 'desktopRail');
    expect(rail.children.map(element => element.props?.className)).toEqual(['desktopRailScroll', 'desktopCompose']);
    const scroll = find(renderer, 'desktopRailScroll');
    expect(scroll.props).toMatchObject({ scrollY: true, type: 'custom' });
    expect(descendants(scroll).some(element => element.type === 'NodesSlot')).toBe(true);
    expect(descendants(scroll).some(element => element.props?.className === 'desktopCompose')).toBe(false);
  });

  it('compiles horizontal text+icon rows in both labeled modes and bounds the rail scroll without shrinking publish', () => {
    const css = compileString(readFileSync('src/components/DesktopLayout/index.scss', 'utf8')).css;
    expect(css).toMatch(/\.desktopRailScroll\s*\{[^}]*flex: 1;[^}]*height: 0;[^}]*min-height: 0;/);
    expect(css).toMatch(/\.desktopLayout--home-labels \.desktopNavItem,[^{]*\.desktopLayout--home-community \.desktopNavItem\s*\{[^}]*flex-direction: row;/);
    for (const cls of ['desktopBrand', 'desktopCompose']) {
      expect(css).toMatch(new RegExp(`\\.desktopLayout--home-labels \\.${cls},[^\\{]*\\.desktopLayout--home-community \\.${cls}\\s*\\{[^}]*flex-direction: row;`));
    }
    const homeCss = compileString(readFileSync('src/pages/home/desktop.scss', 'utf8')).css;
    expect(homeCss).toMatch(/\.homeRailNodesHeader\s*\{[^}]*flex-direction: row;/);
    expect(css).toMatch(/\.desktopLayout--home \.desktopCompose\s*\{[^}]*flex-shrink: 0;/);
    expect(css).toMatch(/\.desktopLayout--rail \.desktopBrand text,[^{]*\.desktopNavCaption\s*\{[^}]*display: none;/);
  });

  it.each(['compose', 'detail'] as const)('does not put a Home slot on a %s page and preserves Mac wide behavior', variant => {
    const renderer = native(); h.viewport = { width: 1920, height: 900, isDesktop: true };
    const tree = () => React.createElement(DesktopLayout, { variant, sidebar: React.createElement('Sidebar'), railContent: React.createElement(HomeHotNodes, { active: true }) });
    renderer.render(tree()); expect(find(renderer, 'desktopRail')).toBeUndefined();
    h.windows = false; renderer.render(tree()); expect(find(renderer, 'desktopRail')).toBeDefined();
    expect(find(renderer, 'desktopSidebar')).toBeDefined(); expect(getHotNodes).not.toHaveBeenCalled();
  });
});

describe('public node-only Home rail lifecycle', () => {
  it('places nodes once in the Mac rail using real fields and scoped routes, with discussions only in its sidebar', async () => {
    h.windows = false; h.viewport = { width: 1400, height: 900, isDesktop: true };
    vi.mocked(getHotNodes).mockResolvedValue([node('真实板块'), node('很长的中文板块名称', '/node/wuhan?sort=new'), node('无效地址', 'javascript:alert(1)')]);
    const renderer = native();
    renderer.render(React.createElement(DesktopLayout, { railContent: React.createElement(HomeHotNodes, { active: true }), sidebar: React.createElement(DesktopSidebar, { active: true, onDiscovery: vi.fn() }) }));
    await settle(renderer);
    expect(getHotNodes).toHaveBeenCalledTimes(1); expect(getHotTopics).toHaveBeenCalledTimes(1);
    const railNodes = find(renderer, 'homeRailNodes');
    expect(railNodes).toBeDefined(); expect(find(renderer, 'homeDesktopNode')).toBeUndefined();
    const rows = descendants(railNodes).filter(element => element.props?.className === 'homeRailNode');
    expect(rows.map(element => element.props.ariaLabel)).toEqual(['真实板块', '很长的中文板块名称', '无效地址']);
    rows[0].props.onClick(); rows[1].props.onClick(); rows[2].props.onClick();
    expect(h.navigation.navigateTo.mock.calls).toEqual([
      [{ url: '/pages/node/topicList/index?node=water&nodeName=' + encodeURIComponent('真实板块') }],
      [{ url: '/pages/node/topicList/index?node=wuhan&nodeName=' + encodeURIComponent('很长的中文板块名称') }],
    ]);
    expect(descendants(find(renderer, 'desktopSidebar')).some(element => element.props?.className === 'homeRailNodes')).toBe(false);
  });

  it('requests no discussions for a Windows rail and no rail requests below 960px', async () => {
    const renderer = native();
    const tree = () => React.createElement(DesktopLayout, { railContent: React.createElement(HomeHotNodes, { active: true }), sidebar: React.createElement(DesktopSidebar, { active: true, onDiscovery: vi.fn() }) });
    h.viewport = { width: 959, height: 300, isDesktop: false }; renderer.render(tree()); await settle(renderer);
    expect(getHotNodes).not.toHaveBeenCalled(); expect(getHotTopics).not.toHaveBeenCalled();
    renderer.flush(() => { h.viewport = { width: 960, height: 300, isDesktop: false }; h.listeners.forEach(listener => listener()); });
    await settle(renderer); expect(getHotNodes).toHaveBeenCalledTimes(1); expect(getHotTopics).not.toHaveBeenCalled();
  });

  it('prefers fresh onRefresh data to a later cached promise and retains fresh data when that promise fails', async () => {
    const cached = deferred<HotNodes[]>(); vi.mocked(getHotNodes).mockReturnValueOnce(cached.promise);
    const renderer = native(); renderer.render(React.createElement(Probe, { active: true }));
    const refresh = vi.mocked(getHotNodes).mock.calls[0][1]!.onRefresh!;
    renderer.flush(() => refresh([node('新板块')])); cached.resolve([node('旧缓存')]); await settle(renderer);
    expect(h.latest.nodes).toEqual([node('新板块')]);
    renderer.flush(() => h.latest.retry());
    const failed = deferred<HotNodes[]>(); // Start a third generation with a pending cached result.
    vi.mocked(getHotNodes).mockReturnValueOnce(failed.promise); renderer.flush(() => h.latest.retry());
    const calls = vi.mocked(getHotNodes).mock.calls;
    const fresh = calls[calls.length - 1][1]!.onRefresh!;
    renderer.flush(() => fresh([node('再次刷新')])); failed.reject(new Error('cached read failed')); await settle(renderer);
    expect(h.latest).toMatchObject({ nodes: [node('再次刷新')], error: false, loading: false });
  });

  it('ignores old promises/refreshes after retry, hide, reactivation and unmount', async () => {
    const old = deferred<HotNodes[]>(), next = deferred<HotNodes[]>();
    vi.mocked(getHotNodes).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const renderer = native(); renderer.render(React.createElement(Probe, { active: false }));
    expect(getHotNodes).not.toHaveBeenCalled(); renderer.render(React.createElement(Probe, { active: true }));
    const oldRefresh = vi.mocked(getHotNodes).mock.calls[0][1]!.onRefresh!;
    renderer.flush(() => h.latest.retry());
    const nextRefresh = vi.mocked(getHotNodes).mock.calls[1][1]!.onRefresh!;
    renderer.flush(() => nextRefresh([node('新代')])); old.resolve([node('旧代')]); await settle(renderer);
    renderer.flush(() => oldRefresh([node('旧代刷新')])); expect(h.latest.nodes).toEqual([node('新代')]);
    renderer.render(React.createElement(Probe, { active: false }));
    next.resolve([node('隐藏后缓存')]); await settle(renderer); renderer.flush(() => nextRefresh([node('隐藏后刷新')]));
    expect(h.latest.nodes).toEqual([node('新代')]);
    renderer.render(React.createElement(Probe, { active: true })); await settle(renderer);
    expect(getHotNodes).toHaveBeenCalledTimes(3);
    renderer.unmount(); const last = h.latest;
    nextRefresh([node('卸载后刷新')]); expect(h.latest).toBe(last);
    expect(getHotTopics).not.toHaveBeenCalled();
  });

  it('rejects callbacks from an unmounted wide rail after collapsing and expanding it again', async () => {
    const old = deferred<HotNodes[]>(); vi.mocked(getHotNodes).mockReturnValueOnce(old.promise);
    const renderer = native();
    const tree = React.createElement(DesktopLayout, { railContent: React.createElement(HomeHotNodes, { active: true }) });
    renderer.render(tree); const oldRefresh = vi.mocked(getHotNodes).mock.calls[0][1]!.onRefresh!;
    const resize = (width: number) => renderer.flush(() => {
      h.viewport = { width, height: 300, isDesktop: false }; h.listeners.forEach(listener => listener());
    });
    resize(959); expect(find(renderer, 'homeRailNodes')).toBeUndefined();
    vi.mocked(getHotNodes).mockResolvedValueOnce([node('重新展开新板块')]); resize(960); await settle(renderer);
    old.resolve([node('收起前旧缓存')]); await settle(renderer); renderer.flush(() => oldRefresh([node('收起前旧刷新')]));
    const labels = descendants(find(renderer, 'homeRailNodes')).filter(element => element.props?.className === 'homeRailNode').map(element => element.props.ariaLabel);
    expect(labels).toEqual(['重新展开新板块']); expect(getHotNodes).toHaveBeenCalledTimes(2); expect(getHotTopics).not.toHaveBeenCalled();
  });

  it('shows failure retry and bounds displayed nodes to twelve', async () => {
    vi.mocked(getHotNodes).mockRejectedValueOnce(new Error('offline'));
    const renderer = native(); renderer.render(React.createElement(HomeHotNodes, { active: true })); await settle(renderer);
    const retry = find(renderer, 'homeRailNodesStatus'); expect(descendants(retry).some(element => element.text === '板块加载失败，点击重试')).toBe(true);
    vi.mocked(getHotNodes).mockResolvedValue(Array.from({ length: 20 }, (_, i) => node('板块' + i, '/node/node' + i)));
    renderer.flush(() => retry.props.onClick()); await settle(renderer);
    expect(descendants(renderer.container).filter(element => element.props?.className === 'homeRailNode')).toHaveLength(12);
    expect(getHotNodes).toHaveBeenCalledTimes(2); expect(getHotTopics).not.toHaveBeenCalled();
  });
});
