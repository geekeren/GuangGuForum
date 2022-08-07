import Taro from "@tarojs/taro";
import { request } from "../client"
import { URLS } from "../urls"
import { getLoginXsrfCode } from "./getLoginXsrfCode";


export interface LoginPayload {
    email: string;
    password: string;
}

export async function login(payload: LoginPayload) {
    const { xsrf_form } = await getLoginXsrfCode();
    return request(URLS.Login, {
        method: 'POST',
        useProxy: true,
        data: {
            ...payload,
            _xsrf: xsrf_form,
        },
        header: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "text/html,application/xhtml+xml",
            Referer: `${URLS.ROOT_URL}`
        }
    }).then(({ data }) => {
        if (data?.location) {
            Taro.showToast({
                title: '登录成功',
                icon: 'success',
                duration: 2000
            })
        } else {
            Taro.showToast({
                title: '登录失败',
                icon: 'error',
                duration: 2000
            })
        }
    });
}