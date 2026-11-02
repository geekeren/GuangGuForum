import { describe, expect, it, vi } from "vitest";
import { API_CACHE_VERSIONS, createApiCacheEntry, readApiCacheEntry } from "../../../packages/guanggu-forum-api/src/cacheVersions";
import { mergeTopicIndex } from "../topicIndex";
import { TOPIC_INDEX_MAX_BYTES, TOPIC_INDEX_MAX_ENTRIES, utf8Size } from "../cachePolicy";

vi.mock("guanggu-forum-api", async () => await import("../../../packages/guanggu-forum-api/src/cacheVersions"));
const owners = ["getRecentTopics", "getNodeTopics"] as const;
const topic = (id: number, title = `Topic ${id}`) => ({
  username: "user", category: "生活", lastUpdated: "刚刚", userLink: "/u/user", userAvatarUrl: "/avatar.png",
  title, link: `/t/${id}`, commentCount: "0", isPinned: false,
});
const envelope = (values: unknown) => createApiCacheEntry(owners, values);
const bytes = (value: unknown) => utf8Size(JSON.stringify(value));

// Byte limits cover the JSON envelope itself, not just the list's UTF-16 length.
describe("bounded topic index", () => {
  it("deduplicates by link and replaces/moves fresh summaries to the newest end without mutating inputs", () => {
    const previous = envelope([topic(1), topic(2), topic(3)]);
    const fresh = [topic(1, "updated"), topic(4), topic(4, "newest")];
    const result = mergeTopicIndex(previous, fresh)!;
    expect(result.data.map(value => value.link)).toEqual(["/t/2", "/t/3", "/t/1", "/t/4"]);
    expect(result.data.map(value => value.title)).toEqual(["Topic 2", "Topic 3", "updated", "newest"]);
    expect(previous!.data).toEqual([topic(1), topic(2), topic(3)]);
    expect(fresh).toEqual([topic(1, "updated"), topic(4), topic(4, "newest")]);
  });

  it("caps entry count and evicts oldest existing and fresh entries", () => {
    const result = mergeTopicIndex(envelope(Array.from({ length: 800 }, (_, i) => topic(i))), Array.from({ length: 600 }, (_, i) => topic(i + 800)))!;
    expect(result.data).toHaveLength(TOPIC_INDEX_MAX_ENTRIES);
    expect(result.data[0].link).toBe("/t/400");
    expect(result.data.at(-1)!.link).toBe("/t/1399");
    expect(bytes(result)).toBeLessThanOrEqual(TOPIC_INDEX_MAX_BYTES);
  });

  it("uses UTF-8 serialized bytes including versions, brackets and commas at the exact byte boundary", () => {
    const base = mergeTopicIndex(null, [topic(1, "")])!;
    const title = "x".repeat(TOPIC_INDEX_MAX_BYTES - bytes(base));
    const boundary = mergeTopicIndex(null, [topic(1, title)])!;
    expect(bytes(boundary)).toBe(TOPIC_INDEX_MAX_BYTES);
    expect(boundary.data).toHaveLength(1);
    expect(mergeTopicIndex(boundary, [topic(2)] )!.data).toEqual([topic(2)]);
    expect(mergeTopicIndex(envelope([topic(2)]), [topic(1, title + "x")])!.data).toEqual([topic(2)]);
  });

  it("evicts oldest entries for multibyte Chinese/emoji summaries below the count cap", () => {
    const values = Array.from({ length: 120 }, (_, i) => topic(i, "汉字😀".repeat(600)));
    const result = mergeTopicIndex(null, values)!;
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.length).toBeLessThan(values.length);
    expect(bytes(result)).toBeLessThanOrEqual(TOPIC_INDEX_MAX_BYTES);
    expect(bytes(envelope([values[values.length - result.data.length - 1], ...result.data]))).toBeGreaterThan(TOPIC_INDEX_MAX_BYTES);
    expect(result.data).toEqual(values.slice(-result.data.length));
  });

  it("skips oversized new or replacement summaries without wiping useful data", () => {
    const previous = envelope([topic(1), topic(2)]);
    const huge = topic(1, "😀".repeat(TOPIC_INDEX_MAX_BYTES));
    expect(mergeTopicIndex(previous, [huge, topic(3), { ...huge, link: "/t/4" }])!.data).toEqual([topic(1), topic(2), topic(3)]);
  });

  it("rejects bad individual fields safely while preserving valid neighbors", () => {
    const throwing = Object.defineProperty(topic(9), "title", { get() { throw new Error("bad getter"); } });
    const cyclic = { ...topic(8), extra: null as any }; cyclic.extra = cyclic;
    const result = mergeTopicIndex(envelope([null, topic(1), 7, { ...topic(2), title: {} }, topic(3)]),
      [throwing, { ...topic(4), commentCount: 1 }, { ...topic(5), isPinned: "yes" }, { ...topic(6), link: " " }, cyclic, topic(7)])!;
    expect(result.data).toEqual([topic(1), topic(3), topic(8), topic(7)]);
  });

  it("treats legacy, incompatible and malformed envelopes as misses but preserves fresh summaries", () => {
    const broken = Object.defineProperty(envelope([])!, "data", { get() { throw new Error("corrupt envelope"); } });
    for (const previous of [[topic(1)], { data: [topic(1)] }, envelope({ not: "array" }), broken, { apiVersions: { getRecentTopics: 999, getNodeTopics: 1 }, data: [topic(1)] }]) {
      const result = mergeTopicIndex(previous, [topic(2)])!;
      expect(result.data).toEqual([topic(2)]);
      expect(readApiCacheEntry(owners, result)).toEqual([topic(2)]);
      expect(result.apiVersions).toEqual({ getRecentTopics: API_CACHE_VERSIONS.getRecentTopics, getNodeTopics: API_CACHE_VERSIONS.getNodeTopics });
    }
  });

  it("invalidates either owner's version independently", () => {
    for (const owner of owners) {
      const previous = envelope([topic(1)])!;
      const version = API_CACHE_VERSIONS[owner];
      try {
        API_CACHE_VERSIONS[owner] += 1;
        expect(mergeTopicIndex(previous, [topic(2)])!.data).toEqual([topic(2)]);
      } finally { API_CACHE_VERSIONS[owner] = version; }
    }
  });

  it("stays stable and within both budgets across repeated merges", () => {
    let current = mergeTopicIndex(null, [])!;
    for (let batch = 0; batch < 30; batch++) {
      const fresh = Array.from({ length: 80 }, (_, i) => topic((batch * 60 + i) % 1500, "汉😀".repeat(15)));
      current = mergeTopicIndex(current, fresh)!;
      expect(current.data.length).toBeLessThanOrEqual(TOPIC_INDEX_MAX_ENTRIES);
      expect(bytes(current)).toBeLessThanOrEqual(TOPIC_INDEX_MAX_BYTES);
      expect(new Set(current.data.map(value => value.link)).size).toBe(current.data.length);
      const again = mergeTopicIndex(current, fresh)!;
      expect(again).toEqual(current);
    }
  });
});
