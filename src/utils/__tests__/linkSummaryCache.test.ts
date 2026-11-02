import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { API_CACHE_VERSIONS, createApiCacheEntry } from "../../../packages/guanggu-forum-api/src/cacheVersions";
import { fetchLinkSummary } from "../../../packages/guanggu-forum-api/src/link/getLinkSummary";

const harness = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@tarojs/taro", () => ({ default: { request: vi.fn() } }));
const cs = vi.hoisted(() => ({
  get: vi.fn((key: string) => harness.store.get(key) ?? null),
  set: vi.fn((key: string, value: unknown) => { harness.store.set(key, value); return true; }),
  remove: vi.fn((key: string) => harness.store.delete(key)),
  isExpired: vi.fn(() => false),
}));
vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ getCacheService: () => cs }));
const url = "https://example.com/article";
const key = "link_html_" + url;
const html = (title: string) => `<html><head><title>${title}</title></head><body><article>${title} 正文</article></body></html>`;
const oldHtml = html("旧内容");
const freshHtml = html("新内容");
function seed() { harness.store.set(key, createApiCacheEntry("fetchLinkSummary", oldHtml)); }
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.clearAllMocks(); harness.store.clear();
  vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: freshHtml } as any);
});

describe("external link retained HTML revalidation", () => {
  it("returns cached data without waiting and refreshes without an onRefresh callback or TTL", async () => {
    seed(); const network = deferred();
    vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    expect((await fetchLinkSummary({ url })).title).toBe("旧内容");
    expect(harness.store.get(key)).toEqual(createApiCacheEntry("fetchLinkSummary", oldHtml));
    network.resolve({ statusCode: 200, data: freshHtml });
    await settle();
    expect(harness.store.get(key)).toEqual(createApiCacheEntry("fetchLinkSummary", freshHtml));
    expect(cs.set).toHaveBeenCalledWith(key, createApiCacheEntry("fetchLinkSummary", freshHtml), { category: "link", priority: "low" });
  });

  it("dedupes concurrent cached refreshes and delivers fresh data to every subscriber", async () => {
    seed(); const network = deferred();
    vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    const first = vi.fn(); const second = vi.fn();
    expect((await Promise.all([
      fetchLinkSummary({ url }, { onRefresh: first }),
      fetchLinkSummary({ url }, { onRefresh: second }),
      fetchLinkSummary({ url }),
    ])).map(summary => summary.title)).toEqual(["旧内容", "旧内容", "旧内容"]);
    expect(Taro.request).toHaveBeenCalledOnce();
    network.resolve({ statusCode: 200, data: freshHtml }); await settle();
    expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
    expect(first.mock.calls[0][0].title).toBe("新内容");
    await fetchLinkSummary({ url }); await settle();
    expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent cold loads", async () => {
    const network = deferred(); vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    const first = fetchLinkSummary({ url }); const second = fetchLinkSummary({ url });
    await Promise.resolve(); expect(Taro.request).toHaveBeenCalledOnce();
    network.resolve({ statusCode: 200, data: freshHtml });
    expect((await Promise.all([first, second])).map(summary => summary.title)).toEqual(["新内容", "新内容"]);
    expect(harness.store.get(key)).toEqual(createApiCacheEntry("fetchLinkSummary", freshHtml));
  });

  it("cache:false bypasses all cached reads and writes, including invalid cached data", async () => {
    harness.store.set(key, { apiVersions: {}, data: oldHtml }); const callback = vi.fn();
    expect((await fetchLinkSummary({ url }, { cache: false, onRefresh: callback })).title).toBe("新内容");
    expect(cs.get).not.toHaveBeenCalled(); expect(cs.isExpired).not.toHaveBeenCalled();
    expect(cs.set).not.toHaveBeenCalled(); expect(cs.remove).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(harness.store.get(key)).toEqual({ apiVersions: {}, data: oldHtml });
  });

  it("shares network work across cache modes without letting cache:false write", async () => {
    const network = deferred(); vi.mocked(Taro.request).mockReturnValueOnce(network.promise as any);
    const one = fetchLinkSummary({ url }, { cache: false });
    const two = fetchLinkSummary({ url }, { cache: false });
    await Promise.resolve(); network.resolve({ statusCode: 200, data: freshHtml });
    await Promise.all([one, two]); expect(cs.set).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledOnce();
    const next = deferred(); vi.mocked(Taro.request).mockReturnValueOnce(next.promise as any);
    const uncached = fetchLinkSummary({ url }, { cache: false });
    const cached = fetchLinkSummary({ url }); await Promise.resolve();
    next.resolve({ statusCode: 200, data: freshHtml }); await Promise.all([uncached, cached]);
    expect(cs.set).toHaveBeenCalledOnce(); expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    [200, ""], [200, "   \n"], [200, { error: "bad payload" }],
    [404, html("Not found")], [500, html("Server failure")], [304, ""], [undefined, freshHtml],
  ])("preserves cached content and suppresses callbacks for status %s and unusable data %#", async (statusCode, data) => {
    seed(); const callback = vi.fn();
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode, data } as any);
    expect((await fetchLinkSummary({ url }, { onRefresh: callback })).title).toBe("旧内容");
    await settle();
    expect(cs.set).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
    expect(harness.store.get(key)).toEqual(createApiCacheEntry("fetchLinkSummary", oldHtml));
    await fetchLinkSummary({ url }, { onRefresh: callback }); await settle();
    expect(callback.mock.calls[0][0].title).toBe("新内容");
    expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it("handles failed background requests, keeps cache available offline, and retries", async () => {
    seed(); const callback = vi.fn();
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    expect((await fetchLinkSummary({ url }, { onRefresh: callback })).title).toBe("旧内容"); await settle();
    expect(callback).not.toHaveBeenCalled(); expect(cs.set).not.toHaveBeenCalled();
    await fetchLinkSummary({ url }, { onRefresh: callback }); await settle();
    expect(callback.mock.calls[0][0].title).toBe("新内容");
  });

  it("treats explicitly expired entries as misses without removing retained unexpired data", async () => {
    seed(); cs.isExpired.mockReturnValueOnce(true);
    expect((await fetchLinkSummary({ url })).title).toBe("新内容");
    expect(cs.remove).toHaveBeenCalledWith(key);
    expect(Taro.request).toHaveBeenCalledOnce();
  });

  it("handles a throwing subscriber without rejecting other subscribers or losing refreshed cache", async () => {
    seed(); const bad = vi.fn(() => { throw new Error("UI disposed"); }); const good = vi.fn();
    await Promise.all([fetchLinkSummary({ url }, { onRefresh: bad }), fetchLinkSummary({ url }, { onRefresh: good })]);
    await settle();
    expect(bad).toHaveBeenCalledOnce(); expect(good).toHaveBeenCalledOnce();
    expect(harness.store.get(key)).toEqual(createApiCacheEntry("fetchLinkSummary", freshHtml));
  });

  it("returns an empty summary after a cold failure and clears pending work for retry", async () => {
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error("offline"));
    expect(await fetchLinkSummary({ url })).toMatchObject({ title: url, bodyText: "", bodyHtml: "" });
    expect(cs.set).not.toHaveBeenCalled();
    expect((await fetchLinkSummary({ url })).title).toBe("新内容");
    expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it("retains API-version checks and removes legacy/old entries before loading", async () => {
    harness.store.set(key, oldHtml);
    expect((await fetchLinkSummary({ url })).title).toBe("新内容");
    expect(cs.remove).toHaveBeenCalledWith(key);
    seed(); const version = API_CACHE_VERSIONS.fetchLinkSummary;
    API_CACHE_VERSIONS.fetchLinkSummary++;
    try { expect((await fetchLinkSummary({ url })).title).toBe("新内容"); }
    finally { API_CACHE_VERSIONS.fetchLinkSummary = version; }
    expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it("refreshes different URLs independently", async () => {
    await Promise.all([fetchLinkSummary({ url }), fetchLinkSummary({ url: url + "/other" })]);
    expect(Taro.request).toHaveBeenCalledTimes(2);
    expect(harness.store.size).toBe(2);
  });
});
