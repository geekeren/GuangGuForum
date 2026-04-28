import Taro from "@tarojs/taro";
import { request } from "../client";
import { getLoginXsrfCode } from "../login/getLoginXsrfCode";

export interface CreateTopicPayload {
  node: string;
  title: string;
  content: string;
}

export async function createTopic(payload: CreateTopicPayload) {
  const { xsrf_form } = await getLoginXsrfCode();
  return request(`/t/create/${payload.node}`, {
    method: "POST",
    data: {
      title: payload.title,
      content: payload.content,
      _xsrf: xsrf_form,
    },
    header: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
    },
  }).then(({ body }) => {
    const alert = body?.querySelector(".alert")?.text?.trim() || "";
    if (alert) {
      Taro.showToast({ title: alert, icon: "none", duration: 2000 });
    } else {
      Taro.showToast({ title: "发布成功", icon: "success", duration: 2000 });
    }
  });
}
