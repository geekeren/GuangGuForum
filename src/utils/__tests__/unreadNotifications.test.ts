import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { parseUnreadNotifications } from "../../../packages/guanggu-forum-api/src/notification/unread";
import { createApiCacheEntry } from "../../../packages/guanggu-forum-api/src/cacheVersions";
import { request, setCacheService, setOnUnreadNotifications } from "../../../packages/guanggu-forum-api/src/client";
import { getUnreadNotificationCount, subscribeUnreadNotifications, updateUnreadNotifications } from "../unreadNotifications";

const runtime = vi.hoisted(() => ({ request: vi.fn(), username: "", store: new Map<string, any>() }));
vi.mock("@tarojs/taro", () => ({ default: {
  request: runtime.request,
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
  showToast: vi.fn(),
} }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => runtime.username }));

// Synthetic markup for the conservative parser contract; not a captured authenticated response.
const html = (count = "3", authenticated = true) => `<html><body><div id="navbar5"><div class="navbar-right">
  ${authenticated ? '<a class="avatar" href="/u/unread-test">账号</a>' : ""}
  <a href="/notifications">通知 <span>${count}</span></a>
</div></div><main><div class="notification-item">历史通知</div></main></body></html>`;

beforeEach(() => {
  runtime.store.clear(); runtime.request.mockReset(); runtime.username = "unread-test";
  setOnUnreadNotifications(null);
  setCacheService({
    get: (key) => runtime.store.get(key) ?? null,
    set: (key, value) => { runtime.store.set(key, value); return true; },
    setAsync: async (key, value) => { runtime.store.set(key, value); return true; },
    remove: (key) => { runtime.store.delete(key); }, isExpired: () => false,
  });
  updateUnreadNotifications(0, runtime.username);
});

describe("website unread notification metadata", () => {
  it("reads numeric notification-link metadata, including explicit server zero", () => {
    expect(parseUnreadNotifications(parse(html()))).toBe(3);
    expect(parseUnreadNotifications(parse(html("0")))).toBe(0);
    expect(parseUnreadNotifications(parse(html().replace('通知 <span>3</span>', '消息 (12)')))).toBe(12);
  });
  it("clears unread state for the website's empty mail-status indicator", () => {
    const indicator = '<div id="navbar5"><div class="navbar-right"><a href="/notifications" class="notification-indicator tooltipped downwards" title="现在没有未读提醒"><span class="mail-status"></span></a></div></div>';
    expect(parseUnreadNotifications(parse(indicator))).toBe(0);
    expect(parseUnreadNotifications(parse(indicator.replace("现在没有未读提醒", "有 2 条未读提醒")))).toBe(2);
  });

  it("keeps unknown markup unknown instead of deriving counts from history", () => {
    expect(parseUnreadNotifications(parse(html("")))).toBeUndefined();
    expect(parseUnreadNotifications(parse(html("99+")))).toBeUndefined();
    expect(parseUnreadNotifications(parse('<div class="notification-item">历史通知</div>'))).toBeUndefined();
    expect(parseUnreadNotifications(parse(html("9007199254740992")))).toBeUndefined();
  });
  it("propagates only authenticated successful live bodies, never cached counts", async () => {
    const callback = vi.fn(); setOnUnreadNotifications(callback);
    runtime.store.set("current_username", runtime.username);
    const key = "html_v2_develop_unread-test_https://www.guozaoke.com/notifications#api=getNotifications";
    runtime.store.set(key, createApiCacheEntry("getNotifications", html("9")));
    runtime.request.mockReturnValueOnce(new Promise(() => {}));
    expect((await request("/notifications", { cache: true, cacheApi: "getNotifications" })).fromCache).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    runtime.request.mockResolvedValueOnce({ statusCode: 200, data: html("3") });
    await request("/", { cache: false });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith(3, "unread-test");
    runtime.request.mockResolvedValueOnce({ statusCode: 503, data: html("0") });
    await request("/notifications", { cache: false });
    runtime.request.mockResolvedValueOnce({ statusCode: 200, data: html("0", false) });
    await request("/", { cache: false });
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it("updates the dot after the server notifications response, not on opening the tab", async () => {
    setOnUnreadNotifications(updateUnreadNotifications);
    runtime.request.mockResolvedValueOnce({ statusCode: 200, data: html("3") });
    await request("/", { cache: false });
    expect(getUnreadNotificationCount()).toBe(3);
    runtime.request.mockRejectedValueOnce(new Error("offline"));
    await expect(request("/notifications", { cache: false })).rejects.toThrow("offline");
    expect(getUnreadNotificationCount()).toBe(3);
    runtime.request.mockResolvedValueOnce({ statusCode: 200, data: html("0") });
    await request("/notifications", { cache: false });
    expect(getUnreadNotificationCount()).toBe(0);
  });
  it("isolates account counts and unsubscribes cleanly", () => {
    const listener = vi.fn(); const stop = subscribeUnreadNotifications(listener);
    updateUnreadNotifications(2, runtime.username);
    expect(listener).toHaveBeenLastCalledWith(2);
    updateUnreadNotifications(7, "different-user");
    expect(getUnreadNotificationCount()).toBe(2);
    stop(); updateUnreadNotifications(4, runtime.username);
    expect(listener).toHaveBeenCalledTimes(2);
    runtime.username = "different-user";
    expect(getUnreadNotificationCount()).toBe(7);
    runtime.username = "";
    expect(getUnreadNotificationCount()).toBe(0);
  });
});
