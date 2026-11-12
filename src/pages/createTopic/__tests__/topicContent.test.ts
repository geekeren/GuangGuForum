import { describe, expect, it, vi } from "vitest";
import { canPublishTopicSnapshot, referencedAttachmentIds, validateTopicContent, type TopicContentInput } from "../topicContent";
import { importTopicMarkdown } from "../../../utils/topicDocument";
import type { EditorSnapshot } from "../RichTopicBody";
import type { TopicAttachment } from "../TopicEditor";

const source = (markdown = "正文"): EditorSnapshot => ({ markdown, errors: [], unsupported: [] });
const photo = (changes: Partial<Extract<TopicAttachment, { kind: "photo" }>> = {}): TopicAttachment => ({
  id: "photo", kind: "photo", path: "wxfile://p", owner: "tester", phase: "complete", progress: 100,
  url: "https://img.test/photo.jpg", ...changes,
});
function input(changes: Partial<TopicContentInput> = {}): TopicContentInput {
  return {
    username: "tester", title: "标题", node: "water", topicType: "normal", typeFields: {}, attachments: [],
    definition: {
      key: "normal", label: "普通", node: null, initialFields: {}, validate: () => null,
      buildContent: (_, shared) => shared.content, renderForm: () => null,
    }, ...changes,
  };
}
function html(snapshot: EditorSnapshot, context: TopicContentInput) {
  const result = validateTopicContent(snapshot, context);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  return result.html;
}

describe("topic authored body validation and attachment composition", () => {
  it("uses native Delta instead of Markdown and appends each independent image and the footer exactly once", () => {
    const snapshot = { ...source("not final"), document: { version: 1 as const, delta: { ops: [{ insert: "正文" }, { insert: { image: "https://img.test/photo.jpg" } }, { insert: "\n" }] } } };
    const result = html(snapshot, input({ attachments: [photo(), photo({ id: "tail", url: "https://img.test/tail.jpg" })] }));
    expect(result).not.toContain("not final"); expect(result.match(/<img\s/g)).toHaveLength(2);
    expect(result.split("https://img.test/photo.jpg")).toHaveLength(2);
    expect(result.match(/本帖发自/g)).toHaveLength(1);
    expect(result.indexOf("https://img.test/tail.jpg")).toBeLessThan(result.indexOf("本帖发自"));
  });

  it("retains URL ownership checks after source/native roundtrips lose attachment tags, including encoded parentheses", () => {
    const attachment = photo({ richManaged: true, url: "https://img.test/p(1).jpg" });
    const markdown = "![图片](https://img.test/p%281%29.jpg)";
    const snapshot = { ...source(markdown), document: { version: 1 as const, delta: importTopicMarkdown(markdown).delta } };
    expect(referencedAttachmentIds(snapshot, [attachment])).toEqual(["photo"]);
    expect(html(snapshot, input({ attachments: [attachment] })).match(/<img\s/g)).toHaveLength(1);
    expect(validateTopicContent(snapshot, input({ username: "other", attachments: [attachment] }))).toMatchObject({ ok: false, message: "图片所属账号已变化，请移除后重新上传" });
  });

  it("never resurrects removed managed images, but lets a completed independent image supply an otherwise empty body", () => {
    const managed = photo({ richManaged: true, phase: "failed", url: undefined });
    expect(html(source(), input({ attachments: [managed] }))).not.toContain("<img ");
    expect(html(source(""), input({ attachments: [photo()] }))).toContain("<img ");
    expect(validateTopicContent(source(""), input({ attachments: [photo({ richManaged: true })] }))).toMatchObject({ ok: false, message: "请输入内容" });
  });

  it.each([
    ["title", { title: " " }, "请输入标题"],
    ["title length", { title: "字".repeat(51) }, "标题最多50字，请缩短后再预览"],
    ["node", { node: "" }, "请选择板块"],
    ["ownership", { attachments: [photo({ owner: "other" })] }, "图片所属账号已变化，请移除后重新上传"],
    ["pending upload", { attachments: [photo({ phase: "uploading" })] }, "请等待图片上传完成，失败图片可点击重试"],
  ] as const)("rejects %s before building final HTML", (_, changes, message) => {
    expect(validateTopicContent(source(), input(changes as Partial<TopicContentInput>))).toMatchObject({ ok: false, reason: "content", message });
  });

  it("rejects malformed/unsupported snapshots and overlong authored content", () => {
    expect(validateTopicContent({ ...source(), errors: ["invalid"] }, input())).toMatchObject({ ok: false, message: "正文格式或图片状态异常，请修正后再预览" });
    expect(canPublishTopicSnapshot({ ...source(), unsupported: ["format"] }, input())).toBe(false);
    expect(validateTopicContent(source("字".repeat(50001)), input())).toMatchObject({ ok: false, message: "正文不能超过50000字" });
    const invalidImage = { ...source(), document: { version: 1 as const, delta: { ops: [{ insert: { image: "wxfile://local" } }, { insert: "\n" }] } } };
    expect(canPublishTopicSnapshot(invalidImage, input())).toBe(false);
  });

  it("validates type fields before metadata/footer can make an empty authored body publishable, retaining the repost exception", () => {
    const context = input();
    const build = vi.fn(context.definition.buildContent);
    const validate = vi.fn().mockReturnValue("请填写原文链接");
    context.definition = { ...context.definition, buildContent: build, validate };
    expect(validateTopicContent(source(""), context)).toMatchObject({ ok: false, message: "请输入内容" });
    expect(validate).not.toHaveBeenCalled(); expect(build).not.toHaveBeenCalled();
    context.topicType = "repost";
    expect(validateTopicContent(source(""), context)).toMatchObject({ ok: false, message: "请填写原文链接" });
    expect(validate).toHaveBeenCalledExactlyOnceWith(context.typeFields);
    validate.mockReturnValue(null); expect(html(source(""), context)).toContain("本帖发自");
    expect(build).toHaveBeenCalledOnce();
  });
});
