import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { getHotTopics, getHotTopicCategory } from "guanggu-forum-api";
import { getSearchHotTopics, getSearchPlaceholderTitles, normalizeHotTitles, normalizePlaceholderTopics, loadHotTopicCategories, startPlaceholderRotation, PLACEHOLDER_INTERVAL } from "../searchPlaceholder";

vi.mock("guanggu-forum-api", () => ({ getHotTopics: vi.fn(), getHotTopicCategory: vi.fn() }));

const topic = { title: " 示例热议 ", topicLink: "/t/123", username: "example", userLink: "/u/example", userAvatarUrl: "" };

let clock = new Date("2026-10-31T00:00:00Z").getTime();
beforeEach(() => {
  vi.useFakeTimers();
  clock += 10 * 60 * 1000;
  vi.setSystemTime(clock);
  vi.mocked(getHotTopics).mockClear();
  vi.mocked(getHotTopicCategory).mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe("search recommendations", () => {
  it("normalizes real titles, removes duplicates and limits rotation", () => {
    expect(normalizeHotTitles([{ title: " A\n B " }, { title: "A B" }, { title: " " }])).toEqual(["A B"]);
    expect(normalizeHotTitles(Array.from({ length: 10 }, (_, i) => ({ title: String(i) })))).toHaveLength(6);
  });
  it("keeps the displayed title paired with its original topic link", () => {
    const normalized = normalizePlaceholderTopics([topic, { ...topic, topicLink: "/t/456" }, { ...topic, title: "另一条热议", topicLink: "/t/789" }]);
    expect(normalized.map((item) => [item.title, item.topicLink])).toEqual([["示例热议", "/t/123"], ["另一条热议", "/t/789"]]);
  });
  it("shares one request between the hot list and placeholders, excluding invalid links", async () => {
    vi.mocked(getHotTopics).mockResolvedValueOnce([topic, { ...topic, topicLink: "https://example.com/" }]);
    const [list, titles] = await Promise.all([getSearchHotTopics(), getSearchPlaceholderTitles()]);
    expect(list).toEqual([topic]);
    expect(titles).toEqual(["示例热议"]);
    await getSearchHotTopics();
    expect(getHotTopics).toHaveBeenCalledTimes(1);
  });
  it("refreshes expired data and allows retry after failure", async () => {
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    vi.mocked(getHotTopics).mockRejectedValueOnce(new Error("offline"));
    await expect(getSearchHotTopics()).rejects.toThrow("offline");
    vi.mocked(getHotTopics).mockResolvedValueOnce([]);
    expect(await getSearchPlaceholderTitles()).toEqual([]);
  });
  it("limits board lookups to two workers and cancels updates after unmount", async () => {
    let finish!: (category: string) => void;
    vi.mocked(getHotTopicCategory).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const update = vi.fn();
    const stop = loadHotTopicCategories([topic, { ...topic, topicLink: "/t/456" }, { ...topic, topicLink: "/t/789" }], update);
    expect(getHotTopicCategory).toHaveBeenCalledTimes(2);
    stop();
    finish("楼市房产");
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    expect(getHotTopicCategory).toHaveBeenCalledTimes(2);
  });
  it("rotates every four seconds and cleans up when paused or unmounted", () => {
    const advance = vi.fn();
    const stop = startPlaceholderRotation(advance, 3, true);
    vi.advanceTimersByTime(PLACEHOLDER_INTERVAL * 2);
    expect(advance).toHaveBeenCalledTimes(2);
    stop();
    startPlaceholderRotation(advance, 3, false);
    startPlaceholderRotation(advance, 1, true);
    vi.advanceTimersByTime(PLACEHOLDER_INTERVAL * 2);
    expect(advance).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
