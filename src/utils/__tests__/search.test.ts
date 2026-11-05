import { describe, it, expect, vi } from "vitest";
import { parse } from "node-html-parser";
import { buildSearchQuery, parseSearchResults, parseSearchNodes } from "../../../packages/guanggu-forum-api/src/searchParser";
import { request } from "../../../packages/guanggu-forum-api/src/client";
import { searchTopics, resolveSearchResult, getSearchNodes, resolveSearchNode } from "../../../packages/guanggu-forum-api/src/search";
import { getNodeNavigation } from "../../../packages/guanggu-forum-api/src/node/getNodeNavigation";

vi.mock("../../../packages/guanggu-forum-api/src/client", () => ({ request: vi.fn() }));
vi.mock("../../../packages/guanggu-forum-api/src/node/getNodeNavigation", () => ({ getNodeNavigation: vi.fn() }));

const fixture = `<section class="gzk-search">
  <select id="search-node"><option value="0">全部节点</option><option value="1">楼市房产</option></select>
  <p class="search-status">第 2 页 · 同一主题的命中已合并</p>
  <div class="search-results"><article class="result">
    <h2><a href="/t/123?p=2">示例 &amp; 标题</a></h2>
    <div class="meta"><a href="/node/house">楼市房产</a> · <a href="/u/example">example</a> · 2024-10-15 11:55:33 · 主题正文</div>
    <p class="excerpt">包含<mark>关键词</mark>的摘要 &amp; 文本</p>
  </article></div>
  <nav class="search-pages"><a href="/search?q=test&amp;p=1">上一页</a><a href="/search?q=test&amp;p=3">下一页</a></nav>
  <p class="search-status">补充查找</p>
</section>`;

describe("online search query", () => {
  it("preserves keywords and all upstream filters", () => {
    expect(buildSearchQuery({ q: " 中建星光城 & 光谷 ", scope: "reply", sort: "newest", node: "1", author: " example ", since: "2024-01-01", until: "2024-12-31", page: 2 }))
      .toEqual({ q: "中建星光城 & 光谷", scope: "reply", sort: "newest", node: "1", author: "example", since: "2024-01-01", until: "2024-12-31", p: "2" });
  });
  it("uses website defaults", () => {
    expect(buildSearchQuery({ q: "租房" })).toMatchObject({ scope: "all", sort: "relevance", node: "0", p: "1" });
  });
  it("rejects blank, oversize, invalid page and invalid date ranges", () => {
    for (const params of [
      { q: " " }, { q: "a".repeat(121) }, { q: "test", page: 0 },
      { q: "test", since: "2024-02-30" }, { q: "test", since: "2025-01-01", until: "2024-12-31" },
      { q: "test", author: "a".repeat(81) }, { q: "test", node: "house" },
    ]) expect(() => buildSearchQuery(params)).toThrow();
  });
});

describe("online search parser", () => {
  it("extracts real metadata, decoded text, node options and pagination", () => {
    const response = parseSearchResults(parse(fixture), 2);
    expect(response.results).toEqual([{
      title: "示例 & 标题", link: "/t/123?p=2", category: "楼市房产", username: "example", displayName: "example",
      publishedAt: "2024-10-15 11:55:33", matchType: "主题正文", excerpt: "包含关键词的摘要 & 文本",
    }]);
    expect(response).toMatchObject({ page: 2, previousPage: 1, nextPage: 3, status: "第 2 页 · 同一主题的命中已合并" });
    expect(response.nodes).toHaveLength(2);
  });
  it("preserves reply redirect links", () => {
    expect(parseSearchResults(parse(fixture.replace("/t/123?p=2", "/search/reply/456"))).results[0].link).toBe("/search/reply/456");
  });
  it("accepts empty results without inventing a next page", () => {
    const result = parseSearchResults(parse('<section class="gzk-search"><div class="search-results"><p class="empty">没有找到匹配内容</p></div></section>'));
    expect(result.results).toEqual([]);
    expect(result.nextPage).toBeUndefined();
  });
  it("rejects challenge, missing body and malformed result links", () => {
    expect(() => parseSearchResults(undefined)).toThrow();
    expect(() => parseSearchResults(parse("<html><script>challenge</script></html>"))).toThrow();
    expect(() => parseSearchResults(parse(fixture.replace("/t/123?p=2", "https://example.com/login")))).toThrow();
  });
});

describe("board search filters", () => {
  it("loads filter options without a dummy keyword", async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(fixture), rawRes: { statusCode: 200 } });
    expect(await getSearchNodes()).toEqual([{ value: "0", label: "全部节点" }, { value: "1", label: "楼市房产" }]);
    expect(request).toHaveBeenLastCalledWith("/search", expect.objectContaining({ cache: true }));
    expect(() => parseSearchNodes(parse("<html>challenge</html>"))).toThrow();
  });
  it("maps a board slug using real navigation names, not the route label", async () => {
    vi.mocked(getNodeNavigation).mockResolvedValueOnce([{ category: "生活", nodes: [{ slug: "house", name: "楼市房产" }] }]);
    const nodes = parseSearchNodes(parse(fixture));
    expect(await resolveSearchNode("house", nodes)).toEqual({ value: "1", label: "楼市房产" });
    expect(await resolveSearchNode("1", nodes)).toEqual({ value: "1", label: "楼市房产" });
    expect(buildSearchQuery({ q: "租房", node: (await resolveSearchNode("1", nodes)).value }).node).toBe("1");
  });
  it("does not silently fall back to all boards when a slug cannot be resolved", async () => {
    vi.mocked(getNodeNavigation).mockResolvedValueOnce([]);
    await expect(resolveSearchNode("unknown", parseSearchNodes(parse(fixture)))).rejects.toThrow("暂不支持");
    await expect(resolveSearchNode("999", parseSearchNodes(parse(fixture)))).rejects.toThrow("暂不支持");
  });
});

describe("online search requests", () => {
  it("uses the shared request layer without a local-cache fallback", async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(fixture), rawRes: { statusCode: 200 } });
    const result = await searchTopics({ q: "关键词", page: 2 });
    expect(request).toHaveBeenLastCalledWith("/search", expect.objectContaining({ cache: false, query: expect.objectContaining({ q: "关键词", p: "2" }) }));
    expect(result.page).toBe(2);
  });
  it("does not report HTTP failures as empty search results", async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(fixture), rawRes: { statusCode: 503 } });
    await expect(searchTopics({ q: "关键词" })).rejects.toThrow("暂不可用");
  });
  it("preserves topic page and resolves reply floor using the upstream redirect", async () => {
    const base = parseSearchResults(parse(fixture)).results[0];
    expect(await resolveSearchResult(base)).toEqual({ tid: "123", page: "2" });
    vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200, data: '<link rel="canonical" href="http://www.guozaoke.com/t/123"><div id="r456"><span class="floor">#4</span></div>' } });
    expect(await resolveSearchResult({ ...base, link: "/search/reply/456" })).toEqual({ tid: "123", page: "1", replyId: "456", floor: "#4" });
    vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200, data: '<link rel="canonical" href="http://www.guozaoke.com/t/123"><div id="r456"><span class="floor">#4</span></div>' } });
    expect(await resolveSearchResult({ ...base, link: "/t/123?p=2#r456" })).toEqual({ tid: "123", page: "1", replyId: "456", floor: "#4" });
  });
});
