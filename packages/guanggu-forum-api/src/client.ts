import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { URLS } from "./urls";
import { parseCookie, stringifyCookie } from "./utils/cookie";

type TaroRequestConfig = Parameters<typeof Taro.request>[0];
export interface RequestConfig extends Omit<TaroRequestConfig, 'url'>{
  useProxy?: boolean;
  useCookie?: boolean;
  query?: Record<string, string | undefined>,
  data?: Record<string, string | undefined>,
  method?: 'POST' | 'GET'
}

export function request(
  relativeUrl: string = '',
  config?: RequestConfig): Promise<{
    body?: HTMLElement,
    rawRes: any,
    data?: Record<string, any>,
  }> {

  const { query = {}, method = 'GET', useProxy = false, useCookie = true, ...rest } = config || {};
  Object.entries(query).forEach(([k, v]) => {
    if (!v) {
      delete query[k]
    }
  })
  const baseUrl = url.parse(
    url.resolve(useProxy ? URLS.PROXY_ROOT_URL : URLS.ROOT_URL, relativeUrl)
    );
  const newUrl = url.format({
    ...baseUrl,
    query: {
      ...query
    },
  })


  return Taro.request({
    url: newUrl,
    method,
    ...rest,
    header: {
      ...rest.header,
      cookie: useCookie ? stringifyCookie(Taro.getStorageSync('cookies')) : "",
    }
  }).then((res: any) => {
    if(res.cookies) {
      Taro.setStorageSync(
        "cookies",
        {
          ...Taro.getStorageSync('cookies'),
          ...parseCookie(res.cookies)
        }
      )
    }
    const resData = res.data;
    if (!useProxy) {
      const REG_BODY = /<body[^>]*>([\s\S]*)<\/body>/;
      const result = REG_BODY.exec(resData);
      if (result && result.length === 2) {
        const bodyStr = result[0];
        if(bodyStr.includes('请先登录社区再完成操作') && !relativeUrl.includes('/login')) {
          Taro.showToast({
            icon: 'error',
            duration: 2000,
            title: '请先登录',
          });
          Taro.reLaunch({
            url: '/pages/login/index'
          });
        }
        const body = parse(bodyStr);
        return Promise.resolve({
          body,
          rawRes: res
        });
      }
    }
    return {
      rawRes: res,
      data: res.data
    };
  })
}

