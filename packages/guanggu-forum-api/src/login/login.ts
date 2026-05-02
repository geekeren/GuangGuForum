import Taro from "@tarojs/taro";
import { request } from "../client";
import { URLS } from "../urls";
import { getLoginXsrfCode } from "./getLoginXsrfCode";

export interface LoginPayload {
  email: string;
  password: string;
}

export async function login(payload: LoginPayload) {
  const { xsrf_form } = await getLoginXsrfCode();
  return request(URLS.Login, {
    method: "POST",
    useProxy: true,
    data: {
      ...payload,
      _xsrf: xsrf_form,
    },
    header: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
      Referer: `${URLS.ROOT_URL}`,
    },
  }).then(() => {
    // 通过 cookie 判断是否登录成功
    const cookies = Taro.getStorageSync("cookies");
    if (cookies && Object.keys(cookies).length > 0) {
      // proxy 请求不会解析 HTML 写入 current_username，发一次非 proxy 请求触发解析
      request("").catch(() => {});
      Taro.showToast({
        title: "登录成功",
        icon: "success",
        duration: 2000,
      });
    } else {
      Taro.showToast({
        title: "登录失败",
        icon: "error",
        duration: 2000,
      });
      return Promise.reject(new Error("登录失败"));
    }
  });
}
