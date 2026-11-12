import type { CacheCategory } from "../types";
import type { CacheApi } from "../cacheVersions";

const STRIP_TAGS = /<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_BODY_FOOTER =
  /<footer[^>]*class="footer"[^>]*>[\s\S]*?<\/footer>/gi;
const COLLAPSE_BLANK_LINES = /\n\s*\n/g;
const COMPRESS_WHITESPACE = />\s+</g;

export function cleanHtmlForCache(html: string): string {
  return html
    .replace(STRIP_TAGS, "")
    .replace(STRIP_BODY_FOOTER, "")
    .replace(COLLAPSE_BLANK_LINES, "\n")
    .replace(COMPRESS_WHITESPACE, "><")
    .trim();
}

export function categorizeUrl(relativeUrl: string): CacheCategory {
  if (relativeUrl === "/") return "node";
  if (/\/t\//.test(relativeUrl)) return "topic";
  if (/\/node\//.test(relativeUrl)) return "node";
  if (/\/u\//.test(relativeUrl)) return "user";
  if (/^https?:\/\//.test(relativeUrl)) return "link";
  return "other";
}

export const READING_CACHE_APIS = new Set<CacheApi>([
  "getRecentTopics",
  "getTopicDetail",
  "getNodeTopics",
  "getHotNodes",
  "getNodeNavigation",
  "getUserProfile",
  "getUserFavorites",
  "getRecentlyViewedTopics",
  "fetchLinkSummary",
  "getNotifications",
  "getHotTopics",
  "getHotTopicMetadata",
  "getHotTopicCategory",
  "getDiscoveryData",
  "resolveSearchNode",
  "getInterestTopics",
  "getSearchNodes",
  "searchTopics",
  "resolveSearchResult",
]);
