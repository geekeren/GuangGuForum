import { describe, expect, it } from "vitest";
import { parseMentionDraft, serializeMentionDraft, updateMentionDraft } from "../mentions";

describe("comment mention tags", () => {
  it("shows reply recipient as an atomic mention separate from editable text", () => {
    expect(parseMentionDraft("@test-user 回复内容", true)).toEqual({ mentions: ["test-user"], text: "回复内容" });
  });
  it("supports multiple names and non-Latin usernames", () => {
    expect(parseMentionDraft("@小早 @user_2 内容", true)).toEqual({ mentions: ["小早", "user_2"], text: "内容" });
  });
  it("keeps partially typed mentions until whitespace or blur", () => {
    expect(parseMentionDraft("@test")).toEqual({ mentions: [], text: "@test" });
    expect(parseMentionDraft("@test", true)).toEqual({ mentions: ["test"], text: "" });
  });
  it("does not turn email addresses into mentions", () => {
    expect(parseMentionDraft("联系 test@example.com", true)).toEqual({ mentions: [], text: "联系 test@example.com" });
  });
  it("keeps existing recipients while editing or adding another tag", () => {
    expect(updateMentionDraft({ mentions: ["first"], text: "旧内容" }, "@second 新内容"))
      .toEqual({ mentions: ["first", "second"], text: "新内容" });
  });
  it("removes an entire recipient and preserves remaining text at submission", () => {
    const draft = parseMentionDraft("@first @second 回复内容", true);
    expect(serializeMentionDraft({ ...draft, mentions: draft.mentions.filter(name => name !== "first") }))
      .toBe("@second 回复内容");
    expect(serializeMentionDraft({ ...draft, mentions: [] })).toBe("回复内容");
  });
  it("does not duplicate recipients on repeated edits", () => {
    expect(updateMentionDraft({ mentions: ["first"], text: "" }, "@first 内容").mentions).toEqual(["first"]);
  });
});
