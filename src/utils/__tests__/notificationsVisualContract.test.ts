import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro from "@tarojs/taro";
import Notifications from "../../pages/home/notifications";
import { resolveSearchResult } from "guanggu-forum-api";
import { fetchAndCacheNodeNavigation, getCachedNodeNavigation } from "../nodeNavigation";
import { subscribeUnreadNotifications } from "../unreadNotifications";

const harness = vi.hoisted(() => ({
  state: [] as any[], cursor: 0, effects: [] as (() => any)[],
  username: "viewer", checkingLogin: false, loginError: undefined as any,
  notifications: undefined as any, loading: false, unread: 0,
  groups: [] as any[], request: vi.fn(), retry: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<any>(),
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => {
      harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next;
    }];
  },
  useRef: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = { current: initial };
    return harness.state[index];
  },
  useEffect: (effect: () => any) => harness.effects.push(effect),
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Image: "Image", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: { navigateTo: vi.fn(), showToast: vi.fn() } }));
vi.mock("guanggu-forum-api", () => ({ getNotifications: vi.fn(), resolveSearchResult: vi.fn() }));
vi.mock("../../hooks/useCurrentUsername", () => ({ useCurrentUsername: () => ({ username: harness.username, loading: harness.checkingLogin, error: harness.loginError, retry: harness.retry }) }));
vi.mock("../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ data: harness.notifications, loading: harness.loading, request: harness.request }) }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/Loading", () => ({ default: "Loading" }));
vi.mock("../../components/LoginPrompt", () => ({ default: "LoginPrompt" }));
vi.mock("../nodeNavigation", () => ({ getCachedNodeNavigation: vi.fn(() => harness.groups), fetchAndCacheNodeNavigation: vi.fn() }));
vi.mock("../unreadNotifications", () => ({
  getUnreadNotificationCount: () => harness.unread,
  subscribeUnreadNotifications: vi.fn((listener: (count: number) => void) => {
    listener(harness.unread);
    return vi.fn();
  }),
}));

function render() {
  harness.cursor = 0;
  harness.effects = [];
  return Notifications({ active: true });
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function find(tree: any, className: string) {
  return elements(tree).find(item => item.props?.className?.split(" ").includes(className))!;
}
function findAll(tree: any, className: string) {
  return elements(tree).filter(item => item.props?.className?.split(" ").includes(className));
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (typeof tree === "string") return tree;
  return tree?.props ? text(tree.props.children) : "";
}
async function openAnnouncements() {
  await findAll(render(), "notificationTab")[1].props.onClick();
  return render();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const notification = {
  username: "reply-user", userLink: "/u/reply-user", userAvatarUrl: "avatar.png",
  topicTitle: "真实主题", topicLink: "/t/123?p=2#r456",
  titleHtml: '<a href="/u/reply-user">reply-user</a> 回复了你的主题 <a href="/t/123?p=2#r456">真实主题</a>',
  content: '<p><a href="/u/viewer">@viewer</a> 真实回复正文</p>',
};
const announcement = {
  username: "admin", category: "公告", lastUpdated: "昨天 10:20", userLink: "/u/admin",
  userAvatarUrl: "avatar.png", title: "站点维护公告", link: "/t/999", commentCount: "3",
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.state = []; harness.username = "viewer"; harness.checkingLogin = false;
  harness.loginError = undefined; harness.notifications = [notification]; harness.loading = false;
  harness.unread = 0; harness.groups = [];
  harness.request.mockResolvedValue([notification]);
  vi.mocked(getNodeTopics).mockResolvedValue([announcement] as any);
  vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([]);
});

describe("notification reference layout and real-data contracts", () => {
  it("renders the two tabs, avatar, status and the original HTML excerpt without bare View text", () => {
    const tree = render();
    const tabs = findAll(tree, "notificationTab");
    expect(tabs).toHaveLength(2);
    expect(text(tabs[0])).toBe("评论回复");
    expect(text(tabs[1])).toBe("社区公告");
    expect(tabs[0].props.className).toContain("notificationTab--active");
    expect(tabs[1].props.className).not.toContain("notificationTab--active");
    expect(find(tree, "notificationUser").props.children).toBe(notification.username);
    expect(find(tree, "notificationBadge").props.children).toBe("回复了你");
    expect(find(tree, "notificationTopicLink").props.children).toBe(notification.topicTitle);
    expect(text(find(tree, "notificationTitle"))).toBe("回复了你的主题《真实主题》");
    expect(elements(tree).find(item => item.type === "HtmlRender")?.props.html).toBe(notification.content);
    expect(find(tree, "notificationUser").props).toMatchObject({ overflow: "ellipsis", maxLines: 1 });
    expect(find(tree, "notificationsList")).toMatchObject({ type: "ScrollView", props: { type: "custom", scrollY: true, enhanced: true } });
    for (const element of elements(tree).filter(item => item.type === "View")) {
      expect([element.props.children].flat(Infinity).some(child => typeof child === "string" || typeof child === "number")).toBe(false);
    }
  });

  it("switches to the announcement tab in place instead of leaving the page", async () => {
    harness.groups = [{ category: "社区", nodes: [{ name: "公告", slug: "actual-board" }] }];
    const tree = await openAnnouncementsTab();
    expect(Taro.navigateTo).not.toHaveBeenCalled();
    expect(find(tree, "notificationTabDot")).toBeUndefined();
    expect(findAll(tree, "notificationTab")[1].props.className).toContain("notificationTab--active");
    expect(find(tree, "announcementTitle").props.children).toBe("站点维护公告");
    expect(elements(tree).find(item => item.type === "HtmlRender")).toBeUndefined();
    find(tree, "notificationItem").props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=999" });
  });

  it("uses the real cached announcement node slug and never invents one", async () => {
    harness.groups = [{ category: "社区", nodes: [{ name: "公告", slug: "actual-board" }] }];
    await openAnnouncementsTab();
    expect(getNodeTopics).toHaveBeenCalledWith({ node: "actual-board", page: 1 });
    expect(fetchAndCacheNodeNavigation).not.toHaveBeenCalled();
    vi.clearAllMocks();
    harness.state = []; harness.groups = [];
    vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([{ category: "社区", nodes: [{ name: "社区公告", slug: "real-announcements" }] }]);
    await openAnnouncementsTab();
    expect(getNodeTopics).toHaveBeenCalledWith({ node: "real-announcements", page: 1 });
  });

  it("keeps the announcement tab retryable when the board cannot be resolved", async () => {
    vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([]);
    const tree = await openAnnouncementsTab(false);
    expect(getNodeTopics).not.toHaveBeenCalled();
    expect(find(tree, "emptyTitle").props.children).toBe("公告加载失败，点击重试");
    find(tree, "emptyState").props.onClick();
    expect(find(render(), "emptyTitle")).toBeDefined();
  });

  it("derives the unread dot only from the account-scoped unread subscription", () => {
    let tree = render();
    expect(find(tree, "notificationTabDot")).toBeUndefined();
    const stop = harness.effects[0]();
    expect(stop).toBeTypeOf("function");
    vi.mocked(subscribeUnreadNotifications).mock.calls[0][0](3);
    tree = render();
    expect(find(tree, "notificationTabDot")).toBeDefined();
    vi.mocked(subscribeUnreadNotifications).mock.calls[0][0](0);
    expect(find(render(), "notificationTabDot")).toBeUndefined();
  });

  it("keeps the reply tab functional without locally marking messages read", () => {
    let tree = render();
    find(tree, "notificationsList").props.onScroll();
    tree = render();
    expect(find(render(), "notificationsList").props.scrollTop).toBeUndefined();
  });

  it("preserves exact comment anchors and prevents username taps opening the topic", async () => {
    const tree = render();
    await find(tree, "notificationItem").props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=123&p=2&replyId=456" });
    expect(resolveSearchResult).not.toHaveBeenCalled();
    vi.mocked(Taro.navigateTo).mockClear();
    const stopPropagation = vi.fn();
    find(tree, "notificationUser").props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/user/index?username=reply-user" });
  });

  it("retains reply permalink resolution and failure feedback", async () => {
    harness.notifications = [{ ...notification, topicLink: "/search/reply/456" }];
    vi.mocked(resolveSearchResult).mockResolvedValue({ tid: "123", page: "2", replyId: "456" } as any);
    await find(render(), "notificationItem").props.onClick();
    await vi.waitFor(() => expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=123&p=2&replyId=456" }));
    // Resolving a notification permalink must never pop the login page.
    expect(resolveSearchResult).toHaveBeenCalledWith({ link: "/search/reply/456" }, { notifyLoginRequired: false });
    vi.mocked(resolveSearchResult).mockRejectedValue(new Error("offline"));
    find(render(), "notificationItem").props.onClick();
    await vi.waitFor(() => expect(Taro.showToast).toHaveBeenCalledWith({ title: "回复定位失败，请重试", icon: "none" }));
  });

  it("keeps a login entry even when the session check failed", () => {
    harness.username = "";
    expect(elements(render()).some(item => item.type === "LoginPrompt")).toBe(true);
    harness.loginError = new Error("offline");
    const tree = render();
    expect(elements(tree).some(item => item.type === "LoginPrompt")).toBe(true);
    expect(find(tree, "loginRetryHint").props.onClick).toBe(harness.retry);
    harness.checkingLogin = true;
    expect(render().type).toBe("Loading");
  });

  it("retains loading, empty and retry states without fabricated notifications", () => {
    harness.notifications = undefined; harness.loading = true;
    expect(findAll(render(), "notificationTab")).toHaveLength(2);
    expect(elements(render()).some(item => item.type === "Loading")).toBe(true);
    harness.loading = false; harness.notifications = [];
    expect(find(render(), "emptyTitle").props.children).toBe("暂无消息");
    expect(find(render(), "notificationItem")).toBeUndefined();
    harness.notifications = [notification];
    const tree = render();
    harness.state[0] = true;
    const errored = render();
    expect(find(errored, "emptyDesc").props.children).toBe("保留登录状态，请检查网络后重试");
    find(errored, "emptyState").props.onClick();
    expect(harness.retry).toHaveBeenCalledOnce();
    expect(tree).toBeDefined();
  });

  it.each(["提到了你", "提及了你"])("keeps the topic between the action text for %s", async (action) => {
    harness.notifications = [{ ...notification, titleHtml: `<a href='/u/reply-user'>reply-user</a> 在 <a href='/t/123?p=2#r456'><strong>真实主题</strong></a> 中${action}` }];
    const tree = render();
    expect(find(tree, "notificationBadge").props.children).toBe("提到了你");
    expect(text(find(tree, "notificationTitle"))).toBe("在《真实主题》中提到了你");
    const stopPropagation = vi.fn();
    find(tree, "notificationTopicLink").props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=123&p=2&replyId=456" }));
  });

  it("preserves reply word order and decodes text entities without duplicating the sender", () => {
    harness.notifications = [{ ...notification, titleHtml: '<a>reply-user</a>&nbsp;在 <a>真实主题</a> 中回复了你' }];
    expect(text(find(render(), "notificationTitle"))).toBe("在《真实主题》中回复了你");
    harness.notifications = [{ ...notification, titleHtml: '<a>reply-user</a> 关注了你' }];
    expect(text(find(render(), "notificationTitle"))).toBe("关注了你");
    expect(find(render(), "notificationTopicLink")).toBeUndefined();
  });

  it("classifies mentions without relabeling unknown notification actions as replies", () => {
    harness.notifications = [{ ...notification, titleHtml: '<a>reply-user</a> 提及了你 <a>主题</a>' }];
    expect(find(render(), "notificationBadge").props.children).toBe("提到了你");
    harness.notifications = [{ ...notification, titleHtml: '<a>reply-user</a> 关注了你' }];
    expect(find(render(), "notificationBadge").props.children).toBe("消息");
  });

  it("keeps scoped pale-blue quote styling, pill tabs and no fabricated timestamps", () => {
    const css = readFileSync("src/pages/home/notifications/index.scss", "utf8");
    const source = readFileSync("src/pages/home/notifications/index.tsx", "utf8");
    expect(css).toContain("border-radius: 28rpx;");
    expect(css).toContain("padding: 18rpx 22rpx 16rpx;");
    expect(css).toContain("border-radius: 29rpx;");
    expect(css).toContain("&--active");
    expect(css).not.toMatch(/notificationShortcut/);
    expect(css).not.toMatch(/::after/);
    expect(css).toContain("background: #f0f5fd;");
    expect(css).toContain(".html-link--mention { background: var(--theme-accent-muted, #e8efff); padding: 0 6rpx; border-radius: 6rpx;");
    expect(css).not.toMatch(/display: flex;\s*align-items:/);
    expect(css).not.toMatch(/position: sticky|display: grid|overflow: auto/);
    expect(source).not.toMatch(/\d+\s*分钟前|notificationTime/);
    expect(source).toContain("<Text className='notificationTitle'>");
  });
});
