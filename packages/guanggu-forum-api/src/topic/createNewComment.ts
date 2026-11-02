import Taro from "@tarojs/taro";
import { request } from "../client";
import { URLS } from "../urls";
import { getUrl } from "../utils/urls";

export interface CreateNewConmmentPayload {
  tid: string;
  content: string;
  _xsrf: string;
}

export class CommentSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentSubmissionError";
  }
}

export async function createNewComment(payload: CreateNewConmmentPayload) {
  const { tid } = payload;
  return request(getUrl(URLS.TOPIC_DETAIL, { tid }), {
    method: "POST",
    data: {
      ...payload,
    },
    header: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,application/xhtml+xml",
    },
  }).then(({ body, rawRes }) => {
    const alert = body?.querySelector(".topic-reply-create .alert") ||
      body?.querySelector(".alert-danger, .alert-warning");
    const response = alert?.text?.trim() || "";
    const moderated = response.includes("本站已开启回复审核模式");
    const duplicate = response.includes('回复重复提交');
    if (rawRes?.statusCode !== 200 || !body) {
      throw new CommentSubmissionError(response || "评论发送失败，请重试");
    }
    // An HTTP 200 reply form can contain a validation/rate-limit error.
    // Reject it so the composer keeps its text and selected images for retry.
    if (alert && !moderated && !duplicate && !alert.classList.contains("alert-success")) {
      throw new CommentSubmissionError(response || "评论发送失败，请重试");
    }
    if (!moderated && !duplicate && !body.querySelector(".topic-detail")) {
      throw new CommentSubmissionError("无法确认评论发送结果，请刷新帖子查看");
    }
    Taro.showToast({
      title: moderated ? "回复审核中" : duplicate ? '回复成功' : response || "回复成功",
      icon: "success",
      duration: 2000,
    });
    return { moderated };
  });
}
