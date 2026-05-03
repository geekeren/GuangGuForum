import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { URLS } from "./urls";
import { parseCookie, stringifyCookie } from "./utils/cookie";

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
const INDEX_KEY = "__cache_index__";
const LAST_CLEANUP_KEY = "__cache_cleanup_date__";
const MAX_ENTRIES = 1000;

interface CacheIndex {
  keys: string[];
}

function getIndex(): CacheIndex {
  try {
    const raw = Taro.getStorageSync(INDEX_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn("[cache] getIndex failed", e); }
  return { keys: [] };
}

function saveIndex(index: CacheIndex) {
  try {
    Taro.setStorageSync(INDEX_KEY, JSON.stringify(index));
  } catch (e) { console.warn("[cache] saveIndex failed", e); }
}

function trackKey(key: string) {
  const index = getIndex();
  const idx = index.keys.indexOf(key);
  if (idx !== -1) index.keys.splice(idx, 1);
  index.keys.push(key);
  while (index.keys.length > MAX_ENTRIES) {
    const oldest = index.keys.shift()!;
    try { Taro.removeStorageSync(oldest); } catch (e) { console.warn("[cache] remove oldest failed", e); }
  }
  saveIndex(index);
}

function getCachedHtml(key: string): string | null {
  try {
    const stored = Taro.getStorageSync(key);
    if (stored) return stored;
  } catch (e) { console.warn("[cache] getCachedHtml failed", e); }
  return null;
}

function safeSetCache(key: string, value: string) {
  try {
    Taro.setStorageSync(key, value);
    trackKey(key);
  } catch (e) {
    console.warn("[cache] setCache failed, evicting and retrying", e);
    const index = getIndex();
    const evictCount = Math.max(10, Math.floor(index.keys.length * 0.2));
    for (let i = 0; i < evictCount && index.keys.length > 0; i++) {
      const oldest = index.keys.shift()!;
      try { Taro.removeStorageSync(oldest); } catch (e2) { console.warn("[cache] remove oldest failed", e2); }
    }
    saveIndex(index);
    try {
      Taro.setStorageSync(key, value);
      trackKey(key);
    } catch (e2) { console.warn("[cache] setCache retry failed", e2); }
  }
}

function safeSetStorage(key: string, value: any) {
  try {
    Taro.setStorageSync(key, value);
  } catch (e) { console.warn("[cache] setStorage failed", key, e); }
}

function safeGetStorage(key: string): any {
  try {
    return Taro.getStorageSync(key);
  } catch (e) { console.warn("[cache] getStorage failed", key, e); }
  return null;
}

export function cleanupCache() {
  const index = getIndex();
  const validKeys: string[] = [];
  for (const key of index.keys) {
    try {
      const val = Taro.getStorageSync(key);
      if (val) validKeys.push(key);
    } catch (e) { console.warn("[cache] cleanup read failed", key, e); }
  }
  index.keys = validKeys;
  while (index.keys.length > MAX_ENTRIES) {
    const oldest = index.keys.shift()!;
    try { Taro.removeStorageSync(oldest); } catch (e) { console.warn("[cache] remove oldest failed", e); }
  }
  saveIndex(index);
}

export function shouldRunDailyCleanup(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const last = Taro.getStorageSync(LAST_CLEANUP_KEY);
    if (last === today) return false;
  } catch (e) { console.warn("[cache] getCleanupDate failed", e); }
  try {
    Taro.setStorageSync(LAST_CLEANUP_KEY, today);
  } catch (e) { console.warn("[cache] setCleanupDate failed", e); }
  return true;
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
      Taro.reLaunch({
        url: "/pages/login/index",
      });
    }
    const body = parse(bodyStr);
    const userLink = body.querySelector("#navbar5 .navbar-right a.avatar");
    const href = userLink?.getAttribute("href") || "";
    const match = href.match(/\/u\/(.+)$/);
    if (match?.[1]) {
      safeSetStorage("current_username", match[1]);
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

  const cacheKey = HTML_CACHE_PREFIX + newUrl;
  const cachedHtml = cache ? getCachedHtml(cacheKey) : null;

  const handleResponse = (res: any) => {
    if (res.cookies) {
      safeSetStorage("cookies", {
        ...safeGetStorage("cookies"),
        ...parseCookie(res.cookies),
      });
    }
    const resData = res.data;
    if (!useProxy) {
      const parsedBody = parseHtmlResponse(resData, relativeUrl);
      if (parsedBody) {
        if (cache) {
          safeSetCache(cacheKey, resData);
        }
        return { body: parsedBody, rawRes: res, fromCache: false };
      }
    }
    return { rawRes: res, data: res.data, fromCache: false };
  };

  if (cache && cachedHtml) {
    const body = parseHtmlResponse(cachedHtml, relativeUrl);

    // Background refresh
    Taro.request({
      url: newUrl,
      method,
      ...rest,
      header: {
        ...rest.header,
        cookie: useCookie ? stringifyCookie(safeGetStorage("cookies")) : "",
      },
    }).then((res: any) => {
      if (res.cookies) {
        safeSetStorage("cookies", {
          ...safeGetStorage("cookies"),
          ...parseCookie(res.cookies),
        });
      }
      const resData = res.data;
      if (!useProxy) {
        const parsedBody = parseHtmlResponse(resData, relativeUrl);
        if (parsedBody) {
          safeSetCache(cacheKey, resData);
          onRefresh?.(parsedBody);
        }
      }
    }).catch(() => {});

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
      cookie: useCookie ? stringifyCookie(safeGetStorage("cookies")) : "",
    },
  }).then(handleResponse);
}
