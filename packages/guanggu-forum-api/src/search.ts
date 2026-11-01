import { parse } from "node-html-parser";
import { request } from "./client";
import { URLS } from "./urls";
import { getNodeNavigation } from "./node/getNodeNavigation";
import {
  buildSearchQuery,
  parseSearchResults,
  parseSearchNodes,
  SearchNode,
  SearchParams,
  SearchResult,
} from "./searchParser";

export * from "./searchParser";

export async function getSearchNodes() {
  const { body, rawRes } = await request(URLS.SEARCH, {
    cache: true, timeout: 15000, responseType: "text", dataType: "其他",
  });
  if (rawRes && rawRes.statusCode !== 200) throw new Error("板块筛选加载失败，请重试");
  return parseSearchNodes(body);
}

export async function resolveSearchNode(node: string, nodes: SearchNode[]) {
  if (/^\d+$/.test(node)) {
    const matched = nodes.find((item) => item.value === node);
    if (matched) return matched;
  } else {
    const groups = await getNodeNavigation();
    const source = groups.flatMap((group) => group.nodes).find((item) => item.slug === node);
    const matched = source && nodes.find((item) => item.value !== "0" && item.label === source.name);
    if (matched) return matched;
  }
  throw new Error("该板块暂不支持网站搜索，请切换为全部板块");
}

export async function searchTopics(params: SearchParams) {
  const query = buildSearchQuery(params);
  const { body, rawRes } = await request(URLS.SEARCH, {
    query,
    cache: false,
    timeout: 15000,
    responseType: "text",
    dataType: "其他",
  });
  if (rawRes?.statusCode !== 200) {
    throw new Error("搜索服务暂不可用，请稍后重试");
  }
  return parseSearchResults(body, Number(query.p));
}

export async function resolveSearchResult(
  result: Pick<SearchResult, "link">,
  /**
   * 通知/后台定位这类“顺带解析”不该把用户弹到登录页：
   * 关掉登录提示后失败只会抛错，由调用方降级成提示文案。
   */
  options: { notifyLoginRequired?: boolean } = {},
) {
  const topic = result.link.match(/^\/t\/(\d+)(?:\?p=(\d+))?(?:#r(\d+))?$/);
  if (topic && !topic[3]) return { tid: topic[1], page: topic[2] || "1" };

  const replyId = topic?.[3] || result.link.match(/^\/search\/reply\/(\d+)$/)?.[1];
  if (!replyId) throw new Error("无法打开这条搜索结果");
  const { rawRes } = await request(`/search/reply/${replyId}`, {
    cache: false,
    timeout: 15000,
    responseType: "text",
    dataType: "其他",
    notifyLoginRequired: options.notifyLoginRequired ?? true,
  });
  if (rawRes?.statusCode !== 200 || typeof rawRes.data !== "string") {
    throw new Error("回复定位失败，请重试");
  }
  const html = parse(rawRes.data);
  const canonical = html.querySelector('link[rel="canonical"]')?.getAttribute("href") || "";
  const tid = canonical.match(/^https?:\/\/www\.guozaoke\.com\/t\/(\d+)/)?.[1];
  const floor = html.querySelector(`#r${replyId} .floor`)?.textContent.trim();
  if (!tid || !floor) throw new Error("未找到对应回复，可能已被删除");
  return { tid, page: "1", replyId: replyId, floor };
}
