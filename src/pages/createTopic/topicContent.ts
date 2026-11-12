import { serializeTopicDocumentHtml, topicMarkdownToSafeHtml, escapeTopicHtml, isSafeTopicImageUrl } from "../../utils/topicDocument";
import type { EditorSnapshot } from "./RichTopicBody";
import type { TopicAttachment } from "./TopicEditor";
import type { TopicType, TopicTypeDefinition } from "./topicTypes/registry";

import { TOPIC_TITLE_MAX_LENGTH } from "./topicConstants";

const FROM_MINI = '<hr><p><em>本帖发自<a href="https://www.guozaoke.com/t/91893">小程序</a></em></p>';

type ContentContext = {
  username: string;
  attachments: TopicAttachment[];
};
export type TopicContentInput = ContentContext & {
  title: string;
  node: string;
  topicType: TopicType;
  definition: TopicTypeDefinition;
  typeFields: Record<string, unknown>;
};
type Validation = { ok: true; html: string } | { ok: false; reason: "login" | "content"; message: string };

// A source roundtrip may retain a public image URL while dropping native attachment tags.
export function referencedAttachmentIds(snapshot: EditorSnapshot, attachments: TopicAttachment[], taggedIds: readonly string[] = []): string[] {
  const imageUrls = snapshot.document?.delta.ops.flatMap(op => typeof op.insert === "object" && typeof op.insert.image === "string" ? [op.insert.image] : []);
  const matched = attachments.flatMap(item => {
    const url = item.kind === "photo" ? item.url : item.sticker.url;
    if (!url) return [];
    const encoded = url.replace(/\(/g, "%28").replace(/\)/g, "%29");
    const referenced = imageUrls ? imageUrls.some(src => src === url || src === encoded)
      : snapshot.markdown.includes(url) || snapshot.markdown.includes(encoded);
    return referenced ? [item.id] : [];
  });
  return [...new Set([...taggedIds, ...matched])];
}

function inspectBody(snapshot: EditorSnapshot, { attachments, username }: ContentContext) {
  const serialized = snapshot.document ? serializeTopicDocumentHtml(snapshot.document.delta, { attachments, username }) : undefined;
  const ids = referencedAttachmentIds(snapshot, attachments, serialized?.referencedAttachmentIds);
  const candidates = attachments.filter(item => !item.richManaged || ids.includes(item.id));
  const invalid = !!(snapshot.errors.length || snapshot.unsupported.length || serialized?.errors.length || serialized?.unsupported.length);
  return { serialized, ids, candidates, invalid };
}

export function canPublishTopicSnapshot(snapshot: EditorSnapshot, context: ContentContext): boolean {
  const { candidates, invalid } = inspectBody(snapshot, context);
  return !!context.username && !invalid && !candidates.some(item => item.kind === "photo" && (
    item.owner !== context.username || item.phase !== "complete" || !item.url
  ));
}

export function validateTopicContent(snapshot: EditorSnapshot, input: TopicContentInput): Validation {
  const fail = (message: string): Validation => ({ ok: false, reason: "content", message });
  if (snapshot.markdown.length > 50000) return fail("正文不能超过50000字");
  const { serialized, ids, candidates, invalid } = inspectBody(snapshot, input);
  const bodyHtml = serialized?.html ?? topicMarkdownToSafeHtml(snapshot.markdown).html;
  if (invalid) return fail("正文格式或图片状态异常，请修正后再预览");
  if (!input.username) return { ok: false, reason: "login", message: "" };
  if (!input.node) return fail("请选择板块");
  if (!input.title.trim()) return fail("请输入标题");
  if (input.title.length > TOPIC_TITLE_MAX_LENGTH) return fail(`标题最多${TOPIC_TITLE_MAX_LENGTH}字，请缩短后再预览`);
  if (candidates.some(item => item.kind === "photo" && item.owner !== input.username)) return fail("图片所属账号已变化，请移除后重新上传");
  if (candidates.some(item => item.kind === "photo" && (item.phase !== "complete" || !item.url))) return fail("请等待图片上传完成，失败图片可点击重试");
  // Validate authored content before metadata/footer makes an empty document look nonempty.
  const meaningfulBody = /<img\s/i.test(bodyHtml) || bodyHtml.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160);/g, " ").trim();
  const legacyImages = candidates.some(item => !item.richManaged && (item.kind === "sticker" || item.phase === "complete"));
  if (!meaningfulBody && !legacyImages && input.topicType !== "repost") return fail("请输入内容");
  const typeError = input.definition.validate(input.typeFields);
  if (typeError) return fail(typeError);

  const body = input.definition.buildContent(input.typeFields, { title: input.title, content: bodyHtml, fromMini: "" });
  const referenced = new Set(ids);
  const images = input.attachments.flatMap(item => {
    if (item.richManaged || referenced.has(item.id)) return [];
    const url = item.kind === "sticker" ? item.sticker.url : item.phase === "complete" ? item.url : undefined;
    if (!url || !isSafeTopicImageUrl(url)) return [];
    return [`<p><img src="${escapeTopicHtml(url)}" alt="${escapeTopicHtml(item.kind === "sticker" ? item.sticker.name : "图片")}" /></p>`];
  });
  return { ok: true, html: (body + images.join("") + FROM_MINI).trim() };
}
