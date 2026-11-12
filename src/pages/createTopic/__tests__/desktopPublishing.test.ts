import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { createTopic } from "guanggu-forum-api";
import CreateTopic from "..";
import { createNativeTestRenderer } from "../../../components/DesktopLayout/__tests__/nativeTestRenderer";

const h = vi.hoisted(() => ({
  viewport: { width: 1023, height: 768, isDesktop: false }, listeners: new Set<() => void>(),
  mounts: 0, unmounts: 0, editor: undefined as any, snapshots: 0,
}));
vi.mock("../../../hooks/usePageScope", async () => {
  const taroModule = await import("@tarojs/taro");
  const taro = taroModule.default;
  const useRouter = "useRouter" in taroModule ? taroModule.useRouter : undefined;
  const { legacyPageScopeMock } = await import("../../../testSupport/legacyPageScopeMock");
  return legacyPageScopeMock(taro, useRouter);
});
vi.mock("../../../hooks/useViewport", async () => {
  const ReactModule = await import("react");
  return { useViewport: () => ReactModule.useSyncExternalStore(listener => { h.listeners.add(listener); return () => { h.listeners.delete(listener); }; }, () => h.viewport) };
});
vi.mock("../../../hooks/usePageRenderer", () => ({ usePageRenderer: () => "webview", usePageScrollViewType: () => undefined }));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", ScrollView: "ScrollView", Image: "Image", Picker: "Picker", Radio: "Radio", RadioGroup: "RadioGroup" }));
vi.mock("@tarojs/taro", () => ({
  default: { useDidHide: () => {}, useUnload: () => {}, getSystemInfoSync: () => ({ statusBarHeight: 20 }), hideKeyboard: () => Promise.resolve(), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), navigateBack: vi.fn(), eventCenter: { trigger: vi.fn() } },
  useRouter: () => ({ params: {} }),
}));
vi.mock("guanggu-forum-api", () => ({ createTopic: vi.fn().mockResolvedValue(undefined), fetchLinkSummary: vi.fn() }));
vi.mock("../../../utils/nodeNavigation", () => ({ getCachedNodeNavigation: () => [], fetchAndCacheNodeNavigation: () => Promise.resolve([]) }));
vi.mock("../../../utils/currentUser", () => ({ getCachedUsername: () => "tester" }));
vi.mock("../../../utils/auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../../../utils/CacheService", () => ({ CacheCategory: { Topic: "topic" }, cacheService: { get: () => null, set: vi.fn(), remove: vi.fn() } }));
vi.mock("../../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../../components/SearchEntry", () => ({ default: "SearchEntry" }));
vi.mock("../../../components/ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../../components/NodePicker", () => ({ default: "NodePicker" }));
vi.mock("../../../components/LinkPreviewCard", () => ({ default: "LinkPreviewCard" }));
vi.mock("../../../components/LinkPreviewCard/Header", () => ({ LinkPreviewHeader: "LinkPreviewHeader" }));
vi.mock("../../../components/ClearableInput", () => ({ ClearableInput: "ClearableInput", ClearableTextarea: "ClearableTextarea" }));
vi.mock("../TopicTitle", async () => {
  const ReactModule = await import("react");
  return { default: (props: any) => ReactModule.createElement("TitleInput", props) };
});
vi.mock("../TopicEditor", async () => {
  const ReactModule = await import("react");
  return { restoreTopicAttachments: () => [], default: class NativeEditorProbe extends ReactModule.Component<any> {
    state = { markdown: "未提交正文" };
    controller = { aborted: false };
    componentDidMount() {
      h.editor = this; h.mounts++;
      this.props.inputRef.current = { snapshot: async () => { h.snapshots++; return { markdown: this.state.markdown, errors: [], unsupported: [] }; }, dismissTools: () => {} };
    }
    componentWillUnmount() { h.unmounts++; this.controller.aborted = true; }
    render() { return ReactModule.createElement("NativeEditor", { ...this.props, ...this.state }); }
  } };
});
function descendants(node: any): any[] { return [node, ...(node.children || []).flatMap(descendants)]; }
beforeEach(() => { h.viewport = { width: 1023, height: 768, isDesktop: false }; h.listeners.clear(); h.mounts = 0; h.unmounts = 0; h.editor = undefined; h.snapshots = 0; vi.clearAllMocks(); });
it("keeps the native editor/controller alive across PC/mobile resize and submits only the confirmed HTML without automatic snapshots", async () => {
  const renderer = createNativeTestRenderer(); renderer.render(React.createElement(CreateTopic));
  const editor = h.editor;
  renderer.flush(() => {
    descendants(renderer.container).find(node => node.type === "TitleInput").props.onInput("真实标题");
    editor.props.onChange("正文事件快照");
  });
  for (const width of [1024, 1200, 1023]) {
    renderer.flush(() => { h.viewport = { width, height: 900, isDesktop: width >= 1024 }; h.listeners.forEach(listener => listener()); });
    expect(h.editor).toBe(editor); expect(editor.controller.aborted).toBe(false); expect(h.snapshots).toBe(0);
  }
  await descendants(renderer.container).find(node => node.props?.className === "previewBtn").props.onClick();
  renderer.flush(() => {});
  const html = descendants(renderer.container).find(node => node.type === "HtmlRender").props.html;
  renderer.flush(() => { h.viewport = { width: 1280, height: 900, isDesktop: true }; h.listeners.forEach(listener => listener()); });
  expect(descendants(renderer.container).filter(node => node.type === "HtmlRender")).toHaveLength(1);
  expect(descendants(renderer.container).find(node => node.type === "HtmlRender").props.html).toBe(html);
  expect(h.editor).toBe(editor); expect(h.mounts).toBe(1); expect(h.unmounts).toBe(0); expect(h.snapshots).toBe(1);
  renderer.flush(() => { h.viewport = { width: 375, height: 800, isDesktop: false }; h.listeners.forEach(listener => listener()); });
  await descendants(renderer.container).find(node => node.props?.className === "topicPreviewPublish").props.onClick();
  expect(createTopic).toHaveBeenCalledExactlyOnceWith({ node: "water", title: "真实标题", content: html });
  renderer.unmount(); expect(editor.controller.aborted).toBe(true); expect(h.unmounts).toBe(1);
});
