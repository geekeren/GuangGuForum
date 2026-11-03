import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro, { useShareAppMessage, useShareTimeline } from "@tarojs/taro";
import Home from "../../pages/home";
import Settings from "../../pages/settings";
import TopicDetail from "../../pages/topicDetail";

const harness = vi.hoisted(() => ({ detail: undefined as any, params: { tid: "123", p: "2", replyId: "456" } as Record<string, string> }));
vi.mock("react", async original => ({
  ...await original<any>(),
  useState: (initial: any) => [typeof initial === "function" ? initial() : initial, vi.fn()],
  useRef: (initial: any) => ({ current: initial }), useEffect: vi.fn(),
}));
vi.mock("@tarojs/components", () => Object.fromEntries(["View", "Text", "Button", "Switch", "Image", "ScrollView", "ShareElement"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({
  default: { useShareAppMessage: vi.fn(), useDidHide: vi.fn(), useDidShow: vi.fn(), getCurrentInstance: () => ({}), navigateTo: vi.fn() },
  useRouter: () => ({ path: "/pages/topicDetail/index", params: harness.params }),
  useShareAppMessage: vi.fn(), useShareTimeline: vi.fn(), useDidShow: vi.fn(), useReady: vi.fn(),
}));
vi.mock("guanggu-forum-api", () => ({ logout: vi.fn(), getTopicDetail: vi.fn(), commentUpvote: vi.fn(), createNewComment: vi.fn() }));
vi.mock("../../pages/home/topics", () => ({ default: "Topics" }));
vi.mock("../../pages/home/discovery", () => ({ default: "Discovery" }));
vi.mock("../../pages/home/notifications", () => ({ default: "Notifications" }));
vi.mock("../../pages/me", () => ({ default: "Me" }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide", checkMiniProgramAdded: vi.fn() }));
vi.mock("../../components/SearchEntry", () => ({ default: "SearchEntry" }));
vi.mock("../../components/ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/UserAvatar", () => ({ default: "UserAvatar" }));
vi.mock("../../components/Loading", () => ({ default: "Loading" }));
vi.mock("../../components/TopicTag", () => ({ default: "TopicTag" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../../components/AdBanner", () => ({ default: "AdBanner" }));
vi.mock("../../pages/topicDetail/relatingTopics", () => ({ default: "RelatingTopics" }));
vi.mock("../../pages/topicDetail/CommentComposer", () => ({ default: "CommentComposer" }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ data: harness.detail, request: vi.fn(), requestFresh: vi.fn(), setData: vi.fn() }) }));
vi.mock("../../hooks/useCurrentUsername", () => ({ useCurrentUsername: () => ({ username: "", loading: false, retry: vi.fn() }) }));
vi.mock("../../hooks/useCommentPhotoUploads", () => ({ useCommentPhotoUploads: vi.fn() }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => "" }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn() }, CacheCategory: {} }));
vi.mock("../renderer", () => ({ isSkyline: () => true, getScrollViewType: () => "custom" }));
vi.mock("../linkHandler", () => ({ linkHandler: vi.fn() }));
vi.mock("../ad", () => ({ isAdDisabled: () => false, getAdDisabledDays: () => 0, disableAd: vi.fn() }));
vi.mock("../unreadNotifications", () => ({ getUnreadNotificationCount: () => 0, subscribeUnreadNotifications: vi.fn() }));
vi.mock("../recentlyViewedTopics", () => ({ recordRecentlyViewedTopic: vi.fn() }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}
// Exercise this installed Taro version's actual native side-effect lifecycle registration rule.
const runtime = readFileSync("node_modules/@tarojs/runtime/dist/dsl/common.js", "utf8");
const registration = runtime.slice(runtime.indexOf("SIDE_EFFECT_LIFECYCLES.forEach(lifecycle =>"), runtime.indexOf("    config.eh = eventHandler;"));
const register = new Function("component", "pageConfig", "safeExecute", "env", "SIDE_EFFECT_LIFECYCLES", `const config = {}; ${registration}; return config;`);
function nativeRegistration(component: any, pageConfig: any) {
  return register(component, pageConfig, vi.fn(), { document: { getElementById: () => null } }, ["onShareAppMessage", "onShareTimeline"]);
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("definePageConfig", (config: any) => config);
  harness.detail = undefined; harness.params = { tid: "123", p: "2", replyId: "456" };
});
afterEach(() => vi.unstubAllGlobals());

describe("native page sharing registration and payloads", () => {
  it("registers settings friend sharing and keeps the native share button targeting home", async () => {
    const config = (await import("../../pages/settings/index.config")).default;
    expect(config.enableShareAppMessage).toBe(true);
    expect(Object.keys(nativeRegistration(Settings, config))).toEqual(["onShareAppMessage"]);
    const tree = elements(Settings());
    expect(tree.find(element => element.type === "Button" && element.props["open-type"] === "share")).toBeDefined();
    const callback = vi.mocked(Taro.useShareAppMessage).mock.calls[0][0];
    expect(callback({} as any)).toEqual({ title: "过早客 - 武汉本地生活社区", path: "/pages/home/index" });
  });

  it("registers both home lifecycles and shares generic home rather than private tab state", async () => {
    const config = (await import("../../pages/home/index.config")).default;
    expect(config).toMatchObject({ enableShareAppMessage: true, enableShareTimeline: true, renderer: "skyline" });
    expect(Object.keys(nativeRegistration(Home, config))).toEqual(["onShareAppMessage", "onShareTimeline"]);
    const home = new Home({}, {});
    home.state.selectedTabIndex = 3; home.state.initialTopicTab = "interest";
    expect(home.onShareAppMessage()).toEqual({ title: "过早客 - 武汉本地生活社区", path: "/pages/home/index" });
    expect(home.onShareTimeline()).toEqual({ title: "过早客 - 武汉本地生活社区", query: "" });
  });

  it('opens the WebView composer without a Skyline-only custom route', async () => {
    const home = new Home({}, {});
    (home as any).handleClick(2);
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/createTopic/index' });
    const config = (await import('../../pages/createTopic/index.config')).default;
    expect(config.renderer).toBe('webview');
  });

  it("registers detail sharing and includes tid in friend path and timeline query even before data loads", async () => {
    const config = (await import("../../pages/topicDetail/index.config")).default;
    expect(Object.keys(nativeRegistration(TopicDetail, config))).toEqual(["onShareAppMessage", "onShareTimeline"]);
    TopicDetail();
    const friend = vi.mocked(useShareAppMessage).mock.calls[0][0]({} as any);
    const timeline = vi.mocked(useShareTimeline).mock.calls[0][0]();
    expect(friend).toMatchObject({ path: "/pages/topicDetail/index?p=2&replyId=456&tid=123" });
    expect(timeline).toMatchObject({ query: "p=2&replyId=456&tid=123" });
    expect(timeline).not.toHaveProperty("path");
    expect(new URLSearchParams(timeline.query).get("tid")).toBe("123");
  });

  it("retains the loaded topic title and image in both share hook payloads", () => {
    harness.detail = {
      title: "真实标题", content: '<p>正文</p><img src="https://images.example.com/topic.png">',
      category: "生活", categoryLink: "/node/water", author: "user", createTime: "今天",
      commentTotalCount: "", comments: [], relatingTopics: [],
    };
    TopicDetail();
    const friend = vi.mocked(useShareAppMessage).mock.calls[0][0]({} as any);
    const timeline = vi.mocked(useShareTimeline).mock.calls[0][0]();
    for (const payload of [friend, timeline]) {
      expect(payload).toMatchObject({ title: "真实标题", imageUrl: "https://images.example.com/topic.png" });
    }
    expect(friend.path).toBe("/pages/topicDetail/index?p=2&replyId=456&tid=123");
    expect(timeline.query).toBe("p=2&replyId=456&tid=123");
    expect(timeline).not.toHaveProperty("path");
  });

  it("does not enable sharing on login, composition, image-host settings or disabled node lists", async () => {
    const configs = await Promise.all([
      import("../../pages/login/index.config"), import("../../pages/createTopic/index.config"),
      import("../../pages/settings/image-setting.config"), import("../../pages/node/topicList/index.config"),
    ]);
    for (const { default: config } of configs) {
      expect(Object.keys(nativeRegistration(() => null, config))).toEqual([]);
    }
  });
});
