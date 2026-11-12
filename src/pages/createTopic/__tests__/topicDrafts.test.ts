import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService, CacheCategory } from "../../../utils/CacheService";
import {
  getDraftKey, hasDraftContent, LAST_DRAFT_KEY, LAST_NODE_KEY,
  readLastDraftLocation, readLastSelectedNode, readTopicDraft, rememberSelectedNode,
  removeTopicDraft, saveTopicDraft,
} from "../topicDrafts";
import type { TopicType } from "../topicTypes/registry";

const storage = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../../../hooks/usePageScope", async () => {
  const taroModule = await import("@tarojs/taro");
  const taro = taroModule.default;
  const useRouter = "useRouter" in taroModule ? taroModule.useRouter : undefined;
  const { legacyPageScopeMock } = await import("../../../testSupport/legacyPageScopeMock");
  return legacyPageScopeMock(taro, useRouter);
});
vi.mock("../../../utils/CacheService", () => ({
  CacheCategory: { Topic: "topic" },
  cacheService: {
    get: vi.fn((key: string) => storage.get(key) ?? null),
    set: vi.fn((key: string, value: unknown) => { storage.set(key, value); }),
    remove: vi.fn((key: string) => { storage.delete(key); }),
  },
}));
beforeEach(() => { storage.clear(); vi.clearAllMocks(); });
describe("topic draft storage adapter", () => {
  it.each(["normal", "repost", "event", "dating"] as TopicType[])("retains the %s draft key and Topic category", topicType => {
    const document = { version: 1 as const, delta: { ops: [{ insert: "正文\n" }] } };
    saveTopicDraft({ topicType, nodeSlug: "node", title: "标题", content: "正文", document, typeFields: { field: "value" }, attachments: [] });
    expect(getDraftKey(topicType, "node")).toBe(`topic_draft_${topicType}_node`);
    expect(readTopicDraft(getDraftKey(topicType, "node"))).toMatchObject({ title: "标题", content: "正文", document, typeFields: { field: "value" }, attachments: [], savedAt: expect.any(String) });
    expect(cacheService.set).toHaveBeenLastCalledWith(LAST_DRAFT_KEY, { topicType, nodeSlug: "node" }, { category: CacheCategory.Topic });
    expect(readLastDraftLocation()).toEqual({ topicType, nodeSlug: "node" });
  });

  it("isolates drafts by type and node while saving or deleting without replacing active metadata", () => {
    saveTopicDraft({ topicType: "normal", nodeSlug: "water", title: "原帖", content: "正文", typeFields: {}, attachments: [] });
    saveTopicDraft({ topicType: "event", nodeSlug: "activity", title: "活动", content: "描述", typeFields: {}, attachments: [] }, false);
    expect(readLastDraftLocation()).toEqual({ topicType: "normal", nodeSlug: "water" });
    removeTopicDraft(getDraftKey("event", "activity"), false);
    expect(readTopicDraft(getDraftKey("normal", "water"))?.title).toBe("原帖");
    expect(storage.has(LAST_DRAFT_KEY)).toBe(true);
    removeTopicDraft(getDraftKey("normal", "water"));
    expect(storage.has(LAST_DRAFT_KEY)).toBe(false);
  });

  it("keeps the remembered node independent of active draft cleanup and safely defaults missing/invalid types", () => {
    expect(readLastDraftLocation()).toEqual({ topicType: "normal", nodeSlug: "water" });
    storage.set(LAST_DRAFT_KEY, { topicType: "unknown", nodeSlug: "custom" });
    expect(readLastDraftLocation()).toEqual({ topicType: "normal", nodeSlug: "custom" });
    rememberSelectedNode("custom"); removeTopicDraft("missing");
    expect(readLastSelectedNode()).toBe("custom");
    expect(cacheService.set).toHaveBeenCalledWith(LAST_NODE_KEY, { slug: "custom" }, { category: CacheCategory.Topic });
  });

  it("uses the same title/body/typed-field presence rule, without treating unrelated numeric metadata as authored text", () => {
    expect(hasDraftContent("", "", {})).toBe(false);
    expect(hasDraftContent("", "", { location: "  ", count: 10 })).toBe(false);
    expect(hasDraftContent("", "", { location: " 武汉 " })).toBe(true);
    expect(hasDraftContent("标题", "", {})).toBe(true);
    expect(hasDraftContent("", "正文", {})).toBe(true);
  });
});
