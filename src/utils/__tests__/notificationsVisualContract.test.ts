import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from 'node:module';
const requireProject = createRequire(`${process.cwd()}/package.json`);
function declarations(selector: string) {
  const result: Record<string, string> = {};
  requireProject('postcss').parse(requireProject('sass').compile('src/pages/home/notifications/index.scss').css).walkRules((rule: any) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((decl: any) => { result[decl.prop] = decl.value; });
  });
  return result;
}
import Taro from "@tarojs/taro";
import Notifications from "../../pages/home/notifications";
import { resolveSearchResult } from "guanggu-forum-api";
import { fetchAndCacheNodeNavigation, getCachedNodeNavigation } from "../nodeNavigation";
import { subscribeUnreadNotifications } from "../unreadNotifications";
import { APP_ROUTES } from '../appRoutes';

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
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
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
  await findAll(render(), 'messageHubCategory')[2].props.onClick();
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

beforeEach(() => {
  vi.clearAllMocks();
  harness.state = []; harness.username = "viewer"; harness.checkingLogin = false;
  harness.loginError = undefined; harness.notifications = [notification]; harness.loading = false;
  harness.unread = 0; harness.groups = [];
  harness.request.mockResolvedValue([notification]);
  vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([]);
});

describe('desktop notification geometry and mobile baseline', () => {
  it('bounds the three entry icons, row avatar and quoted excerpt independently of pane width', () => {
    const pc = (suffix: string) => declarations(`.themePageHost--desktop .notificationsPage ${suffix}`);
    expect(pc('.messageHubCategories')).toMatchObject({ padding: '13PX 12PX 12PX' });
    expect(pc('.messageHubCategoryIcon')).toMatchObject({ width: '40PX', height: '40PX', 'border-radius': '12PX' });
    expect(pc('.messageHubIcon')).toMatchObject({ width: '20PX', height: '20PX' });
    expect(pc('.notificationItem')).toMatchObject({ margin: '0 11PX 9PX', padding: '13PX 11PX', 'border-radius': '14PX' });
    expect(pc('.notificationAvatar .avatarImg')).toMatchObject({ width: '35PX', height: '35PX', 'border-radius': '12PX' });
    expect(pc('.notificationContent')).toMatchObject({ 'margin-top': '8PX', padding: '9PX 10PX', 'border-radius': '9PX' });
    expect(pc('.notificationAvatar .avatarImg')).toMatchObject({ width: '35PX', height: '35PX' });
    expect(pc('.notificationContent .htmlWrap .html .html-link--mention')).toMatchObject({ padding: '0 6PX', 'border-radius': '5PX' });
    expect(pc('.loginPromptBadge')).toMatchObject({ width: '56PX', height: '56PX' });
    expect(pc('.notificationsList')).toMatchObject({ height: '0', 'flex-basis': '0', 'flex-grow': '1', 'flex-shrink': '1' });
    expect(declarations('.notificationsPage .messageHubCategoryIcon')).toMatchObject({ width: '80rpx', height: '80rpx', 'border-radius': '24rpx' });
    expect(declarations('.notificationsPage .notificationContent')).toMatchObject({ padding: '18rpx 20rpx', 'border-radius': '18rpx' });
  });
});

describe("notification reference layout and real-data contracts", () => {
  it("renders three existing entries, avatar, status and original HTML excerpt without bare View text", () => {
    const tree = render();
    const tabs = findAll(tree, 'messageHubCategory');
    expect(tabs).toHaveLength(3);
    expect(text(tabs[0])).toBe('评论回复');
    expect(text(tabs[1])).toBe('私信');
    expect(text(tabs[2])).toBe('社区公告');
    expect(tabs[0].props.className).toContain('messageHubCategory--active');
    expect(tabs[2].props.className).not.toContain('messageHubCategory--active');
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

  it('opens existing private and announcement pages without altering reply selection', async () => {
    const tree = render();
    findAll(tree, 'messageHubCategory')[1].props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: APP_ROUTES.messages });
    harness.groups = [{ category: '社区', nodes: [{ name: '公告', slug: 'actual-board' }] }];
    await openAnnouncements();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/node/topicList/index?node=actual-board&nodeName=%E5%85%AC%E5%91%8A' });
    expect(findAll(render(), 'messageHubCategory')[0].props.className).toContain('messageHubCategory--active');
    expect(find(render(), 'notificationTopicLink').props.children).toBe(notification.topicTitle);
  });

  it('resolves the cached or refreshed announcement slug without inventing a node', async () => {
    harness.groups = [{ category: '社区', nodes: [{ name: '公告', slug: 'actual-board' }] }];
    await openAnnouncements();
    expect(fetchAndCacheNodeNavigation).not.toHaveBeenCalled();
    vi.clearAllMocks(); harness.state = []; harness.groups = [];
    vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([{ category: '社区', nodes: [{ name: '社区公告', slug: 'real-announcements' }] }]);
    await openAnnouncements();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/node/topicList/index?node=real-announcements&nodeName=%E7%A4%BE%E5%8C%BA%E5%85%AC%E5%91%8A' });
  });

  it('keeps the announcement entry retryable and coalesces repeated pending taps', async () => {
    const pending = deferred<any[]>();
    vi.mocked(fetchAndCacheNodeNavigation).mockReturnValueOnce(pending.promise);
    const first = openAnnouncements(); const second = openAnnouncements();
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledOnce();
    pending.resolve([]); await first; await second;
    expect(Taro.navigateTo).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '暂未找到公告板块', icon: 'none' });
    harness.groups = [{ category: '社区', nodes: [{ name: '公告', slug: 'retry-node' }] }];
    await openAnnouncements();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/node/topicList/index?node=retry-node&nodeName=%E5%85%AC%E5%91%8A' });
  });

  it("derives the unread dot only from the account-scoped unread subscription", () => {
    let tree = render();
    expect(find(tree, 'messageHubUnreadDot')).toBeUndefined();
    const stop = harness.effects[0]();
    expect(stop).toBeTypeOf("function");
    vi.mocked(subscribeUnreadNotifications).mock.calls[0][0](3);
    tree = render();
    expect(find(tree, 'messageHubUnreadDot')).toBeDefined();
    vi.mocked(subscribeUnreadNotifications).mock.calls[0][0](0);
    expect(find(render(), 'messageHubUnreadDot')).toBeUndefined();
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
    await Promise.resolve();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=123&p=2&replyId=456' });
    // Resolving a notification permalink must never pop the login page.
    expect(resolveSearchResult).toHaveBeenCalledWith({ link: "/search/reply/456" }, { notifyLoginRequired: false });
    vi.mocked(resolveSearchResult).mockRejectedValue(new Error("offline"));
    find(render(), "notificationItem").props.onClick();
    await Promise.resolve();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '回复定位失败，请重试', icon: 'none' });
  });

  it("keeps a login entry even when the session check failed", () => {
    harness.username = "";
    expect(elements(render()).some(item => item.type === "LoginPrompt")).toBe(true);
    harness.loginError = new Error("offline");
    const tree = render();
    expect(elements(tree).some(item => item.type === "LoginPrompt")).toBe(true);
    expect(find(tree, "loginRetryHint").props.onClick).toBe(harness.retry);
    harness.checkingLogin = true;
    expect(elements(render()).some(item => item.type === 'Loading')).toBe(true);
    expect(findAll(render(), 'messageHubCategory')).toHaveLength(3);
  });

  it("retains loading, empty and retry states without fabricated notifications", () => {
    harness.notifications = undefined; harness.loading = true;
    expect(findAll(render(), 'messageHubCategory')).toHaveLength(3);
    expect(elements(render()).some(item => item.type === "Loading")).toBe(true);
    harness.loading = false; harness.notifications = [];
    expect(find(render(), "emptyTitle").props.children).toBe("暂无消息");
    expect(find(render(), "notificationItem")).toBeUndefined();
    harness.notifications = [notification];
    const tree = render();
    harness.state[0] = true;
    const errored = render();
    expect(find(errored, "emptyDesc").props.children).toBe("私信入口仍可使用，请检查网络后重试");
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
    await Promise.resolve();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=123&p=2&replyId=456' });
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

  it("keeps existing pale-blue quote and three-entry styling without fabricated timestamps", () => {
    const css = readFileSync("src/pages/home/notifications/index.scss", "utf8");
    const source = readFileSync("src/pages/home/notifications/index.tsx", "utf8");
    expect(css).toContain("border-radius: 28rpx;");
    expect(css).toContain('padding: 18rpx 20rpx;');
    expect(css).toContain('border-radius: 18rpx;');
    expect(css).toContain("&--active");
    expect(css).not.toMatch(/notificationShortcut/);
    expect(css).toContain('background: var(--theme-surface-alt, #f0f5fd);');
    expect(source).toContain("className='messageHubCategory messageHubCategory--active'");
    expect(css).toContain(".html-link--mention { background: var(--theme-accent-muted, #e8efff); }");
    expect(css).toContain('flex-direction: row;');
    expect(css).not.toMatch(/position: sticky|display: grid|overflow: auto/);
    expect(source).not.toMatch(/\d+\s*分钟前|notificationTime/);
    expect(source).toContain("<Text className='notificationTitle'>");
  });
});
