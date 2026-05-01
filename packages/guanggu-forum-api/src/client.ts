import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { URLS } from "./urls";
import { parseCookie, stringifyCookie } from "./utils/cookie";

type TaroRequestConfig = Parameters<typeof Taro.request>[0];
export interface RequestConfig extends Omit<TaroRequestConfig, "url"> {
  useProxy?: boolean;
  useCookie?: boolean;
  query?: Record<string, string | undefined>;
  data?: Record<string, string | undefined>;
  method?: "POST" | "GET";
  cacheTTL?: number;
}

const CACHE_PREFIX = "req_cache_";
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

interface CachedResponse {
  data: string;
  timestamp: number;
}

export function request(
  relativeUrl: string = "",
  config?: RequestConfig,
): Promise<{
  body?: HTMLElement;
  rawRes: any;
  data?: Record<string, any>;
}> {
  const {
    query = {},
    method = "GET",
    useProxy = false,
    useCookie = true,
    cacheTTL,
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
    query: {
      ...query,
    },
  });

  const shouldCache = method === "GET" && cacheTTL !== 0;
  const ttl = cacheTTL ?? DEFAULT_CACHE_TTL;

  const makeRequest = () =>
    Taro.request({
      url: newUrl,
      method,
      ...rest,
      header: {
        ...rest.header,
        cookie: useCookie ? stringifyCookie(Taro.getStorageSync("cookies")) : "",
      },
    }).then((res: any) => {
      if (res.cookies) {
        Taro.setStorageSync("cookies", {
          ...Taro.getStorageSync("cookies"),
          ...parseCookie(res.cookies),
        });
      }

      if (shouldCache) {
        try {
          const data = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          Taro.setStorageSync(CACHE_PREFIX + newUrl, JSON.stringify({ data, timestamp: Date.now() }));
        } catch {}
      }

      return res;
    });

  const run = (res: any) => {
    const resData = res.data;
    if (!useProxy) {
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
          Taro.setStorageSync("current_username", match[1]);
        }
        return Promise.resolve({
          body,
          rawRes: res,
        });
      }
    }
    return {
      rawRes: res,
      data: res.data,
    };
  };

  if (shouldCache) {
    try {
      const stored = Taro.getStorageSync(CACHE_PREFIX + newUrl);
      if (stored) {
        const cached: CachedResponse = JSON.parse(stored);
        if (Date.now() - cached.timestamp < ttl) {
          const res = { data: cached.data, cookies: [], statusCode: 200 };
          return Promise.resolve(run(res) as any);
        }
      }
    } catch {}
  }

  return makeRequest().then(run);
}
