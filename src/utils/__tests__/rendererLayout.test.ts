import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { readFileSync } from "node:fs";
import React from 'react';
import { Current, createPageConfig, document, getPageInstance, removePageInstance } from '@tarojs/runtime';
import { connectReactPage, createReactApp } from '@tarojs/plugin-framework-react/dist/runtime';
import { createRoot, render as renderNative, unmountComponentAtNode } from '@tarojs/react';
import App from '../../app';
import Home from "../../pages/home";
import TopicList from "../../pages/home/topics/topicList";
import { getBottomSafeAreaInset } from "../dimension";

const geometry = vi.hoisted(() => ({ ticks: [] as (() => void)[], queries: [] as any[], owner: {} as any, navbar: false, hideTab: false, username: '', accounts: new Set<() => void>(), accountStops: [] as any[] }));
vi.mock("@tarojs/taro", () => ({
  default: {
    getWindowInfo: vi.fn(() => ({ screenHeight: 844, windowWidth: 390, safeArea: { bottom: 810 } })),
    getDeviceInfo: vi.fn(() => ({ platform: 'ios' })),
    getSystemInfoSync: vi.fn(() => ({ screenWidth: 390, screenHeight: 844, windowHeight: 800, statusBarHeight: 24 })),
    getMenuButtonBoundingClientRect: vi.fn(() => ({ width: 88, height: 32, left: 290, top: 28, right: 378 })),
    getCurrentInstance: vi.fn(() => ({ page: geometry.owner, router: { params: {} } })),
    nextTick: vi.fn((callback: () => void) => geometry.ticks.push(callback)),
    createSelectorQuery: vi.fn(() => {
      const record = { owner: undefined as any, selector: '', callback: undefined as any }; geometry.queries.push(record);
      const query = { in: (owner: any) => { record.owner = owner; return query; }, select: (selector: string) => { record.selector = selector; return query; }, boundingClientRect: () => query, exec: (callback: any) => { record.callback = callback; } };
      return query;
    }),
    navigateTo: vi.fn(() => Promise.resolve()),
    redirectTo: vi.fn(() => Promise.resolve()),
    navigateBack: vi.fn(),
    reLaunch: vi.fn(),
    showToast: vi.fn(),
  },
}));
vi.mock("@tarojs/components", () => Object.fromEntries(
  ["View", "Text", "Image", "ShareElement", "ScrollView", "OpenContainer"].map(name => [name, name]),
));
vi.mock("guanggu-forum-api", () => ({ URLS: {} }));
vi.mock("../../pages/home/topics", () => ({ default: "Topics" }));
vi.mock("../../pages/home/discovery", () => ({ default: "Discovery" }));
vi.mock("../../pages/home/notifications", () => ({ default: "Notifications" }));
vi.mock("../../pages/me", () => ({ default: "Me" }));
vi.mock('../../pages/messages', () => ({ MessageConversationList: 'MessageConversationList' }));
// A sentinel catches accidental reintroduction of native history reset into Home.
const history = vi.hoisted(() => ({ reset: vi.fn(() => Promise.resolve(true)), dispose: vi.fn(), owners: [] as any[] }));
vi.mock('../desktopPaneHistory', () => ({ createDesktopPaneHistory: (owner: any) => {
  history.owners.push(owner);
  return { reset: history.reset, dispose: history.dispose };
} }));
vi.mock('../../pages/settings', () => ({ SettingsContent: 'SettingsContent' }));
vi.mock('../../pages/createTopic', () => ({ CreateTopicContent: 'CreateTopicContent' }));
vi.mock("../../pages/config", () => ({ get ENABLE_CUSTOM_NAVBAR() { return geometry.navbar; }, get HIDE_TAB() { return geometry.hideTab; } }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/SearchEntry", () => ({ default: "SearchEntry" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "AddToDesktopGuide" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock('../currentUser', () => ({
  getCachedUsername: () => geometry.username,
  subscribeCurrentAccount: (callback: () => void) => {
    geometry.accounts.add(callback);
    const stop = vi.fn(() => geometry.accounts.delete(callback)); geometry.accountStops.push(stop); return stop;
  },
}));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: {} }));
vi.mock("../unreadNotifications", () => ({ getUnreadNotificationCount: () => 0, subscribeUnreadNotifications: vi.fn() }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../urls", () => ({ urlPathVaiable: () => () => ({ params: { tid: "1" } }) }));
// Use the production App wrapper but never mount App's storage/network effects.
vi.mock('../../components/ThemePage', () => ({ default: ({ children }: any) => React.createElement('view', { className: 'themePageHost themePageHost--desktop' }, children) }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === 'function' && tree.type.name === 'DesktopSideNav') return elements(tree.type(tree.props));
  return [tree, ...elements(tree.props?.children)];
}
function navigation(tree: any) { return elements(tree).find(e => ['bottomTab', 'desktopSideNav'].some(name => e.props?.className?.split(' ').includes(name))); }
function tabProps() {
  return navigation(new Home({}, undefined).render()).props;
}
function listProps() {
  const list = new TopicList({ getTopics: vi.fn() }, undefined);
  list.state = { topics: [{ link: "/t/1" } as any], loadingPage: 1 };
  return elements(list.render()).find(e => e.type === "ScrollView").props;
}

beforeEach(() => {
  history.reset.mockReset().mockResolvedValue(true); history.dispose.mockClear(); history.owners = [];
  vi.mocked(Taro.redirectTo).mockReset().mockResolvedValue({ errMsg: 'redirectTo:ok' });
  geometry.owner = {}; geometry.ticks = []; geometry.queries = []; geometry.navbar = false; geometry.hideTab = false; geometry.username = ''; geometry.accounts.clear(); geometry.accountStops = []; vi.clearAllMocks();
  vi.mocked(Taro.nextTick).mockImplementation((callback: () => void) => geometry.ticks.push(callback));
  vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'ios' } as any);
  vi.mocked(Taro.navigateTo).mockClear();
  vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
  vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth: 390, safeArea: { bottom: 810 } } as any);
});
afterEach(() => vi.unstubAllGlobals());

function makeHome() {
  const home = new Home({}, undefined);
  home.setState = ((update: any) => { home.state = { ...home.state, ...(typeof update === 'function' ? update(home.state, home.props) : update) }; }) as typeof home.setState;
  return home;
}
function flushGeometry() { geometry.ticks.splice(0).forEach(callback => callback()); }
function rect(width: number) { return [{ left: 40, top: 20, width, height: 700 }]; }
function nativeHomeTree(tree: any): any {
  if (Array.isArray(tree)) return tree.map(nativeHomeTree);
  if (!tree || typeof tree !== 'object') return tree;
  if (typeof tree.type === 'function' && tree.type.name === 'DesktopSideNav') return nativeHomeTree(tree.type(tree.props));
  if (tree.type === React.Fragment) {
    const children = nativeHomeTree(tree.props.children);
    return React.createElement(React.Fragment, null, ...(Array.isArray(children) ? children : [children]));
  }
  const { children, ...props } = tree.props;
  const content = ['Topics', 'Discovery', 'Notifications', 'Me'].includes(tree.type) ? `synthetic retained ${tree.type}` : nativeHomeTree(children);
  return React.createElement('view', { ...props, ...(tree.key === null ? {} : { key: tree.key }) }, ...(Array.isArray(content) ? content : [content]));
}
function nativeFind(root: any, className: string): any {
  if (root.className?.split(' ').includes(className)) return root;
  for (const child of root.childNodes ?? []) { const result = nativeFind(child, className); if (result) return result; }
}

describe('production Home page registration and App wrapper', () => {
  it.each(['devtools', 'windows', 'mac'])('keeps class lifecycle/ref ownership through installed registration and production App.render on %s', async platform => {
    const previousCurrent = { app: Current.app, page: Current.page, router: Current.router };
    const container = document.createElement('view'); container.id = 'synthetic-app-container';
    let path = '';
    const drain = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    // Initialize the installed adapter's React metadata without mounting App.
    // createReactApp mounts its entry asynchronously; use an inert entry so
    // production App storage/theme listeners cannot run in this fixture.
    class InertEntry extends React.Component { render() { return null; } }
    createReactApp(InertEntry, React, { createRoot, render: renderNative, unmountComponentAtNode }, {});
    await drain();
    class NativeHomeLeaves extends Home { render() { return nativeHomeTree(super.render()); } }
    Current.app = {
      mount(Page: any, pagePath: string, callback: () => void) {
        path = pagePath;
        const Wrapper = connectReactPage(React, pagePath)(Page);
        const app = new App({ children: React.createElement(Wrapper, { tid: pagePath } as any) });
        renderNative(app.render(), container, () => {
          const pageRoot = document.getElementById(pagePath)! as unknown as { performUpdate: (initial?: boolean, cb?: () => void) => void };
          // Synthetic transport only: no native setData or user data.
          pageRoot.performUpdate = (_initial?: boolean, cb?: () => void) => cb?.();
          callback();
        });
      },
      unmount(_path: string, callback: () => void) { unmountComponentAtNode(container); callback(); },
    } as any;
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    vi.mocked(Taro.getCurrentInstance).mockImplementation(() => Current as any);
    const config = createPageConfig(NativeHomeLeaves, 'synthetic-home-lifecycle', { root: { cn: [] } }, {});
    const page = { ...config, route: 'synthetic-home-lifecycle' } as any;
    try {
      page.onLoad({}); await drain();
      const home = getPageInstance(path) as unknown as Home;
      expect(home).toBeInstanceOf(Home);
      expect((home as any).ownerPage).toBe(page); // Actual createPageConfig assigns the owning root's native ctx after mount.
      expect(nativeFind(container, 'themePageHost')).toBeDefined();
      if (platform !== 'devtools') {
        expect(home.state.wideTabs).toBe(true);
        const workspace = nativeFind(container, 'homeWorkspace'), tabs = nativeFind(container, 'desktopSideNav');
        page.onReady(); page.onResize({ size: { windowWidth: 430 } }); await drain(); flushGeometry();
        expect(home.state.wideTabs).toBe(true); expect(geometry.queries).toHaveLength(0);
        page.onHide(); await drain(); expect(home.state.pageVisible).toBe(false);
        page.onShow(); await drain(); flushGeometry(); expect(home.state.wideTabs).toBe(true); expect(home.state.pageVisible).toBe(true);
        expect(nativeFind(container, 'homeWorkspace')).toBe(workspace); expect(nativeFind(container, 'desktopSideNav')).toBe(tabs);
        return;
      }
      // Constructor/mount happens before createPageConfig assigns root.ctx;
      // only the owning ready lifecycle may begin native measurements.
      flushGeometry(); expect(geometry.queries).toHaveLength(0);
      page.onReady(); await drain(); flushGeometry(); expect(geometry.queries[0].owner).toBe(page);
      geometry.queries[0].callback(rect(1032)); await drain(); expect(home.state.wideTabs).toBe(true);
      geometry.queries = []; page.onShow(); await drain(); flushGeometry(); expect(geometry.queries).toHaveLength(1);
      geometry.queries[0].callback(rect(1032)); await drain();
      page.onResize({ size: { windowWidth: 430 } }); await drain(); flushGeometry(); expect(geometry.queries).toHaveLength(2);
      geometry.queries[1].callback(rect(430)); await drain(); expect(home.state.wideTabs).toBe(false);
      page.onHide(); await drain(); expect(home.state.pageVisible).toBe(false);
      page.onShow(); await drain(); flushGeometry(); expect(home.state.pageVisible).toBe(true); expect(geometry.queries[2].owner).toBe(page);
    } finally {
      if (path) { unmountComponentAtNode(container); removePageInstance(path); }
      Object.assign(Current, previousCurrent);
      vi.mocked(Taro.getCurrentInstance).mockImplementation(() => ({ app: null, onReady: 'onReady', onHide: 'onHide', onShow: 'onShow', page: geometry.owner, router: { params: {}, shareTicket: '', scene: 0, path: '/synthetic-home', $taroPath: '/synthetic-home', onReady: 'onReady', onShow: 'onShow', onHide: 'onHide' } }));
    }
  });
});

describe('PC tabs are synchronous and independent of native geometry', () => {
  it.each(['windows', 'mac'])('starts %s left even in a narrow frameset with no captured owner or callback', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth: 430 } as any);
    geometry.owner = undefined;
    const home = makeHome();
    expect(home.state.wideTabs).toBe(true);
    const root = elements(home.render()).find(node => node.props?.className?.split(' ').includes('root'));
    expect(root.props.className).toContain('root--wideTabs');
    expect(tabProps().style).toBeUndefined();
    home.componentDidMount(); home.onReady(); home.onResize(); home.componentDidHide(); home.componentDidShow(); flushGeometry();
    expect(home.state.wideTabs).toBe(true); expect(geometry.queries).toHaveLength(0); expect(geometry.ticks).toHaveLength(0);
    home.componentWillUnmount();
  });
  it.each(['windows', 'mac'])('never resets %s tabs to bottom when measurement APIs throw or are missing', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    vi.mocked(Taro.nextTick).mockImplementation(() => { throw new Error('synthetic unavailable'); });
    const home = makeHome(); home.componentDidMount(); home.onReady(); home.onResize(); home.componentDidShow();
    expect(home.state.wideTabs).toBe(true);
    expect(Taro.nextTick).not.toHaveBeenCalled(); expect(Taro.createSelectorQuery).not.toHaveBeenCalled();
    home.componentWillUnmount();
    vi.mocked(Taro.nextTick).mockImplementation((callback: () => void) => geometry.ticks.push(callback));
  });
});

describe('owner-measured wide Home tabs', () => {
  it.each([450, 959, 960, 1032, 1400])('uses owning root width %s, not the entire desktop window', width => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    vi.mocked(Taro.getWindowInfo).mockReturnValue({ windowWidth: 2000, screenHeight: 844 } as any);
    const home = makeHome(); home.componentDidMount(); flushGeometry();
    const root = elements(home.render()).find(node => node.props?.className?.split(' ').includes('root'));
    expect(geometry.queries[0].owner).toBe(geometry.owner); expect(geometry.queries[0].selector).toBe(`#${root.props.id}`);
    geometry.queries[0].callback(rect(width)); expect(home.state.wideTabs).toBe(width >= 960);
    const tabs = navigation(home.render());
    expect(tabs.props.style).toEqual(width >= 960 ? undefined : { paddingBottom: `${16 * 2000 / 750}px` });
    home.componentWillUnmount();
  });
  it.each(['ios', 'android', 'devtools'])('uses actual owner width on %s without making the client desktop or trusting a huge window', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    vi.mocked(Taro.getWindowInfo).mockReturnValue({ windowWidth: 2000, screenHeight: 844 } as any);
    const home = makeHome(); home.componentDidMount(); flushGeometry();
    geometry.queries[0].callback(rect(1032)); expect(home.state.wideTabs).toBe(true);
    for (const width of [390, 430, 450, 959]) {
      home.onResize(); flushGeometry(); geometry.queries[geometry.queries.length - 1].callback(rect(width)); expect(home.state.wideTabs).toBe(false);
    }
    home.componentWillUnmount();
  });
  it('captures page ownership once, assigns unique roots and rejects stale resize/hide/unmount queries', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    const owner = geometry.owner, home = makeHome(); home.componentDidMount(); flushGeometry(); const old = geometry.queries[0];
    geometry.owner = { anotherPage: true }; const second = makeHome();
    expect(elements(second.render())[1].props.id).not.toBe(elements(home.render())[1].props.id);
    home.onResize(); old.callback(rect(1400)); expect(home.state.wideTabs).toBe(false); flushGeometry();
    expect(geometry.queries[1].owner).toBe(owner); geometry.queries[1].callback(rect(1400)); expect(home.state.wideTabs).toBe(true);
    home.onResize(); expect(home.state.wideTabs).toBe(false); flushGeometry(); const pending = geometry.queries[2];
    home.componentDidHide(); pending.callback(rect(1400)); expect(home.state.wideTabs).toBe(false);
    home.componentDidShow(); flushGeometry(); const shown = geometry.queries[3]; home.componentWillUnmount(); const before = home.state;
    shown.callback(rect(1400)); expect(home.state).toBe(before);
  });
  it('rejects stale nextTick before querying and falls back bottom if a resized query never responds', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    const home = makeHome(); home.componentDidMount(); home.onResize(); flushGeometry(); expect(geometry.queries).toHaveLength(1);
    geometry.queries[0].callback(rect(1400)); expect(home.state.wideTabs).toBe(true);
    home.onResize(); expect(home.state.wideTabs).toBe(false); flushGeometry(); expect(home.state.wideTabs).toBe(false);
    home.componentWillUnmount();
  });
  it('drops queued nextTick work after hide/unmount and ignores repeated callbacks after narrow settlement', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    const home = makeHome(); home.componentDidMount(); home.componentDidHide(); flushGeometry(); expect(geometry.queries).toHaveLength(0);
    home.componentDidShow(); flushGeometry(); const query = geometry.queries[0]; query.callback(rect(450)); query.callback(rect(1400)); expect(home.state.wideTabs).toBe(false);
    home.onResize(); home.componentWillUnmount(); flushGeometry(); expect(geometry.queries).toHaveLength(1);
  });
  it('keeps bottom tabs if nextTick is absent or throws on resize', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    const home = makeHome(); home.componentDidMount(); flushGeometry(); geometry.queries[0].callback(rect(1400));
    vi.mocked(Taro.nextTick).mockImplementationOnce(() => { throw new Error('synthetic nextTick unsupported'); }); home.onResize(); expect(home.state.wideTabs).toBe(false);
    vi.mocked(Taro.nextTick).mockImplementationOnce(() => {}); home.onResize(); flushGeometry(); expect(geometry.queries).toHaveLength(1); expect(home.state.wideTabs).toBe(false); home.componentWillUnmount();
  });
  it.each([null, {}, [], [null], [{ left: 0, top: 0, width: NaN, height: 700 }], [{ left: 0, top: 0, width: 1400, height: 0 }]].map(value => ({ value })))('rejects malformed native owner geometry', ({ value }) => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    const home = makeHome(); home.componentDidMount(); flushGeometry(); geometry.queries[0].callback(rect(1400));
    home.onResize(); flushGeometry(); geometry.queries[1].callback(value); expect(home.state.wideTabs).toBe(false); home.componentWillUnmount();
  });
  it('falls back bottom for missing owner, scoped API and query exceptions', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'devtools' } as any);
    geometry.owner = undefined; const missing = makeHome(); missing.componentDidMount(); flushGeometry(); expect(geometry.queries).toHaveLength(0); missing.componentWillUnmount();
    geometry.owner = {}; const home = makeHome(); home.componentDidMount(); flushGeometry(); geometry.queries[0].callback(rect(1400));
    vi.mocked(Taro.createSelectorQuery).mockReturnValueOnce({ select: vi.fn() } as any); home.onResize(); flushGeometry(); expect(home.state.wideTabs).toBe(false);
    vi.mocked(Taro.createSelectorQuery).mockImplementationOnce(() => { throw new Error('synthetic unsupported'); }); home.onResize(); flushGeometry(); expect(home.state.wideTabs).toBe(false); home.componentWillUnmount();
  });
  it.each(['windows', 'mac', 'devtools'])('keeps the page Navbar at the top of homeMain beside the same left Tab, never above the workspace on %s', platform => {
    geometry.navbar = true;
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = makeHome(); home.setState({ selectedTabIndex: 3 });
    for (const wide of [true, false, true]) {
      home.setState({ wideTabs: wide }); const tree = home.render();
      const root = elements(tree).find(node => node.props?.className?.split(' ').includes('root'));
      const workspace = elements(tree).find(node => node.props?.className === 'homeWorkspace');
      const main = elements(tree).find(node => node.props?.className === 'homeMain');
      expect(root.props.children).toBe(workspace);
      expect(workspace.props.children[0]).toBe(main);
      expect(navigation(workspace.props.children[1]).props.className).toContain(wide ? 'desktopSideNav' : 'bottomTab');
      const navbars = elements(main).filter(node => node.type === 'Navbar');
      expect(navbars).toHaveLength(1); expect(elements(navbars[0]).find(node => node.props?.className === 'navTitle').props.children).toBe('消息');
      expect(elements(workspace.props.children[1]).filter(node => node.type === 'Navbar')).toHaveLength(0);
      expect(main.props.children[main.props.children.length - 1].props.className).toBe('tabContent');
    }
  });
  it.each([{ renderer: 'skyline', platform: 'devtools' }, { renderer: 'webview', platform: 'devtools' }, { renderer: 'skyline', platform: 'windows' }, { renderer: 'webview', platform: 'mac' }])('retains actual React/Taro content and selected lazy pages while replacing only navigation across width/lifecycle changes on %s', async ({ renderer, platform }) => {
    vi.stubGlobal('getCurrentPages', () => [{ renderer }]); vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    geometry.navbar = true;
    const home = makeHome(); home.setState({ selectedTabIndex: 3, unreadNotifications: 2, visitedTabs: { 0: true, 1: true, 3: true, 4: true } });
    home.componentDidMount(); flushGeometry();
    const root = document.createElement('root'); root.id = `synthetic-home-${renderer}`;
    const commit = async () => { renderNative(nativeHomeTree(home.render()), root, () => {}); await Promise.resolve(); await Promise.resolve(); };
    try {
      await commit();
      const owningRoot = nativeFind(root, 'root'), workspace = nativeFind(root, 'homeWorkspace'), main = nativeFind(root, 'homeMain'), content = nativeFind(root, 'tabContent');
      const navbar = nativeFind(root, 'navTitle').parentNode;
      const contentHosts = [...content.childNodes];
      const retainedPages = contentHosts.map(host => host.childNodes[0]);
      for (const width of [1400, 450, 1100]) {
        home.onResize(); flushGeometry();
        if (platform === 'devtools') geometry.queries[geometry.queries.length - 1].callback(rect(width));
        else { expect(home.state.wideTabs).toBe(true); expect(geometry.queries).toHaveLength(0); }
        await commit();
        expect(nativeFind(root, 'homeWorkspace')).toBe(workspace); expect(nativeFind(root, 'tabContent')).toBe(content);
        contentHosts.forEach((host, i) => { expect(content.childNodes[i]).toBe(host); expect(host.childNodes[0]).toBe(retainedPages[i]); });
        expect(home.state.selectedTabIndex).toBe(3); expect(home.state.visitedTabs).toEqual({ 0: true, 1: true, 3: true, 4: true }); expect(home.state.unreadNotifications).toBe(2);
        const tree = home.render(), tab = navigation(tree);
        expect(elements(tree).filter(node => ['bottomTab', 'desktopSideNav'].some(name => node.props?.className?.split(' ').includes(name)))).toHaveLength(1); expect(elements(tab).filter(node => node.props?.className === 'tabUnreadDot')).toHaveLength(1);
        expect(nativeFind(root, 'root')).toBe(owningRoot); expect(nativeFind(root, 'homeMain')).toBe(main);
        expect(nativeFind(root, 'navTitle').parentNode).toBe(navbar);
        expect(owningRoot.childNodes[0]).toBe(workspace);
        expect(workspace.childNodes[0]).toBe(main); expect(workspace.childNodes[1]).toBe(nativeFind(root, home.state.wideTabs ? 'desktopSideNav' : 'bottomTab'));
        expect(main.childNodes[0]).toBe(navbar); expect(main.childNodes[1]).toBe(content);
      }
      expect(contentHosts).toHaveLength(7); expect(contentHosts[4].childNodes).toHaveLength(0);
      const navigationHost = nativeFind(root, 'desktopSideNav');
      // Exercise retained content rendering without pretending redirectTo preserves a native page.
      (home as any).selectContent(5); await commit();
      const privateHost = content.childNodes[4], listHost = privateHost.childNodes[0]; expect(listHost).toBeDefined();
      expect(nativeFind(root, 'desktopSideNav')).toBe(navigationHost); expect(workspace.childNodes[1]).toBe(navigationHost);
      const retainedOriginals = () => contentHosts.slice(0, 4).forEach((host, i) => { expect(content.childNodes[i]).toBe(host); expect(host.childNodes[0]).toBe(retainedPages[i]); });
      for (const selectedTabIndex of [3, 0, 4, 1, 5]) {
        home.setState({ selectedTabIndex }); await commit(); retainedOriginals();
        expect(content.childNodes[4]).toBe(privateHost); expect(privateHost.childNodes[0]).toBe(listHost); expect(nativeFind(root, 'desktopSideNav')).toBe(navigationHost);
        expect(elements(home.render()).find(node => node.type === 'MessageConversationList').props.active).toBe(selectedTabIndex === 5);
      }
      for (const wideTabs of [false, true, false, true]) {
        home.setState({ wideTabs }); await commit(); retainedOriginals();
        expect(content.childNodes[4]).toBe(privateHost); expect(privateHost.childNodes[0]).toBe(listHost);
        expect(nativeFind(root, 'homeMain')).toBe(main); expect(nativeFind(root, 'tabContent')).toBe(content);
        expect(home.state.selectedTabIndex).toBe(5); expect(elements(home.render()).find(node => node.type === 'MessageConversationList').props.active).toBe(true);
      }
      for (const pageVisible of [false, true]) {
        home.setState({ pageVisible }); await commit(); expect(privateHost.childNodes[0]).toBe(listHost); expect(nativeFind(root, 'homeMain')).toBe(main);
        expect(elements(home.render()).find(node => node.type === 'MessageConversationList').props.active).toBe(pageVisible);
      }
      const tab = navigation(home.render());
      const compose = elements(tab).find(node => node.props?.className === 'desktopComposeButton' || node.props?.className === 'tabItem tabItem--add');
      await compose.props.onClick();
      if (platform !== 'devtools' && renderer === 'webview') {
        expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=2' });
        expect(Taro.navigateTo).not.toHaveBeenCalled(); expect(home.state.selectedTabIndex).toBe(5);
        (home as any).selectContent(2); await commit();
        const composeHost = content.childNodes[6], editorHost = composeHost.childNodes[0]; expect(editorHost).toBeDefined();
        await elements(navigation(home.render())).find(node => node.props?.ariaLabel === '设置').props.onClick();
        expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=6' });
        (home as any).selectContent(6); await commit();
        const settingsHost = content.childNodes[5], settingsPage = settingsHost.childNodes[0]; expect(settingsPage).toBeDefined();
        for (const selectedTabIndex of [2, 6, 5, 0, 2, 6]) {
          home.setState({ selectedTabIndex }); await commit(); retainedOriginals();
          expect(content.childNodes[6]).toBe(composeHost); expect(composeHost.childNodes[0]).toBe(editorHost);
          expect(content.childNodes[5]).toBe(settingsHost); expect(settingsHost.childNodes[0]).toBe(settingsPage);
          expect(nativeFind(root, 'desktopSideNav')).toBe(navigationHost); expect(nativeFind(root, 'homeMain')).toBe(main);
        }
        for (const pageVisible of [false, true]) {
          home.setState({ pageVisible }); await commit(); expect(settingsHost.childNodes[0]).toBe(settingsPage); expect(composeHost.childNodes[0]).toBe(editorHost);
          expect(elements(home.render()).find(node => node.type === 'SettingsContent').props.active).toBe(pageVisible);
          expect(elements(home.render()).find(node => node.type === 'CreateTopicContent').props.active).toBe(false);
        }
      }
      else {
        expect(platform === 'devtools' ? Taro.navigateTo : Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/createTopic/index' });
        expect(home.state.selectedTabIndex).toBe(5);
      }
    } finally { home.componentWillUnmount(); unmountComponentAtNode(root); }
  });
});

describe('native Home owner geometry and PC redirect experiment', () => {
  function rootedHome(tid: string, context?: object) {
    const root = document.createElement('root'); root.id = tid; document.documentElement.appendChild(root);
    (root as any).ctx = context;
    const home = new Home({ tid }, undefined);
    home.setState = ((update: any) => { home.state = { ...home.state, ...(typeof update === 'function' ? update(home.state, home.props) : update) }; }) as typeof home.setState;
    home.componentDidMount();
    return { home, root, destroy() { home.componentWillUnmount(); root.remove(); } };
  }
  const entry = (home: Home, label: string) => elements(navigation(home.render())).find(node => node.props?.ariaLabel === label)!;
  it('redirects even before the framework tid root has a native owner, without borrowing Current or checking history', async () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'windows' } as any);
    geometry.owner = { route: 'pages/topicDetail/index' };
    const mounted = rootedHome('synthetic-owner-late');
    try {
      expect((mounted.home as any).ownerPage).toBeUndefined(); geometry.owner = undefined;
      await entry(mounted.home, '发现').props.onClick(); await entry(mounted.home, '发现').props.onClick();
      expect(Taro.redirectTo).toHaveBeenCalledTimes(2);
      expect(Taro.redirectTo).toHaveBeenLastCalledWith({ url: '/pages/home/index?tab=1' });
      expect(mounted.home.state.selectedTabIndex).toBe(0); expect(history.owners).toHaveLength(0);
      expect(history.reset).not.toHaveBeenCalled(); expect(Taro.navigateBack).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
      const owner = {}; (mounted.root as any).ctx = owner; expect((mounted.home as any).ownerPage).toBe(owner);
    } finally { mounted.destroy(); }
  });
  it('does not inspect an owning page router or invoke native back while redirecting multiple sidebar actions', async () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'windows' } as any);
    const back = vi.fn(); const owner = { get pageRouter() { throw new Error('must not inspect native router'); } };
    const mounted = rootedHome('synthetic-owner-redirect', owner);
    const pages = vi.fn(() => [{ renderer: 'webview', navigateBack: back }]); vi.stubGlobal('getCurrentPages', pages);
    try {
      const first = entry(mounted.home, '发现').props.onClick(); const next = entry(mounted.home, '设置').props.onClick();
      await Promise.all([first, next]);
      expect(vi.mocked(Taro.redirectTo).mock.calls.map(([options]) => options.url)).toEqual(['/pages/home/index?tab=1', '/pages/home/index?tab=6']);
      expect(pages).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled(); expect(Taro.navigateBack).not.toHaveBeenCalled();
      expect(history.reset).not.toHaveBeenCalled(); expect(mounted.home.state.selectedTabIndex).toBe(0);
    } finally { mounted.destroy(); }
  });
  it('handles a delayed redirect failure after unmount without resurrecting UI or showing a stale toast', async () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'windows' } as any);
    let reject!: (reason: Error) => void;
    vi.mocked(Taro.redirectTo).mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const home = makeHome(); home.componentDidMount(); const before = home.state;
    const pending = entry(home, '设置').props.onClick(); home.componentWillUnmount(); reject(new Error('synthetic late redirect failure')); await pending;
    expect(home.state).toBe(before); expect(Taro.showToast).not.toHaveBeenCalled(); expect(history.reset).not.toHaveBeenCalled(); expect(Taro.reLaunch).not.toHaveBeenCalled();
  });
  it('uses the same tid native owner for local selector queries rather than the latest Current page', () => {
    geometry.owner = { route: 'synthetic-foreign' }; const owner = { route: 'synthetic-native-owner' };
    const mounted = rootedHome('synthetic-owner-query', owner);
    try { flushGeometry(); expect(geometry.queries[0].owner).toBe(owner); mounted.home.onReady(); flushGeometry(); expect(geometry.queries.at(-1).owner).toBe(owner); }
    finally { mounted.destroy(); }
  });
});

describe('side navigation account ownership', () => {
  function account(value: string) { geometry.username = value; [...geometry.accounts].forEach(callback => callback()); }
  function avatar(home: Home) { return elements(navigation(home.render())).find(node => node.type === 'UserAvatar'); }
  function publisher(home: Home) { return elements(home.render()).find(node => node.type === 'Me').props.onOwnAvatarChange; }
  it.each(['windows', 'mac'])('redirects every PC sidebar entry and repeat to its registered absolute route on %s without clearing history or mutating this Home', async platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any); vi.stubGlobal('getCurrentPages', () => [{ renderer: 'webview' }]);
    const home = makeHome(); home.componentDidMount();
    const pages = vi.fn(() => [{ renderer: 'webview' }]); vi.stubGlobal('getCurrentPages', pages);
    const entry = (label: string) => elements(navigation(home.render())).find(node => node.props?.ariaLabel === label);
    const before = home.state;
    for (const label of ['首页', '发现', '消息', '私信', '设置', '发帖', '我的（未登录）', '首页', '首页']) await entry(label).props.onClick();
    expect(vi.mocked(Taro.redirectTo).mock.calls.map(([options]) => options.url)).toEqual([0, 1, 3, 5, 6, 2, 4, 0, 0].map(index => `/pages/home/index?tab=${index}`));
    expect(home.state).toBe(before); expect(history.owners).toHaveLength(0); expect(history.reset).not.toHaveBeenCalled();
    expect(pages).not.toHaveBeenCalled(); expect(Taro.navigateBack).not.toHaveBeenCalled(); expect(Taro.navigateTo).not.toHaveBeenCalled();
    expect(Taro.reLaunch).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
    home.componentWillUnmount(); expect(history.dispose).not.toHaveBeenCalled();
  });
  it('handles redirect failure without the old history toast, reload or state/storage cleanup', async () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'windows' } as any);
    const home = makeHome(); home.componentDidMount();
    home.setState({ selectedTabIndex: 5, visitedTabs: { 0: true, 2: true, 5: true } }); const before = home.state;
    vi.mocked(Taro.redirectTo).mockRejectedValueOnce(new Error('synthetic redirect failure'));
    const settings = elements(navigation(home.render())).find(node => node.props?.ariaLabel === '设置');
    await settings.props.onClick();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '无法打开所选页面，请重试', icon: 'none' });
    expect(home.state).toBe(before); expect(history.reset).not.toHaveBeenCalled(); expect(Taro.navigateBack).not.toHaveBeenCalled();
    expect(Taro.reLaunch).not.toHaveBeenCalled(); expect(Taro.navigateTo).not.toHaveBeenCalled(); home.componentWillUnmount();
  });
  it('uses default avatar and accessible footer actions without requesting a profile and redirects PC account selection', async () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'windows' } as any);
    const home = makeHome(); home.componentDidMount();
    const nav = navigation(home.render()), footer = nav.props.children[1];
    expect(nav.props.children[0].props.children.flat().map((node: any) => node.props.ariaLabel)).toEqual(['首页', '发现', '消息', '私信']);
    expect(footer.props.className).toBe('desktopSideNavFooter');
    expect(footer.props.children[0].props.className).toBe('desktopComposeButton');
    expect(footer.props.children[0].props.children.props.children).toBe('发帖');
    expect(footer.props.children[2].props.ariaLabel).toBe('我的（未登录）');
    expect(avatar(home).props).toMatchObject({ username: '', style: { width: '32px', height: '32px' } });
    expect(avatar(home).props.src).toBe('');
    expect(elements(home.render()).filter(node => node.type === 'Me')).toHaveLength(0);
    await footer.props.children[2].props.onClick(); expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=4' }); expect(home.state.selectedTabIndex).toBe(0);
    expect(Taro.navigateTo).not.toHaveBeenCalled(); home.componentWillUnmount();
  });
  it.each(['ios', 'android', 'devtools'])('preserves every non-PC wide-sidebar local selection and independent compose route on %s', async platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = makeHome(); home.componentDidMount(); flushGeometry(); geometry.queries[0].callback(rect(1032));
    const entry = (label: string) => elements(navigation(home.render())).find(node => node.props?.ariaLabel === label);
    for (const [label, index] of [['首页', 0], ['发现', 1], ['消息', 3], ['私信', 5], ['设置', 6], ['我的（未登录）', 4], ['首页', 0]] as const) {
      await entry(label).props.onClick(); expect(home.state.selectedTabIndex).toBe(index);
    }
    await entry('发帖').props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/createTopic/index' });
    expect(home.state.selectedTabIndex).toBe(0); expect(Taro.redirectTo).not.toHaveBeenCalled(); expect(history.reset).not.toHaveBeenCalled();
    home.componentWillUnmount();
  });
  it.each(['windows', 'mac', 'devtools'])('routes settings by client identity and renders existing content above the avatar without changing Me visibility', async platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = makeHome(); home.componentDidMount(); home.setState({ selectedTabIndex: 3, unreadNotifications: 2, visitedTabs: { 0: true, 3: true, 4: true }, wideTabs: true });
    const footer = navigation(home.render()).props.children[1];
    expect(footer.props.children.map((node: any) => node.props.className)).toEqual(['desktopComposeButton', 'desktopSettingsButton', 'desktopAccountButton']);
    const settings = footer.props.children[1]; expect(settings.props.ariaLabel).toBe('设置'); expect(settings.props.ariaRole).toBe('button');
    expect(elements(settings).find(node => node.props?.className === 'desktopSettingsIcon').props.tone).toBe('secondary');
    await settings.props.onClick(); expect(Taro.navigateTo).not.toHaveBeenCalled();
    if (platform !== 'devtools') {
      expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=6' }); expect(home.state.selectedTabIndex).toBe(3);
      (home as any).selectContent(6);
    } else expect(Taro.redirectTo).not.toHaveBeenCalled();
    expect(home.state.selectedTabIndex).toBe(6);
    expect(home.state.visitedTabs).toEqual({ 0: true, 3: true, 4: true, 6: true });
    const content = () => elements(home.render()).find(node => node.type === 'SettingsContent');
    expect(content().props).toMatchObject({ embedded: true, active: true });
    expect(navigation(home.render()).props.children[1].props.children[1].props.className).toContain('desktopSettingsButton--active');
    home.setState({ pageVisible: false }); expect(content().props.active).toBe(false); home.setState({ pageVisible: true });
    const me = () => elements(home.render()).find(node => node.type === 'Me');
    expect(me().props.hideSettings).toBe(true);
    for (const wideTabs of [false, true, false]) { home.setState({ wideTabs }); expect(me().props.hideSettings).toBe(wideTabs); }
    home.setState({ wideTabs: true }); geometry.hideTab = true;
    expect(me().props.hideSettings).toBe(false); expect(navigation(home.render())).toBeUndefined();
  });
  it.each(['windows', 'mac', 'devtools'])('routes private selection by client identity and preserves the existing content, footer and unread rendering on %s', async platform => {
    geometry.navbar = true; vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = makeHome(); home.componentDidMount(); home.setState({ wideTabs: true, selectedTabIndex: 3, unreadNotifications: 2, visitedTabs: { 0: true, 3: true, 4: true } });
    const list = () => elements(home.render()).find(node => node.type === 'MessageConversationList');
    expect(list()).toBeUndefined();
    const entries = navigation(home.render()).props.children[0].props.children.flat();
    expect(entries.map((node: any) => node.props.ariaLabel)).toEqual(['首页', '发现', '消息', '私信']);
    const privateMessage = entries[3]; expect(privateMessage.props.className).toBe('desktopNavItem'); expect(privateMessage.props.ariaRole).toBe('button');
    const icon = elements(privateMessage).find(node => node.props?.className === 'tabIcon'); expect(icon.props.tone).toBe('secondary'); expect(icon.props.src).toBeDefined();
    await privateMessage.props.onClick(); expect(Taro.navigateTo).not.toHaveBeenCalled();
    if (platform !== 'devtools') {
      expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=5' }); expect(home.state.selectedTabIndex).toBe(3);
      (home as any).selectContent(5);
    } else expect(Taro.redirectTo).not.toHaveBeenCalled();
    expect(home.state.selectedTabIndex).toBe(5); expect(home.state.visitedTabs).toEqual({ 0: true, 3: true, 4: true, 5: true }); expect(home.state.unreadNotifications).toBe(2);
    const nav = navigation(home.render()), selected = nav.props.children[0].props.children.flat();
    expect(nav.props.className).toBe('desktopSideNav'); expect(selected[3].props.className).toContain('desktopNavItem--active');
    expect(elements(selected[3]).find(node => node.props?.className === 'tabIcon').props.tone).toBe('accent');
    expect(elements(selected[2]).filter(node => node.props?.className === 'tabUnreadDot')).toHaveLength(1);
    expect(selected.filter((node: any) => node.props.ariaLabel !== '消息').flatMap(elements).filter(node => node.props?.className === 'tabUnreadDot')).toHaveLength(0);
    expect(nav.props.children[1].props.children.map((node: any) => node.props.className)).toEqual(['desktopComposeButton', 'desktopSettingsButton', 'desktopAccountButton']);
    expect(list().props).toMatchObject({ embedded: true, active: true }); expect(list().props.header).toBeUndefined(); expect(list().props.compact).toBeUndefined();
    expect(elements(home.render()).find(node => node.type === 'Me').props.hideSettings).toBe(true);
    const main = elements(home.render()).find(node => node.props?.className === 'homeMain');
    const content = elements(main).find(node => node.props?.className === 'tabContent');
    expect(content.props.children).toHaveLength(7); expect(elements(content.props.children[4]).find(node => node.type === 'MessageConversationList').props).toMatchObject({ embedded: true, active: true });
    expect(content.props.children.map((node: any) => node.props.style.display)).toEqual(['none', 'none', 'none', 'none', 'block', 'none', 'none']);
    expect(elements(main).find(node => node.props?.className === 'navTitle').props.children).toBe('私信');
    for (const pageVisible of [false, true]) { home.setState({ pageVisible }); expect(list().props.active).toBe(pageVisible); }
    for (const wideTabs of [false, true, false]) { home.setState({ wideTabs }); expect(list().props.active).toBe(true); expect(home.state.selectedTabIndex).toBe(5); }
    geometry.hideTab = true; expect(list().props.active).toBe(true); expect(navigation(home.render())).toBeUndefined();
    geometry.hideTab = false;
    const bottom = navigation(home.render()); expect(bottom.props.children.map((node: any) => node.key)).toEqual(['0', '1', '2', '3', '4']);
    bottom.props.children[3].props.onClick(); expect(home.state.selectedTabIndex).toBe(3); expect(list().props.active).toBe(false);
    bottom.props.children[0].props.onClick(); expect(home.state.selectedTabIndex).toBe(0); expect(list().props.active).toBe(false);
    home.setState({ wideTabs: true }); await navigation(home.render()).props.children[0].props.children.flat()[3].props.onClick();
    if (platform !== 'devtools') { expect(list().props.active).toBe(false); (home as any).selectContent(5); }
    expect(list().props.active).toBe(true);
    expect(Taro.navigateTo).not.toHaveBeenCalled();
  });
  it('supports private content entry hints without adding a sixth mobile navigation item or automatically redirecting', () => {
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: geometry.owner, router: { params: { tab: '5' } } } as any);
    const home = makeHome(); expect(home.state.selectedTabIndex).toBe(5); expect(home.state.visitedTabs).toEqual({ 5: true });
    expect(elements(home.render()).find(node => node.type === 'MessageConversationList').props.active).toBe(true);
    expect(navigation(home.render()).props.children).toHaveLength(5); expect(Taro.navigateTo).not.toHaveBeenCalled();
    vi.mocked(Taro.getCurrentInstance).mockImplementation(() => ({ page: geometry.owner, router: { params: {} } } as any));
  });
  it.each([{ platform: 'windows', renderer: 'webview', embedded: true }, { platform: 'mac', renderer: 'webview', embedded: true }, { platform: 'windows', renderer: 'skyline', embedded: false }, { platform: 'devtools', renderer: 'webview', embedded: false }, { platform: 'ios', renderer: 'skyline', embedded: false }])('redirects PC compose by actual renderer and retains standalone routing and existing embedded content guards on %s', async ({ platform, renderer, embedded }) => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any); vi.stubGlobal('getCurrentPages', () => [{ renderer }]);
    const home = makeHome(); home.componentDidMount(); home.setState({ wideTabs: true }); geometry.navbar = true;
    const compose = navigation(home.render()).props.children[1].props.children[0]; await compose.props.onClick();
    if (embedded) {
      expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/home/index?tab=2' });
      expect(Taro.navigateTo).not.toHaveBeenCalled(); expect(home.state.selectedTabIndex).toBe(0); expect(home.state.visitedTabs).toEqual({ 0: true });
      (home as any).selectContent(2);
      const editor = () => elements(home.render()).find(node => node.type === 'CreateTopicContent');
      expect(editor().props).toMatchObject({ embedded: true, active: true });
      expect(navigation(home.render()).props.children[1].props.children[0].props.className).toContain('desktopComposeButton--active');
      home.setState({ selectedTabIndex: 0 }); expect(editor().props.active).toBe(false);
      home.setState({ selectedTabIndex: 2, pageVisible: false }); expect(editor().props.active).toBe(false);
      home.setState({ pageVisible: true }); editor().props.onPublished(); expect(home.state.selectedTabIndex).toBe(0); expect(editor().props.active).toBe(false);
    } else {
      expect(platform === 'windows' || platform === 'mac' ? Taro.redirectTo : Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/createTopic/index' });
      if (platform === 'devtools' || platform === 'ios') expect(Taro.redirectTo).not.toHaveBeenCalled();
      expect(home.state.selectedTabIndex).toBe(0); expect(home.state.visitedTabs[2]).toBeUndefined();
    }
  });
  it.each([{ platform: 'windows', renderer: 'webview', selected: 2 }, { platform: 'windows', renderer: 'skyline', selected: 0 }, { platform: 'ios', renderer: 'webview', selected: 0 }])('gates tab2 entry hints by real PC WebView without auto navigation on %s', ({ platform, renderer, selected }) => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any); vi.stubGlobal('getCurrentPages', () => [{ renderer }]);
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: geometry.owner, router: { params: { tab: '2' } } } as any);
    const home = makeHome(); expect(home.state.selectedTabIndex).toBe(selected); expect(Taro.navigateTo).not.toHaveBeenCalled();
    vi.mocked(Taro.getCurrentInstance).mockImplementation(() => ({ page: geometry.owner, router: { params: {} } } as any));
  });
  it('reuses loaded own avatar, clears on account events and rejects old A -> B -> A publishers and signout', () => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'mac' } as any);
    geometry.username = 'A'; const home = makeHome(); home.setState({ visitedTabs: { 0: true, 4: true } }); home.componentDidMount();
    const oldA = publisher(home); oldA({ account: 'A', avatarUrl: 'synthetic-A' }); expect(avatar(home).props.src).toBe('synthetic-A');
    account('B'); expect(avatar(home).props.src).toBe(''); const oldB = publisher(home);
    oldA({ account: 'A', avatarUrl: 'late-A' }); oldB({ account: 'A', avatarUrl: 'wrong-owner' }); expect(avatar(home).props.src).toBe('');
    oldB({ account: 'B', avatarUrl: 'synthetic-B' }); expect(avatar(home).props.src).toBe('synthetic-B');
    account('A'); oldA({ account: 'A', avatarUrl: 'late-original-A' }); oldB({ account: 'B', avatarUrl: 'late-B' }); expect(avatar(home).props.src).toBe('');
    const newA = publisher(home); newA({ account: 'A', avatarUrl: 'new-A' }); expect(avatar(home).props.src).toBe('new-A');
    account(''); newA({ account: 'A', avatarUrl: 'signed-out-A' }); expect(avatar(home).props.src).toBe('');
    const before = home.state; home.componentWillUnmount(); account('A'); newA({ account: 'A', avatarUrl: 'unmounted-A' });
    expect(home.state).toBe(before); expect(geometry.accounts.size).toBe(0); expect(geometry.accountStops[0]).toHaveBeenCalledTimes(1);
  });
});

describe("renderer-specific home layout", () => {
  it("limits native wrapper sizing to Skyline", () => {
    expect(listProps().className).toBe("topicList topicList--skyline");
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(listProps().className).toBe("topicList");
  });
  it("adds the device safe inset below Skyline tabs", () => {
    expect(tabProps().className).toBe("bottomTab bottomTab--skyline");
    expect(tabProps().style).toEqual({ paddingBottom: "34px" });
  });
  it("keeps a small baseline inset on devices without a bottom safe area", () => {
    vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth: 375 } as any);
    expect(tabProps().style).toEqual({ paddingBottom: "8px" });
  });
  it.each(['windows', 'mac'])('keeps %s left with no bottom safe-area inset across narrow and wide panes', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    for (const windowWidth of [450, 750, 1400]) {
      vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth } as any);
      expect(tabProps().style).toBeUndefined();
      vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth, safeArea: { bottom: 824 } } as any);
      expect(tabProps().style).toBeUndefined();
    }
  });
  it.each(['windows', 'mac'])('keeps independent side destinations, text compose and bottom avatar on %s', async platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = new Home({}, undefined);
    home.setState = ((update: any) => {
      home.state = { ...home.state, ...(typeof update === 'function' ? update(home.state, home.props) : update) };
    }) as typeof home.setState;
    home.componentDidMount(); home.setState({ unreadNotifications: 2 });
    const footer = () => navigation(home.render());
    const actions = () => [...footer().props.children[0].props.children.flat().filter((node: any) => node.props.ariaLabel !== '私信'), footer().props.children[1].props.children[0], footer().props.children[1].props.children[2]];
    const actionIndex = (index: number) => [0, 1, 3, 2, 4].indexOf(index);
    expect(actions()).toHaveLength(5);
    expect(elements(footer()).filter(e => e.props?.className === 'tabUnreadDot')).toHaveLength(1);
    for (const index of [1, 3, 4, 0]) {
      await actions()[actionIndex(index)].props.onClick();
      expect(Taro.redirectTo).toHaveBeenLastCalledWith({ url: `/pages/home/index?tab=${index}` });
      expect(home.state.selectedTabIndex).toBe(0);
      (home as any).selectContent(index);
      expect(actions()[actionIndex(index)].props.className).toContain(index === 4 ? 'desktopAccountButton--active' : 'desktopNavItem--active');
      home.setState({ selectedTabIndex: 0 });
    }
    expect(home.state.visitedTabs).toEqual({ 0: true, 1: true, 3: true, 4: true });
    await actions()[actionIndex(2)].props.onClick();
    expect(Taro.redirectTo).toHaveBeenCalledWith({ url: '/pages/createTopic/index' });
    expect(Taro.navigateTo).not.toHaveBeenCalled();
    expect(home.state.selectedTabIndex).toBe(0);
    home.setState({ unreadNotifications: 0 });
    expect(elements(footer()).filter(e => e.props?.className === 'tabUnreadDot')).toHaveLength(0);
  });
  it.each(['ios', 'android', 'devtools'])('preserves the original mobile five-action bottom navigation on %s', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const home = makeHome(); const tabs = () => navigation(home.render());
    expect(tabs().props.className).toContain('bottomTab'); expect(tabs().props.children.map((node: any) => node.key)).toEqual(['0', '1', '2', '3', '4']);
    expect(elements(tabs()).filter(node => node.type === 'ShareElement')).toHaveLength(1);
    for (const index of [1, 3, 4, 0]) { tabs().props.children[index].props.onClick(); expect(home.state.selectedTabIndex).toBe(index); }
    expect(elements(tabs()).filter(node => node.type === 'UserAvatar')).toHaveLength(0);
    tabs().props.children[2].props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledTimes(1); expect(home.state.selectedTabIndex).toBe(0);
    expect(Taro.redirectTo).not.toHaveBeenCalled(); expect(history.reset).not.toHaveBeenCalled();
  });
  it("never produces a negative safe inset", () => {
    vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, safeArea: { bottom: 850 } } as any);
    expect(getBottomSafeAreaInset()).toBe(0);
  });
  it("leaves WebView tabs on their existing CSS safe-area path", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(tabProps().className).toBe("bottomTab");
    expect(tabProps().style).toBeUndefined();
  });
  it("defaults to the WebView layout while the page renderer is unavailable", () => {
    vi.stubGlobal("getCurrentPages", () => []);
    expect(listProps().className).toBe("topicList");
    expect(tabProps().style).toBeUndefined();
  });
  it("shares reference card spacing while preserving native content-sized wrappers", () => {
    const source = readFileSync("src/pages/home/topics/topicList/index.scss", "utf8");
    const [baseline, native] = source.split(".topicList--skyline");
    const override = native.split(".topicListEmpty")[0];
    expect(baseline).toContain("margin: 0 22rpx 14rpx;");
    expect(baseline).toContain("padding: 22rpx 26rpx 20rpx;");
    expect(baseline).toContain("min-height: 132rpx;");
    expect(baseline).toContain("margin-top: 16rpx;");
    expect(override).toContain("height: auto;");
    expect(override).toContain("flex: none;");
    expect(override).not.toMatch(/margin(?:-top|-bottom)?:|padding(?:-top|-bottom)?:/);
  });
});
