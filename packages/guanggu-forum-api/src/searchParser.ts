import type { HTMLElement } from "node-html-parser";
import { getDisplayName } from "./utils/displayName";

export type SearchScope = "all" | "title" | "topic" | "reply";
export type SearchSort = "relevance" | "newest";

export interface SearchParams {
  q: string;
  scope?: SearchScope;
  sort?: SearchSort;
  node?: string;
  author?: string;
  since?: string;
  until?: string;
  page?: number;
}

export interface SearchResult {
  title: string;
  link: string;
  category: string;
  username: string;
  displayName?: string;
  publishedAt: string;
  matchType: string;
  excerpt: string;
}

export interface SearchNode {
  value: string;
  label: string;
}

export interface SearchResponse {
  results: SearchResult[];
  nodes: SearchNode[];
  page: number;
  previousPage?: number;
  nextPage?: number;
  status: string;
  notice: string;
}

function validateDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" && value <= "2100-12-31";
}

export function buildSearchQuery(params: SearchParams): Record<string, string> {
  const q = params.q.trim();
  if (!q) throw new Error("请输入搜索关键词");
  if (q.length > 120) throw new Error("搜索关键词不能超过 120 字");
  const scope = params.scope || "all";
  const sort = params.sort || "relevance";
  if (!["all", "title", "topic", "reply"].includes(scope) ||
    !["relevance", "newest"].includes(sort)) throw new Error("搜索筛选参数无效");
  const author = (params.author || "").trim();
  if (author.length > 80) throw new Error("作者用户名不能超过 80 字");
  const node = params.node || "0";
  if (!/^\d+$/.test(node)) throw new Error("节点参数无效");
  const since = params.since || "";
  const until = params.until || "";
  if ((since && !validateDate(since)) || (until && !validateDate(until))) {
    throw new Error("请选择有效的日期");
  }
  if (since && until && since > until) throw new Error("开始日期不能晚于结束日期");
  const page = params.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("搜索页码无效");
  return { q, scope, sort, node, author, since, until, p: String(page) };
}

const text = (element?: HTMLElement | null) =>
  element?.textContent.replace(/\s+/g, " ").trim() || "";

export function parseSearchNodes(body: HTMLElement | undefined): SearchNode[] {
  const options = body?.querySelectorAll(".gzk-search #search-node option") || [];
  const nodes = options.map((option) => ({
    value: option.getAttribute("value") || "",
    label: text(option),
  })).filter((node) => /^\d+$/.test(node.value) && node.label);
  if (!nodes.some((node) => node.value === "0")) throw new Error("板块筛选加载失败，请重试");
  return nodes;
}

export function parseSearchResults(body: HTMLElement | undefined, page = 1): SearchResponse {
  const root = body?.querySelector(".gzk-search");
  if (!root) throw new Error("搜索页面加载失败，请稍后重试");
  const container = root.querySelector(".search-results");
  const empty = root.querySelector(".empty");
  const notice = text(root.querySelector(".notice"));
  if (!container && !empty && !notice) throw new Error("搜索页面格式异常，请稍后重试");
  const results = (container?.querySelectorAll(".result") || []).map((item): SearchResult => {
    const title = item.querySelector("h2 a");
    const link = title?.getAttribute("href") || "";
    if (!text(title) || !/^\/(?:t\/\d+(?:\?p=\d+)?(?:#r\d+)?|search\/reply\/\d+)$/.test(link)) {
      throw new Error("搜索结果格式异常，请稍后重试");
    }
    const meta = text(item.querySelector(".meta"));
    const author = item.querySelector('.meta a[href^="/u/"]');
    const username = text(author);
    return {
      title: text(title),
      link,
      category: text(item.querySelector('.meta a[href^="/node/"]')),
      username,
      displayName: getDisplayName(item.querySelector('.meta'), username, author?.getAttribute('href')),
      publishedAt: meta.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || "",
      matchType: meta.split("·").pop()?.trim() || "",
      excerpt: text(item.querySelector(".excerpt")),
    };
  });
  let previousPage: number | undefined;
  let nextPage: number | undefined;
  for (const link of root.querySelectorAll(".search-pages a")) {
    const href = link.getAttribute("href")?.replace(/&amp;/g, "&") || "";
    const value = Number(href.match(/[?&]p=(\d+)(?:&|$)/)?.[1]);
    if (!Number.isSafeInteger(value) || value < 1) continue;
    if (value < page) previousPage = value;
    if (value > page) nextPage = value;
  }
  return {
    results,
    nodes: root.querySelectorAll("#search-node option").map((option) => ({
      value: option.getAttribute("value") || "0",
      label: text(option),
    })).filter((node) => /^\d+$/.test(node.value)),
    page,
    previousPage,
    nextPage,
    status: text(root.querySelector(".search-status")),
    notice,
  };
}
