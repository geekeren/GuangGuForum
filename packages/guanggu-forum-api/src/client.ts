import Taro from "@tarojs/taro";
import url from "url";

import { parse, HTMLElement } from "node-html-parser";
import { ROOT_URL } from './consts';

export function request(relativeUrl: string = '', params: Record<string, string | undefined> = {}): Promise<HTMLElement | undefined> {

  Object.entries(params).forEach(([k, v]) => {
    if(!v) {
      delete params[k]
    }
  })
  const baseUrl = url.parse(url.resolve(ROOT_URL, relativeUrl) );
  const newUrl = url.format({
    ...baseUrl,
    query: {
      ...params
    }
  })


  return Taro.request({
    url: newUrl
  }).then((res) => {
    const REG_BODY = /<body[^>]*>([\s\S]*)<\/body>/;
    const result = REG_BODY.exec(res.data);
    if(result && result.length === 2) {
      return parse(result[0]);
    }
    return undefined;
  })
}
