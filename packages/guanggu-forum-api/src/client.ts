import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { URLS } from "./urls";
import { Cookie, parseCookie, stringifyCookie } from "./utils/cookie";
import { ICacheService, CacheCategory } from "./types";
import { createApiCacheEntry, readApiCacheEntry, getApiCacheVersions, type CacheApi } from "./cacheVersions";
import { parseUnreadNotifications } from "./notification/unread";

type TaroRequestConfig = Parameters<typeof Taro.request>[0];
export interface RequestConfig extends Omit<TaroRequestConfig, "url" | "data" | "cache"> {
  useProxy?: boolean;
  useCookie?: boolean;
  notifyLoginRequired?: boolean;
  query?: Record<string, string | undefined>;
  data?: Record<string, unknown>;
  method?: "POST" | "GET";
  cache?: boolean;
  cacheApi?: CacheApi;
  onRefresh?: (body: HTMLElement) => void;
}

const HTML_CACHE_PREFIX = "html_v2_";

function getCacheEnvironment(): string {
  try {
    return Taro.getAccountInfoSync().miniProgram.envVersion || "unknown";
  } catch {
    return "unknown";
  }
}

const STRIP_TAGS = /<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi;
const STRIP_BODY_FOOTER = /<footer[^>]*class="footer"[^>]*>[\s\S]*?<\/footer>/gi;
const COLLAPSE_BLANK_LINES = /\n\s*\n/g;
const COMPRESS_WHITESPACE = />\s+</g;

function cleanHtmlForCache(html: string): string {
  return html
    .replace(STRIP_TAGS, "")
    .replace(STRIP_BODY_FOOTER, "")
    .replace(COLLAPSE_BLANK_LINES, "\n")
    .replace(COMPRESS_WHITESPACE, "><")
    .trim();
}

function categorizeUrl(relativeUrl: string): CacheCategory {
  if (relativeUrl === "/") return "node";
  if (/\/t\//.test(relativeUrl)) return "topic";
  if (/\/node\//.test(relativeUrl)) return "node";
  if (/\/u\//.test(relativeUrl)) return "user";
  if (/^https?:\/\//.test(relativeUrl)) return "link";
  return "other";
}

let _cacheService: ICacheService | null = null;
let _onLoginRequired: (() => void) | null = null;
let _onUnreadNotifications: ((count: number, username: string) => void) | null = null;

// In-memory cache for parsed HTML to avoid re-parsing on every cache hit
const parsedCache = new Map<string, { body: HTMLElement; html: string; timestamp: number }>();
const PARSED_CACHE_TTL = 10 * 60 * 1000; // 10 min
const PARSED_CACHE_MAX_ENTRIES = 100;
const READING_CACHE_APIS = new Set<CacheApi>([
  "getRecentTopics", "getTopicDetail", "getNodeTopics", "getHotNodes", "getNodeNavigation",
  "getUserProfile", "getUserFavorites", "getRecentlyViewedTopics", "fetchLinkSummary", "getNotifications",
  "getHotTopics", "getHotTopicMetadata", "getHotTopicCategory", "getDiscoveryData",
  "resolveSearchNode", "getInterestTopics", "getSearchNodes", "searchTopics", "resolveSearchResult",
]);
// Keep only active requests; older responses cannot publish after a newer request starts.
const requestRevisions = new Map<string, { latest: number; active: number }>();
let nextRequestRevision = 0;

function pruneParsedCache() {
  const now = Date.now();
  for (const [key, entry] of parsedCache) {
    if (now < entry.timestamp || now - entry.timestamp >= PARSED_CACHE_TTL) parsedCache.delete(key);
  }
}

function rememberParsed(key: string, html: string, body: HTMLElement) {
  pruneParsedCache();
  parsedCache.delete(key);
  parsedCache.set(key, { body, html, timestamp: Date.now() });
  while (parsedCache.size > PARSED_CACHE_MAX_ENTRIES) parsedCache.delete(parsedCache.keys().next().value!);
}

export function setCacheService(cs: ICacheService) {
  _cacheService = cs;
  parsedCache.clear();
}

export function setOnLoginRequired(callback: () => void) {
  _onLoginRequired = callback;
}

export function setOnUnreadNotifications(callback: ((count: number, username: string) => void) | null) {
  _onUnreadNotifications = callback;
}

export function getCacheService(): ICacheService {
  if (!_cacheService) throw new Error("CacheService not initialized. Call setCacheService() first.");
  return _cacheService;
}

export class LoginRequiredError extends Error {
  constructor() {
    super("请先登录");
    this.name = "LoginRequiredError";
  }
}

function parseHtmlResponse(resData: string, relativeUrl: string, live = false, success = false, notifyLoginRequired = true) {
  if (typeof resData !== 'string') return null;
  const REG_BODY = /<body[^>]*>([\s\S]*)<\/body>/;
  const result = REG_BODY.exec(resData);
  if (result && result.length === 2) {
    const bodyStr = result[0];
    const body = parse(bodyStr);
    const userLink = body.querySelector('#navbar5 .navbar-right a.avatar[href^="/u/"]');
    if (
      !userLink && body.querySelector(".alert.alert-danger")?.textContent.includes("请先登录社区再完成操作") &&
      !relativeUrl.includes("/login")
    ) {
      if (!live) return null;
      if (notifyLoginRequired) {
        Taro.showToast({
          icon: "error",
          duration: 2000,
          title: "请先登录",
        });
        _onLoginRequired?.();
      }
      throw new LoginRequiredError();
    }
    const href = userLink?.getAttribute("href") || "";
    const match = href.match(/\/u\/(.+)$/);
    if (live && match?.[1]) {
      getCacheService().set("current_username", match[1], { category: "system" });
      if (success) {
        const unread = parseUnreadNotifications(body);
        if (unread !== undefined) _onUnreadNotifications?.(unread, match[1]);
      }
    }
    return body;
  }
  return null;
}

export async function request(
  relativeUrl: string = "",
  config?: RequestConfig,
): Promise<{
  body?: HTMLElement;
  rawRes: any;
  data?: Record<string, any>;
  fromCache?: boolean;
}> {
  const {
    query = {},
    method = "GET",
    useProxy = false,
    useCookie = true,
    notifyLoginRequired = true,
    cache: requestedCache = false,
    cacheApi,
    onRefresh,
    ...rest
  } = config || {};
  Object.entries(query).forEach(([k, v]) => {
    if (!v) {
      delete query[k];
    }
  });
  const baseUrl = url.parse(
    url.resolve(useProxy ? URLS.PROXY_ROOT_URL : URLS.ROOT_URL, relativeUrl),
  );
  const newUrl = url.format({
    ...baseUrl,
    query: { ...query },
  });

  const persistCache = method === "GET" && !useProxy && !!cacheApi &&
    READING_CACHE_APIS.has(cacheApi) && !!getApiCacheVersions(cacheApi);
  const cache = requestedCache && persistCache;
  pruneParsedCache();
  const cs = getCacheService();
  const username = useCookie ? cs.get<string>("current_username") : null;
  const getCookies = () => cs.get<Record<string, Cookie | string>>("cookies") || {};
  const requestCookie = useCookie ? stringifyCookie(getCookies()) : "";
  const scopeCurrent = () => getCacheService() === cs && (!useCookie ||
    (cs.get<string>("current_username") === username && stringifyCookie(getCookies()) === requestCookie));
  const cacheKey = `${HTML_CACHE_PREFIX}${getCacheEnvironment()}_${username ? encodeURIComponent(username) : "guest"}_${newUrl}${cacheApi ? `#api=${encodeURIComponent(cacheApi)}` : ""}`;
  const mayReadCache = requestedCache && method === "GET" && !useProxy &&
    (!cacheApi || READING_CACHE_APIS.has(cacheApi)) && (relativeUrl !== "/notifications" || username);
  const cachedValue = mayReadCache
    ? await (cs.getAsync ? cs.getAsync<unknown>(cacheKey) : cs.get<unknown>(cacheKey)) : null;

  const cachedData = cacheApi ? readApiCacheEntry<unknown>(cacheApi, cachedValue) : null;
  const cachedHtml = typeof cachedData === 'string' ? cachedData : null;
  if (mayReadCache && !cachedHtml) {
    parsedCache.delete(cacheKey);
    if (cachedValue !== null) {
      if (cs.removeAsync) await cs.removeAsync(cacheKey);
      else cs.remove(cacheKey);
    }
  }

  // Async disk lookup may yield across account switching: restart with its new scope.
  if (!scopeCurrent()) return request(relativeUrl, config);

  const revisionKey = JSON.stringify([cacheKey, useCookie, requestCookie]);
  const startRequest = () => {
    const state = requestRevisions.get(revisionKey) || { latest: 0, active: 0 };
    const revision = ++nextRequestRevision;
    state.latest = revision;
    state.active++;
    requestRevisions.set(revisionKey, state);
    return {
      current: () => state.latest === revision && getCacheService() === cs,
      finish: () => {
        state.active--;
        if (state.active === 0 && requestRevisions.get(revisionKey) === state) requestRevisions.delete(revisionKey);
      },
    };
  };
  const persistHtml = async (resData: string, body: HTMLElement, current: () => boolean) => {
    if (!persistCache || !current()) return;
    const html = cleanHtmlForCache(resData);
    const entry = createApiCacheEntry(cacheApi!, html);
    if (!entry) return;
    try {
      // File-cache publication is generation-ordered; storage uses ordered synchronous commits.
      await cs.setAsync(cacheKey, entry, { category: categorizeUrl(relativeUrl), priority: "low" });
    } catch {
      // A storage failure must not turn a successful read into a UI/network failure.
    }
    if (current()) rememberParsed(cacheKey, html, body);
  };
  const liveRequest = () => Taro.request({
    url: newUrl,
    method,
    ...rest,
    header: { ...rest.header, cookie: requestCookie },
  });

  const doBackgroundRefresh = () => {
    if (!scopeCurrent()) return;
    const revision = startRequest();
    void Promise.resolve().then(liveRequest).then(async (res: any) => {
      if (!scopeCurrent() || !revision.current() || !(res.statusCode >= 200 && res.statusCode < 300)) return;
      // A background refresh must not interrupt the page displaying cached data.
      const parsedBody = parseHtmlResponse(res.data, relativeUrl, true, true, false);
      if (!parsedBody) return;
      if (res.cookies) cs.set("cookies", { ...getCookies(), ...parseCookie(res.cookies) }, { category: "system" });
      const responseUsername = useCookie ? cs.get<string>("current_username") : null;
      const responseCookie = useCookie ? stringifyCookie(getCookies()) : "";
      const current = () => revision.current() && (!useCookie ||
        (cs.get<string>("current_username") === responseUsername && stringifyCookie(getCookies()) === responseCookie));
      if (!useCookie || responseUsername === username) await persistHtml(res.data, parsedBody, current);
      if (current()) onRefresh?.(parsedBody);
    }).catch(() => {}).finally(revision.finish);
  };

  const handleResponse = async (res: any, revision: ReturnType<typeof startRequest>) => {
    if (!scopeCurrent()) throw new Error("账号已切换，请重试");
    // Obsolete foreground results may be returned to their caller, but cannot mutate identity/cache.
    const currentResponse = revision.current();
    if (currentResponse && res.cookies) {
      cs.set("cookies", { ...getCookies(), ...parseCookie(res.cookies) }, { category: "system" });
    }
    const resData = res.data;
    if (!useProxy) {
      const success = res.statusCode >= 200 && res.statusCode < 300;
      const parsedBody = parseHtmlResponse(resData, relativeUrl, currentResponse, success, notifyLoginRequired);
      if (parsedBody) {
        const responseUsername = useCookie ? cs.get<string>("current_username") : null;
        const responseCookie = useCookie ? stringifyCookie(getCookies()) : "";
        const current = () => revision.current() && (!useCookie ||
          (cs.get<string>("current_username") === responseUsername && stringifyCookie(getCookies()) === responseCookie));
        // Do not publish authenticated HTML under a guest/other-account cache key.
        if (success && (!useCookie || responseUsername === username)) await persistHtml(resData, parsedBody, current);
        if (getCacheService() !== cs || (useCookie &&
          (cs.get<string>("current_username") !== responseUsername || stringifyCookie(getCookies()) !== responseCookie))) {
          throw new Error("账号已切换，请重试");
        }
        return { body: parsedBody, rawRes: res, fromCache: false };
      }
    }
    return { rawRes: res, data: res.data, fromCache: false };
  };

  if (cache && cachedHtml) {
    // Check in-memory parsed cache first to skip HTML parsing
    const cached = parsedCache.get(cacheKey);
    if (cached && cached.html === cachedHtml) {
      parsedCache.delete(cacheKey);
      parsedCache.set(cacheKey, cached);
      doBackgroundRefresh();
      return Promise.resolve({ body: cached.body, rawRes: null, fromCache: true });
    }

    const body = parseHtmlResponse(cachedHtml, relativeUrl);
    if (body) {
      rememberParsed(cacheKey, cachedHtml, body);
    }

    if (body) {
      doBackgroundRefresh();
      return Promise.resolve({ body, rawRes: null, fromCache: true });
    }
    if (cs.removeAsync) await cs.removeAsync(cacheKey);
    else cs.remove(cacheKey);
    parsedCache.delete(cacheKey);
  }

  const revision = startRequest();
  return Promise.resolve().then(liveRequest).then(res => handleResponse(res, revision)).finally(revision.finish);
}
