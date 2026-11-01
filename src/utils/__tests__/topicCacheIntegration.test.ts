import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CacheService, { CacheCategory } from "../CacheService";
import Taro from "@tarojs/taro";
import { request, setCacheService, setOnLoginRequired } from "../../../packages/guanggu-forum-api/src/client";

const env = vi.hoisted(() => ({
  storage: new Map<string, any>(), files: new Map<string, string>(),
  writes: [] as Array<{ filePath: string; data: string; success: () => void; fail: () => void }>,
  delayed: false, unavailable: false, writeFailure: false, deleteFailure: false,
  scanFailure: false, legacyDeleteFailure: false, indexReadFailure: false,
}));
vi.mock("@tarojs/taro", () => ({ default: {
  request: vi.fn(), showToast: vi.fn(),
  getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: "develop" } })),
  env: { USER_DATA_PATH: "/user" },
  getStorageSync: (key: string) => {
    if (key === "__cache_index__" && env.indexReadFailure) { env.indexReadFailure = false; throw new Error("read failed"); }
    return env.storage.get(key) ?? "";
  },
  setStorageSync: (key: string, value: any) => env.storage.set(key, value),
  setStorage: async ({ key, data }: any) => { env.storage.set(key, data); },
  removeStorageSync: (key: string) => {
    if (env.legacyDeleteFailure && key.startsWith("html_v2_")) throw new Error("delete failed");
    return env.storage.delete(key);
  },
  clearStorageSync: () => env.storage.clear(),
  getStorageInfoSync: () => ({ keys: [...env.storage.keys()] }),
  getFileSystemManager: () => {
    if (env.unavailable) throw new Error("unavailable");
    return {
      accessSync: () => {}, mkdirSync: () => {},
      readdirSync: (dir: string) => {
        if (env.scanFailure) throw new Error("scan failed");
        return [...env.files.keys()].filter(p => p.startsWith(dir + "/")).map(p => p.slice(dir.length + 1));
      },
      readFileSync: (path: string) => {
        if (!env.files.has(path)) throw new Error("ENOENT");
        return env.files.get(path)!;
      },
      writeFileSync: (path: string, data: string) => {
        if (env.writeFailure) throw new Error("quota");
        env.files.set(path, data);
      },
      writeFile: (args: any) => {
        if (env.delayed) env.writes.push(args);
        else if (env.writeFailure) args.fail(new Error("quota"));
        else { env.files.set(args.filePath, args.data); args.success(); }
      },
      renameSync: (from: string, to: string) => {
        if (!env.files.has(from)) throw new Error("ENOENT");
        env.files.set(to, env.files.get(from)!); env.files.delete(from);
      },
      unlinkSync: (path: string) => {
        if (env.deleteFailure) throw new Error("permission");
        env.files.delete(path);
      },
      statSync: (path: string) => ({ size: env.files.get(path)?.length ?? 0, isFile: () => env.files.has(path), isDirectory: () => !env.files.has(path) }),
    };
  },
} }));
vi.mock("guanggu-forum-api", () => ({ URLS: { ROOT_URL: "https://www.guozaoke.com/" } }));
const liveHtml = '<html><body><main>新正文</main></body></html>';
const cachedHtml = '<html><body><main>缓存正文</main></body></html>';
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const key = (path = "/t/123", user = "test_user") => `html_v2_develop_${user}_https://www.guozaoke.com${path}`;
const index = () => JSON.parse(env.storage.get("__cache_index__") || '{"keys":[]}').keys as string[];
function seedLegacy(k: string, value = "<body>旧正文</body>") {
  const meta = { key: k, size: value.length * 2, createdAt: Date.now() - 10000,
    expiresAt: Date.now() + 100000, priority: "low", category: CacheCategory.Topic };
  env.storage.set(k, value);
  env.storage.set("__cache_meta_" + k, JSON.stringify(meta));
  env.storage.set("__cache_index__", JSON.stringify({ keys: [k] }));
  return meta;
}
function finishWrites() {
  for (const write of env.writes.splice(0)) {
    env.files.set(write.filePath, write.data); write.success();
  }
}
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.mocked(Taro.request).mockReset();
  vi.mocked(Taro.request).mockResolvedValue({ statusCode: 200, data: liveHtml } as any);
  vi.mocked(Taro.getAccountInfoSync).mockReturnValue({ miniProgram: { envVersion: "develop" } } as any);
  env.storage.clear(); env.files.clear(); env.writes = [];
  env.delayed = env.unavailable = env.writeFailure = env.deleteFailure = false;
  env.scanFailure = env.legacyDeleteFailure = env.indexReadFailure = false;
});

describe("topic content files with persistent storage indexes", () => {
  it("keeps both indexes in storage while HTML payload and metadata live in files", () => {
    const cs = new CacheService();
    cs.set("topic_index", [{ link: "/t/123" }], { category: CacheCategory.Topic });
    expect(cs.set(key(), "<body>正文</body>", { category: CacheCategory.Topic })).toBe(true);
    expect(env.storage.has(key())).toBe(false);
    expect(env.storage.has("__cache_meta_" + key())).toBe(false);
    expect(env.storage.has("topic_index")).toBe(true);
    expect(index()).toContain(key());
    expect(index()).toContain("topic_index");
    expect(new CacheService().get(key())).toBe("<body>正文</body>");
    expect(cs.getMeta(key())!.expiresAt - cs.getMeta(key())!.createdAt).toBe(30 * 60 * 1000);
  });
  it("routes only paged topic details and exact replies, keeping lists and drafts in storage", () => {
    const cs = new CacheService();
    for (const path of ["/t/123?p=2", "/search/reply/456"]) {
      expect(cs.set(key(path), "<body>缓存</body>", { category: CacheCategory.Other })).toBe(true);
      expect(env.storage.has(key(path))).toBe(false);
      expect(index()).toContain(key(path));
    }
    for (const k of [key("/?p=2&tab=hot"), key("/node/city?p=3"), "topic_draft_normal_city", "last_selected_node", key("/u/test_user"), key("/notifications")]) {
      cs.set(k, "保留", { category: CacheCategory.Topic });
      expect(env.storage.has(k)).toBe(true);
    }
  });
  it("migrates only after publication and preserves original expiration", () => {
    const meta = seedLegacy(key());
    const cs = new CacheService();
    expect(cs.get(key())).toBe("<body>旧正文</body>");
    expect(cs.getMeta(key())!.expiresAt).toBe(meta.expiresAt);
    expect(cs.getMeta(key())!.createdAt).toBe(meta.createdAt);
    expect(env.storage.has(key())).toBe(false);
    expect(index()).toContain(key());
  });
  it("startup migration keeps lists/indexes in storage and preserves a detail's original deadline", () => {
    vi.useFakeTimers();
    const meta = seedLegacy(key());
    const cs = new CacheService();
    const list = key("/node/city?p=2");
    cs.set(list, "列表", { category: CacheCategory.Node });
    cs.set("topic_index", [], { category: CacheCategory.Topic });
    cs.migrateTopicCaches();
    vi.advanceTimersByTime(0);
    expect(env.storage.has(key())).toBe(false);
    expect(env.storage.has(list)).toBe(true);
    expect(env.storage.has("topic_index")).toBe(true);
    expect(index()).toContain(key());
    expect(cs.getMeta(key())!.expiresAt).toBe(meta.expiresAt);
  });
  it("keeps source data on migration failure without falling back to storage reads", () => {
    seedLegacy(key()); env.unavailable = true;
    const cs = new CacheService();
    expect(cs.get(key())).toBeNull();
    expect(env.storage.has(key())).toBe(true);
    expect(cs.set(key("/t/999"), "new", { category: CacheCategory.Topic })).toBe(false);
    expect(env.storage.has(key("/t/999"))).toBe(false);
  });
  it("does not allow migration to overwrite pending live content", async () => {
    seedLegacy(key()); env.delayed = true;
    const cs = new CacheService();
    const write = cs.setAsync(key(), "新正文", { category: CacheCategory.Topic });
    expect(cs.get(key())).toBeNull();
    finishWrites(); expect(await write).toBe(true);
    expect(cs.get(key())).toBe("新正文");
    expect(env.storage.has(key())).toBe(false);
  });
  it("removes only the requested category across both backends", () => {
    const cs = new CacheService();
    cs.set(key(), "正文", { category: CacheCategory.Topic });
    cs.set(key("/node/city"), "列表", { category: CacheCategory.Node });
    cs.set("topic_index", [], { category: CacheCategory.Topic });
    cs.set("cookies", { sid: "session" }, { category: CacheCategory.System });
    cs.category(CacheCategory.Topic).clear();
    expect(cs.get(key())).toBeNull();
    expect(cs.get(key("/node/city"))).toBe("列表");
    expect(cs.get("cookies")).toEqual({ sid: "session" });
    expect(index()).not.toContain(key());
    expect(index()).toContain(key("/node/city"));
  });
  it("clears pending writes without reviving files or storage index references", async () => {
    env.delayed = true;
    const cs = new CacheService();
    const write = cs.setAsync(key(), "正文", { category: CacheCategory.Topic });
    cs.clearAll(true); finishWrites();
    expect(await write).toBe(false);
    expect(cs.get(key())).toBeNull();
    expect(index()).not.toContain(key());
  });
  it("retains account storage when file deletion fails during forced clear", () => {
    const cs = new CacheService();
    cs.set(key(), "正文", { category: CacheCategory.Topic });
    cs.set("cookies", { sid: "session" }, { category: CacheCategory.System });
    env.deleteFailure = true;
    expect(() => cs.clearAll(false)).toThrow();
    expect(env.storage.has("cookies")).toBe(true);
    expect(index()).toContain(key());
  });
  it("removes expired files and their index references without deleting unrelated files", () => {
    env.files.set("/user/unrelated.json", "keep");
    const cs = new CacheService();
    cs.set(key(), "正文", { category: CacheCategory.Topic, ttl: -1 });
    expect(cs.get(key())).toBeNull();
    expect(index()).not.toContain(key());
    cs.clearAll(false);
    expect(env.files.get("/user/unrelated.json")).toBe("keep");
  });
  it("serves persisted detail immediately, then refreshes the same file without writing HTML to storage", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), cachedHtml, { category: CacheCategory.Topic });
    setCacheService(new CacheService()); // Drop parsed-memory state to simulate restart.
    let respond!: (value: any) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }) as any);
    const refresh = vi.fn();
    const result = await request("/t/123", { cache: true, onRefresh: refresh });
    expect(result.fromCache).toBe(true);
    expect(result.body!.textContent).toContain("缓存正文");
    expect(refresh).not.toHaveBeenCalled();
    respond({ statusCode: 200, data: liveHtml }); await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(new CacheService().get(key())).toBe(liveHtml);
    expect(env.storage.has(key())).toBe(false);
    expect(index()).toContain(key());
  });
  it("cache:false neither reads nor replaces an existing detail file", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), cachedHtml, { category: CacheCategory.Topic });
    setCacheService(cs);
    expect((await request("/t/123", { cache: false })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key())).toBe(cachedHtml);
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it("keeps API account/environment/pagination scopes and list storage routing", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), cachedHtml, { category: CacheCategory.Topic });
    setCacheService(cs);
    expect((await request("/t/123", { cache: true, query: { p: "2" } })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123?p=2"))).toBe(liveHtml);
    cs.set("current_username", "other_user", { category: CacheCategory.System });
    expect((await request("/t/123", { cache: true })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123", "other_user"))).toBe(liveHtml);
    vi.mocked(Taro.getAccountInfoSync).mockReturnValue({ miniProgram: { envVersion: "release" } } as any);
    expect((await request("/t/123", { cache: true })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123", "other_user").replace("_develop_", "_release_"))).toBe(liveHtml);
    await request("/node/city", { cache: true }); await settle();
    expect(env.storage.has(key("/node/city", "other_user").replace("_develop_", "_release_"))).toBe(true);
  });
  it("stores exact-reply detail in a file while its Other category stays intact", async () => {
    const cs = new CacheService(); setCacheService(cs);
    expect((await request("/search/reply/456", { cache: true })).fromCache).toBe(false);
    await settle();
    const k = key("/search/reply/456", "guest");
    expect(cs.get(k)).toBe(liveHtml);
    expect(cs.getMeta(k)!.category).toBe(CacheCategory.Other);
    expect(env.storage.has(k)).toBe(false);
    expect(index()).toContain(k);
  });
  it("does not let parsed-memory content bypass an expired detail file", async () => {
    const cs = new CacheService(); setCacheService(cs);
    await request("/t/123", { cache: true }); await settle();
    const k = key("/t/123", "guest");
    cs.set(k, cachedHtml, { category: CacheCategory.Topic, ttl: -1 });
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200,
      data: '<html><body><main>过期后新正文</main></body></html>' } as any);
    const result = await request("/t/123", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(result.body!.textContent).toContain("过期后新正文");
  });
  it("returns live detail even if the filesystem is unavailable, without storage fallback", async () => {
    env.unavailable = true;
    const cs = new CacheService(); setCacheService(cs);
    const result = await request("/t/123", { cache: true }); await settle();
    expect(result.fromCache).toBe(false);
    expect(result.body!.textContent).toContain("新正文");
    expect(env.files.size).toBe(0);
    expect(env.storage.has(key("/t/123", "guest"))).toBe(false);
  });
  it("a background login failure preserves cached detail and does not interrupt the page", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), cachedHtml, { category: CacheCategory.Topic });
    setCacheService(cs);
    const login = vi.fn(); setOnLoginRequired(login);
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200,
      data: '<html><body><ul class="alert alert-danger"><li>请先登录社区再完成操作</li></ul></body></html>' } as any);
    expect((await request("/t/123", { cache: true })).fromCache).toBe(true);
    await settle();
    expect(cs.get(key())).toBe(cachedHtml);
    expect(login).not.toHaveBeenCalled();
  });
  it("retains account storage when a fresh file backend cannot scan its existing directory", () => {
    const cs = new CacheService();
    cs.set(key(), "persisted", { category: CacheCategory.Topic });
    cs.set("cookies", "keep", { category: CacheCategory.System });
    env.scanFailure = true;
    expect(() => new CacheService().clearAll(false)).toThrow();
    expect(env.storage.has("cookies")).toBe(true);
    expect(env.files.size).toBe(1);
  });
  it("preserves the shared index after a transient read failure on detail miss", () => {
    const cs = new CacheService();
    const list = key("/node/city");
    cs.set(list, "list", { category: CacheCategory.Node });
    const before = env.storage.get("__cache_index__");
    env.indexReadFailure = true;
    expect(cs.get(key())).toBeNull();
    expect(env.storage.get("__cache_index__")).toBe(before);
    cs.clearAll(true);
    expect(env.storage.has(list)).toBe(false);
  });
  it("reclaims unmigrated storage copies without deleting a file", () => {
    seedLegacy(key()); env.unavailable = true;
    const cs = new CacheService();
    expect(cs.evict(1)).toBe(1);
    expect(env.storage.has(key())).toBe(false);
    expect(env.files.size).toBe(0);
  });
  it("requires a readable destination before deleting a surviving migration source", () => {
    seedLegacy(key()); env.legacyDeleteFailure = true;
    const cs = new CacheService();
    expect(cs.get(key())).toBe("<body>旧正文</body>");
    env.files.clear(); env.legacyDeleteFailure = false;
    expect(cs.get(key())).toBe("<body>旧正文</body>");
    expect(env.files.size).toBe(1);
    expect(env.storage.has(key())).toBe(false);
  });
  it("daily expiry leaves a pending replacement able to publish", async () => {
    const cs = new CacheService();
    cs.set(key(), "old", { category: CacheCategory.Topic, ttl: -1 });
    env.delayed = true;
    const write = cs.setAsync(key(), "fresh", { category: CacheCategory.Topic });
    cs.removeExpired(); finishWrites();
    expect(await write).toBe(true);
    expect(cs.get(key())).toBe("fresh");
  });
  it("storage eviction does not evict live file caches", () => {
    const cs = new CacheService();
    cs.set(key(), "正文", { category: CacheCategory.Topic });
    cs.set("cached_user", "用户", { category: CacheCategory.User });
    cs.evict(1);
    expect(cs.get(key())).toBe("正文");
    expect(cs.get("cached_user")).toBeNull();
  });
});
