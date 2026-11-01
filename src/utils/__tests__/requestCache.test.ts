import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { request, setCacheService, setOnLoginRequired } from "../../../packages/guanggu-forum-api/src/client";
import { stringifyCookie } from "../../../packages/guanggu-forum-api/src/utils/cookie";
import { URLS } from "../../../packages/guanggu-forum-api/src/urls";

vi.mock("@tarojs/taro", () => ({ default: {
  request: vi.fn(),
  showToast: vi.fn(),
  getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: "develop" } })),
} }));

const loggedIn = '<html><body><div id="navbar5"><div class="navbar-right"><a class="avatar" href="/u/test-user">账号</a></div></div><main>新数据</main></body></html>';
const loginRequired = '<html><body><ul class="alert alert-danger"><li>请先登录社区再完成操作</li></ul></body></html>';
let store: Map<string, any>;
let loginCallback: ReturnType<typeof vi.fn<() => void>>;
let set: ReturnType<typeof vi.fn<(key: string, value: any) => boolean>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(Taro.getAccountInfoSync).mockReturnValue({ miniProgram: { envVersion: "develop" } } as any);
  store = new Map<string, any>([["cookies", { sid: { value: "test-session" } }], ["current_username", "test-user"]]);
  set = vi.fn((key, value) => { store.set(key, value); return true; });
  setCacheService({ get: (key) => store.get(key) ?? null, set, setAsync: async (key, value) => { store.set(key, value); return true; }, remove: (key) => { store.delete(key); }, isExpired: () => false });
  loginCallback = vi.fn();
  setOnLoginRequired(loginCallback);
  vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: loggedIn } as any);
});

function htmlKey(path: string, env = "develop", user = "test-user") {
  return `html_v2_${env}_${user}_${URLS.ROOT_URL.replace(/\/$/, "")}${path}`;
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("HTML cache authentication", () => {
  it("ignores old-account background responses after account switching", async () => {
    store.set(htmlKey("/node/city"), loggedIn);
    let respond!: (value: any) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }) as any);
    expect((await request("/node/city", { cache: true })).fromCache).toBe(true);
    store.set("current_username", "other-user");
    store.set("cookies", { sid: "other-session" });
    respond({ statusCode: 200, data: loggedIn.replace("新数据", "旧账号刷新") });
    await settle();
    expect(store.get("current_username")).toBe("other-user");
    expect(store.get(htmlKey("/node/city"))).toBe(loggedIn);
  });
  it("ignores legacy login-required cache and uses live data", async () => {
    store.set(`html_${URLS.ROOT_URL.replace(/\/$/, "")}/node/house`, loginRequired);
    const result = await request("/node/house", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });

  it("does not navigate for cached login-required HTML", async () => {
    store.set(htmlKey("/node/house"), loginRequired);
    const result = await request("/node/house", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });

  it("does not restore account identity from cached HTML", async () => {
    store.set(htmlKey("/node/city"), loggedIn.replace(/test-user/g, "old-user"));
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    const result = await request("/node/city", { cache: true });
    await settle();
    expect(result.fromCache).toBe(true);
    expect(set).not.toHaveBeenCalledWith("current_username", "old-user", expect.anything());
    expect(store.get("current_username")).toBe("test-user");
  });

  it("separates development and release HTML caches", async () => {
    store.set(htmlKey("/node/help", "release"), loginRequired);
    expect((await request("/node/help", { cache: true })).fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
  });

  it("separates account-specific notifications", async () => {
    store.set(htmlKey("/notifications", "develop", "old-user"), loggedIn);
    expect((await request("/notifications", { cache: true })).fromCache).toBe(false);
  });

  it("rejects live authentication failures instead of caching them as empty data", async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loginRequired } as any);
    await expect(request("/notifications", { cache: true })).rejects.toThrow("请先登录");
    expect(loginCallback).toHaveBeenCalledTimes(1);
    expect(store.has(htmlKey("/notifications"))).toBe(false);
  });

  it("keeps background authentication failures from interrupting cached content", async () => {
    store.set(htmlKey("/notifications"), loggedIn);
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loginRequired } as any);
    expect((await request("/notifications", { cache: true })).fromCache).toBe(true);
    await settle();
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(store.get("current_username")).toBe("test-user");
    expect(store.get(htmlKey("/notifications"))).toBe(loggedIn);
  });

  it("does not treat quoted login text on an authenticated page as logout", async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loggedIn.replace("新数据", "请先登录社区再完成操作") } as any);
    expect((await request("/node/quoted", { cache: true })).fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
  });

  it("does not redirect public board pages for quoted login text", async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: '<html><body><div class="topics"><p>请先登录社区再完成操作</p></div></body></html>' } as any);
    expect((await request("/node/public", { cache: true })).fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
  });

  it("lets public discovery handle an interest login failure inline", async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loginRequired } as any);
    await expect(request("/", { query: { tab: "interest" }, notifyLoginRequired: false })).rejects.toThrow("请先登录");
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(store.get("current_username")).toBe("test-user");
  });

  it("accepts both legacy string and current structured cookies", () => {
    expect(stringifyCookie({ old: "legacy-session", newer: { value: "current-session" } }))
      .toBe("old=legacy-session; newer=current-session");
  });
});
