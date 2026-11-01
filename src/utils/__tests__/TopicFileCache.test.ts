import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CacheCategory, CacheMeta } from "../CacheService";
import TopicFileCache, { isTopicFileKey, utf8ByteLength } from "../TopicFileCache";

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
  if (state.failure === operation) throw failure("EIO");
}

vi.mock("@tarojs/taro", () => ({
  default: {
    env: { get USER_DATA_PATH() { return state.root; } },
    getFileSystemManager: () => {
      check("getFileSystemManager");
      if (state.unavailable) throw failure("UNAVAILABLE");
      return {
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

const root = "/sandbox/guozaoke-topic-cache-v1";
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
  state.root = "/sandbox";
  state.unavailable = false;
  state.failure = "";
  state.statFailure = false;
  state.calls = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isTopicFileKey", () => {
  it("matches forum reading HTML with intact environment, underscored account and query scope", () => {
    for (const path of ["/t/1", "/t/1?p=2", "/t/1?tab=hot", "/search/reply/9?foo=x"]) {
      expect(isTopicFileKey(key(path, "account_with_underscores", "release"))).toBe(true);
    }
  });

  it("keeps every index in storage and excludes private/business/nonforum routes", () => {
    for (const candidate of [
      "topic_index", "__cache_index__", key("/"), key("/?tab=hot"), key("/node/house"),
      "draft_topic_1", "html_https://www.guozaoke.com/t/1",
      "html_v2__guest_https://www.guozaoke.com/t/1", "html_v2_develop__https://www.guozaoke.com/t/1",
      key("/u/somebody"), key("/notifications"), key("/login"), key("/search?q=/t/1"),
      key("/u/foo?redirect=/node/house"), key("/node/"), key("/t/"), key("/search/reply/"),
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
    const b = cache.setAsync(key(), "x", meta(key()));
    expect(await cache.setAsync(key(), "x", meta(key()))).toBe(false);
    completeWrite(0); completeWrite(1);
    expect(await a).toBe(false);
    expect(await b).toBe(false); // The newest attempted write invalidates both old writes.
    expect(state.files.size).toBe(0);
  });

  it("reserves entry slots for unpublished writes", async () => {
    const cache = new TopicFileCache(1);
    const a = cache.setAsync(key(), "a", meta(key()));
    expect(await cache.setAsync(key("/t/2"), "b", meta(key("/t/2")))).toBe(false);
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
    const second = cache.setAsync(key(), "second", meta(key()));
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
    expect(cache.set(key(), "new sync", meta(key()))).toBe(true);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(cache.get(key())?.payload).toBe("new sync");
  });

  it("remove invalidates even an unpublished write and cannot resurrect the key", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "old", meta(key()));
    expect(cache.remove(key())).toBe(true);
    expect(cache.hasPending(key())).toBe(false);
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(cache.get(key())).toBeNull();
    expect(state.files.size).toBe(0);
  });

  it("a post-remove new write can publish while the pre-remove write is rejected", async () => {
    const cache = new TopicFileCache();
    const old = cache.setAsync(key(), "old", meta(key()));
    cache.remove(key());
    const next = cache.setAsync(key(), "next", meta(key()));
    completeWrite(1); completeWrite(0);
    expect(await old).toBe(false);
    expect(await next).toBe(true);
    expect(cache.get(key())?.payload).toBe("next");
  });

  it("global clear invalidates pending-only writes and counts only published deletions", async () => {
    const cache = new TopicFileCache();
    cache.set(key(), "published", meta(key()));
    const pending = cache.setAsync(key("/t/2"), "pending", meta(key("/t/2")));
    expect(cache.clear()).toBe(1);
    const after = cache.setAsync(key("/t/3"), "after clear", meta(key("/t/3")));
    completeWrite(0); completeWrite(1);
    expect(await pending).toBe(false);
    expect(await after).toBe(true);
    expect(cache.getAllMeta().map((m) => m.key)).toEqual([key("/t/3")]);
  });

  it("category clear cancels its pending writes but preserves other categories", async () => {
    const cache = new TopicFileCache();
    const topicWrite = cache.setAsync(key(), "topic", meta(key()));
    // Category handling is independent of route selection; use a whitelisted detail key.
    const nodeKey = key("/t/2");
    const nodeWrite = cache.setAsync(nodeKey, "node", meta(nodeKey, { category: node }));
    expect(cache.clear(topic)).toBe(0);
    completeWrite(1); completeWrite(0);
    expect(await topicWrite).toBe(false);
    expect(await nodeWrite).toBe(true);
    expect(cache.get(nodeKey)?.payload).toBe("node");
  });

  it("cleanup and another instance's recovery do not delete active temporary files", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "active", meta(key()));
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
    state.failure = "writeFileSync";
    expect(cache.set(key(), "failed new", meta(key()))).toBe(false);
    state.failure = "";
    completeWrite(0);
    expect(await old).toBe(false);
    expect(cache.get(key())).toBeNull();
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
    completeWrite(0);
    expect(await pending).toBe(false);
    expect(state.files.get(path)).toBe(old);
    expect(cache.get(key())?.payload).toBe("old");
    expect(state.files.size).toBe(1);
  });

  it("async quota failure resolves false and frees the temporary reservation", async () => {
    const cache = new TopicFileCache();
    const pending = cache.setAsync(key(), "x", meta(key()));
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
    state.failure = "unlinkSync";
    expect(() => cache.clear()).toThrow();
    state.failure = "";
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
