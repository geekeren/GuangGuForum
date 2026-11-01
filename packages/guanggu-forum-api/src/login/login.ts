import Taro from "@tarojs/taro";
import { request, getCacheService } from "../client";
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
  }).then(async () => {
    const cs = getCacheService();
    const cookies = cs.get<Record<string, unknown>>("cookies");
    if (cookies && Object.keys(cookies).length > 0) {
      // 等实时首页确认账号，避免仅有匿名 Cookie 时误报登录成功。
      const { body } = await request("");
      if (!body?.querySelector('#navbar5 .navbar-right a.avatar[href^="/u/"]')) {
        throw new Error("登录失败，请检查账号和密码");
      }
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
