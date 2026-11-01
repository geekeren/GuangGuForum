import { describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { LoginRequiredError, request } from "../../../packages/guanggu-forum-api/src/client";
import { getHotTopics, getHotTopicMetadata, getHotTopicCategory, getDiscoveryData } from "../../../packages/guanggu-forum-api/src/discovery";

vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ request: vi.fn(), LoginRequiredError: class extends Error {} }));

describe("real discovery metadata", () => {
  it("keeps public sections available when interest requires login", async () => {
    vi.mocked(request).mockImplementation(async (_, options) => {
      if (options?.query?.tab === "interest") throw new LoginRequiredError();
      return { body: parse('<div class="hot-topics"><div class="cell"><span class="hot_topic_title"><a href="/t/1">真实热门</a></span></div></div>'), rawRes: {} };
    });
    const result = await getDiscoveryData();
    expect(result.hotTopics).toHaveLength(1);
    expect(result.interestTopics).toEqual([]);
    expect(result.interestLoginRequired).toBe(true);
    vi.mocked(request).mockReset();
  });
  it("joins hot posts to real list category and count without changing rank", async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(`<div class="hot-topics">
      <div class="cell"><a href="/u/example"></a><span class="hot_topic_title"><a href="/t/1">热帖一</a></span></div>
      <div class="cell"><a href="/u/example"></a><span class="hot_topic_title"><a href="/t/2">热帖二</a></span></div>
    </div><div class="topics"><div class="topic-item"><div class="main"><div class="title"><a href="/t/2">热帖二</a></div><div class="meta"><span class="node"><a>楼市房产</a></span></div></div><span class="count">36</span></div></div>`), rawRes: {} });
    const topics = await getHotTopics();
    expect(topics.map(topic => topic.topicLink)).toEqual(["/t/1", "/t/2"]);
    expect(topics[1]).toMatchObject({ category: "楼市房产", commentCount: "36" });
    expect(topics[0].commentCount).toBeUndefined();
  });
  it("extracts category and total replies from detail, not fabricated counts", async () => {
    const body = parse('<div class="topic-detail"><div class="meta"><span class="node"><a>生活</a></span></div></div><div class="topic-reply"><div class="ui-header">共收到 1,234 条回复 · 最新回复</div></div>');
    vi.mocked(request).mockResolvedValueOnce({ body, rawRes: {} });
    expect(await getHotTopicMetadata("/t/42")).toEqual({ category: "生活", commentCount: "1,234" });
    vi.mocked(request).mockResolvedValueOnce({ body, rawRes: {} });
    expect(await getHotTopicCategory("/t/42")).toBe("生活");
  });
  it("keeps missing counts absent and rejects invalid links or missing category", async () => {
    await expect(getHotTopicMetadata("https://example.com/42")).rejects.toThrow();
    vi.mocked(request).mockResolvedValueOnce({ body: parse('<div class="topic-detail"><div class="meta"><span class="node">生活</span></div></div>'), rawRes: {} });
    expect(await getHotTopicMetadata("/t/1")).toEqual({ category: "生活", commentCount: undefined });
    vi.mocked(request).mockResolvedValueOnce({ body: parse("<div></div>"), rawRes: {} });
    await expect(getHotTopicMetadata("/t/1")).rejects.toThrow();
  });
});
