import { cacheService, CacheCategory } from "../../utils/CacheService";
import type { TopicDocument } from "../../utils/topicDocument";
import type { TopicAttachment } from "./TopicEditor";
import type { TopicType } from "./topicTypes/registry";

export const LAST_NODE_KEY = "last_selected_node";
export const LAST_DRAFT_KEY = "topic_draft_last";

export type DraftLocation = { topicType: TopicType; nodeSlug: string };
export type TopicDraft = {
  savedAt?: string;
  title: string;
  content: string;
  document?: TopicDocument;
  typeFields: Record<string, unknown>;
  attachments?: unknown;
};
type DraftInput = DraftLocation & Omit<TopicDraft, "savedAt" | "attachments"> & { attachments: TopicAttachment[] };

export function getDraftKey(type: TopicType, nodeSlug: string): string {
  return `topic_draft_${type}_${nodeSlug}`;
}

export function hasDraftContent(title: string, content: string, fields: Record<string, unknown>): boolean {
  return !!(title || content) || Object.values(fields).some(value => typeof value === "string" && !!value.trim());
}

export function readTopicDraft(key: string): TopicDraft | null {
  return cacheService.get<TopicDraft>(key);
}

export function readLastDraftLocation(): DraftLocation {
  const saved = cacheService.get<DraftLocation>(LAST_DRAFT_KEY);
  const topicType = saved && ["normal", "repost", "event", "dating"].includes(saved.topicType) ? saved.topicType : "normal";
  return { topicType, nodeSlug: saved?.nodeSlug || "water" };
}

export function rememberDraftLocation(location: DraftLocation): void {
  cacheService.set(LAST_DRAFT_KEY, location, { category: CacheCategory.Topic });
}

export function saveTopicDraft({ topicType, nodeSlug, ...draft }: DraftInput, remember = true): void {
  const savedAt = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  cacheService.set(getDraftKey(topicType, nodeSlug), { savedAt, ...draft }, { category: CacheCategory.Topic });
  if (remember) rememberDraftLocation({ topicType, nodeSlug });
}

export function removeTopicDraft(key: string, forgetLocation = true): void {
  cacheService.remove(key);
  if (forgetLocation) cacheService.remove(LAST_DRAFT_KEY);
}

export function readLastSelectedNode(): string | undefined {
  return cacheService.get<{ slug: string }>(LAST_NODE_KEY)?.slug;
}

export function rememberSelectedNode(slug: string): void {
  cacheService.set(LAST_NODE_KEY, { slug }, { category: CacheCategory.Topic });
}
