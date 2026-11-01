import { afterEach, describe, expect, it, vi } from "vitest";
import { getHotTopicMetadata } from "guanggu-forum-api";
import { getHotTopicPage, loadDiscoveryTopicMetadata, startHotTopicRotation } from "../discoveryTopics";

vi.mock("guanggu-forum-api", () => ({ getHotTopicMetadata: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const topics = Array.from({ length: 10 }, (_, index) => ({ title: `真实标题 ${index + 1}`, topicLink: `/t/${index + 1}`, username: "example", userLink: "/u/example", userAvatarUrl: "" }));

describe("five-post discovery carousel", () => {
  it("starts with ranks 1-5, then 6-10, and loops back with original links", () => {
    expect(getHotTopicPage(topics, 0).map(item => item.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(getHotTopicPage(topics, 1).map(item => item.rank)).toEqual([6, 7, 8, 9, 10]);
    expect(getHotTopicPage(topics, 2)).toEqual(getHotTopicPage(topics, 0));
    expect(getHotTopicPage(topics, 1)[0].topic).toBe(topics[5]);
  });
  it("keeps a partial final group and handles empty and single-group lists", () => {
    expect(getHotTopicPage(topics.slice(0, 7), 1).map(item => item.rank)).toEqual([6, 7]);
    expect(getHotTopicPage([], 0)).toEqual([]);
    expect(getHotTopicPage(topics.slice(0, 3), 10)).toHaveLength(3);
  });
  it("advances precisely at five seconds and cancels on hide or unmount", () => {
    vi.useFakeTimers();
    const advance = vi.fn();
    const stop = startHotTopicRotation(advance, 10, true);
    vi.advanceTimersByTime(4999);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(advance).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(advance).toHaveBeenCalledTimes(2);
    stop();
    startHotTopicRotation(advance, 10, false);
    startHotTopicRotation(advance, 5, true);
    vi.advanceTimersByTime(10000);
    expect(advance).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("fades out sequentially before the five-second swap and cancels pending fade work", () => {
    vi.useFakeTimers();
    const advance = vi.fn(), fade = vi.fn();
    const stop = startHotTopicRotation(advance, 10, true, fade);
    vi.advanceTimersByTime(4579);
    expect(fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fade).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
    vi.advanceTimersByTime(420);
    expect(advance).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(10000);
    expect(fade).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("enriches only missing metadata using at most two requests at a time", async () => {
    let finish!: (value: { category: string; commentCount: string }) => void;
    vi.mocked(getHotTopicMetadata).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const update = vi.fn();
    const stop = loadDiscoveryTopicMetadata([{ ...topics[0], category: "生活", commentCount: "0" }, ...topics.slice(1, 4)], update);
    expect(getHotTopicMetadata).toHaveBeenCalledTimes(2);
    stop();
    finish({ category: "楼市房产", commentCount: "28" });
    await Promise.resolve();
    expect(update).not.toHaveBeenCalled();
    expect(getHotTopicMetadata).toHaveBeenCalledTimes(2);
  });
});
