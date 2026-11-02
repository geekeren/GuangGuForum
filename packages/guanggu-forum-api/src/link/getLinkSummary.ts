import { createApiCacheEntry, readApiCacheEntry } from "../cacheVersions";
import Taro from "@tarojs/taro";
import { parse, HTMLElement } from "node-html-parser";
import { matchContentRule } from "./linkContentRules";
import { CacheAPIFunc } from "../types";
import { getCacheService } from "../client";

export interface LinkSummary {
  title: string;
  description: string;
  bodyText: string;
  bodyHtml: string;
  image: string;
  favicon: string;
  siteName: string;
  url: string;
}

const LINK_CACHE_PREFIX = "link_html_";
const pendingHtml = new Map<string, Promise<string>>();

function metaContent(doc: HTMLElement, property: string): string {
  const el =
    doc.querySelector(`meta[property="${property}"]`) ||
    doc.querySelector(`meta[name="${property}"]`);
  return el?.getAttribute("content") || "";
}

function extractTitle(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:title") ||
    doc.querySelector("title")?.text ||
    ""
  );
}

function extractDescription(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:description") ||
    metaContent(doc, "description") ||
    ""
  );
}

function extractImage(doc: HTMLElement): string {
  return (
    metaContent(doc, "og:image") ||
    metaContent(doc, "twitter:image") ||
    ""
  );
}

function extractFavicon(doc: HTMLElement, origin: string): string {
  const el =
    doc.querySelector('link[rel="icon"]') ||
    doc.querySelector('link[rel="shortcut icon"]') ||
    doc.querySelector('link[rel="apple-touch-icon"]');
  if (!el) return "";
  const href = el.getAttribute("href") || "";
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  return `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractSiteName(doc: HTMLElement): string {
  return metaContent(doc, "og:site_name") || "";
}

function extractBodyText(doc: HTMLElement, rootSelector?: string): string {
  const root = (rootSelector && doc.querySelector(rootSelector)) || doc.querySelector("body");
  if (!root) return "";

  const clone = parse(root.innerHTML);
  clone.querySelectorAll("script, style, noscript, nav, header, footer, aside").forEach((el) => el.remove());

  const text = (clone.structuredText || clone.textContent || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function extractBodyHtml(doc: HTMLElement, rootSelector?: string): string {
  const root = (rootSelector && doc.querySelector(rootSelector)) || doc.querySelector("body");
  if (!root) return "";
  root.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return root.innerHTML.trim();
}

function parseSummary(html: string, url: string): LinkSummary {
  let origin = "";
  try { origin = new URL(url).origin; } catch {}

  const doc = parse(html);
  const rule = matchContentRule(url);
  const rootSelector = rule?.selector;

  // debug: check if selector matches and what it contains
  if (rootSelector) {
    const el = doc.querySelector(rootSelector);
    console.log("[parseSummary] rule matched:", rootSelector, "found:", !!el, "innerHTML len:", el?.innerHTML?.length || 0);
    const body = doc.querySelector("body");
    console.log("[parseSummary] body innerHTML len:", body?.innerHTML?.length || 0);
    // check if content is in script tags (WeChat stores article HTML in a JS variable)
    const scripts = doc.querySelectorAll("script");
    for (const s of scripts) {
      const text = s.textContent || "";
      if (text.includes("rich_media_content")) {
        console.log("[parseSummary] found rich_media_content in script, preview:", text.slice(0, 300));
      }
    }
  }

  return {
    title: extractTitle(doc) || url,
    description: extractDescription(doc),
    bodyText: extractBodyText(doc, rootSelector),
    bodyHtml: extractBodyHtml(doc, rootSelector),
    image: extractImage(doc),
    favicon: extractFavicon(doc, origin),
    siteName: extractSiteName(doc),
    url,
  };
}

function fetchHtml(url: string): Promise<string> {
  const existing = pendingHtml.get(url);
  if (existing) return existing;
  const pending = Promise.resolve().then(() => Taro.request({
    url,
    responseType: "text",
    timeout: 8000,
  })).then(res => {
    if (!(res.statusCode >= 200 && res.statusCode < 300)) return "";
    return typeof res.data === "string" && res.data.trim() ? res.data : "";
  }).catch(() => "").finally(() => {
    if (pendingHtml.get(url) === pending) pendingHtml.delete(url);
  });
  pendingHtml.set(url, pending);
  return pending;
}

function cacheHtml(url: string, html: string) {
  if (!html) return;
  const entry = createApiCacheEntry("fetchLinkSummary", html);
  if (entry) getCacheService().set(LINK_CACHE_PREFIX + url, entry, { category: "link", priority: "low" });
}

function getCachedHtml(url: string): string {
  const cs = getCacheService();
  if (cs.isExpired(LINK_CACHE_PREFIX + url)) {
    cs.remove(LINK_CACHE_PREFIX + url);
    return "";
  }
  const cached = cs.get<unknown>(LINK_CACHE_PREFIX + url);
  const html = readApiCacheEntry<unknown>("fetchLinkSummary", cached);
  if (typeof html === 'string') return html;
  if (cached !== null) cs.remove(LINK_CACHE_PREFIX + url);
  return "";
}

export interface FetchLinkSummaryParam {
  url: string;
}

export const fetchLinkSummary: CacheAPIFunc<FetchLinkSummaryParam, LinkSummary> = async (
  { url },
  options?,
) => {
  const emptySummary = { title: url, description: "", bodyText: "", bodyHtml: "", image: "", favicon: "", siteName: "", url };
  const cache = options?.cache ?? true;
  const cachedHtml = cache ? getCachedHtml(url) : "";
  if (cachedHtml) {
    const summary = parseSummary(cachedHtml, url);
    // Refresh retained HTML even when nobody subscribes to UI updates.
    void fetchHtml(url).then(freshHtml => {
      if (!freshHtml) return;
      const freshSummary = parseSummary(freshHtml, url);
      cacheHtml(url, freshHtml);
      options?.onRefresh?.(freshSummary);
    }).catch(() => {});
    return summary;
  }

  const html = await fetchHtml(url);
  if (!html) return emptySummary;
  const summary = parseSummary(html, url);
  if (cache) cacheHtml(url, html);
  return summary;
}
