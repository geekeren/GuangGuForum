import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro from "@tarojs/taro";
import Search from "../../pages/search";
import CreateTopic from "../../pages/createTopic";
import Login from "../../pages/login";
import LinkPreview from "../../pages/linkPreview";
import Settings from "../../pages/settings";
import Me from "../../pages/me";
import UserProfileDetail from "../../components/UserProfileDetail";
import LoginPrompt from "../../components/LoginPrompt";
import { LinkPreviewHeader } from "../../components/LinkPreviewCard/Header";
import { ClearableInput, ClearableTextarea } from "../../components/ClearableInput";
import repostDef from "../../pages/createTopic/topicTypes/repost";

// Same lightweight hook/tree harness as searchPage.test.ts: no native renderer is simulated.
const harness = vi.hoisted(() => ({
  state: [] as any[], cursor: 0, refs: [] as any[], refCursor: 0,
  profile: undefined as any, username: "tester", loginError: undefined as any, checkingLogin: false,
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<any>(),
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => {
      harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next;
    }];
  },
  useRef: (initial: any) => {
    const index = harness.refCursor++;
    if (!(index in harness.refs)) harness.refs[index] = { current: initial };
    return harness.refs[index];
  },
  useEffect: vi.fn(),
  useMemo: (compute: () => any) => compute(),
  forwardRef: (render: any) => (props: any) => render(props, null),
}));
vi.mock("@tarojs/components", () => Object.fromEntries(
  ["RootPortal", "View", "Text", "Image", "Input", "Textarea", "Button", "Picker", "ScrollView", "Radio", "RadioGroup"].map(name => [name, name]),
));
vi.mock("@tarojs/taro", () => ({
  default: { useShareAppMessage: vi.fn(), useDidShow: vi.fn(), hideKeyboard: vi.fn(), navigateTo: vi.fn(), showToast: vi.fn(), getWindowInfo: () => ({ windowWidth: 430, windowHeight: 932 }) },
  useRouter: () => ({ params: { url: encodeURIComponent("https://example.com/article") } }),
}));
vi.mock("guanggu-forum-api", () => ({
  searchTopics: vi.fn(), getSearchNodes: vi.fn(), resolveSearchNode: vi.fn(), resolveSearchResult: vi.fn(),
  getUserProfile: vi.fn(), getUserFavorites: vi.fn(), fetchLinkSummary: vi.fn(), createTopic: vi.fn(), login: vi.fn(), logout: vi.fn(),
  URLS: {}, urlPathVaiable: () => () => ({ params: {} }),
}));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/NodePicker", () => ({ default: "NodePicker" }));
vi.mock("../../components/BottomSheet", () => ({ default: "BottomSheet" }));
vi.mock("../../components/SearchHotTopics", () => ({ default: "SearchHotTopics" }));
vi.mock("../../components/MarkdownRender", () => ({ default: "MarkdownRender" }));
vi.mock("../../components/Loading", () => ({ default: "Loading" }));
vi.mock("../../components/Tag", () => ({ default: "Tag" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide", checkMiniProgramAdded: vi.fn() }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../../hooks/useSearchPlaceholder", () => ({ useSearchPlaceholder: () => ({ placeholder: "热议标题" }) }));
vi.mock("../../hooks/useCurrentUsername", () => ({ useCurrentUsername: () => ({ username: harness.username, loading: harness.checkingLogin, error: harness.loginError }) }));
vi.mock("../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ data: harness.profile, request: vi.fn() }) }));
vi.mock("../nodeNavigation", () => ({ getCachedNodeNavigation: () => [], fetchAndCacheNodeNavigation: vi.fn() }));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn(), set: vi.fn() }, CacheCategory: {} }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => "tester" }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../dimension", () => ({ getNavInfo: () => ({ appHeaderHeight: 88 }) }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../linkHandler", async (importOriginal) => ({ ...(await importOriginal<typeof import("../linkHandler")>()), linkHandler: vi.fn(), extractSummaryUrl: vi.fn() }));

function render(component: any, props: any = {}) {
  harness.cursor = 0;
  harness.refCursor = 0;
  return component(props);
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  if (tree.type === "BottomSheet") return tree.props.visible ? [tree, ...elements(tree.props.children), ...elements(tree.props.footer)] : [];
  return [tree, ...elements(tree.props?.children)];
}
function find(tree: any, className: string) {
  const element = elements(tree).find(item => item.props?.className?.split(" ").includes(className));
  if (!element) throw new Error(`Missing ${className}`);
  return element;
}
function assertNoBareViewText(tree: any) {
  for (const element of elements(tree).filter(item => item.type === "View")) {
    const children = [element.props?.children].flat(Infinity);
    expect(children.some(child => typeof child === "string" && child.trim() || typeof child === "number"), element.props.className).toBe(false);
  }
}
const summary = { url: "https://example.com/article", siteName: "example", title: "长标题".repeat(80) };
const profile = {
  username: "longusername".repeat(10), nickname: "昵称".repeat(60), avatarUrl: "avatar", memberNumber: "123", joinDate: "入住于2020",
  city: "武汉", email: "tester@example.com", blog: "https://example.com", website: "https://example.org", reputation: 123,
  topics: [{ link: "/t/1", title: "主题".repeat(80), category: "生活", lastUpdated: "今天", commentCount: 1 }],
  replies: [{ topicLink: "/t/1", replyTitle: "回复了 tester 创建的主题 长标题", content: "回复".repeat(80) }],
};
const css = (path: string) => readFileSync(`src/${path}/index.scss`, "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  harness.state = []; harness.refs = []; harness.profile = undefined; harness.username = "tester"; harness.loginError = undefined; harness.checkingLogin = false;
  vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
});
afterEach(() => vi.unstubAllGlobals());

describe("Skyline scoped page layout contracts", () => {
  it("uses a bounded floating ScrollView on Skyline and WebView", () => {
    let tree = render(Search);
    find(tree, "searchAdvancedToggle").props.onClick();
    tree = render(Search);
    expect(find(tree, "searchAdvancedSheet").type).toBe("BottomSheet");
    expect(find(tree, "searchAdvancedSheet").props).toMatchObject({ visible: true, heightRpx: 420 });
    assertNoBareViewText(tree);
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    tree = render(Search);
    expect(find(tree, "searchAdvanced").type).toBe("View");
    expect(tree.props.className).toBe("searchPage");
    const styles = css("pages/search");
    expect(styles).not.toContain("height: 55vh;");
    expect(styles).not.toContain("420px");
    expect(styles).toContain(".searchAdvanced { padding: 0 28rpx;");
    expect(styles).not.toContain("overflow-y: auto;");
  });

  it("renders result excerpts on Text with native three-line ellipsis only in Skyline", () => {
    render(Search);
    // Existing search state ordering: response is the sixth useState call.
    harness.state[5] = { results: [{ link: "/t/1", title: "长标题", category: "生活", username: "tester", excerpt: "长摘要", publishedAt: "今天" }], page: 1, nodes: [] };
    let tree = render(Search);
    expect(find(tree, "searchItemTitle").type).toBe("Text");
    expect(find(tree, "searchExcerpt")).toMatchObject({ type: "Text", props: { overflow: "ellipsis", maxLines: 3 } });
    assertNoBareViewText(tree);
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    tree = render(Search);
    expect(find(tree, "searchExcerpt").props.maxLines).toBeUndefined();
  });

  it("keeps profile names, titles, replies and empty states on Text", () => {
    let tree = render(UserProfileDetail, { profile });
    assertNoBareViewText(tree);
    expect(find(tree, "nickname")).toMatchObject({ type: "Text", props: { maxLines: 1, overflow: "ellipsis" } });
    expect(find(tree, "topicTitle").props.maxLines).toBe(2);
    elements(tree).find(item => item.props?.className === "tabLabel" && item.props.children === "回复")!;
    find(tree, "tabBar").props.children[1].props.onClick();
    tree = render(UserProfileDetail, { profile });
    assertNoBareViewText(tree);
    expect(find(tree, "replyTitle")).toMatchObject({ type: "Text", props: { maxLines: 1 } });
    expect(find(tree, "replyContent")).toMatchObject({ type: "Text", props: { maxLines: 2 } });
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    tree = render(UserProfileDetail, { profile });
    expect(tree.props.className).toBe("userProfileDetail");
    expect(find(tree, "replyContent").props.maxLines).toBeUndefined();
  });

  it.each([false, true])("limits link header titles to two lines with image=%s", (image) => {
    const tree = render(LinkPreviewHeader, { summary: { ...summary, image: image ? "cover" : undefined } });
    expect(find(tree, "previewTitle").props).toMatchObject({ maxLines: 2, overflow: "ellipsis" });
    expect(find(tree, "previewFaviconText").props.children).toBe("E");
    assertNoBareViewText(tree);
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(find(render(LinkPreviewHeader, { summary }), "previewTitle").props.maxLines).toBeUndefined();
  });

  it("retains text in login prompts, login footer and account error states", () => {
    assertNoBareViewText(render(LoginPrompt, { icon: "早", title: "登录", desc: "欢迎" }));
    harness.state = [];
    const login = render(Login);
    assertNoBareViewText(login);
    expect(find(login, "webTip").type).toBe("Text");
    expect(find(login, "loginBody")).toMatchObject({ type: "ScrollView", props: { type: "custom", scrollY: true } });
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(find(render(Login), "loginBody").type).toBe("View");
    harness.state = []; harness.loginError = new Error("offline");
    assertNoBareViewText(render(Me));
  });

  it.each(["skyline", "webview"])("keeps settings and a bounded centered body in every profile status under %s", (renderer) => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    for (const state of [
      { username: "", checkingLogin: true, loginError: undefined },
      { username: "", checkingLogin: false, loginError: undefined },
      { username: "", checkingLogin: false, loginError: new Error("offline") },
      { username: "tester", checkingLogin: false, loginError: undefined },
    ]) {
      Object.assign(harness, state);
      const tree = render(Me, { active: true });
      expect(tree.props.style.height).toBe("100%");
      const navbars = elements(tree).filter(item => item.type === "Navbar");
      expect(navbars).toHaveLength(1);
      expect(navbars[0].props.shared).toBe(false);
      find(navbars[0].props.leftAction, "navSettingsIcon").props.onClick();
      expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/secondary/settings/index" });
      const body = find(tree, "meStatusBody");
      const loading = elements(body).find(item => item.type === "Loading");
      if (state.checkingLogin || state.username) expect(loading?.props.fullscreen).toBe(true);
      else expect(loading).toBeUndefined();
    }
    const styles = css("pages/me");
    expect(styles).toMatch(/\.meStatusBody\s*\{[^}]*position: relative;[^}]*flex: 1;[^}]*min-height: 0;/s);
  });

  it("gives create-topic body and preview the remaining native flex space without changing WebView heights", () => {
    let tree = render(CreateTopic);
    expect(tree.props.className).toBe("createTopic createTopic--skyline");
    expect(find(tree, "createTopicBody").props.style).toBeUndefined();
    harness.state[8] = "preview markdown";
    tree = render(CreateTopic);
    expect(find(tree, "repostSheetScroll").props.style).toBeUndefined();
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    tree = render(CreateTopic);
    expect(tree.props.className).toBe("createTopic");
    expect(find(tree, "createTopicBody").props.style).toEqual({ height: "100vh" });
    expect(find(tree, "repostSheetScroll").props.style.height).toContain("80vh - 200rpx");
    const native = css("pages/createTopic").split("// Native scrolling")[1];
    expect(native).toContain("width: 100vw;");
    expect(native).toContain("height: 100vh;");
    expect(native).toContain("justify-content: flex-end;");
    expect(native).toContain("flex-direction: column;");
    expect(native).toContain(".repostSheetScroll {\n    flex: 1;\n    height: 0;");
  });

  it("tags the nested repost confirmation mask for native bottom-sheet sizing", () => {
    const tree = repostDef.renderForm({ fields: { ...repostDef.initialFields, repostPreview: summary }, title: "title", content: "content", getRef: () => ({ current: null }), setField: vi.fn(), setTitle: vi.fn(), setContent: vi.fn(), focusRef: vi.fn(), handleTitleInput: vi.fn() });
    expect(find(tree, "repostMask").props.className).toContain("repostMask--skyline");
    assertNoBareViewText(tree);
  });

  it("uses native remaining-height scrolling for the modal link preview", () => {
    let tree = render(LinkPreview);
    expect(tree.props.className).toBe("linkPreviewPage linkPreviewPage--skyline");
    expect(find(tree, "linkPreviewContent").props.style).toBeUndefined();
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    tree = render(LinkPreview);
    expect(tree.props.className).toBe("linkPreviewPage");
    expect(find(tree, "linkPreviewContent").props.style).toEqual({ height: "auto" });
    const native = css("pages/linkPreview").split(".linkPreviewPage--skyline")[1];
    expect(native).toContain("height: 100%;");
    expect(native).toContain("min-height: 0;");
    expect(native).toMatch(/\.linkPreviewContent\s*\{\s*flex:\s*1;\s*height:\s*0;\s*min-height:\s*0;/);
    expect(css("pages/login").split(".loginPage--skyline")[1]).toContain("height: 100%;");
  });

  it("keeps settings description ellipsis on Text and native share controls in a row", () => {
    let tree = render(Settings);
    expect(elements(tree).find(item => item.type === "Navbar")?.props.shared).toBe(false);
    expect(find(tree, "settingsItemDesc")).toMatchObject({ type: "Text", props: { maxLines: 1 } });
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(find(render(Settings), "settingsItemDesc").props.maxLines).toBeUndefined();
    const [base, native] = css("pages/settings").split(".settingsPage--skyline");
    expect(base).toContain("font-size: inherit;");
    expect(native).toContain("font-size: 28rpx;");
    expect(native).toContain("flex-direction: row;");
  });

  it.each([ClearableInput, ClearableTextarea])("reserves the clear-button area while preserving clear behavior", (component) => {
    const onInput = vi.fn();
    const tree = render(component, { value: "输入内容", onInput });
    expect(tree.props.className).toContain("clearableWrap--hasValue");
    find(tree, "clearableBtn").props.onClick();
    expect(onInput).toHaveBeenCalledWith("");
    expect(css("components/ClearableInput")).toContain("padding-right: 64rpx;");
    expect(render(component, { value: "", onInput }).props.className).not.toContain("clearableWrap--hasValue");
  });
});
