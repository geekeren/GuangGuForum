import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { createTopic } from "guanggu-forum-api";
import { openLoginModal } from "../../../utils/auth";
import { useTopicPublishing } from "../useTopicPublishing";
import type { TopicAttachment } from "../TopicEditor";
import type { EditorSnapshot } from "../RichTopicBody";
import type { TopicTypeDefinition } from "../topicTypes/registry";

const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], cleanups: [] as (() => void)[],
  stateCursor: 0, refCursor: 0, initial: true, username: "tester",
}));
vi.mock("../../../hooks/usePageScope", async () => {
  const taroModule = await import("@tarojs/taro");
  const taro = taroModule.default;
  const useRouter = "useRouter" in taroModule ? taroModule.useRouter : undefined;
  const { legacyPageScopeMock } = await import("../../../testSupport/legacyPageScopeMock");
  return legacyPageScopeMock(taro, useRouter);
});
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (value: unknown) => { h.states[index] = value; }];
  },
  useRef(initial: unknown) {
    return h.refs[h.refCursor++] ??= { current: initial };
  },
  useEffect(effect: () => () => void) { if (h.initial) h.cleanups.push(effect()); },
}));
vi.mock("@tarojs/taro", () => ({ default: {
  hideKeyboard: vi.fn().mockResolvedValue(undefined), showToast: vi.fn(),
  showLoading: vi.fn(), hideLoading: vi.fn(), navigateBack: vi.fn(), eventCenter: { trigger: vi.fn() },
} }));
vi.mock("guanggu-forum-api", () => ({ createTopic: vi.fn() }));
vi.mock("../../../utils/currentUser", () => ({ getCachedUsername: () => h.username }));
vi.mock("../../../utils/auth", () => ({ openLoginModal: vi.fn() }));
const definition: TopicTypeDefinition = {
  key: "normal", label: "普通", node: null, initialFields: {}, validate: () => null,
  buildContent: (_, shared) => shared.content, renderForm: () => null,
};
const snapshot = (markdown = "正文"): EditorSnapshot => ({ markdown, errors: [], unsupported: [] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function makeInput() {
  return {
    title: " 标题 ", node: "water", nodeName: "水区", topicType: "normal" as const, definition,
    typeFields: {}, attachments: [] as TopicAttachment[], draftKey: "topic_draft_normal_water",
    readSnapshot: vi.fn<() => Promise<EditorSnapshot> | undefined>().mockResolvedValue(snapshot()),
    onSnapshot: vi.fn(), dismissTools: vi.fn(), onPublished: vi.fn(),
  };
}
let input: ReturnType<typeof makeInput>;
function RenderPublishing() {
  h.stateCursor = h.refCursor = 0;
  const hook = useTopicPublishing(input);
  h.initial = false;
  return hook;
}
function unmount() { h.cleanups.forEach(cleanup => cleanup()); }
beforeEach(() => {
  h.states = []; h.refs = []; h.cleanups = []; h.initial = true; h.username = "tester";
  vi.clearAllMocks(); vi.useFakeTimers();
  vi.mocked(createTopic).mockResolvedValue(undefined);
  input = makeInput();
});
afterEach(() => vi.useRealTimers());

describe("topic preview and publication lifecycle", () => {
  it("locks native reads and form transitions before awaiting a snapshot", async () => {
    const native = deferred<EditorSnapshot>(); input.readSnapshot.mockReturnValue(native.promise);
    const hook = RenderPublishing();
    const request = hook.handleSubmit();
    await hook.handleSubmit();
    const transition = vi.fn(); await hook.withSnapshot(transition);
    expect(input.readSnapshot).toHaveBeenCalledOnce(); expect(hook.isBusy()).toBe(true);
    native.resolve(snapshot("最新正文")); await request;
    expect(transition).not.toHaveBeenCalled();
    expect(input.onSnapshot).toHaveBeenCalledWith(snapshot("最新正文"));
    expect(RenderPublishing().previewContent).toContain("最新正文");
    expect(input.dismissTools).toHaveBeenCalledOnce();
  });

  it("holds the transition lock through synchronous actions and releases it even if the action fails", async () => {
    const hook = RenderPublishing(); const nested = vi.fn();
    await hook.withSnapshot(() => {
      void hook.withSnapshot(nested); void hook.handleSubmit();
      expect(hook.isBusy()).toBe(true);
      throw new Error("transition");
    });
    expect(nested).not.toHaveBeenCalled(); expect(input.readSnapshot).toHaveBeenCalledOnce();
    expect(hook.isBusy()).toBe(false);
    await hook.withSnapshot(nested); expect(nested).toHaveBeenCalledOnce();
  });

  it("submits only the captured preview title/node/HTML and serializes duplicate confirmations", async () => {
    const api = deferred<void>(); vi.mocked(createTopic).mockReturnValue(api.promise);
    let hook = RenderPublishing(); await hook.handleSubmit(); hook = RenderPublishing();
    const html = hook.previewContent;
    input = { ...input, title: "变更的标题", node: "new-node", draftKey: "topic_draft_normal_new-node" };
    hook = RenderPublishing();
    const first = hook.confirmSubmit(); await hook.confirmSubmit(); await hook.handleSubmit();
    expect(createTopic).toHaveBeenCalledExactlyOnceWith({ title: "标题", node: "water", content: html });
    expect(RenderPublishing().submitting).toBe(true);
    api.resolve(); await first;
    expect(input.onPublished).toHaveBeenCalledExactlyOnceWith("topic_draft_normal_water");
    expect(Taro.eventCenter.trigger).toHaveBeenCalledExactlyOnceWith("refreshTopics");
    expect(Taro.navigateBack).toHaveBeenCalledOnce();
    expect(RenderPublishing().canSaveDraft()).toBe(false);
    await RenderPublishing().handleSubmit(); await RenderPublishing().confirmSubmit();
    expect(createTopic).toHaveBeenCalledOnce();
  });

  it("releases publish/read locks after failures and retains drafts for retry", async () => {
    input.readSnapshot.mockRejectedValueOnce(new Error("native"));
    const hook = RenderPublishing(); await hook.handleSubmit();
    expect(hook.isBusy()).toBe(false);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "正文读取失败，请点击正文后重试", icon: "none" });
    await hook.handleSubmit();
    vi.mocked(createTopic).mockRejectedValueOnce(new Error("network"));
    await hook.confirmSubmit();
    expect(input.onPublished).not.toHaveBeenCalled(); expect(hook.canSaveDraft()).toBe(true);
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "发布失败", icon: "none" });
    await hook.handleSubmit(); await hook.confirmSubmit();
    expect(createTopic).toHaveBeenCalledTimes(2); expect(input.onPublished).toHaveBeenCalledOnce();
  });

  it("keeps the 250ms close animation idempotent and prevents its timer closing a new preview", async () => {
    const hook = RenderPublishing(); await hook.handleSubmit();
    hook.closePreview(); hook.closePreview();
    expect(RenderPublishing().previewClosing).toBe(true);
    vi.advanceTimersByTime(249); expect(RenderPublishing().previewContent).not.toBeNull();
    input.readSnapshot.mockResolvedValue(snapshot("第二次正文"));
    await RenderPublishing().handleSubmit();
    vi.advanceTimersByTime(1);
    expect(RenderPublishing()).toMatchObject({ previewClosing: false });
    expect(RenderPublishing().previewContent).toContain("第二次正文");
    RenderPublishing().closePreview(); vi.advanceTimersByTime(250);
    expect(RenderPublishing()).toMatchObject({ previewClosing: false, previewContent: null });
    expect(RenderPublishing().isBusy()).toBe(false);
  });

  it.each(["other", ""])("blocks account changes (%s) between preview and confirmation", async username => {
    const hook = RenderPublishing(); await hook.handleSubmit(); h.username = username;
    await hook.confirmSubmit();
    expect(createTopic).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "登录或图片状态已变化，请重新预览", icon: "none" });
    vi.advanceTimersByTime(250); expect(RenderPublishing().previewContent).toBeNull();
  });

  it.each(["owner", "upload"] as const)("checks current attachment %s again immediately before POST", async change => {
    const attachment: TopicAttachment = { id: "photo", kind: "photo", owner: "tester", path: "wxfile://p", url: "https://img.test/p.jpg", phase: "complete", progress: 100 };
    input.attachments = [attachment];
    const hook = RenderPublishing(); await hook.handleSubmit();
    input = { ...input, attachments: [{ ...attachment, ...(change === "owner" ? { owner: "other" } : { phase: "failed" as const }) }] };
    await RenderPublishing().confirmSubmit();
    expect(createTopic).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenLastCalledWith({ title: "登录或图片状态已变化，请重新预览", icon: "none" });
  });

  it("cancels an outstanding close animation on unmount without changing disposed preview state", async () => {
    const hook = RenderPublishing(); await hook.handleSubmit(); hook.closePreview();
    const preview = RenderPublishing().previewContent;
    expect(vi.getTimerCount()).toBe(1); unmount();
    expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(250);
    expect(RenderPublishing().previewContent).toBe(preview);
    expect(input.onPublished).not.toHaveBeenCalled();
  });

  it("opens login instead of previewing for an unauthenticated editor", async () => {
    h.username = ""; await RenderPublishing().handleSubmit();
    expect(openLoginModal).toHaveBeenCalledOnce(); expect(RenderPublishing().previewContent).toBeNull();
    expect(createTopic).not.toHaveBeenCalled();
  });

  it("rejects a stale native read and late saves after a body boundary changes", async () => {
    const native = deferred<EditorSnapshot>(); input.readSnapshot.mockReturnValue(native.promise);
    const hook = RenderPublishing(); const atBoundary = hook.getBoundary();
    const request = hook.handleSubmit(); hook.invalidateBody(); hook.setBodySnapshot(snapshot("新的草稿"));
    native.resolve(snapshot("过期正文")); await request;
    expect(RenderPublishing().previewContent).toBeNull(); expect(input.onSnapshot).not.toHaveBeenCalled();
    expect(hook.getBodySnapshot().markdown).toBe("新的草稿");
    expect(hook.canSaveDraft(atBoundary)).toBe(false);
  });

  it("ignores snapshots resolved after unmounting", async () => {
    const native = deferred<EditorSnapshot>(); input.readSnapshot.mockReturnValue(native.promise);
    const hook = RenderPublishing(); const request = hook.handleSubmit(); unmount();
    native.resolve(snapshot()); await request;
    expect(input.onSnapshot).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
    expect(RenderPublishing().previewContent).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not navigate, mutate form/drafts, or report errors after an unmounted API result", async () => {
    const api = deferred<void>(); vi.mocked(createTopic).mockReturnValue(api.promise);
    const hook = RenderPublishing(); await hook.handleSubmit(); const publish = hook.confirmSubmit(); unmount();
    api.resolve(); await publish;
    expect(input.onPublished).not.toHaveBeenCalled(); expect(Taro.navigateBack).not.toHaveBeenCalled();
    expect(Taro.hideLoading).toHaveBeenCalledOnce(); expect(hook.canSaveDraft()).toBe(false);
  });
});
