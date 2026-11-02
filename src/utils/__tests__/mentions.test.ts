import { describe, expect, it } from "vitest";
import { getMentionSegments, getCommentBody, getMentionQuery, getMentionCandidates, replaceInlineMention } from "../mentions";

describe("inline mention text and native offsets", () => {
  it("keeps recipients at their original positions without trimming whitespace or newlines", () => {
    const value = "  前文 @Alice 后文\n@小早 👍 @user_2 ";
    const parts = getMentionSegments(value);
    expect(parts.map(p => p.text).join("")).toBe(value);
    expect(parts.filter(p => p.username).map(p => p.username)).toEqual(["Alice", "小早", "user_2"]);
    for (const part of parts) expect(value.slice(part.start, part.end)).toBe(part.text);
  });
  it("leaves emails, URLs and HTML-looking text as literal text", () => {
    const value = "test@example.com https://user@example.com <script>alert(1)</script>";
    expect(getMentionSegments(value).some(p => p.username)).toBe(false);
    expect(getMentionSegments(value).map(p => p.text).join("")).toBe(value);
  });
  it("recognizes Chinese-adjacent mentions and punctuation without dropping characters", () => {
    const value = "你好@小早，看看 @Alice!";
    expect(getMentionSegments(value).filter(p => p.username).map(p => p.username)).toEqual(["小早", "Alice"]);
    expect(getMentionSegments(value).map(p => p.text).join("")).toBe(value);
    expect(getCommentBody(value)).toBe("你好，看看 !");
  });
  it("does not count recipient-only input as a comment body", () => {
    expect(getCommentBody("@Alice @Bob ").trim()).toBe("");
    expect(getCommentBody("@Alice 正文内容").trim()).toBe("正文内容");
  });
  it("inserts a selected recipient between existing text and reuses the separator", () => {
    const value = "正文 @al 后文";
    expect(replaceInlineMention(value, getMentionQuery(value, 6)!, "Alice"))
      .toEqual({ value: "正文 @Alice 后文", cursor: 10 });
  });
  it("replaces the remaining username when the caret is inside the query", () => {
    const value = "你好 @Alison 后文";
    expect(replaceInlineMention(value, getMentionQuery(value, 6)!, "Bob"))
      .toEqual({ value: "你好 @Bob 后文", cursor: 8 });
  });
  it("keeps emoji UTF-16 cursor offsets and existing recipients", () => {
    const value = "👍 @Bob @al";
    const result = replaceInlineMention(value, getMentionQuery(value)!, "Alice");
    expect(result.value).toBe("👍 @Bob @Alice ");
    expect(result.cursor).toBe(result.value.length);
  });
});

describe("mention suggestions", () => {
  it("detects the query at the caret and excludes email addresses", () => {
    expect(getMentionQuery("你好 @")).toEqual({ start: 3, end: 4, keyword: "" });
    expect(getMentionQuery("@小早 后文", 3)?.keyword).toBe("小早");
    expect(getMentionQuery("你好@")?.keyword).toBe("");
    expect(getMentionQuery("mail@example.com")).toBeNull();
    expect(getMentionQuery("@name ")).toBeNull();
  });
  it("deduplicates and excludes other recipients while filtering case-insensitively", () => {
    expect(getMentionCandidates(["Alice", "Bob", "Bob", "Bobby", ""], ["Alice"], getMentionQuery("@b")!))
      .toEqual(["Bob", "Bobby"]);
  });
});
