import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheCategory, CacheMeta } from "../CacheService";
import TopicFileCache, { isTopicFileKey, utf8ByteLength } from "../TopicFileCache";

interface DeferredCallback {
  complete: () => void;
}

interface DelayedWrite {
  filePath: string;
  data: string;
  success: () => void;
  fail: (error: unknown) => void;
}

const state = vi.hoisted(() => ({
  files: new Map<string, string>(),
  directories: new Set<string>(),
  writes: [] as DelayedWrite[],
  reads: [] as DeferredCallback[],
  scans: [] as DeferredCallback[],
  deferReads: false,
  deferScans: false,
  asyncUnavailable: false,
  forbidSyncReads: false,
  root: "/sandbox",
  unavailable: false,
  failure: "",
  statFailure: false,
  calls: [] as string[],
}));

function failure(code = "ENOENT"): Error & { code?: string } {
  // DevTools reports missing local files as message-only "not found" errors.
  if (code === "ENOENT") return new Error("readFileSync:fail local file not found");
  return Object.assign(new Error(code), { code });
}

function check(operation: string): void {
  state.calls.push(operation);
  if (state.forbidSyncReads && ["readFileSync", "accessSync", "mkdirSync", "readdirSync", "statSync"].includes(operation)) {
    throw failure("SYNC_IO_FORBIDDEN");
  }
  if (state.failure === operation) throw failure("EIO");
}

vi.mock("@tarojs/taro", () => ({
  default: {
    env: { get USER_DATA_PATH() { return state.root; } },
    getFileSystemManager: () => {
      check("getFileSystemManager");
      if (state.unavailable) throw failure("UNAVAILABLE");
      return {
        access: state.asyncUnavailable ? undefined : (options: { path: string; success: () => void; fail: (error: unknown) => void }) => {
          try { check("access"); if (!state.directories.has(options.path)) throw failure(); options.success(); }
          catch (error) { options.fail(error); }
        },
        mkdir: (options: { dirPath: string; success: () => void; fail: (error: unknown) => void }) => {
          try { check("mkdir"); state.directories.add(options.dirPath); options.success(); }
          catch (error) { options.fail(error); }
        },
        readdir: (options: { dirPath: string; success: (result: { files: string[] }) => void; fail: (error: unknown) => void }) => {
          try {
            check("readdir");
            const files = [...state.files.keys()].filter((name) => name.startsWith(`${options.dirPath}/`)).map((name) => name.slice(options.dirPath.length + 1));
            const callback = { complete: () => options.success({ files }) };
            if (state.deferScans) state.scans.push(callback); else callback.complete();
          } catch (error) { options.fail(error); }
        },
        readFile: (options: { filePath: string; encoding: string; success: (result: { data: string }) => void; fail: (error: unknown) => void }) => {
          check("readFile");
          if (options.encoding !== "utf8") throw failure("ENCODING");
          // Snapshot at request time models a stale in-flight read, including missing.
          const raw = state.files.get(options.filePath);
          const callback = { complete: () => raw === undefined ? options.fail(failure()) : options.success({ data: raw }) };
          if (state.deferReads) state.reads.push(callback); else callback.complete();
        },
        rmdir: (options: { dirPath: string; recursive: boolean; success: () => void; fail: (error: unknown) => void }) => {
          try {
            check("rmdir");
            for (const path of [...state.files.keys()]) if (path.startsWith(`${options.dirPath}/`)) state.files.delete(path);
            for (const path of [...state.directories]) if (path === options.dirPath || path.startsWith(`${options.dirPath}/`)) state.directories.delete(path);
            options.success();
          } catch (error) { options.fail(error); }
        },
        stat: (options: { path: string; success: (result: { stats: { size: number } }) => void; fail: (error: unknown) => void }) => {
          try {
            check("stat");
            if (state.statFailure) throw failure("EIO");
            if (!state.files.has(options.path)) throw failure();
            options.success({ stats: { size: utf8ByteLength(state.files.get(options.path)!) } });
          } catch (error) { options.fail(error); }
        },
        accessSync: (path: string) => {
          check("accessSync");
          if (!state.directories.has(path)) throw failure();
        },
        mkdirSync: (path: string) => { check("mkdirSync"); state.directories.add(path); },
        readdirSync: (path: string) => {
          check("readdirSync");
          return [...state.files.keys()].filter((name) => name.startsWith(`${path}/`)).map((name) => name.slice(path.length + 1));
        },
        readFileSync: (path: string, encoding: string) => {
          check("readFileSync");
          if (encoding !== "utf8") throw failure("ENCODING");
          if (!state.files.has(path)) throw failure();
          return state.files.get(path)!;
        },
        writeFileSync: (path: string, data: string, encoding: string) => {
          check("writeFileSync");
          if (encoding !== "utf8") throw failure("ENCODING");
          state.files.set(path, data);
        },
        writeFile: (options: DelayedWrite & { encoding: string }) => {
          check("writeFile");
          if (options.encoding !== "utf8") throw failure("ENCODING");
          state.writes.push(options);
        },
        renameSync: (oldPath: string, newPath: string) => {
          check("renameSync");
          if (!state.files.has(oldPath)) throw failure();
          state.files.set(newPath, state.files.get(oldPath)!);
          state.files.delete(oldPath);
        },
        unlinkSync: (path: string) => {
          check("unlinkSync");
          if (!state.files.delete(path)) throw failure();
        },
        statSync: (path: string) => {
          check("statSync");
          if (state.statFailure) throw failure("EIO");
          if (!state.files.has(path)) throw failure();
          return { size: utf8ByteLength(state.files.get(path)!) };
        },
      };
    },
    // Any accidental runtime CacheService/storage dependency is a test failure.
    getStorageSync: () => { throw new Error("File cache must not use storage"); },
    setStorageSync: () => { throw new Error("File cache must not use storage"); },
    removeStorageSync: () => { throw new Error("File cache must not use storage"); },
  },
}));

const root = "/sandbox/caches/guozaoke-topic-cache-v1";
const legacyRoot = "/sandbox/guozaoke-topic-cache-v1";
const topic = "topic" as CacheCategory;
const node = "node" as CacheCategory;
const other = "other" as CacheCategory;
const key = (path = "/t/1", user = "guest", env = "develop") => `html_v2_${env}_${user}_https://www.guozaoke.com${path}`;
const meta = (cacheKey: string, overrides: Partial<CacheMeta> = {}): CacheMeta => ({
  key: cacheKey, size: 0, createdAt: Date.now() - 1000, expiresAt: Date.now() + 30 * 60 * 1000,
  priority: "normal", category: topic, ...overrides,
});

function completeWrite(index: number, success = true): void {
  const write = state.writes[index];
  if (success) { state.files.set(write.filePath, write.data); write.success(); }
  else write.fail(failure("QUOTA"));
}

async function settle(): Promise<void> {
  // Bounded microtask drain; no wall-clock timing or process-level sleeps.
  for (let i = 0; i < 100; i++) await Promise.resolve();
}

async function waitForWrites(count: number): Promise<void> {
  await settle();
  expect(state.writes.length).toBeGreaterThanOrEqual(count);
}

function diskBytes(): number {
  return [...state.files.values()].reduce((sum, raw) => sum + utf8ByteLength(raw), 0);
}

function publishedPath(): string {
  return [...state.files.keys()].find((path) => path.endsWith(".json"))!;
}

beforeEach(() => {
  state.files.clear();
  state.directories.clear();
  state.writes = [];
  state.reads = [];
  state.scans = [];
  state.deferReads = false;
  state.deferScans = false;
  state.asyncUnavailable = false;
  state.forbidSyncReads = false;
  state.root = "/sandbox";
  state.unavailable = false;
  state.failure = "";
  state.statFailure = false;
  state.calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isTopicFileKey", () => {
  it("matches forum reading HTML with intact environment, underscored account and query scope", () => {
    for (const path of ["/t/1", "/t/1?p=2", "/t/1?tab=hot", "/search/reply/9?foo=x", "/u/somebody", "/u/a_b/?p=2", "/u/foo?redirect=/node/house"]) {
      expect(isTopicFileKey(key(path, "account_with_underscores", "release"))).toBe(true);
    }
  });

  it("keeps every index in storage and excludes private/business/nonforum routes", () => {
    for (const candidate of [
      "topic_index", "__cache_index__", key("/"), key("/?tab=hot"), key("/node/house"),
      "draft_topic_1", "html_https://www.guozaoke.com/t/1",
      "html_v2__guest_https://www.guozaoke.com/t/1", "html_v2_develop__https://www.guozaoke.com/t/1",
      key("/u/"), key("/u/foo/favorites"), key("/u/foo/topics"), key("/notifications"), key("/login"), key("/search?q=/t/1"),
      key("/node/"), key("/t/"), key("/search/reply/"),
      key("/t/../notifications"), key("/t/%2e%2e/notifications"), key("/t/1\\\\../../notifications"),
      key().replace("www.guozaoke.com", "www.guozaoke.com.evil.test"),
      key().replace("https://www.guozaoke.com", "https://evil.test"),
      key().replace("https://", "http://"), key().replace("www.guozaoke.com", "www.guozaoke.com@evil.test"),
      "link_" + key(),
    ]) expect(isTopicFileKey(candidate)).toBe(false);
  });
});

describe("UTF-8", () => {
  it("counts ASCII, Chinese, emoji, and lone surrogates as encoded bytes", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("光谷")).toBe(6);
    expect(utf8ByteLength("a光😀")).toBe(8);
    expect(utf8ByteLength("\ud800")).toBe(3);
    expect(utf8ByteLength("\udc00")).toBe(3);
    expect(utf8ByteLength("\ud800x")).toBe(4);
  });
});

describe("TopicFileCache failure recovery", () => {
  it("automatic expiration does not cancel a fresh pending replacement", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "old", meta(key(), { expiresAt: Date.now() - 1 }));
    const fresh = cache.setAsync(key(), "fresh", meta(key()));
    expect(cache.get(key())).toBeNull();
    cache.cleanup();
    await waitForWrites(1);
    completeWrite(0);
    expect(await fresh).toBe(true);
    expect(cache.get(key())?.payload).toBe("fresh");
  });
  it("a fresh instance cannot report clear success after a real directory scan failure", () => {
    new TopicFileCache().set(key(), "persisted", meta(key()));
    state.failure = "readdirSync";
    expect(() => new TopicFileCache().clear()).toThrow();
    expect(state.files.size).toBe(1);
  });
  it("full clear removes a known file corrupted after initialization", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "old", meta(key()));
    state.files.set(publishedPath(), "broken");
    expect(cache.clear()).toBe(0);
    expect(state.files.size).toBe(0);
    expect(cache.set(key(), "fresh", meta(key()))).toBe(true);
  });
  it("manual clear recovers from historical unknown-size state", () => {
    new TopicFileCache().set(key(), "old", meta(key()));
    const cache = new TopicFileCache();
    state.failure = "readFileSync"; state.statFailure = true;
    cache.getAllMeta();
    state.failure = ""; state.statFailure = false;
    expect(cache.clear()).toBe(1);
    expect(cache.clear()).toBe(0);
    expect(cache.set(key(), "fresh", meta(key()))).toBe(true);
  });
});

describe("TopicFileCache persistence", () => {
  it("initializes lazily, stores a versioned UTF-8 envelope, and reports payload bytes", () => {
    const cache = new TopicFileCache();
    expect(state.calls).toEqual([]);
    const original = meta(key());
    expect(cache.set(key(), "光谷😀", original)).toBe(true);
    expect(original.size).toBe(0);
    expect(cache.get(key())).toEqual({ payload: "光谷😀", meta: { ...original, size: 10 } });
    const envelope = JSON.parse(state.files.get(publishedPath())!);
    expect(envelope.version).toBe(1);
    expect(envelope.meta.key).toBe(key());
    expect(publishedPath()).toMatch(/\/guozaoke-topic-cache-v1\/[a-f0-9]{16}\.json$/);
  });

  it("recovers across instances, preserving metadata without rescanning for every read/stat", () => {
    const first = new TopicFileCache();
    first.set(key(), "persisted", meta(key()));
    const second = new TopicFileCache();
    expect(second.get(key())?.payload).toBe("persisted");
    const scans = state.calls.filter((call) => call === "readdirSync").length;
    second.get(key()); second.getMeta(key()); second.getAllMeta(); second.getAllMeta();
    expect(state.calls.filter((call) => call === "readdirSync").length).toBe(scans);
    const exposed = second.getMeta(key())!;
    exposed.size = 999;
    expect(second.getMeta(key())!.size).toBe(9);
  });

  it("isolates account, environment, pagination, tab and route values", () => {
    const cache = new TopicFileCache();
    const keys = [key(), key("/t/1?p=2"), key("/t/1", "a_b"), key("/t/1", "guest", "release"), key("/t/1?tab=hot"), key("/search/reply/1")];
    keys.forEach((value, index) => expect(cache.set(value, String(index), meta(value))).toBe(true));
    keys.forEach((value, index) => expect(cache.get(value)?.payload).toBe(String(index)));
    expect(cache.getAllMeta().length).toBe(keys.length);
  });

  it("retains expired metadata for upper-layer cleanup but get expires after the deadline", () => {
    const cache = new TopicFileCache();
    const expired = meta(key(), { expiresAt: Date.now() - 1 });
    expect(cache.set(key(), "expired", expired)).toBe(true);
    expect(cache.getMeta(key())?.expiresAt).toBe(expired.expiresAt);
    expect(cache.getAllMeta().length).toBe(1);
    expect(cache.get(key())).toBeNull();
    expect(cache.getMeta(key())).toBeNull();
    expect(state.files.size).toBe(0);
  });

  it("matches the legacy TTL boundary: a zero-TTL value hits in the same millisecond", () => {
    let now = 100000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const cache = new TopicFileCache();
    expect(cache.set(key(), "same millisecond", meta(key(), { createdAt: now, expiresAt: now }))).toBe(true);
    cache.cleanup();
    expect(cache.get(key())?.payload).toBe("same millisecond");
    now++;
    expect(cache.get(key())).toBeNull();
  });

  it("a restart retains expired metadata until get or cleanup", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "expired", meta(key(), { expiresAt: 1 }));
    const restarted = new TopicFileCache();
    expect(restarted.getMeta(key())?.expiresAt).toBe(1);
    restarted.cleanup();
    expect(restarted.getAllMeta()).toEqual([]);
  });

  it("rejects invalid keys, metadata timestamps/categories/priorities and nonstrings", () => {
    const cache = new TopicFileCache();
    for (const invalid of [
      { createdAt: Infinity }, { expiresAt: NaN }, { size: Infinity }, { size: -1 },
      { category: "invalid" as CacheCategory }, { priority: "invalid" as CacheMeta["priority"] },
      { key: key("/t/2") },
    ]) expect(cache.set(key(), "bad", meta(key(), invalid))).toBe(false);
    expect(cache.set(key(), {} as string, meta(key()))).toBe(false);
    expect(cache.set("topic_index", "{}", meta("topic_index"))).toBe(false);
    expect(state.files.size).toBe(0);
  });

  it("recovers by deleting orphan temporaries and corrupted/invalid envelopes only in its directory", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "valid", meta(key()));
    const validPath = publishedPath();
    state.files.set(`${root}/orphan.tmp`, "old");
    state.files.set(`${root}/broken.json`, "{bad");
    state.files.set("/sandbox/important-file", "untouched");
    new TopicFileCache().cleanup();
    expect(state.files.has(validPath)).toBe(true);
    expect(state.files.has(`${root}/orphan.tmp`)).toBe(false);
    expect(state.files.has(`${root}/broken.json`)).toBe(false);
    expect(state.files.get("/sandbox/important-file")).toBe("untouched");
  });

  it("rejects corrupt stored versions, nonfinite/malformed metadata and mismatched payload size", () => {
    for (const patch of [
      { version: 2 }, { meta: { ...meta(key()), expiresAt: null } },
      { meta: { ...meta(key()), category: "bogus" } }, { meta: { ...meta(key()), size: 999 } },
    ]) {
      const cache = new TopicFileCache();
      cache.set(key(), "abc", meta(key()));
      const path = publishedPath();
      state.files.set(path, JSON.stringify({ ...JSON.parse(state.files.get(path)!), ...patch }));
      expect(new TopicFileCache().get(key())).toBeNull();
    }
  });

  it("does not read, overwrite, or delete another full key on a hash collision", () => {
    const cache = new TopicFileCache();
    // Force a filename collision rather than trusting that hashing never collides.
    vi.spyOn(cache as any, "fileName").mockReturnValue("0000000000000000.json");
    expect(cache.set(key(), "first account", meta(key()))).toBe(true);
    const colliding = key("/t/1", "other_account");
    expect(cache.get(colliding)).toBeNull();
    expect(cache.set(colliding, "other account", meta(colliding))).toBe(false);
    expect(cache.remove(colliding)).toBe(false);
    expect(cache.get(key())?.payload).toBe("first account");
    expect(cache.remove(key())).toBe(true);
    expect(cache.remove(key())).toBe(true);
  });
});

describe("capacity", () => {
  it("enforces entry count and evicts expired before low priority before oldest", () => {
    const cache = new TopicFileCache(3);
    const expired = key("/t/expired");
    const low = key("/t/low");
    const high = key("/t/high");
    cache.set(expired, "x", meta(expired, { expiresAt: 1, priority: "high" }));
    cache.set(high, "x", meta(high, { priority: "high", createdAt: 1 }));
    cache.set(low, "x", meta(low, { priority: "low" }));
    expect(cache.getMeta(expired)).toBeNull();
    cache.set(key("/t/four"), "x", meta(key("/t/four")));
    cache.set(key("/t/five"), "x", meta(key("/t/five")));
    expect(cache.getMeta(low)).toBeNull();
    expect(cache.getMeta(high)).not.toBeNull();
    expect(cache.getAllMeta().length).toBe(3);
  });

  it("uses full JSON UTF-8 disk bytes rather than payload size", () => {
    const measuring = new TopicFileCache();
    measuring.set(key(), "中".repeat(10), meta(key()));
    const bytes = diskBytes();
    state.files.clear();
    const cache = new TopicFileCache(1000, bytes - 1);
    expect(cache.set(key(), "中".repeat(10), meta(key()))).toBe(false);
    expect(state.files.size).toBe(0);
  });

  it("preserves an old value when replacement plus temporary reservation cannot fit", () => {
    const measuring = new TopicFileCache();
    measuring.set(key(), "old", meta(key()));
    const bytes = diskBytes();
    const cache = new TopicFileCache(1000, bytes + 10);
    expect(cache.set(key(), "new", meta(key()))).toBe(false);
    expect(cache.get(key())?.payload).toBe("old");
  });

  it("accounts for all overlapping temporary writes, including invalidated writes", async () => {
    const measuring = new TopicFileCache();
    measuring.set(key(), "x", meta(key()));
    const bytes = diskBytes();
    state.files.clear();
    const cache = new TopicFileCache(1000, bytes * 2 + 10);
    const a = cache.setAsync(key(), "x", meta(key()));
    await waitForWrites(1);
    const b = cache.setAsync(key(), "x", meta(key()));
    await waitForWrites(2);
    expect(await cache.setAsync(key(), "x", meta(key()))).toBe(false);
    await waitForWrites(1);
    completeWrite(0); completeWrite(1);
    expect(await a).toBe(false);
    expect(await b).toBe(false); // The newest attempted write invalidates both old writes.
    expect(state.files.size).toBe(0);
  });

  it("reserves entry slots for unpublished writes", async () => {
    const cache = new TopicFileCache(1);
    const a = cache.setAsync(key(), "a", meta(key()));
    await waitForWrites(1);
    expect(await cache.setAsync(key("/t/2"), "b", meta(key("/t/2")))).toBe(false);
    await waitForWrites(1);
    completeWrite(0);
    expect(await a).toBe(true);
    expect(cache.getAllMeta().length).toBe(1);
  });

  it("never publishes over budget when failed eviction leaves disk files behind", () => {
    const cache = new TopicFileCache(1);
    cache.set(key(), "old", meta(key()));
    state.failure = "unlinkSync";
    expect(cache.set(key("/t/2"), "new", meta(key("/t/2")))).toBe(false);
    expect(cache.getMeta(key())).not.toBeNull();
  });
});

describe("concurrent publication", () => {
  it("publishes only the latest async write when callbacks complete out of order", async () => {
    const cache = new TopicFileCache();
    const first = cache.setAsync(key(), "first", meta(key()));
    await waitForWrites(1);
    const second = cache.setAsync(key(), "second", meta(key()));
    await waitForWrites(2);
    expect(cache.hasPending(key())).toBe(true);
    completeWrite(1); completeWrite(0);
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(cache.get(key())?.payload).toBe("second");
    expect(cache.hasPending(key())).toBe(false);
    expect(state.files.size).toBe(1);
  });

  it("a later sync set invalidates an older async write", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "old async", meta(key()));
    await waitForWrites(1);
    expect(cache.set(key(), "new sync", meta(key()))).toBe(true);
    await waitForWrites(1);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(cache.get(key())?.payload).toBe("new sync");
  });

  it("remove invalidates even an unpublished write and cannot resurrect the key", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "old", meta(key()));
    await waitForWrites(1);
    expect(cache.remove(key())).toBe(true);
    expect(cache.hasPending(key())).toBe(false);
    await waitForWrites(1);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(cache.get(key())).toBeNull();
    expect(state.files.size).toBe(0);
  });

  it("a post-remove new write can publish while the pre-remove write is rejected", async () => {
    const cache = new TopicFileCache();
    const old = cache.setAsync(key(), "old", meta(key()));
    await waitForWrites(1);
    cache.remove(key());
    const next = cache.setAsync(key(), "next", meta(key()));
    await waitForWrites(2);
    completeWrite(1); completeWrite(0);
    expect(await old).toBe(false);
    expect(await next).toBe(true);
    expect(cache.get(key())?.payload).toBe("next");
  });

  it("global clear invalidates pending-only writes and counts only published deletions", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "published", meta(key()));
    const pending = cache.setAsync(key("/t/2"), "pending", meta(key("/t/2")));
    await waitForWrites(1);
    expect(cache.clear()).toBe(1);
    const after = cache.setAsync(key("/t/3"), "after clear", meta(key("/t/3")));
    await waitForWrites(2);
    completeWrite(0); completeWrite(1);
    expect(await pending).toBe(false);
    expect(await after).toBe(true);
    expect(cache.getAllMeta().map((m) => m.key)).toEqual([key("/t/3")]);
  });

  it("category clear cancels its pending writes but preserves other categories", async () => {
    const cache = new TopicFileCache();
    const topicWrite = cache.setAsync(key(), "topic", meta(key()));
    await waitForWrites(1);
    // Category handling is independent of route selection; use a whitelisted detail key.
    const nodeKey = key("/t/2");
    const nodeWrite = cache.setAsync(nodeKey, "node", meta(nodeKey, { category: node }));
    await waitForWrites(2);
    expect(cache.clear(topic)).toBe(0);
    completeWrite(1); completeWrite(0);
    expect(await topicWrite).toBe(false);
    expect(await nodeWrite).toBe(true);
    expect(cache.get(nodeKey)?.payload).toBe("node");
  });

  it("cleanup and another instance's recovery do not delete active temporary files", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "active", meta(key()));
    await waitForWrites(1);
    const write = state.writes[0];
    // WeChat can create a temp before its completion callback fires.
    state.files.set(write.filePath, write.data);
    cache.cleanup();
    new TopicFileCache().cleanup();
    expect(state.files.has(write.filePath)).toBe(true);
    write.success();
    expect(await pending).toBe(true);
    expect(cache.get(key())?.payload).toBe("active");
  });

  it("a failed new write never allows an older pending write to win", async () => {
    const cache = new TopicFileCache();
    const old = cache.setAsync(key(), "old", meta(key()));
    await waitForWrites(1);
    state.failure = "writeFileSync";
    expect(cache.set(key(), "failed new", meta(key()))).toBe(false);
    state.failure = "";
    await waitForWrites(1);
    completeWrite(0);
    expect(await old).toBe(false);
    expect(cache.get(key())).toBeNull();
  });
});

describe("genuine async filesystem paths", () => {
  it("publication callbacks synchronously see committed metadata and revision for sync and fresh async sets", async () => {
    const tracked = new Set<string>();
    const published = vi.fn((cacheKey: string, publishedMeta: CacheMeta) => {
      expect(cache.getMetaCached(cacheKey)?.size).toBe(publishedMeta.size);
      expect(cache.getRevision(cacheKey)).not.toBe(captured);
      tracked.add(cacheKey);
      publishedMeta.size = 999;
    });
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024,
      (cacheKey) => { tracked.delete(cacheKey); }, published);
    let captured = cache.getRevision(key());
    expect(cache.set(key(), "sync", meta(key()))).toBe(true);
    expect(published).toHaveBeenCalledTimes(1);
    expect(cache.getMetaCached(key())?.size).toBe(4);
    const fresh = key("/u/fresh-profile");
    captured = cache.getRevision(fresh);
    const write = cache.setAsync(fresh, "async", meta(fresh));
    await waitForWrites(1);
    completeWrite(0);
    await settle();
    expect(tracked.has(fresh)).toBe(true); // No read/reconciliation required.
    expect(await write).toBe(true);
    expect(published).toHaveBeenCalledTimes(2);
    expect(cache.getMetaCached(fresh)?.size).toBe(5);
    expect(await cache.clearAsync()).toBe(2);
    expect(tracked.size).toBe(0);
    expect(published).toHaveBeenCalledTimes(2);
  });

  it("canceled async writes never publish callbacks or resurrect tracking after clear", async () => {
    const tracked = new Set<string>();
    const published = vi.fn((cacheKey: string) => { tracked.add(cacheKey); });
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024,
      (cacheKey) => { tracked.delete(cacheKey); }, published);
    const write = cache.setAsync(key(), "pending", meta(key()));
    await waitForWrites(1);
    const clearing = cache.clearAsync();
    completeWrite(0);
    expect(await write).toBe(false);
    expect(await clearing).toBe(0);
    expect(published).not.toHaveBeenCalled();
    expect(tracked.size).toBe(0);
  });

  it("repairs metadata after a successful read following cold scan EIO without changing revision", async () => {
    new TopicFileCache().set(key(), "persisted", meta(key()));
    const cache = new TopicFileCache();
    const revision = cache.getRevision(key());
    state.failure = "readFile";
    expect(await cache.getAllMetaAsync()).toEqual([]);
    expect(cache.getMetaCached(key())).toBeNull();
    state.failure = "";
    expect((await cache.getAsync(key()))?.payload).toBe("persisted");
    expect(cache.getMetaCached(key())?.size).toBe(9);
    expect(cache.getRevision(key())).toBe(revision);
    expect((await cache.getAllMetaAsync()).map((entry) => entry.key)).toEqual([key()]);
  });

  it("recovers valid old files when the new destination is malformed and clears old garbage", async () => {
    new TopicFileCache().set(key(), "recover", meta(key()));
    const newPath = publishedPath();
    const original = state.files.get(newPath)!;
    state.files.set(newPath.replace(root, legacyRoot), original);
    state.files.set(newPath, "broken");
    state.files.set(`${legacyRoot}/garbage.json`, "broken");
    const cache = new TopicFileCache();
    expect((await cache.getAsync(key()))?.payload).toBe("recover");
    expect(state.files.get(newPath)).toBe(original);
    expect([...state.files.keys()].some((path) => path.startsWith(`${legacyRoot}/`))).toBe(false);
    expect(await cache.clearAsync()).toBe(1);
  });

  it("metadata enumeration rejects genuine initialization failures but unsupported empty FS stays empty", async () => {
    state.failure = "readdir";
    const cache = new TopicFileCache();
    await expect(cache.getAllMetaAsync()).rejects.toThrow();
    state.failure = "";
    expect(await cache.getAllMetaAsync()).toEqual([]);
    state.asyncUnavailable = true;
    expect(await new TopicFileCache().getAllMetaAsync()).toEqual([]);
  });

  it("category clearing leaves an unrelated in-flight read and its revision valid", async () => {
    const cache = new TopicFileCache();
    const unrelated = key("/u/unrelated");
    cache.set(unrelated, "profile", meta(unrelated, { category: "user" as CacheCategory }));
    state.deferReads = true;
    const revision = cache.getRevision(unrelated);
    const read = cache.getAsync(unrelated);
    await settle();
    const clearing = cache.clearAsync(topic);
    await settle();
    expect(cache.getRevision(unrelated)).toBe(revision);
    state.deferReads = false;
    for (const callback of [...state.reads]) callback.complete();
    expect(await clearing).toBe(0);
    expect((await read)?.payload).toBe("profile");
    expect(cache.getRevision(unrelated)).toBe(revision);
  });

  it("migrates the previous directory asynchronously without extending original deadlines", async () => {
    const original = meta(key(), { createdAt: 10, expiresAt: Date.now() + 1e6 });
    const seed = new TopicFileCache();
    seed.set(key(), "legacy", original);
    const newPath = publishedPath();
    const oldPath = newPath.replace(root, legacyRoot);
    const raw = state.files.get(newPath)!;
    state.files.delete(newPath);
    state.files.set(oldPath, raw);
    state.files.set(`${legacyRoot}/orphan.tmp`, "orphan");
    state.calls = [];
    state.forbidSyncReads = true;
    const migrated = new TopicFileCache();
    const result = await migrated.getAsync(key());
    expect(result?.payload).toBe("legacy");
    expect(result?.meta.createdAt).toBe(original.createdAt);
    expect(result?.meta.expiresAt).toBe(original.expiresAt);
    expect(state.files.get(newPath)).toBe(raw);
    expect(state.files.has(oldPath)).toBe(false);
    expect(state.files.has(`${legacyRoot}/orphan.tmp`)).toBe(false);
    expect(state.calls.some((call) => ["readFileSync", "readdirSync", "accessSync", "statSync"].includes(call))).toBe(false);
  });

  it("new directory values win legacy duplicates and failed migration stays retryable", async () => {
    const seed = new TopicFileCache();
    seed.set(key(), "new", meta(key()));
    const path = publishedPath();
    const envelope = JSON.parse(state.files.get(path)!);
    const oldPath = path.replace(root, legacyRoot);
    state.files.set(oldPath, JSON.stringify({ ...envelope, payload: "old", meta: { ...envelope.meta, size: 3 } }));
    const cache = new TopicFileCache();
    expect((await cache.getAsync(key()))?.payload).toBe("new");
    expect(state.files.has(oldPath)).toBe(false);
    state.files.set(oldPath, state.files.get(path)!);
    state.files.delete(path);
    const retry = new TopicFileCache();
    state.failure = "renameSync";
    expect(await retry.getAsync(key())).toBeNull();
    await expect(retry.clearAsync()).rejects.toThrow();
    expect(state.files.has(oldPath)).toBe(true);
    state.failure = "";
    expect((await retry.getAsync(key()))?.payload).toBe("new");
    expect(state.files.has(oldPath)).toBe(false);
  });

  it("full clear drains canceled temps, removes the caches root and permits safe recreation", async () => {
    const cache = new TopicFileCache();
    const write = cache.setAsync(key(), "late temp", meta(key()));
    await waitForWrites(1);
    state.files.set("/sandbox/caches/another-cache/value", "cache");
    state.files.set("/sandbox/account-data", "private");
    const clearing = cache.clearAsync();
    let completed = false;
    void clearing.then(() => { completed = true; });
    await settle();
    expect(completed).toBe(false);
    expect(await cache.setAsync(key("/t/2"), "blocked", meta(key("/t/2")))).toBe(false);
    completeWrite(0);
    expect(await write).toBe(false);
    expect(await clearing).toBe(0);
    expect(state.calls).toContain("rmdir");
    expect([...state.files.keys()]).toEqual(["/sandbox/account-data"]);
    expect(state.directories.has(root)).toBe(false);
    const calls = state.calls.length;
    expect(await cache.getAllMetaAsync()).toEqual([]);
    expect(await cache.getMetaAsync(key())).toBeNull();
    expect(await cache.getAsync(key())).toBeNull();
    cache.getAllMeta(); cache.getMeta(key()); cache.getMetaCached(key()); cache.getAllMetaCached();
    await cache.cleanupAsync();
    expect(state.calls.length).toBe(calls);
    expect(state.directories.has(root)).toBe(false);
    const replacement = cache.setAsync(key(), "recreated", meta(key()));
    await waitForWrites(2);
    completeWrite(1);
    expect(await replacement).toBe(true);
    expect(state.directories.has(root)).toBe(true);
  });

  it("root deletion failure rejects without claiming unrelated caches were removed", async () => {
    const cache = new TopicFileCache();
    await cache.getAllMetaAsync();
    state.files.set("/sandbox/caches/another-cache/value", "cache");
    state.failure = "rmdir";
    await expect(cache.clearAsync()).rejects.toThrow();
    expect(state.files.has("/sandbox/caches/another-cache/value")).toBe(true);
    state.failure = "";
    expect(await cache.clearAsync()).toBe(0);
    expect(state.files.size).toBe(0);
  });

  it("sync missing/expiry/removal/eviction callbacks never fire for corruption or delete failures", () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1, 20 * 1024 * 1024, removed);
    cache.set(key(), "value", meta(key()));
    state.files.delete(publishedPath());
    expect(cache.get(key())).toBeNull();
    expect(removed).toHaveBeenCalledWith(key(), "missing");
    expect(cache.remove(key())).toBe(true);
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
    removed.mockClear();
    cache.set(key(), "expired", meta(key(), { expiresAt: 1 }));
    expect(cache.get(key())).toBeNull();
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
    cache.set(key(), "old", meta(key()));
    cache.set(key("/t/2"), "next", meta(key("/t/2")));
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
    removed.mockClear();
    state.failure = "unlinkSync";
    expect(cache.remove(key("/t/2"))).toBe(false);
    expect(removed).not.toHaveBeenCalled();
    state.failure = "";
    state.files.set(publishedPath(), "broken");
    expect(cache.get(key("/t/2"))).toBeNull();
    cache.cleanup();
    expect(removed).not.toHaveBeenCalled();
  });

  it("coalesces cold initialization without any sync reads or scans", async () => {
    state.forbidSyncReads = true;
    state.deferScans = true;
    const cache = new TopicFileCache();
    const read = cache.getAsync(key());
    const metas = cache.getAllMetaAsync();
    const one = cache.getMetaAsync(key());
    let completed = false;
    void read.then(() => { completed = true; });
    await settle();
    expect(completed).toBe(false);
    expect(state.scans.length).toBe(1);
    expect(state.calls.filter((call) => call === "access").length).toBe(1);
    state.deferScans = false;
    state.scans[0].complete();
    expect(await read).toBeNull();
    expect(await metas).toEqual([]);
    expect(await one).toBeNull();
    expect(state.calls.some((call) => /Sync$/.test(call))).toBe(false);
  });

  it("writes, reads, snapshots, cleans and clears using async FS only", async () => {
    state.forbidSyncReads = true;
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    const profile = key("/u/account_with_underscores?p=2");
    const write = cache.setAsync(profile, "光谷😀", meta(profile, { category: "user" as CacheCategory }));
    expect(cache.hasPending(profile)).toBe(true);
    await waitForWrites(1);
    completeWrite(0);
    expect(await write).toBe(true);
    expect((await cache.getAsync(profile))?.payload).toBe("光谷😀");
    expect((await cache.getMetaAsync(profile))?.size).toBe(10);
    const calls = state.calls.length;
    cache.getMeta(profile); cache.getAllMeta(); cache.getMetaCached(profile);
    expect(state.calls.length).toBe(calls);
    await cache.cleanupAsync();
    expect(await cache.clearAsync("user" as CacheCategory)).toBe(1);
    expect(removed).toHaveBeenCalledWith(profile, "deleted");
    expect(state.calls.some((call) => ["readFileSync", "accessSync", "readdirSync", "statSync", "mkdirSync"].includes(call))).toBe(false);
  });

  it("cancels a write during initialization before any temporary write", async () => {
    state.deferScans = true;
    const cache = new TopicFileCache();
    const revision = cache.getRevision(key());
    const write = cache.setAsync(key(), "old", meta(key()));
    expect(cache.hasPending(key())).toBe(true);
    const deletion = cache.removeAsync(key());
    expect(cache.hasPending(key())).toBe(false);
    await settle();
    state.deferScans = false;
    state.scans[0].complete();
    expect(await write).toBe(false);
    expect(await deletion).toBe(true);
    expect(state.writes.length).toBe(0);
    expect(cache.getRevision(key())).not.toBe(revision);
  });

  it("latest attempt cancels a preparing write even if the latest attempt fails", async () => {
    const cache = new TopicFileCache();
    await cache.getAllMetaAsync();
    state.deferReads = true;
    const first = cache.setAsync(key(), "first", meta(key()));
    await settle();
    expect(state.reads.length).toBe(1);
    expect(cache.hasPending(key())).toBe(true);
    expect(await cache.setAsync(key(), {} as string, meta(key()))).toBe(false);
    state.deferReads = false;
    state.reads[0].complete();
    expect(await first).toBe(false);
    expect(state.writes.length).toBe(0);
  });

  it("a stale missing read cannot forget a newly published file even after write finish", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    await cache.getAllMetaAsync();
    const write = cache.setAsync(key(), "new", meta(key()));
    await waitForWrites(1);
    state.deferReads = true;
    const read = cache.getAsync(key());
    await settle();
    expect(state.reads.length).toBe(1);
    state.deferReads = false;
    completeWrite(0);
    expect(await write).toBe(true);
    state.reads[0].complete();
    expect(await read).toBeNull();
    expect(removed).not.toHaveBeenCalled();
    expect(cache.getMetaCached(key())).not.toBeNull();
    expect((await cache.getAsync(key()))?.payload).toBe("new");
  });

  it("missing callbacks preserve preparing writes and nonmissing/corrupt reads preserve metadata", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    cache.set(key(), "old", meta(key()));
    state.files.delete(publishedPath());
    state.deferReads = true;
    const write = cache.setAsync(key(), "new", meta(key()));
    await settle();
    const read = cache.getAsync(key());
    await settle();
    state.reads[1].complete();
    expect(await read).toBeNull();
    expect(removed).not.toHaveBeenCalled();
    expect(cache.getMetaCached(key())).not.toBeNull();
    state.deferReads = false;
    state.reads[0].complete();
    await waitForWrites(1);
    completeWrite(0);
    expect(await write).toBe(true);
    state.failure = "readFile";
    expect(await cache.getAsync(key())).toBeNull();
    expect(cache.getMetaCached(key())).not.toBeNull();
    state.failure = "";
    state.files.set(publishedPath(), "broken");
    expect(await cache.getAsync(key())).toBeNull();
    expect(cache.getMetaCached(key())).not.toBeNull();
    expect(removed).not.toHaveBeenCalled();
    expect(await cache.clearAsync()).toBe(0);
    expect(state.files.size).toBe(0);
    expect(removed).not.toHaveBeenCalled();
  });

  it("missing reads and cleanup notify missing; explicit deletion/expiry/eviction notify deleted", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1, 20 * 1024 * 1024, removed);
    cache.set(key(), "x", meta(key()));
    state.files.delete(publishedPath());
    const revision = cache.getRevision(key());
    expect(await cache.getAsync(key())).toBeNull();
    expect(cache.getRevision(key())).toBe(revision);
    expect(removed).toHaveBeenCalledWith(key(), "missing");
    cache.set(key(), "x", meta(key()));
    state.files.delete(publishedPath());
    await cache.cleanupAsync();
    expect(removed).toHaveBeenCalledWith(key(), "missing");
    expect(await cache.removeAsync(key())).toBe(true);
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
    cache.set(key(), "expired", meta(key(), { expiresAt: 1 }));
    expect(await cache.getAsync(key())).toBeNull();
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
    cache.set(key(), "x", meta(key()));
    const next = key("/t/2");
    const write = cache.setAsync(next, "y", meta(next));
    await waitForWrites(1);
    completeWrite(0);
    expect(await write).toBe(true);
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
  });

  it("conditional migration refuses changed revisions without invalidating a live write", async () => {
    const cache = new TopicFileCache();
    await cache.getAllMetaAsync();
    const oldRevision = cache.getRevision(key());
    const live = cache.setAsync(key(), "live", meta(key()));
    const liveRevision = cache.getRevision(key());
    expect(await cache.setAsync(key(), "legacy", meta(key()), oldRevision)).toBe(false);
    expect(cache.getRevision(key())).toBe(liveRevision);
    await waitForWrites(1);
    completeWrite(0);
    expect(await live).toBe(true);
    expect(cache.getRevision(key())).not.toBe(oldRevision);
    const finishedRevision = cache.getRevision(key());
    expect(await cache.getAsync(key())).not.toBeNull();
    expect(cache.getRevision(key())).toBe(finishedRevision);
    cache.clear(node);
    expect(cache.getRevision(key())).toBe(finishedRevision);
    cache.clear(topic);
    expect(cache.getRevision(key())).not.toBe(finishedRevision);
  });

  it("clear cancels category preparation before initialization resolves", async () => {
    state.deferScans = true;
    const cache = new TopicFileCache();
    const write = cache.setAsync(key(), "pending", meta(key()));
    const clearing = cache.clearAsync(topic);
    expect(cache.hasPending(key())).toBe(false);
    await settle();
    state.deferScans = false;
    state.scans[0].complete();
    expect(await write).toBe(false);
    expect(await clearing).toBe(0);
    expect(state.writes.length).toBe(0);
  });

  it("serial publication follows recovery scan and sync mutations are guarded during scan", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "old", meta(key()));
    const write = cache.setAsync(key("/t/2"), "new", meta(key("/t/2")));
    await waitForWrites(1);
    state.deferScans = true;
    const cleanup = cache.cleanupAsync();
    await settle();
    completeWrite(0);
    expect(cache.set(key(), "new sync", meta(key()))).toBe(false);
    state.deferScans = false;
    state.scans[0].complete();
    await cleanup;
    expect(await write).toBe(true);
    expect(cache.getMetaCached(key())?.size).toBe(3);
    expect((await cache.getAsync(key()))?.payload).toBe("old");
  });

  it("async collision guards retain the other key and never notify its deletion", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    vi.spyOn(cache as any, "fileName").mockReturnValue("0000000000000000.json");
    const first = cache.setAsync(key(), "first", meta(key()));
    await waitForWrites(1);
    completeWrite(0);
    expect(await first).toBe(true);
    const collision = key("/u/another-user");
    expect(await cache.getAsync(collision)).toBeNull();
    expect(await cache.setAsync(collision, "collision", meta(collision))).toBe(false);
    expect(await cache.removeAsync(collision)).toBe(false);
    expect(removed).not.toHaveBeenCalled();
    expect((await cache.getAsync(key()))?.payload).toBe("first");
  });

  it("revalidates async destination immediately before publish if disk changes during temp write", async () => {
    const cache = new TopicFileCache();
    const write = cache.setAsync(key(), "new", meta(key()));
    await waitForWrites(1);
    const destination = state.writes[0].filePath.split(".json.")[0] + ".json";
    state.files.set(destination, "corrupted externally");
    completeWrite(0);
    expect(await write).toBe(false);
    expect(state.files.get(destination)).toBe("corrupted externally");
  });

  it("full async clear notifies confirmed-missing known references as explicit deletion", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    cache.set(key(), "old", meta(key()));
    state.files.delete(publishedPath());
    expect(await cache.clearAsync()).toBe(0);
    expect(removed).toHaveBeenCalledWith(key(), "deleted");
  });

  it("async cleanup protects active temporary files owned by another instance", async () => {
    const cache = new TopicFileCache();
    const write = cache.setAsync(key(), "temp", meta(key()));
    await waitForWrites(1);
    state.files.set(state.writes[0].filePath, state.writes[0].data);
    await new TopicFileCache().cleanupAsync();
    expect(state.files.has(state.writes[0].filePath)).toBe(true);
    completeWrite(0);
    expect(await write).toBe(true);
  });

  it("another instance full clear fails rather than deleting an active temp", async () => {
    const cache = new TopicFileCache();
    const write = cache.setAsync(key(), "temp", meta(key()));
    await waitForWrites(1);
    state.files.set(state.writes[0].filePath, state.writes[0].data);
    await expect(new TopicFileCache().clearAsync()).rejects.toThrow();
    expect(state.files.has(state.writes[0].filePath)).toBe(true);
    completeWrite(0);
    expect(await write).toBe(true);
  });

  it("full clear works after sync initialization without sync read/scan fallback", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "seed", meta(key()));
    state.calls = [];
    state.forbidSyncReads = true;
    expect(await cache.clearAsync()).toBe(1);
    expect(state.calls).toContain("rmdir");
    expect(state.calls.some((call) => ["readFileSync", "accessSync", "readdirSync", "statSync"].includes(call))).toBe(false);
  });

  it("async remove rechecks state after read and never deletes a newer pending replacement", async () => {
    const removed = vi.fn();
    const cache = new TopicFileCache(1000, 20 * 1024 * 1024, removed);
    cache.set(key(), "old", meta(key()));
    state.deferReads = true;
    const deletion = cache.removeAsync(key());
    await settle();
    const write = cache.setAsync(key(), "new", meta(key()));
    state.deferReads = false;
    state.reads[0].complete();
    expect(await deletion).toBe(false);
    expect(removed).not.toHaveBeenCalled();
    await waitForWrites(1);
    completeWrite(0);
    expect(await write).toBe(true);
    expect((await cache.getAsync(key()))?.payload).toBe("new");
  });

  it("full clear fails on genuine scan/delete errors but unsupported async FS never falls back to sync", async () => {
    state.asyncUnavailable = true;
    const unsupported = new TopicFileCache();
    expect(await unsupported.getAsync(key())).toBeNull();
    expect(await unsupported.setAsync(key(), "x", meta(key()))).toBe(false);
    expect(await unsupported.clearAsync()).toBe(0);
    expect(state.calls.some((call) => /Sync$/.test(call))).toBe(false);
    state.asyncUnavailable = false;
    const cache = new TopicFileCache();
    cache.set(key(), "x", meta(key()));
    state.failure = "readdir";
    await expect(cache.clearAsync()).rejects.toThrow();
    expect(cache.getMetaCached(key())).not.toBeNull();
    state.failure = "unlinkSync";
    await expect(cache.clearAsync()).rejects.toThrow();
    expect(cache.getMetaCached(key())).not.toBeNull();
    state.failure = "";
    expect(await cache.clearAsync()).toBe(1);
  });

  it("async scan stats unreadable files and conservatively blocks writes if size is unknown", async () => {
    new TopicFileCache().set(key(), "old", meta(key()));
    const cache = new TopicFileCache();
    state.forbidSyncReads = true;
    state.failure = "readFile";
    await cache.getAllMetaAsync();
    expect(state.calls).toContain("stat");
    state.statFailure = true;
    await cache.cleanupAsync();
    state.failure = "";
    expect(await cache.setAsync(key("/t/2"), "x", meta(key("/t/2")))).toBe(false);
    state.statFailure = false;
    await cache.cleanupAsync();
    const write = cache.setAsync(key("/t/2"), "x", meta(key("/t/2")));
    await waitForWrites(1);
    completeWrite(0);
    expect(await write).toBe(true);
  });
});

describe("filesystem failures and isolation", () => {
  it("handles unavailable FS with misses/false, an empty clear no-op, and retries when available", async () => {
    state.unavailable = true;
    const cache = new TopicFileCache();
    expect(cache.get(key())).toBeNull();
    expect(cache.getMeta(key())).toBeNull();
    expect(cache.getAllMeta()).toEqual([]);
    expect(cache.set(key(), "x", meta(key()))).toBe(false);
    expect(await cache.setAsync(key(), "x", meta(key()))).toBe(false);
    expect(cache.remove(key())).toBe(false);
    expect(cache.clear()).toBe(0);
    expect(() => cache.cleanup()).not.toThrow();
    state.unavailable = false;
    expect(cache.set(key(), "recovered", meta(key()))).toBe(true);
  });

  it("waits for a valid USER_DATA_PATH instead of touching an undefined directory", () => {
    const cache = new TopicFileCache();
    state.root = "";
    expect(cache.set(key(), "x", meta(key()))).toBe(false);
    expect(state.directories.size).toBe(0);
    state.root = "/sandbox";
    expect(cache.set(key(), "x", meta(key()))).toBe(true);
  });

  it("preserves old files on rename failure without unlinking the destination first", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "old", meta(key()));
    const path = publishedPath();
    const old = state.files.get(path);
    state.failure = "renameSync";
    expect(cache.set(key(), "new sync", meta(key()))).toBe(false);
    const pending = cache.setAsync(key(), "new async", meta(key()));
    await waitForWrites(1);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(state.files.get(path)).toBe(old);
    expect(cache.get(key())?.payload).toBe("old");
    expect(state.files.size).toBe(1);
  });

  it("async quota failure resolves false and frees the temporary reservation", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "x", meta(key()));
    await waitForWrites(1);
    completeWrite(0, false);
    expect(await pending).toBe(false);
    expect(cache.hasPending(key())).toBe(false);
    expect(cache.set(key(), "next", meta(key()))).toBe(true);
  });

  it("delete failure returns false, retains metadata, and clear throws instead of false success", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "x", meta(key()));
    state.failure = "unlinkSync";
    expect(cache.remove(key())).toBe(false);
    expect(cache.getMeta(key())).not.toBeNull();
    expect(() => cache.clear(topic)).toThrow();
    expect(cache.getAllMeta().length).toBe(1);
    expect(() => cache.cleanup()).not.toThrow();
    state.failure = "";
    expect(cache.clear(topic)).toBe(1);
  });

  it("clear failure still invalidates all pending writes before reporting the error", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "x", meta(key()));
    const pending = cache.setAsync(key("/t/2"), "pending", meta(key("/t/2")));
    await waitForWrites(1);
    state.failure = "unlinkSync";
    expect(() => cache.clear()).toThrow();
    state.failure = "";
    await waitForWrites(1);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(cache.get(key("/t/2"))).toBeNull();
  });

  it("clear deletes only the selected category and only within its own directory", () => {
    const cache = new TopicFileCache();
    const reply = key("/search/reply/1");
    cache.set(key(), "topic", meta(key()));
    cache.set(reply, "reply", meta(reply, { category: other }));
    state.files.set("/sandbox/account-data", "private");
    expect(cache.clear(topic)).toBe(1);
    expect(cache.get(reply)?.payload).toBe("reply");
    expect(cache.clear()).toBe(1);
    expect(state.files.get("/sandbox/account-data")).toBe("private");
  });

  it("manual clear detects directory errors and newly arrived garbage without false success", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "x", meta(key()));
    state.files.set(`${root}/new-garbage.tmp`, "garbage");
    state.failure = "unlinkSync";
    expect(() => cache.clear()).toThrow();
    state.failure = "readdirSync";
    expect(() => cache.clear()).toThrow();
    // A clear can partially succeed before reporting the directory error.
    expect(cache.getAllMeta()).toEqual([]);
    state.failure = "";
    expect(cache.clear()).toBe(0);
    expect(state.files.size).toBe(0);
  });

  it("read failures are misses and failed garbage deletion never throws during cleanup", () => {
    const cache = new TopicFileCache();
    cache.set(key(), "x", meta(key()));
    state.failure = "readFileSync";
    expect(cache.get(key())).toBeNull();
    expect(() => cache.cleanup()).not.toThrow();
    state.failure = "";
    state.files.set(`${root}/garbage.tmp`, "garbage");
    state.failure = "unlinkSync";
    expect(() => cache.cleanup()).not.toThrow();
    expect(state.files.has(`${root}/garbage.tmp`)).toBe(true);
    expect(console.warn).toHaveBeenCalled();
  });
});
