import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CacheService, { CacheCategory } from "../CacheService";
import Taro from "@tarojs/taro";
import { request as rawRequest, type RequestConfig, setCacheService, setOnLoginRequired } from "../../../packages/guanggu-forum-api/src/client";

import { API_CACHE_VERSIONS, createApiCacheEntry } from "../../../packages/guanggu-forum-api/src/cacheVersions";

function request(path: string, config?: RequestConfig) { return rawRequest(path, { cacheApi: "getTopicDetail", ...config }); }

const env = vi.hoisted(() => ({
  storage: new Map<string, any>(), files: new Map<string, string>(),
  writes: [] as Array<{ filePath: string; data: string; success: () => void; fail: () => void }>,
  delayed: false, unavailable: false, writeFailure: false, deleteFailure: false,
  scanFailure: false, legacyDeleteFailure: false, indexReadFailure: false, storageDeleteFailure: false,
  syncReads: 0, asyncReads: 0, noSync: false, readFailure: false,
  directories: new Set<string>(),
  delayedReads: false, reads: [] as any[],
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
    if (env.storageDeleteFailure && key === "list") throw new Error("permission");
    if (env.legacyDeleteFailure && key.startsWith("html_v2_")) throw new Error("delete failed");
    return env.storage.delete(key);
  },
  clearStorageSync: () => env.storage.clear(),
  getStorageInfoSync: () => ({ keys: [...env.storage.keys()] }),
  getFileSystemManager: () => {
    if (env.unavailable) throw new Error("unavailable");
    return {
      access: (args: any) => env.directories.has(args.path) ? args.success({}) : args.fail(new Error("ENOENT")),
      mkdir: (args: any) => { env.directories.add(args.dirPath); args.success({}); },
      readdir: (args: any) => {
        if (env.scanFailure) args.fail(new Error("scan failed"));
        else args.success({ files: [...env.files.keys()].filter(p => p.startsWith(args.dirPath + "/")).map(p => p.slice(args.dirPath.length + 1)) });
      },
      readFile: (args: any) => {
        env.asyncReads++;
        const raw = env.files.get(args.filePath);
        const complete = () => {
          if (env.readFailure) args.fail(new Error("EIO"));
          else if (raw === undefined) args.fail(new Error("readFile:fail local file not found"));
          else args.success({ data: raw });
        };
        if (env.delayedReads) env.reads.push(complete); else complete();
      },
      stat: (args: any) => args.success({ stats: { size: env.files.get(args.path)?.length ?? 0 } }),
      rmdir: (args: any) => {
        if (env.deleteFailure) return args.fail(new Error("permission"));
        for (const path of [...env.files.keys()]) if (path.startsWith(args.dirPath + "/")) env.files.delete(path);
        for (const dir of [...env.directories]) if (dir === args.dirPath || dir.startsWith(args.dirPath + "/")) env.directories.delete(dir);
        args.success({});
      },
      rmdirSync: (path: string) => {
        if (env.deleteFailure) throw new Error("permission");
        for (const name of [...env.files.keys()]) if (name.startsWith(path + "/")) env.files.delete(name);
        for (const dir of [...env.directories]) if (dir === path || dir.startsWith(path + "/")) env.directories.delete(dir);
      },
      accessSync: (path: string) => {
        if (env.noSync) throw new Error("sync access forbidden");
        if (!env.directories.has(path)) throw new Error("ENOENT");
      },
      mkdirSync: (path: string) => { env.directories.add(path); },

      readdirSync: (dir: string) => {
        if (env.noSync) throw new Error("sync scan forbidden");
        if (env.scanFailure) throw new Error("scan failed");
        return [...env.files.keys()].filter(p => p.startsWith(dir + "/")).map(p => p.slice(dir.length + 1));
      },
      readFileSync: (path: string) => {
        env.syncReads++;
        if (env.noSync) throw new Error("sync read forbidden");
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
const settle = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
const key = (path = "/t/123", user = "test_user") => `html_v2_develop_${user}_https://www.guozaoke.com${path}#api=getTopicDetail`;
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
  env.storage.clear(); env.files.clear(); env.directories.clear(); env.directories.add("/user"); env.writes = [];
  env.delayed = env.unavailable = env.writeFailure = env.deleteFailure = false;
  env.scanFailure = env.legacyDeleteFailure = env.indexReadFailure = env.storageDeleteFailure = false;
  env.syncReads = env.asyncReads = 0; env.noSync = env.readFailure = env.delayedReads = false; env.reads = [];
});

describe("topic content files with persistent storage indexes", () => {
  it("preserves a read detail over an untouched detail on capacity eviction after restart", async () => {
    const first = new CacheService(2);
    await first.setAsync(key('/t/1'), 'recently visited', { category: CacheCategory.Topic });
    await first.setAsync(key('/t/2'), 'untouched', { category: CacheCategory.Topic });
    expect(await first.getAsync(key('/t/1'))).toBe('recently visited');
    const restarted = new CacheService(2);
    await restarted.setAsync(key('/t/3'), 'newest', { category: CacheCategory.Topic });
    await settle();
    expect(await restarted.getAsync(key('/t/1'))).toBe('recently visited');
    expect(await restarted.getAsync(key('/t/2'))).toBeNull();
    expect(await restarted.getAsync(key('/t/3'))).toBe('newest');
  });

  it("keeps default files and storage HTML usable after a year and daily cleanup", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000);
    const cs = new CacheService();
    await cs.setAsync(key(), 'retained detail', { category: CacheCategory.Topic });
    cs.set(key('/node/city'), 'retained list', { category: CacheCategory.Node });
    vi.setSystemTime(100000 + 365 * 24 * 60 * 60 * 1000);
    await cs.dailyCleanupAsync();
    const restarted = new CacheService();
    expect(await restarted.getAsync(key())).toBe('retained detail');
    expect(restarted.get(key('/node/city'))).toBe('retained list');
  });

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
    expect(cs.getMeta(key())!.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("routes only paged topic details and exact replies, keeping lists and drafts in storage", () => {
    const cs = new CacheService();
    for (const path of ["/t/123?p=2", "/search/reply/456"]) {
      expect(cs.set(key(path), "<body>缓存</body>", { category: CacheCategory.Other })).toBe(true);
      expect(env.storage.has(key(path))).toBe(false);
      expect(index()).toContain(key(path));
    }
    for (const k of [key("/?p=2&tab=hot"), key("/node/city?p=3"), "topic_draft_normal_city", "last_selected_node", key("/u/test_user/favorites"), key("/notifications")]) {
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
    await settle(); finishWrites(); expect(await write).toBe(true);
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
    const clearing = cs.clearAllAsync(true);
    await settle(); finishWrites(); await clearing;
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
    cs.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
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
    expect(new CacheService().get(key())).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    expect(env.storage.has(key())).toBe(false);
    expect(index()).toContain(key());
  });
  it("retains an already-started disk refresh when a newer network request fails without stale callbacks", async () => {
    const cs = new CacheService();
    cs.set('current_username', 'test_user', { category: CacheCategory.System });
    cs.set(key(), createApiCacheEntry('getTopicDetail', cachedHtml), { category: CacheCategory.Topic });
    setCacheService(cs);
    env.delayed = true;
    const refresh = vi.fn();
    expect((await request('/t/123', { cache: true, onRefresh: refresh })).fromCache).toBe(true);
    await settle();
    expect(env.writes.length).toBe(1);
    vi.mocked(Taro.request).mockRejectedValueOnce(new Error('offline'));
    await expect(request('/t/123', { cache: false })).rejects.toThrow('offline');
    finishWrites(); await settle();
    expect(new CacheService().get(key())).toEqual(createApiCacheEntry('getTopicDetail', liveHtml));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rejects old-account foreground data if the account switches during pending disk publication", async () => {
    const cs = new CacheService();
    cs.set('current_username', 'test_user', { category: CacheCategory.System });
    setCacheService(cs); env.delayed = true;
    const pending = request('/t/123', { cache: false });
    const rejected = expect(pending).rejects.toThrow('账号已切换');
    await settle(); expect(env.writes.length).toBe(1);
    cs.set('current_username', 'other_user', { category: CacheCategory.System });
    finishWrites(); await rejected;
    expect(cs.get('current_username')).toBe('other_user');
  });

  it("cache:false bypasses cached HTML reads and persists fresh detail for later opening", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
    setCacheService(cs);
    const reads = vi.spyOn(cs, "getAsync");
    expect((await request("/t/123", { cache: false })).fromCache).toBe(false);
    await settle();
    expect(reads).not.toHaveBeenCalledWith(key());
    expect(cs.get(key())).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it("keeps API account/environment/pagination scopes and list storage routing", async () => {
    const cs = new CacheService();
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
    setCacheService(cs);
    expect((await request("/t/123", { cache: true, query: { p: "2" } })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123?p=2"))).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    cs.set("current_username", "other_user", { category: CacheCategory.System });
    expect((await request("/t/123", { cache: true })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123", "other_user"))).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    vi.mocked(Taro.getAccountInfoSync).mockReturnValue({ miniProgram: { envVersion: "release" } } as any);
    expect((await request("/t/123", { cache: true })).fromCache).toBe(false);
    await settle();
    expect(cs.get(key("/t/123", "other_user").replace("_develop_", "_release_"))).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    await request("/node/city", { cache: true }); await settle();
    expect(env.storage.has(key("/node/city", "other_user").replace("_develop_", "_release_"))).toBe(true);
  });
  it("stores exact-reply detail in a file while its Other category stays intact", async () => {
    const cs = new CacheService(); setCacheService(cs);
    expect((await request("/search/reply/456", { cache: true })).fromCache).toBe(false);
    await settle();
    const k = key("/search/reply/456", "guest");
    expect(cs.get(k)).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
    expect(cs.getMeta(k)!.category).toBe(CacheCategory.Other);
    expect(env.storage.has(k)).toBe(false);
    expect(index()).toContain(k);
  });
  it("does not let parsed-memory content bypass an expired detail file", async () => {
    const cs = new CacheService(); setCacheService(cs);
    await request("/t/123", { cache: true }); await settle();
    const k = key("/t/123", "guest");
    cs.set(k, createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic, ttl: -1 });
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200,
      data: '<html><body><main>过期后新正文</main></body></html>' } as any);
    const result = await request("/t/123", { cache: true });
    expect(result.fromCache).toBe(false);
    expect(result.body!.textContent).toContain("过期后新正文");
    await settle(); // Await fire-and-forget cache publication before resetting the mock FS.
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
    cs.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
    setCacheService(cs);
    const login = vi.fn(); setOnLoginRequired(login);
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 200,
      data: '<html><body><ul class="alert alert-danger"><li>请先登录社区再完成操作</li></ul></body></html>' } as any);
    expect((await request("/t/123", { cache: true })).fromCache).toBe(true);
    await settle();
    expect(cs.get(key())).toEqual(createApiCacheEntry("getTopicDetail", cachedHtml));
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
    cs.removeExpired(); await settle(); finishWrites();
    expect(await write).toBe(true);
    expect(cs.get(key())).toBe("fresh");
  });
  it("retains file and storage entries until eviction while honoring explicit deadlines", async () => {
    const cs = new CacheService();
    for (const k of [key(), key("/search/reply/456"), key("/u/test_user?p=2"), "topic_index"]) {
      expect(await cs.setAsync(k, "data", { category: CacheCategory.User })).toBe(true);
      const meta = cs.getMeta(k)!;
      expect(meta.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
      expect(env.storage.has(k)).toBe(k === "topic_index");
    }
    for (const k of [key("/"), key("/node/city"), "topic_draft_city", key("/u/test_user/favorites"), key("/notifications")]) {
      cs.set(k, "data", { category: CacheCategory.Topic });
      const meta = cs.getMeta(k)!;
      expect(meta.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
      expect(env.storage.has(k)).toBe(true);
    }
    await cs.setAsync(key(), "override", { category: CacheCategory.Topic, ttl: 0 });
    expect(cs.getMeta(key())!.expiresAt - cs.getMeta(key())!.createdAt).toBe(0);
  });
  it("cold API hits, stats, migration and cleanup use async reads only", async () => {
    const seed = new CacheService();
    seed.set("current_username", "test_user", { category: CacheCategory.System });
    seed.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
    seed.set(key("/u/test_user"), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.User });
    const cs = new CacheService(); setCacheService(cs);
    env.noSync = true; env.syncReads = 0;
    expect((await request("/t/123", { cache: true })).fromCache).toBe(true);
    await settle();
    expect(await cs.getAsync(key("/u/test_user"))).toEqual(createApiCacheEntry("getTopicDetail", cachedHtml));
    expect((await cs.getAllCategoryStatsAsync()).some(stat => stat.category === CacheCategory.User)).toBe(true);
    await cs.migrateTopicCachesAsync(); await cs.dailyCleanupAsync();
    expect(env.syncReads).toBe(0);
    expect(env.asyncReads).toBeGreaterThan(0);
  });
  it("confirmed missing drops only that reference, while EIO preserves it", async () => {
    const cs = new CacheService();
    cs.set(key(), "detail", { category: CacheCategory.Topic });
    cs.set("topic_index", [], { category: CacheCategory.Topic });
    env.readFailure = true;
    expect(await cs.getAsync(key())).toBeNull();
    expect(index()).toContain(key());
    env.readFailure = false; env.files.clear();
    expect(await cs.getAsync(key())).toBeNull();
    expect(index()).not.toContain(key());
    expect(index()).toContain("topic_index");
  });
  it("an old missing callback cannot delete a newly published reference", async () => {
    const cs = new CacheService();
    cs.set(key(), "seed", { category: CacheCategory.Topic });
    env.files.clear(); env.delayedReads = true;
    const read = cs.getAsync(key()); await settle();
    env.delayedReads = false;
    expect(await cs.setAsync(key(), "fresh", { category: CacheCategory.Topic })).toBe(true);
    for (const finish of env.reads.splice(0)) finish();
    expect(await read).toBeNull();
    expect(index()).toContain(key());
    expect(await cs.getAsync(key())).toBe("fresh");
  });
  it("settings-style clear removes all detail/profile files but keeps account and unrelated files", async () => {
    const cs = new CacheService();
    cs.set(key(), "detail", { category: CacheCategory.Topic });
    cs.set(key("/u/test_user"), "profile", { category: CacheCategory.User });
    cs.set("cookies", "keep", { category: CacheCategory.System });
    cs.set("topic_index", [], { category: CacheCategory.Topic });
    env.files.set("/user/unrelated.json", "keep");
    env.files.set("/user/caches/another-cache/nested/file.json", "disposable");
    env.noSync = true; env.syncReads = 0;
    await cs.clearAllAsync(true);
    await cs.getAllCategoryStatsAsync();
    expect(env.directories.has("/user/caches")).toBe(false);
    expect(env.directories.has("/user/caches/guozaoke-topic-cache-v1")).toBe(false);
    expect([...env.files.keys()]).toEqual(["/user/unrelated.json"]);
    expect(index()).not.toContain(key());
    expect(index()).not.toContain(key("/u/test_user"));
    expect(env.storage.has("topic_index")).toBe(false);
    expect(cs.get("cookies")).toBe("keep");
    expect(env.syncReads).toBe(0);
  });
  it("failed async clear preserves file references and forced-clear account data", async () => {
    const cs = new CacheService();
    cs.set(key(), "detail", { category: CacheCategory.Topic });
    cs.set(key("/u/test_user"), "profile", { category: CacheCategory.User });
    cs.set("cookies", "keep", { category: CacheCategory.System });
    env.deleteFailure = true;
    let failed = false;
    try { await cs.clearAllAsync(false); } catch { failed = true; }
    expect(failed).toBe(true);
    expect(index()).toContain(key()); expect(index()).toContain(key("/u/test_user"));
    expect(cs.get("cookies")).toBe("keep");
  });
  it("file index-capacity eviction retains a reference when deletion fails", async () => {
    const cs = new CacheService(2);
    cs.set(key(), "detail", { category: CacheCategory.Topic });
    env.deleteFailure = true;
    cs.set("list", "list", { category: CacheCategory.Node });
    cs.set("second_list", "list", { category: CacheCategory.Node });
    await settle();
    expect(index()).toContain(key());
    expect(await cs.getAsync(key())).toBe("detail");
  });
  it("async migration preserves deadlines and never overwrites live pending data", async () => {
    const meta = seedLegacy(key("/u/test_user"));
    const cs = new CacheService(); env.noSync = true;
    expect(await cs.getAsync(key("/u/test_user"))).toBe("<body>旧正文</body>");
    expect(cs.getMeta(key("/u/test_user"))!.expiresAt).toBe(meta.expiresAt);
    expect(env.storage.has(key("/u/test_user"))).toBe(false);
    seedLegacy(key()); env.delayed = true;
    const write = cs.setAsync(key(), "live", { category: CacheCategory.Topic });
    expect(await cs.getAsync(key())).toBeNull();
    await settle(); finishWrites(); expect(await write).toBe(true);
    expect(await cs.getAsync(key())).toBe("live");
    expect(env.syncReads).toBe(0);
  });
  it("moves legacy files under caches without resetting deadlines or dropping indexes", async () => {
    const cs = new CacheService();
    cs.set(key(), "detail", { category: CacheCategory.Topic });
    const path = [...env.files.keys()][0];
    const raw = env.files.get(path)!;
    const original = JSON.parse(raw).meta;
    const legacy = path.replace("/user/caches/", "/user/");
    env.files.delete(path); env.files.set(legacy, raw);
    env.directories.add("/user/guozaoke-topic-cache-v1");
    const restarted = new CacheService(); env.noSync = true;
    expect(await restarted.getAsync(key())).toBe("detail");
    expect(env.files.has(legacy)).toBe(false);
    expect(env.files.has(path)).toBe(true);
    expect(JSON.parse(env.files.get(path)!).meta.expiresAt).toBe(original.expiresAt);
    expect(index()).toContain(key());
    expect(env.syncReads).toBeGreaterThan(0); // Only the initial synchronous seed.
  });
  it("first async publication tracks its file before any cache read", async () => {
    const cs = new CacheService();
    expect(await cs.setAsync(key(), "new", { category: CacheCategory.Topic })).toBe(true);
    expect(index()).toContain(key());
    expect(env.storage.has(key())).toBe(false);
    seedLegacy(key("/u/test_user"));
    expect(await cs.setAsync(key("/u/test_user"), "fresh", { category: CacheCategory.User })).toBe(true);
    expect(index()).toContain(key("/u/test_user"));
    expect(env.storage.has(key("/u/test_user"))).toBe(false);
    expect(env.storage.has("__cache_meta_" + key("/u/test_user"))).toBe(false);
  });
  it("async account switching does not write new-account HTML under an old scope", async () => {
    const cs = new CacheService(); setCacheService(cs);
    cs.set("current_username", "test_user", { category: CacheCategory.System });
    cs.set("cookies", { sid: "A" }, { category: CacheCategory.System });
    cs.set(key(), createApiCacheEntry("getTopicDetail", cachedHtml), { category: CacheCategory.Topic });
    env.delayedReads = true;
    const result = request("/t/123", { cache: true }); await settle();
    cs.set("current_username", "other_user", { category: CacheCategory.System });
    cs.set("cookies", { sid: "B" }, { category: CacheCategory.System });
    env.delayedReads = false;
    for (const finish of env.reads.splice(0)) finish();
    expect((await result).fromCache).toBe(false); await settle();
    expect((Taro.request as any).mock.calls[0][0].header.cookie).toContain("B");
    expect(await cs.getAsync(key())).toEqual(createApiCacheEntry("getTopicDetail", cachedHtml));
    expect(await cs.getAsync(key("/t/123", "other_user"))).toEqual(createApiCacheEntry("getTopicDetail", liveHtml));
  });
  it("storage deletion failure preserves references and makes settings clear fail", async () => {
    const cs = new CacheService();
    cs.set("list", "keep", { category: CacheCategory.Node });
    env.storageDeleteFailure = true;
    expect(await cs.removeAsync("list")).toBe(false);
    expect(index()).toContain("list");
    let failed = false;
    try { await cs.clearAllAsync(true); } catch { failed = true; }
    expect(failed).toBe(true); expect(index()).toContain("list");
    expect(env.storage.get("list")).toBe("keep");
  });
  it("expiry does not delete a storage key refreshed during an earlier async deletion", async () => {
    const cs = new CacheService();
    cs.set("first", "old", { category: CacheCategory.Node, ttl: -1 });
    cs.set("second", "old", { category: CacheCategory.Node, ttl: -1 });
    const original = cs.removeAsync.bind(cs);
    let release!: () => void;
    const pause = new Promise<void>(resolve => { release = resolve; });
    const remove = vi.spyOn(cs, "removeAsync").mockImplementation(async (key: string) => {
      if (key === "first") await pause;
      return original(key);
    });
    const cleanup = cs.removeExpiredAsync(); await settle();
    cs.set("second", "fresh", { category: CacheCategory.Node });
    release(); await cleanup;
    expect(cs.get("second")).toBe("fresh"); remove.mockRestore();
  });
  it("cache:false does not call async HTML lookup", async () => {
    const cs = new CacheService(); setCacheService(cs);
    const read = vi.spyOn(cs, "getAsync");
    await request("/t/123", { cache: false });
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
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


it('rejects an obsolete version persisted in a detail file after restarting', async () => {
  const cs = new CacheService();
  const k = key('/t/123', 'guest');
  await cs.setAsync(k, { apiVersions: { getTopicDetail: 0 }, data: cachedHtml }, { category: CacheCategory.Topic });
  setCacheService(new CacheService());
  const result = await request('/t/123', { cache: true });
  expect(result.fromCache).toBe(false);
  expect(result.body!.textContent).toContain('新正文');
  await settle();
  expect(await new CacheService().getAsync(k)).toEqual(createApiCacheEntry('getTopicDetail', liveHtml));
});

it('invalidates a parsed detail when its on-disk API version changes', async () => {
  const cs = new CacheService(); setCacheService(cs);
  await request('/t/123', { cache: true }); await settle();
  const original = API_CACHE_VERSIONS.getTopicDetail;
  API_CACHE_VERSIONS.getTopicDetail++;
  try {
    const result = await request('/t/123', { cache: true });
    expect(result.fromCache).toBe(false);
    await settle();
    expect((await cs.getAsync<any>(key('/t/123', 'guest'))).apiVersions.getTopicDetail).toBe(original + 1);
  } finally { API_CACHE_VERSIONS.getTopicDetail = original; }
});
