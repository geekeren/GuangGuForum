import { describe, expect, it, vi } from "vitest";
import { parse } from "node-html-parser";
import { getTopicDetail } from "../../../packages/guanggu-forum-api/src/getTopicDetail";
import { request } from "../../../packages/guanggu-forum-api/src/client";

vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ request: vi.fn() }));

const fixture = `<div class="container"><div class="row">
  <div class="topic-detail"><div class="main"><h3 class="title">主题</h3></div></div>
  <div class="topic-reply"><div class="ui-header">2 回复 | 2024-10-15 最后回复</div>
    <div class="reply-item" id="r456"><div class="meta"><span class="floor">#4</span><span class="time">2024-10-15 11:55</span>
      <span class="reply-to"><a class="J_replyVote" href="/replyVote?reply_id=456">3 赞</a></span></div><div class="content">第一条</div></div>
    <div class="reply-item" id="r789"><div class="meta"><span class="floor">#5</span><span class="time">2024-10-15 12:00</span></div><div class="content">第二条</div></div>
  </div>
</div></div>`;

function result() { return { body: parse(fixture), rawRes: { statusCode: 200 } }; }

describe("topic detail precise reply data", () => {
  it("parses each actual reply id without losing individual timestamps or heading data", async () => {
    vi.mocked(request).mockResolvedValueOnce(result());
    const detail = await getTopicDetail({ tid: "123", page: "2" });
    expect(request).toHaveBeenLastCalledWith("/t/123", expect.objectContaining({ query: { p: "2" } }));
    expect(detail.comments.map(({ id, floor, replyMetas }) => ({ id, floor, replyMetas }))).toEqual([
      { id: "r456", floor: "#4", replyMetas: ["2024-10-15 11:55"] },
      { id: "r789", floor: "#5", replyMetas: ["2024-10-15 12:00"] },
    ]);
    expect(detail.commentTotalCount).toBe("2 回复 | 2024-10-15 最后回复");
    expect(detail.comments.map((comment) => comment.content)).toEqual([
      '<div class="content">第一条</div>',
      '<div class="content">第二条</div>',
    ]);
  });
  it.each([
    '<a href="/u/MixedCaseLv9">MixedCaseLv9</a><span>Lv. 12</span>',
    '<a href="/u/MixedCaseLv9">MixedCaseLv9</a><a href="/level">Lv. 12</a>',
    '<a href="/u/MixedCaseLv9">MixedCaseLv9</a> Lv. 12',
  ])("separates account anchors from actual level sibling nodes %s", async (authorMarkup) => {
    const html = fixture
      .replace('<h3 class="title">主题</h3>', `<h3 class="title">主题</h3><div class="meta"><span class="username">${authorMarkup}</span></div>`)
      .replace('<span class="floor">#4</span>', '<span class="reply-username"><span class="username"><a href="/u/ReplyUser">ReplyUser</a><span>Lv3</span></span></span><span class="floor">#4</span>');
    vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { statusCode: 200 } });
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail).toMatchObject({ author: "MixedCaseLv9", authorLevel: "Lv. 12" });
    expect(detail.comments[0]).toMatchObject({ author: "ReplyUser", authorLevel: "Lv3" });
    expect(detail.comments[1].authorLevel).toBeUndefined();
  });

  it.each([
    ["PlainLv12", "PlainLv12"],
    ['<a href="/u/Lv12">Lv12</a>', "Lv12"],
    ['<a href="/u/Account">Account</a><span>last seen Lv12</span>', "Account"],
    ['<span>PlainLv12</span><span>Lv3</span>', "PlainLv12Lv3"],
  ])("preserves usernames and legacy fallback without fabricating a level %s", async (markup, expected) => {
    const html = fixture.replace('<h3 class="title">主题</h3>', `<h3 class="title">主题</h3><div class="meta"><span class="username">${markup}</span></div>`);
    vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { statusCode: 200 } });
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail.author).toBe(expected);
    expect(detail.authorLevel).toBeUndefined();
  });

  it("applies the same level extraction to refreshed cached detail", async () => {
    const body = parse(fixture.replace('<h3 class="title">主题</h3>', '<h3 class="title">主题</h3><div class="meta"><span class="username"><a href="/u/Account">Account</a><span>Lv2</span></span></div>'));
    vi.mocked(request).mockResolvedValueOnce({ body, rawRes: { statusCode: 200 } });
    const refreshed = vi.fn();
    await getTopicDetail({ tid: "123" }, { onRefresh: refreshed });
    vi.mocked(request).mock.calls.at(-1)![1]!.onRefresh!(body);
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ author: "Account", authorLevel: "Lv2" }));
  });

  it("loads a precise reply through the existing upstream resolver independent of page", async () => {
    vi.mocked(request).mockResolvedValueOnce(result());
    await getTopicDetail({ tid: "123", page: "2", replyId: "789" });
    expect(request).toHaveBeenLastCalledWith("/search/reply/789", expect.objectContaining({ query: {} }));
  });
  it("does not interpolate a malformed reply route", async () => {
    vi.mocked(request).mockResolvedValueOnce(result());
    await getTopicDetail({ tid: "123", replyId: "789/evil" });
    expect(request).toHaveBeenLastCalledWith("/t/123", expect.anything());
  });
});
