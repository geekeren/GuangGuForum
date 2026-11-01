import { parse } from "node-html-parser";

export interface TopicReplyTarget {
  tid?: string;
  page?: string;
  replyId?: string;
  floor?: string;
  commentMessage?: string;
}

export function decodeReplyRouteValue(value?: string): string {
  if (!value) return "";
  try { return decodeURIComponent(value); } catch { return value; }
}

export function replyPlainText(html: string): string {
  return parse(html).textContent.replace(/\s+/g, " ").trim();
}

// Only accept forum routes already used by the website/search API.
export function parseTopicReplyLink(link: string): TopicReplyTarget | undefined {
  const path = link.trim().replace(/^https?:\/\/www\.guozaoke\.com(?=\/)/i, "");
  const topic = path.match(/^\/t\/(\d+)(?:\?([^#]*))?(?:#r(\d+))?$/);
  if (topic) {
    const page = topic[2]?.split("&").map((pair) => pair.split("="))
      .find(([key]) => key === "p")?.[1];
    if (page && !/^[1-9]\d*$/.test(page)) return undefined;
    return { tid: topic[1], ...(page ? { page } : {}), ...(topic[3] ? { replyId: topic[3] } : {}) };
  }
  const reply = path.match(/^\/search\/reply\/(\d+)$/);
  return reply ? { replyId: reply[1] } : undefined;
}

export function buildTopicReplyRoute(target: TopicReplyTarget): string {
  const params = [
    ["tid", target.tid], ["p", target.page], ["replyId", target.replyId],
    ["floor", target.floor], ["commentMessage", target.commentMessage],
  ].filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value!)}`);
  return `/pages/topicDetail/index?${params.join("&")}`;
}

interface ReplyComment {
  id?: string;
  floor: string;
  content: string;
  upVoteUrl: string;
}

export function getCommentReplyId(comment: ReplyComment): string {
  const anchor = comment.id?.match(/^r(\d+)$/)?.[1];
  return anchor || comment.upVoteUrl.match(/[?&]reply_id=(\d+)(?:&|$)/)?.[1] || "";
}

export function getCommentElementId(comment: ReplyComment): string {
  const replyId = getCommentReplyId(comment);
  return replyId ? `reply-${replyId}` : `comment-${comment.floor.replace(/[^\d]/g, "")}`;
}

export function findTargetComment<T extends ReplyComment>(comments: T[], target: TopicReplyTarget): T | undefined {
  // Never jump to another reply because its prefix/floor happens to match a missing exact anchor.
  if (target.replyId) return comments.find((comment) => getCommentReplyId(comment) === target.replyId);
  if (target.floor) return comments.find((comment) => comment.floor === decodeReplyRouteValue(target.floor));
  const snippet = replyPlainText(decodeReplyRouteValue(target.commentMessage));
  if (!snippet) return undefined;
  const matches = comments.filter((comment) => replyPlainText(comment.content).startsWith(snippet));
  return matches.length === 1 ? matches[0] : undefined;
}
