import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { request as rawRequest, type RequestConfig, setCacheService, setOnLoginRequired } from "../../../packages/guanggu-forum-api/src/client";
import { stringifyCookie } from "../../../packages/guanggu-forum-api/src/utils/cookie";
import { API_CACHE_VERSIONS, createApiCacheEntry, type CacheApi } from "../../../packages/guanggu-forum-api/src/cacheVersions";
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
  return `html_v2_${env}_${user}_${URLS.ROOT_URL.replace(/\/$/, "")}${path}#api=${path === "/notifications" ? "getNotifications" : "getNodeTopics"}`;
}

function request(path: string, config?: RequestConfig) {
  return rawRequest(path, { cacheApi: path === '/notifications' ? 'getNotifications' : 'getNodeTopics', ...config });
}
function seedHtml(key: string, html: string) {
  const api = key.split('#api=')[1] as CacheApi;
  store.set(key, createApiCacheEntry(api, html));
}

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe("HTML cache authentication", () => {
  it("ignores old-account background responses after account switching", async () => {
    seedHtml(htmlKey("/node/city"), loggedIn);
    let respond!: (value: any) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }) as any);
    expect((await request("/node/city", { cache: true })).fromCache).toBe(true);
    store.set("current_username", "other-user");
    store.set("cookies", { sid: "other-session" });
    respond({ statusCode: 200, data: loggedIn.replace("新数据", "旧账号刷新") });
    await settle();
    expect(store.get("current_username")).toBe("other-user");
    expect(store.get(htmlKey("/node/city"))).toEqual(createApiCacheEntry("getNodeTopics", loggedIn));
  });
  it("ignores legacy login-required cache and uses live data", async () => {
    store.set(`html_${URLS.ROOT_URL.replace(/\/$/, "")}/node/house`, loginRequired);
    const result = await request("/node/house", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });

  it("does not navigate for cached login-required HTML", async () => {
    seedHtml(htmlKey("/node/house"), loginRequired);
    const result = await request("/node/house", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });

  it("does not restore account identity from cached HTML", async () => {
    seedHtml(htmlKey("/node/city"), loggedIn.replace(/test-user/g, "old-user"));
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    const result = await request("/node/city", { cache: true });
    await settle();
    expect(result.fromCache).toBe(true);
    expect(set).not.toHaveBeenCalledWith("current_username", "old-user", expect.anything());
    expect(store.get("current_username")).toBe("test-user");
  });

  it("separates development and release HTML caches", async () => {
    seedHtml(htmlKey("/node/help", "release"), loginRequired);
    expect((await request("/node/help", { cache: true })).fromCache).toBe(false);
    expect(loginCallback).not.toHaveBeenCalled();
  });

  it("separates account-specific notifications", async () => {
    seedHtml(htmlKey("/notifications", "develop", "old-user"), loggedIn);
    expect((await request("/notifications", { cache: true })).fromCache).toBe(false);
  });

  it("rejects live authentication failures instead of caching them as empty data", async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loginRequired } as any);
    await expect(request("/notifications", { cache: true })).rejects.toThrow("请先登录");
    expect(loginCallback).toHaveBeenCalledTimes(1);
    expect(store.has(htmlKey("/notifications"))).toBe(false);
  });

  it("keeps background authentication failures from interrupting cached content", async () => {
    seedHtml(htmlKey("/notifications"), loggedIn);
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loginRequired } as any);
    expect((await request("/notifications", { cache: true })).fromCache).toBe(true);
    await settle();
    expect(loginCallback).not.toHaveBeenCalled();
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(store.get("current_username")).toBe("test-user");
    expect(store.get(htmlKey("/notifications"))).toEqual(createApiCacheEntry("getNotifications", loggedIn));
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

function deferred<T = any>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("fresh reading HTML persistence and request ordering", () => {
  it("bypasses HTML reads for cache:false while persisting fresh data for the next offline opening", async () => {
    const key = htmlKey("/node/city");
    seedHtml(key, loggedIn.replace("新数据", "旧数据"));
    const reads = vi.fn((name: string) => store.get(name) ?? null);
    const asyncReads = vi.fn(async (name: string) => store.get(name) ?? null);
    setCacheService({ get: reads, getAsync: asyncReads, set, setAsync: async (name, value) => { store.set(name, value); return true; }, remove: name => { store.delete(name); }, isExpired: () => false });
    expect((await request("/node/city", { cache: false })).body?.textContent).toContain("新数据");
    expect(asyncReads).not.toHaveBeenCalled();
    expect(reads.mock.calls.some(([name]) => name === key)).toBe(false);
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn));
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    const reopened = await request("/node/city", { cache: true }); await settle();
    expect(reopened.fromCache).toBe(true);
    expect(reopened.body?.textContent).toContain("新数据");
  });

  it("awaits foreground cache publication before returning fresh data", async () => {
    const publication = deferred<boolean>(); let published = false; let returned = false;
    setCacheService({ get: name => store.get(name) ?? null, set,
      setAsync: async (name, value) => { await publication.promise; store.set(name, value); published = true; return true; },
      remove: name => { store.delete(name); }, isExpired: () => false });
    const pending = request("/node/city", { cache: false }).then(value => { returned = true; return value; });
    await settle(); expect(returned).toBe(false); expect(published).toBe(false);
    publication.resolve(true); await pending;
    expect(published).toBe(true); expect(returned).toBe(true);
  });

  it("rejects old-account foreground content if the account switches during cache publication", async () => {
    const publication = deferred<boolean>();
    setCacheService({ get: name => store.get(name) ?? null, set,
      setAsync: async (name, value) => { await publication.promise; store.set(name, value); return true; },
      remove: name => { store.delete(name); }, isExpired: () => false });
    const pending = request("/node/city", { cache: false }); await settle();
    store.set("current_username", "other-user"); store.set("cookies", { sid: "other-session" });
    publication.resolve(true);
    await expect(pending).rejects.toThrow("账号已切换");
  });

  it("keeps an already-started useful write when a newer request fails, without stale callbacks", async () => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn);
    const publication = deferred<boolean>(); const callback = vi.fn();
    const newHtml = loggedIn.replace("新数据", "已收到的有效刷新");
    setCacheService({ get: name => store.get(name) ?? null, set,
      setAsync: async (name, value) => { await publication.promise; store.set(name, value); return true; },
      remove: name => { store.delete(name); }, isExpired: () => false });
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: newHtml } as any);
    await request("/node/city", { cache: true, onRefresh: callback }); await settle();
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    await expect(request("/node/city", { cache: false })).rejects.toThrow("offline");
    publication.resolve(true); await settle();
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", newHtml));
    expect(callback).not.toHaveBeenCalled();
  });

  it("ignores older background responses after a foreground refresh updates the same key", async () => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn);
    const old = deferred(); const callback = vi.fn();
    vi.mocked(Taro.request).mockReturnValueOnce(old.promise as any);
    expect((await request("/node/city", { cache: true, onRefresh: callback })).fromCache).toBe(true);
    await request("/node/city", { cache: false });
    old.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "过时刷新"), cookies: ["sid=obsolete"] }); await settle();
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn));
    expect(store.get("cookies")).toEqual({ sid: { value: "test-session" } });
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not publish older background data after a newer cache:true refresh starts", async () => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn);
    const one = deferred(); const two = deferred(); const oldCallback = vi.fn(); const newCallback = vi.fn();
    vi.mocked(Taro.request).mockReturnValueOnce(one.promise as any).mockReturnValueOnce(two.promise as any);
    await request("/node/city", { cache: true, onRefresh: oldCallback });
    await request("/node/city", { cache: true, onRefresh: newCallback });
    two.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "最新刷新") }); await settle();
    one.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "过时刷新") }); await settle();
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn.replace("新数据", "最新刷新")));
    expect(oldCallback).not.toHaveBeenCalled(); expect(newCallback).toHaveBeenCalledOnce();
  });

  it("does not let an older foreground response overwrite newer foreground HTML", async () => {
    const one = deferred(); const two = deferred();
    vi.mocked(Taro.request).mockReturnValueOnce(one.promise as any).mockReturnValueOnce(two.promise as any);
    const first = request("/node/city", { cache: false });
    const second = request("/node/city", { cache: false }); await settle();
    two.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "最新数据") }); await second;
    one.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "过时数据") }); await first;
    expect(store.get(htmlKey("/node/city"))).toEqual(createApiCacheEntry("getNodeTopics", loggedIn.replace("新数据", "最新数据")));
  });

  it.each([
    { statusCode: 500, data: loggedIn }, { statusCode: 404, data: loggedIn },
    { statusCode: 200, data: "" }, { statusCode: 200, data: "no body" },
  ])("failed/empty background refresh preserves cache and suppresses callbacks %#", async response => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn); const callback = vi.fn();
    vi.mocked(Taro.request).mockResolvedValueOnce(response as any);
    expect((await request("/node/city", { cache: true, onRefresh: callback })).fromCache).toBe(true); await settle();
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn)); expect(callback).not.toHaveBeenCalled();
  });

  it("failed foreground refresh preserves retained HTML for offline retry", async () => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn);
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    await expect(request("/node/city", { cache: false })).rejects.toThrow("offline");
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn));
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 500, data: loggedIn.replace("新数据", "服务错误") } as any);
    await request("/node/city", { cache: false });
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn));
  });

  it.each([
    { method: "POST" as const }, { useProxy: true },
    { cacheApi: "logout" as CacheApi }, { cacheApi: "createNewComment" as CacheApi },
    { cacheApi: "clearRecentlyViewedTopics" as CacheApi }, { cacheApi: "getLoginXsrfCode" as CacheApi },
  ])("does not read or persist mutation/proxy HTML %#", async config => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn.replace("新数据", "旧数据"));
    const result = await request("/node/city", { cache: true, ...config });
    expect(result.fromCache).toBe(false);
    expect([...store.keys()].filter(name => name.startsWith("html_v2_"))).toEqual([key]);
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn.replace("新数据", "旧数据")));
    expect(Taro.request).toHaveBeenCalledOnce();
  });

  it("rejects a delayed foreground response after the account switches without persisting it", async () => {
    const network = deferred(); vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    const pending = request("/node/city", { cache: false }); await settle();
    store.set("current_username", "other-user"); store.set("cookies", { sid: "other-session" });
    network.resolve({ statusCode: 200, data: loggedIn });
    await expect(pending).rejects.toThrow("账号已切换");
    expect(store.has(htmlKey("/node/city"))).toBe(false); expect(store.get("current_username")).toBe("other-user");
  });

  it("ignores delayed refreshes when only session cookies change", async () => {
    const key = htmlKey("/node/city"); seedHtml(key, loggedIn); const network = deferred(); const callback = vi.fn();
    vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    await request("/node/city", { cache: true, onRefresh: callback });
    store.set("cookies", { sid: "renewed-session" });
    network.resolve({ statusCode: 200, data: loggedIn.replace("新数据", "旧会话数据") }); await settle();
    expect(store.get(key)).toEqual(createApiCacheEntry("getNodeTopics", loggedIn)); expect(callback).not.toHaveBeenCalled();
  });

  it("allows live identity discovery but never persists authenticated HTML under the guest key", async () => {
    store.delete("current_username");
    expect((await request("/node/city", { cache: false })).body?.textContent).toContain("新数据");
    expect(store.get("current_username")).toBe("test-user");
    expect(store.has(htmlKey("/node/city", "develop", "guest"))).toBe(false);
  });

  it("handles callback and cache-write failures without rejecting cached or fresh reads", async () => {
    seedHtml(htmlKey("/node/city"), loggedIn);
    const callback = vi.fn(() => { throw new Error("disposed UI"); });
    expect((await request("/node/city", { cache: true, onRefresh: callback })).fromCache).toBe(true); await settle();
    expect(callback).toHaveBeenCalledOnce();
    setCacheService({ get: name => store.get(name) ?? null, set, setAsync: async () => { throw new Error("disk full"); }, remove: name => { store.delete(name); }, isExpired: () => false });
    expect((await request("/node/city", { cache: false })).body?.textContent).toContain("新数据");
  });

  it("limits parsed HTML memory to 100 entries and prunes after ten minutes", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
    const first = await request("/node/0", { cache: false });
    vi.mocked(Taro.request).mockRejectedValue(new Error("offline"));
    expect((await request("/node/0", { cache: true })).body).toBe(first.body); await settle();
    vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: loggedIn } as any);
    for (let i = 1; i <= 100; i++) await request(`/node/${i}`, { cache: false });
    vi.mocked(Taro.request).mockRejectedValue(new Error("offline"));
    const evicted = await request("/node/0", { cache: true }); await settle();
    expect(evicted.body).not.toBe(first.body); expect(evicted.body?.textContent).toContain("新数据");
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect((await request("/node/0", { cache: true })).body).not.toBe(evicted.body); await settle();
  });
});

describe('per-API cache versions', () => {
  it.each([
    ['unversioned', loggedIn],
    ['missing version', { apiVersions: {}, data: loggedIn }],
    ['old version', { apiVersions: { getNodeTopics: 0 }, data: loggedIn }],
    ['another API', createApiCacheEntry('getHotNodes', loggedIn)],
  ])('invalidates %s cached data and replaces it with a versioned response', async (_name, value) => {
    store.set(htmlKey('/node/city'), value);
    expect((await request('/node/city', { cache: true })).fromCache).toBe(false);
    expect(store.get(htmlKey('/node/city'))).toEqual(createApiCacheEntry('getNodeTopics', loggedIn));
    expect(Taro.request).toHaveBeenCalledOnce();
  });

  it('does not reuse the parsed memory cache after an API version changes', async () => {
    await request('/node/city', { cache: true });
    const original = API_CACHE_VERSIONS.getNodeTopics;
    API_CACHE_VERSIONS.getNodeTopics++;
    try {
      vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200, data: loggedIn.replace('新数据', '升级后数据') } as any);
      const result = await request('/node/city', { cache: true });
      expect(result.fromCache).toBe(false);
      expect(result.body?.textContent).toContain('升级后数据');
      expect(store.get(htmlKey('/node/city')).apiVersions.getNodeTopics).toBe(original + 1);
    } finally { API_CACHE_VERSIONS.getNodeTopics = original; }
  });

  it('bypasses cached data and cache writes when the current API version is unavailable', async () => {
    seedHtml(htmlKey('/node/city'), loggedIn);
    const original = API_CACHE_VERSIONS.getNodeTopics;
    delete (API_CACHE_VERSIONS as Partial<typeof API_CACHE_VERSIONS>).getNodeTopics;
    try {
      expect((await request('/node/city', { cache: true })).fromCache).toBe(false);
      expect(store.has(htmlKey('/node/city'))).toBe(false);
    } finally { API_CACHE_VERSIONS.getNodeTopics = original; }
  });

  it('never trusts an anonymous cache-enabled request without an API identity', async () => {
    const key = htmlKey('/node/city').split('#api=')[0];
    store.set(key, loggedIn);
    expect((await rawRequest('/node/city', { cache: true })).fromCache).toBe(false);
    expect(store.has(key)).toBe(false);
  });

  it('isolates APIs sharing the same URL and preserves the file-cache route', async () => {
    await rawRequest('/t/123', { cache: true, cacheApi: 'getTopicDetail' });
    const other = await rawRequest('/t/123', { cache: true, cacheApi: 'getHotTopicMetadata' });
    expect(other.fromCache).toBe(false);
    expect([...store.keys()].filter(key => key.includes('/t/123#api='))).toHaveLength(2);
  });
});
