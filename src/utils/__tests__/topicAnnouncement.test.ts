import { describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { request } from "../../../packages/guanggu-forum-api/src/client";
import { getRecentTopics, parseTopicSummaries, TopicSummary } from "../../../packages/guanggu-forum-api/src/getRecentTopics";
import { getNodeTopics } from "../../../packages/guanggu-forum-api/src/node/getTopics";
import { splitTopicAnnouncement } from "../topicAnnouncement";

vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ request: vi.fn() }));

const topic = (id: number, category = "生活", isPinned?: boolean): TopicSummary => ({
  title: `帖子 ${id}`, link: `/t/${id}`, category, isPinned,
  username: "example", userLink: "/u/example", userAvatarUrl: "/avatar.png",
  lastUpdated: "刚刚", commentCount: "2",
});
const fixture = `<div class="topics">
  <div class="topic-item"><div class="main"><div class="title"><i class="icon-pushpin" title="置顶"></i><a href="/t/1">真实置顶标题</a></div><div class="meta"><span class="node"><a>生活</a></span></div></div></div>
  <div class="topic-item"><div class="main"><div class="title"><a href="/t/2">普通帖子讨论置顶功能</a></div><div class="meta"><span class="node"><a>生活</a></span></div></div></div>
  <div class="topic-item"><div class="main"><div class="title"><a href="/t/3">社区公告</a></div><div class="meta"><span class="node"><a>公告</a></span></div></div></div>
</div>`;

describe("topic announcement selection", () => {
  it("does not invent a banner for empty or ordinary lists", () => {
    expect(splitTopicAnnouncement([])).toEqual({ announcement: undefined, topics: [] });
    const topics = [topic(1), { ...topic(2), title: "公告和置顶功能讨论" }];
    const result = splitTopicAnnouncement(topics);
    expect(result.announcement).toBeUndefined();
    expect(result.topics).toBe(topics);
  });

  it("selects the first announcement or pinned post in the original order", () => {
    for (const topics of [
      [topic(1), topic(2, "生活", true), topic(3, "公告")],
      [topic(1), topic(2, "公告"), topic(3, "生活", true)],
    ]) {
      const before = topics.slice();
      const result = splitTopicAnnouncement(topics);
      expect(result.announcement).toBe(topics[1]);
      expect(result.topics).toEqual([topics[0], topics[2]]);
      expect(topics).toEqual(before);
      expect(result.topics).not.toContain(result.announcement);
    }
  });

  it("handles a list containing only the selected post", () => {
    const pinned = topic(1, "生活", true);
    expect(splitTopicAnnouncement([pinned])).toEqual({ announcement: pinned, topics: [] });
  });

  it("recomputes selection for each refreshed list rather than carrying another tab's announcement", () => {
    expect(splitTopicAnnouncement([topic(1, "公告")]).announcement?.link).toBe("/t/1");
    expect(splitTopicAnnouncement([topic(2)]).announcement).toBeUndefined();
    expect(splitTopicAnnouncement([topic(3, "生活", true)]).announcement?.link).toBe("/t/3");
  });
});

describe("real list pinned metadata", () => {
  it("reads the upstream pushpin marker without matching title keywords", () => {
    const topics = parseTopicSummaries(parse(fixture));
    expect(topics.map(item => item.isPinned)).toEqual([true, false, false]);
    expect(topics[0]).toMatchObject({ title: "真实置顶标题", link: "/t/1", category: "生活" });
    expect(splitTopicAnnouncement(topics).announcement).toBe(topics[0]);
    expect(parseTopicSummaries(undefined)).toEqual([]);
  });

  it("uses the same pin parser for home and board responses and cache refresh callbacks", async () => {
    for (const load of [
      (onRefresh: any) => getRecentTopics({ type: "default", page: 1 }, { onRefresh }),
      (onRefresh: any) => getNodeTopics({ node: "house", page: 1 }, { onRefresh }),
    ]) {
      const onRefresh = vi.fn();
      vi.mocked(request).mockResolvedValueOnce({ body: parse(fixture), rawRes: { statusCode: 200 } });
      expect((await load(onRefresh))[0].isPinned).toBe(true);
      const options = vi.mocked(request).mock.calls.at(-1)![1]!;
      options.onRefresh!(parse(fixture));
      expect(onRefresh.mock.calls[0][0][0].isPinned).toBe(true);
    }
  });
});
