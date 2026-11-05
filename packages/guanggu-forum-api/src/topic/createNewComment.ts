import Taro from "@tarojs/taro";
import { request } from "../client";
import { URLS } from "../urls";
import { getUrl } from "../utils/urls";

/**
 * Upstream `gzk_mentions` binding (built by `uid-mentions-20261104.js`).
 * `start`/`end` are UTF-16 offsets into the submitted `content`; `end = start + label.length`
 * (the textarea's trailing space is not part of the range). `reply_id` is 0 unless the
 * mention targets a specific floor.
 */
export interface GzkMentionBinding {
  uid: number;
  reply_id: number;
  start: number;
  end: number;
  label: string;
}

export interface CreateNewConmmentPayload {
  tid: string;
  content: string;
  _xsrf: string;
  mentions?: GzkMentionBinding[];
}

export const MAX_GZK_MENTIONS = 16;

/** Drop malformed bindings without reordering the valid ones. */
export function sanitizeGzkMentions(mentions?: GzkMentionBinding[]): GzkMentionBinding[] {
  if (!Array.isArray(mentions)) return [];
  const sanitized: GzkMentionBinding[] = [];
  for (const binding of mentions) {
    if (!binding || typeof binding !== "object") continue;
    if (!Number.isSafeInteger(binding.uid) || binding.uid <= 0) continue;
    if (!Number.isSafeInteger(binding.reply_id) || binding.reply_id < 0) continue;
    if (!Number.isFinite(binding.start) || !Number.isFinite(binding.end)) continue;
    if (binding.end <= binding.start) continue;
    if (typeof binding.label !== "string" || !binding.label.startsWith("@")) continue;
    sanitized.push({
      uid: binding.uid,
      reply_id: binding.reply_id,
      start: binding.start,
      end: binding.end,
      label: binding.label,
    });
    if (sanitized.length >= MAX_GZK_MENTIONS) break;
  }
  return sanitized;
}

export class CommentSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommentSubmissionError";
  }
}

export async function createNewComment(payload: CreateNewConmmentPayload) {
  const { tid, mentions, ...fields } = payload;
  return request(getUrl(URLS.TOPIC_DETAIL, { tid }), {
    method: "POST",
    data: {
      ...fields,
      // The native form submits tid as well as using it in the topic URL.
      tid,
      // Upstream always submits the field, defaulting to an empty array.
      gzk_mentions: JSON.stringify(sanitizeGzkMentions(mentions)),
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
