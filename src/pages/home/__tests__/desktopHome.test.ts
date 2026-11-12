import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsx } from "react/jsx-runtime";
import Taro from "@tarojs/taro";
import { getHotNodes, getHotTopics, type HotTopic } from "guanggu-forum-api";
import DesktopLayout from "../../../components/DesktopLayout";
import DesktopSidebar from "../DesktopSidebar";
import { useDesktopCommunity } from "../useDesktopCommunity";

const h = vi.hoisted(() => ({
  state: [] as unknown[], cursor: 0, effects: [] as (() => (() => void) | undefined)[],
  viewport: { width: 375, height: 667, isDesktop: false }, desktopClient: false, windows: false,
}));
vi.mock("../../../hooks/usePageScope", async () => {
  const taroModule = await import("@tarojs/taro");
  const taro = taroModule.default;
  const useRouter = "useRouter" in taroModule ? taroModule.useRouter : undefined;
  const { legacyPageScopeMock } = await import("../../../testSupport/legacyPageScopeMock");
  const mock = legacyPageScopeMock(taro, useRouter);
  const scope = mock.usePageScope();
  Object.defineProperties(scope.viewport, { isDesktopClient: { get: () => h.desktopClient }, isWindowsClient: { get: () => h.windows } });
  return { ...mock, usePageScope: () => scope };
});
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.state)) h.state[index] = initial;
    return [h.state[index], (next: unknown) => { h.state[index] = typeof next === "function" ? next(h.state[index]) : next; }];
  },
  useEffect: (effect: () => (() => void) | undefined) => { h.effects.push(effect); },
}));
vi.mock("../../../hooks/useViewport", () => ({ useViewport: () => h.viewport }));
vi.mock("../../../hooks/usePageRenderer", () => ({ usePageScrollViewType: () => "custom" }));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: { navigateTo: vi.fn() } }));
vi.mock("guanggu-forum-api", () => ({ getHotTopics: vi.fn(), getHotNodes: vi.fn() }));
vi.mock("../../../components/ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../../components/SearchEntry", () => ({ default: "SearchEntry" }));
function nodes(tree: any): any[] {
  return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
function RenderCommunity(active: boolean) { h.cursor = 0; h.effects = []; return useDesktopCommunity(active); }
function renderSidebar() { h.cursor = 0; h.effects = []; return nodes(DesktopSidebar({ active: true, onDiscovery: vi.fn() })); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const topic = (title: string): HotTopic => ({ title, topicLink: "/t/123", username: "fixture", userLink: "/u/fixture", userAvatarUrl: "" });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  h.desktopClient = false; h.windows = false; h.state = []; h.effects = []; h.cursor = 0; h.viewport = { width: 375, height: 667, isDesktop: false };
  vi.resetAllMocks(); vi.mocked(getHotTopics).mockResolvedValue([]); vi.mocked(getHotNodes).mockResolvedValue([]);
});

describe("responsive desktop home shell", () => {
  it("retains a single center and stable parent path while adding/removing only desktop siblings", () => {
    const child = jsx("div", { className: "FixtureCenter" });
    const sidebar = jsx("aside", { className: "FixtureSidebar" });
    const mobile = DesktopLayout({ children: child, sidebar });
    h.desktopClient = true; h.viewport = { width: 1024, height: 768, isDesktop: true };
    const desktop = DesktopLayout({ children: child, sidebar });
    const mobileCenter = nodes(mobile).find(element => element.props?.className === "desktopContent");
    const desktopCenter = nodes(desktop).find(element => element.props?.className === "desktopContent");
    expect(mobileCenter.props.children).toBe(child); expect(desktopCenter.props.children).toBe(child);
    expect(nodes(desktop).filter(element => element.props?.className === "FixtureCenter")).toHaveLength(1);
    expect(nodes(mobile).some(element => element.props?.className === "desktopRail")).toBe(false);
    expect(nodes(mobile).some(element => element.props?.className === "FixtureSidebar")).toBe(false);
    expect(desktop.props.className).toContain("desktopLayout--wide");
    h.desktopClient = false; h.viewport = { width: 1023, height: 768, isDesktop: false };
    expect(DesktopLayout({ children: child }).props.className).toBe("desktopLayout");
  });

  it('keeps narrow desktop rail tabs and unread indicators interactive but omits duplicate compose/detail rails on Windows', () => {
    h.desktopClient = true; h.windows = true; h.viewport.width = 450;
    const onSelectTab = vi.fn();
    const tree = nodes(DesktopLayout({ onSelectTab, selectedTab: 3, unreadNotifications: 4 }));
    tree.find(element => element.props?.ariaLabel === '发现').props.onClick(); expect(onSelectTab).toHaveBeenCalledWith(1);
    expect(tree.some(element => element.props?.className === 'desktopUnreadDot')).toBe(true);
    for (const width of [450, 1920]) {
      h.viewport = { width, height: 900, isDesktop: width >= 1024 };
      for (const variant of ['compose', 'detail'] as const) {
        const pane = nodes(DesktopLayout({ variant, sidebar: jsx('aside', {}) }));
        expect(pane.some(element => element.props?.className === 'desktopRail')).toBe(false);
        expect(pane.some(element => element.props?.className === 'desktopSidebar')).toBe(false);
      }
    }
  });

  it("reuses current home tab callbacks, interest shortcut and the unchanged compose route", () => {
    h.desktopClient = true; h.viewport.isDesktop = true;
    const onSelectTab = vi.fn(), onInterest = vi.fn();
    const tree = nodes(DesktopLayout({ children: null, onSelectTab, onInterest, selectedTab: 3, unreadNotifications: 1 }));
    tree.find(element => element.props?.ariaLabel === "发现").props.onClick();
    expect(onSelectTab).toHaveBeenCalledWith(1);
    tree.find(element => element.props?.ariaLabel === "我的关注").props.onClick(); expect(onInterest).toHaveBeenCalledOnce();
    tree.find(element => element.props?.ariaLabel === "发布帖子").props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/createTopic/index" });
    expect(tree.some(element => element.props?.className === "desktopUnreadDot")).toBe(true);
  });
});

describe("desktop public community sidebar", () => {
  it("loads only public hot topics and leaves popular nodes to the rail", async () => {
    vi.mocked(getHotTopics).mockResolvedValue([{ ...topic("真实讨论"), category: "生活", commentCount: "12" }, { ...topic("无评论元数据"), topicLink: "/t/124" }]);
    renderSidebar(); h.effects[0](); await flush();
    const tree = renderSidebar();
    expect(tree.some(element => element.props?.children === "真实讨论")).toBe(true);
    expect(tree.some(element => element.props?.children === "生活 · 12 条评论")).toBe(true);
    expect(getHotNodes).not.toHaveBeenCalled();
    expect(tree.some(element => element.props?.children === "热门板块")).toBe(false);
    tree.find(element => element.props?.ariaLabel === "真实讨论").props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=123" });
  });

  it("does not fetch when inactive and ignores requests after hiding or unmounting", async () => {
    RenderCommunity(false); h.effects[0](); expect(getHotTopics).not.toHaveBeenCalled();
    const hot = deferred<HotTopic[]>();
    vi.mocked(getHotTopics).mockReturnValue(hot.promise);
    RenderCommunity(true); const cleanup = h.effects[0](); cleanup?.();
    hot.resolve([topic("迟到的讨论")]); await flush();
    expect(RenderCommunity(false)).toMatchObject({ topics: [] });
  });

  it("retries failed topics without requesting popular nodes", async () => {
    vi.mocked(getHotTopics).mockRejectedValueOnce(new Error("offline"));
    RenderCommunity(true); h.effects[0](); await flush();
    let community = RenderCommunity(true);
    expect(community.topicsError).toBe(true);
    community.retry(); community = RenderCommunity(true); h.effects[0](); await flush();
    expect(RenderCommunity(true).topicsError).toBe(false); expect(getHotTopics).toHaveBeenCalledTimes(2);
    expect(getHotNodes).not.toHaveBeenCalled();
  });
});
