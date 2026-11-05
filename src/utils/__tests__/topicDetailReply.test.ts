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

function result(html = fixture) { return { body: parse(html), rawRes: { statusCode: 200 } }; }

const legacyAuthor = '<a href="/u/letiankaimen" class="reply-username gzk-legacy-id"><span class="username">letiankaimen</span></a>';
const displayAuthor = (extra = "") =>
  `<a class="gzk-display-name " href="/u/62936" data-gzk-mention-user="62936" data-username="letiankaimen" data-display-name="乐天鱼" data-avatar="/static/avatar/36/foo.png"${extra}><bdi>乐天鱼</bdi></a>`;

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
  it('loads the latest reply page uncached instead of an old page or reply resolver', async () => {
    const pagination = `<ul class="pagination">
      <li><a href="/t/123?p=2">2</a></li><li><a href="?p=4">末页</a></li>
      <li><a href="https://www.guozaoke.com/t/123?p=3">3</a></li>
      <li><a href="/t/999?p=100">别的帖子</a></li><li><a href="https://example.com/t/123?p=99">外链</a></li>
      <li><a href="/t/123?p=oops">无效页码</a></li>
    </ul>`;
    vi.mocked(request).mockResolvedValueOnce(result(fixture + pagination));
    vi.mocked(request).mockResolvedValueOnce(result(fixture.replace('id="r789"', 'id="r999"')));
    const start = vi.mocked(request).mock.calls.length;
    const detail = await getTopicDetail({ tid: '123', page: '2', replyId: '456', latest: true });
    expect(vi.mocked(request).mock.calls.slice(start)).toEqual([
      ['/t/123', { cache: false, cacheApi: 'getTopicDetail', query: {} }],
      ['/t/123', { cache: false, cacheApi: 'getTopicDetail', query: { p: '4' } }],
    ]);
    expect(detail.comments[1].id).toBe('r999');
  });
  it('uses a single fresh request for topics without reply pagination', async () => {
    vi.mocked(request).mockResolvedValueOnce(result());
    const start = vi.mocked(request).mock.calls.length;
    const detail = await getTopicDetail({ tid: '123', latest: true });
    expect(vi.mocked(request).mock.calls.slice(start)).toEqual([
      ['/t/123', { cache: false, cacheApi: 'getTopicDetail', query: {} }],
    ]);
    expect(detail.comments.at(-1)?.id).toBe('r789');
  });
  it('rejects an unrelated response when locating the latest replies', async () => {
    vi.mocked(request).mockResolvedValueOnce(result('<div>unavailable</div>'));
    await expect(getTopicDetail({ tid: '123', latest: true })).rejects.toThrow();
  });
  it("does not interpolate a malformed reply route", async () => {
    vi.mocked(request).mockResolvedValueOnce(result());
    await getTopicDetail({ tid: "123", replyId: "789/evil" });
    expect(request).toHaveBeenLastCalledWith("/t/123", expect.anything());
  });
});

describe("display-name authors", () => {
  it("keeps legacy-only author markup unchanged", async () => {
    const html = fixture.replace(
      '<span class="floor">#4</span>',
      `${legacyAuthor}<span class="floor">#4</span>`,
    ).replace(
      '<h3 class="title">主题</h3>',
      `<h3 class="title">主题</h3><div class="meta">${legacyAuthor}<span>Lv. 12</span></div>`,
    );
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail).toMatchObject({ author: "letiankaimen", authorLevel: "Lv. 12", authorUsername: "letiankaimen" });
    expect(detail.authorUserId).toBeUndefined();
    expect(detail.comments[0]).toMatchObject({ author: "letiankaimen", authorUsername: "letiankaimen" });
    expect(detail.comments[0].authorUserId).toBeUndefined();
  });

  it("uses the display nickname for a reply and exposes handle, uid, avatar and level", async () => {
    const html = fixture.replace(
      '<span class="floor">#4</span>',
      `${legacyAuthor}${displayAuthor()}<span>Lv3</span><span class="floor">#4</span>`,
    );
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail.comments[0]).toMatchObject({
      author: "乐天鱼",
      authorUsername: "letiankaimen",
      authorUserId: "62936",
      authorAvatarUrl: "/static/avatar/36/foo.png",
      authorLevel: "Lv3",
    });
  });

  it("applies display-name parsing to the topic author", async () => {
    const html = fixture.replace(
      '<h3 class="title">主题</h3>',
      `<h3 class="title">主题</h3><div class="meta">${legacyAuthor}${displayAuthor()}<span>Lv. 12</span></div>`,
    );
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail).toMatchObject({
      author: "乐天鱼",
      authorUsername: "letiankaimen",
      authorUserId: "62936",
      authorAvatarUrl: "/static/avatar/36/foo.png",
      authorLevel: "Lv. 12",
    });
  });

  it("parses a mixed reply list where only some replies use display names", async () => {
    const html = fixture
      .replace(
        '<span class="floor">#4</span>',
        `${legacyAuthor}${displayAuthor()}<span>Lv3</span><span class="floor">#4</span>`,
      )
      .replace(
        '<span class="floor">#5</span>',
        '<span class="username"><a href="/u/other_handle">other_handle</a></span><span class="floor">#5</span>',
      );
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail.comments[0]).toMatchObject({ author: "乐天鱼", authorUserId: "62936", authorLevel: "Lv3" });
    expect(detail.comments[1]).toMatchObject({ author: "other_handle", authorUsername: "other_handle" });
    expect(detail.comments[1].authorUserId).toBeUndefined();
    expect(detail.comments[1].authorLevel).toBeUndefined();
  });

  it.each([
    [
      "rendered nickname first",
      `<a class="gzk-display-name" href="/u/62936" data-gzk-mention-user="62936" data-username="letiankaimen" data-display-name="备用名"><bdi>乐天鱼</bdi></a>`,
      "乐天鱼",
    ],
    [
      "data-display-name before the legacy handle",
      `<a class="gzk-display-name" href="/u/62936" data-gzk-mention-user="62936" data-username="letiankaimen" data-display-name="备用名"><bdi>   </bdi></a>`,
      "备用名",
    ],
    [
      "legacy .username when the display name is blank",
      `<a class="gzk-display-name" href="/u/62936" data-gzk-mention-user="62936" data-username="letiankaimen"><bdi></bdi></a>`,
      "letiankaimen",
    ],
  ])("falls back for a blank display name using %s", async (_label, anchor, expected) => {
    const html = fixture
      .replace('<span class="floor">#4</span>', `${anchor}${legacyAuthor}<span class="floor">#4</span>`)
      .replace('<h3 class="title">主题</h3>', `<h3 class="title">主题</h3><div class="meta">${anchor}${legacyAuthor}</div>`);
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail.comments[0].author).toBe(expected);
    expect(detail.author).toBe(expected);
  });

  it("never derives a level from the display anchor's attributes or title", async () => {
    const anchor = `<a class="gzk-display-name" title="Lv. 12" data-level="Lv. 12" data-display-name="乐天鱼" href="/u/62936" data-gzk-mention-user="62936" data-username="letiankaimen"><bdi>乐天鱼</bdi></a>`;
    const html = fixture.replace(
      '<span class="floor">#4</span>',
      `${anchor}${legacyAuthor}<span class="floor">#4</span>`,
    );
    vi.mocked(request).mockResolvedValueOnce(result(html));
    const detail = await getTopicDetail({ tid: "123" });
    expect(detail.comments[0].authorLevel).toBeUndefined();
  });

  it("applies display-name parsing on the refreshed cached detail path", async () => {
    const body = parse(fixture.replace(
      '<h3 class="title">主题</h3>',
      `<h3 class="title">主题</h3><div class="meta">${legacyAuthor}${displayAuthor()}<span>Lv2</span></div>`,
    ));
    vi.mocked(request).mockResolvedValueOnce({ body, rawRes: { statusCode: 200 } });
    const refreshed = vi.fn();
    await getTopicDetail({ tid: "123" }, { onRefresh: refreshed });
    vi.mocked(request).mock.calls.at(-1)![1]!.onRefresh!(body);
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({
      author: "乐天鱼",
      authorUsername: "letiankaimen",
      authorUserId: "62936",
      authorAvatarUrl: "/static/avatar/36/foo.png",
      authorLevel: "Lv2",
    }));
  });
});
