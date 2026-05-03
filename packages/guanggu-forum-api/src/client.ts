import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { URLS } from "./urls";
import { parseCookie, stringifyCookie } from "./utils/cookie";
import { ICacheService, CacheCategory } from "./types";

type TaroRequestConfig = Parameters<typeof Taro.request>[0];
export interface RequestConfig extends Omit<TaroRequestConfig, "url" | "data"> {
  useProxy?: boolean;
  useCookie?: boolean;
  query?: Record<string, string | undefined>;
  data?: Record<string, string | undefined>;
  method?: "POST" | "GET";
  cache?: boolean;
  onRefresh?: (body: HTMLElement) => void;
}

const HTML_CACHE_PREFIX = "html_";

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

// In-memory cache for parsed HTML to avoid re-parsing on every cache hit
const parsedCache = new Map<string, { body: HTMLElement; timestamp: number }>();
const PARSED_CACHE_TTL = 10 * 60 * 1000; // 10 min

export function setCacheService(cs: ICacheService) {
  _cacheService = cs;
}

export function setOnLoginRequired(callback: () => void) {
  _onLoginRequired = callback;
}

export function getCacheService(): ICacheService {
  if (!_cacheService) throw new Error("CacheService not initialized. Call setCacheService() first.");
  return _cacheService;
}

function parseHtmlResponse(resData: string, relativeUrl: string) {
  const REG_BODY = /<body[^>]*>([\s\S]*)<\/body>/;
  const result = REG_BODY.exec(resData);
  if (result && result.length === 2) {
    const bodyStr = result[0];
    if (
      bodyStr.includes("请先登录社区再完成操作") &&
      !relativeUrl.includes("/login")
    ) {
      Taro.showToast({
        icon: "error",
        duration: 2000,
        title: "请先登录",
      });
      _onLoginRequired?.();
    }
    const body = parse(bodyStr);
    const userLink = body.querySelector("#navbar5 .navbar-right a.avatar");
    const href = userLink?.getAttribute("href") || "";
    const match = href.match(/\/u\/(.+)$/);
    if (match?.[1]) {
      getCacheService().set("current_username", match[1], { category: "system" });
    }
    return body;
  }
  return null;
}

export function request(
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
    cache = false,
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

  const cs = getCacheService();
  const cacheKey = HTML_CACHE_PREFIX + newUrl;
  const cachedHtml = cache ? cs.get<string>(cacheKey) : null;

  const getCookies = () => cs.get<Record<string, string>>("cookies") || {};

  const doBackgroundRefresh = () => {
    Taro.request({
      url: newUrl,
      method,
      ...rest,
      header: {
        ...rest.header,
        cookie: useCookie ? stringifyCookie(getCookies()) : "",
      },
    }).then((res: any) => {
      if (res.cookies) {
        cs.set("cookies", { ...getCookies(), ...parseCookie(res.cookies) }, { category: "system" });
      }
      const resData = res.data;
      if (!useProxy) {
        const parsedBody = parseHtmlResponse(resData, relativeUrl);
        if (parsedBody) {
          cs.setAsync(cacheKey, cleanHtmlForCache(resData), { category: categorizeUrl(relativeUrl), priority: "low" });
          parsedCache.set(cacheKey, { body: parsedBody, timestamp: Date.now() });
          onRefresh?.(parsedBody);
        }
      }
    }).catch(() => {});
  };

  const handleResponse = (res: any) => {
    if (res.cookies) {
      cs.set("cookies", { ...getCookies(), ...parseCookie(res.cookies) }, { category: "system" });
    }
    const resData = res.data;
    if (!useProxy) {
      const parsedBody = parseHtmlResponse(resData, relativeUrl);
      if (parsedBody) {
        if (cache) {
          cs.setAsync(cacheKey, cleanHtmlForCache(resData), { category: categorizeUrl(relativeUrl), priority: "low" });
          parsedCache.set(cacheKey, { body: parsedBody, timestamp: Date.now() });
        }
        return { body: parsedBody, rawRes: res, fromCache: false };
      }
    }
    return { rawRes: res, data: res.data, fromCache: false };
  };

  if (cache && cachedHtml) {
    // Check in-memory parsed cache first to skip HTML parsing
    const cached = parsedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < PARSED_CACHE_TTL) {
      doBackgroundRefresh();
      return Promise.resolve({ body: cached.body, rawRes: null, fromCache: true });
    }

    const body = parseHtmlResponse(cachedHtml, relativeUrl);
    if (body) {
      parsedCache.set(cacheKey, { body, timestamp: Date.now() });
    }

    doBackgroundRefresh();

    if (body) {
      return Promise.resolve({ body, rawRes: null, fromCache: true });
    }
  }

  return Taro.request({
    url: newUrl,
    method,
    ...rest,
    header: {
      ...rest.header,
      cookie: useCookie ? stringifyCookie(getCookies()) : "",
    },
  }).then(handleResponse);
}
