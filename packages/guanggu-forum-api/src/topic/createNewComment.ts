import Taro from "@tarojs/taro";
import { request } from "../client"
import { URLS } from "../urls"
import { getUrl } from "../utils/urls";

export interface CreateNewConmmentPayload {
    tid: string;
    content: string;
    _xsrf: string;
}

export async function createNewConmment(payload: CreateNewConmmentPayload) {
    const { tid } = payload;
    return request(
        getUrl(URLS.TOPIC_DETAIL, { tid}), {
        method: 'POST',
        data: {
            ...payload,
        },
        header: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "text/html,application/xhtml+xml",
        }
    }).then(({ body }) => {
        Taro.showToast({
            title: body?.querySelector('.topic-reply-create .alert')?.text?.trim() || '',
            icon: 'success',
            duration: 2000
        })
    });
}