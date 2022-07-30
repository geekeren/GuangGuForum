import Taro from "@tarojs/taro";
import { parse, HTMLElement } from "node-html-parser";

export function request(relativeUrl: string = ''): Promise<HTMLElement | undefined> {
  const url = `https://www.guozaoke.com${relativeUrl}`
  return Taro.request({
    url
  }).then((res) => {
    const REG_BODY = /<body[^>]*>([\s\S]*)<\/body>/;
    const result = REG_BODY.exec(res.data);
    if(result && result.length === 2) {
      return parse(result[0]);
    }
    return undefined;
  })
}
