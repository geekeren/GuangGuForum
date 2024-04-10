import Taro from "@tarojs/taro";
import { request } from "../client"
import { URLS } from "../urls"
import { getUrl } from "../utils/urls";

export interface CreateNewConmmentPayload {
    tid: string;
    content: string;
    _xsrf: string;
}

export async function createNewComment(payload: CreateNewConmmentPayload) {
    console.log('createNewComment');
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
      let response = body?.querySelector('.topic-reply-create .alert')?.text?.trim() || '';
      if(response.includes('本站已开启回复审核模式')) {
        response = '回复审核中'
      }
      console.log('response', response);
        Taro.showToast({
            title: response,
            icon: 'success',
            duration: 2000
        })
    });
}
