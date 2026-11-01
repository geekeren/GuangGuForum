import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { readFileSync } from "node:fs";
import Home from "../../pages/home";
import TopicList from "../../pages/home/topics/topicList";
import { getBottomSafeAreaInset } from "../dimension";

vi.mock("@tarojs/taro", () => ({
  default: {
    getWindowInfo: vi.fn(() => ({ screenHeight: 844, windowWidth: 390, safeArea: { bottom: 810 } })),
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
vi.mock("../../pages/config", () => ({ ENABLE_CUSTOM_NAVBAR: false, HIDE_TAB: false }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/SearchEntry", () => ({ default: "SearchEntry" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "AddToDesktopGuide" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: {} }));
vi.mock("../unreadNotifications", () => ({ getUnreadNotificationCount: () => 0, subscribeUnreadNotifications: vi.fn() }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../urls", () => ({ urlPathVaiable: () => () => ({ params: { tid: "1" } }) }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function tabProps() {
  return elements(new Home({}, {}).render()).find(e => e.props?.className?.split(" ").includes("bottomTab")).props;
}
function listProps() {
  const list = new TopicList({ getTopics: vi.fn() }, {});
  list.state = { topics: [{ link: "/t/1" } as any], loadingPage: 1 };
  return elements(list.render()).find(e => e.type === "ScrollView").props;
}

beforeEach(() => {
  vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
  vi.mocked(Taro.getWindowInfo).mockReturnValue({ screenHeight: 844, windowWidth: 390, safeArea: { bottom: 810 } } as any);
});
afterEach(() => vi.unstubAllGlobals());

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
