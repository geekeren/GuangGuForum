import { describe, expect, it } from "vitest";
import {
  buildTopicReplyRoute, decodeReplyRouteValue, findTargetComment, getCommentElementId,
  getCommentReplyId, parseTopicReplyLink, replyPlainText,
} from "../topicReplyRoute";

const comments = [
  { id: "r456", floor: "#4", content: "<p>@alice 相同的前十个字后面不同甲</p>", upVoteUrl: "/replyVote?reply_id=456" },
  { id: "r789", floor: "#5", content: "<p>@alice 相同的前十个字后面不同乙</p>", upVoteUrl: "/replyVote?reply_id=789" },
];

describe("notification reply routes", () => {
  it("keeps topic id, page and exact reply anchor separate", () => {
    const target = parseTopicReplyLink("/t/123?p=2#r789");
    expect(target).toEqual({ tid: "123", page: "2", replyId: "789" });
    expect(buildTopicReplyRoute(target!)).toBe("/pages/topicDetail/index?tid=123&p=2&replyId=789");
    expect(parseTopicReplyLink("https://www.guozaoke.com/t/123?p=3#r456")).toEqual({ tid: "123", page: "3", replyId: "456" });
    expect(parseTopicReplyLink("/t/123?foo=bar&p=2#r789")).toEqual(target);
  });
  it("recognizes the existing upstream reply-specific route without inventing tid", () => {
    expect(parseTopicReplyLink("/search/reply/789")).toEqual({ replyId: "789" });
    expect(parseTopicReplyLink("/t/123")).toEqual({ tid: "123" });
    for (const path of ["/t/123?p=oops#r789", "/t/123?p=0", "/t/abc", "/t/123#unknown", "https://example.com/t/123", "/reply/789"]) {
      expect(parseTopicReplyLink(path)).toBeUndefined();
    }
  });
  it("preserves fallback text rather than truncating or corrupting percent signs", () => {
    const text = replyPlainText("<p>@alice &amp; 100%&nbsp;完成\n继续</p>");
    expect(text).toBe("@alice & 100% 完成 继续");
    const route = buildTopicReplyRoute({ tid: "123", commentMessage: text });
    expect(decodeReplyRouteValue(route.split("commentMessage=")[1])).toBe(text);
    expect(decodeReplyRouteValue("100%完成")).toBe("100%完成");
  });
});

describe("exact comment selection", () => {
  it("prioritizes reply identity over floor and duplicate snippets regardless of sort", () => {
    expect(findTargetComment([...comments].reverse(), { replyId: "789", floor: "#4", commentMessage: "@alice" })).toBe(comments[1]);
    expect(getCommentElementId(comments[1])).toBe("reply-789");
  });
  it("uses vote reply id for older cached comments without the parsed HTML id", () => {
    const old = { ...comments[1], id: undefined };
    expect(getCommentReplyId(old)).toBe("789");
    expect(findTargetComment([old], { replyId: "789" })).toBe(old);
  });
  it("does not silently select another reply when the precise anchor is deleted or absent", () => {
    expect(findTargetComment(comments, { replyId: "999", floor: "#4", commentMessage: "@alice" })).toBeUndefined();
  });
  it("uses encoded floor or unique normalized text only as a legacy fallback", () => {
    expect(findTargetComment(comments, { floor: "%235" })).toBe(comments[1]);
    expect(findTargetComment(comments, { commentMessage: encodeURIComponent("@alice 相同的前十个字后面不同乙") })).toBe(comments[1]);
    expect(findTargetComment(comments, { commentMessage: "@alice" })).toBeUndefined();
    expect(findTargetComment(comments, {})).toBeUndefined();
    expect(getCommentElementId({ ...comments[0], id: undefined, upVoteUrl: "" })).toBe("comment-4");
  });
});
