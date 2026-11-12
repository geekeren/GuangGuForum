import { afterEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { createElement } from "react";
import Navbar from "../../components/Navbar";

vi.mock("@tarojs/components", () => Object.fromEntries(
  ["View", "Text", "Image", "ShareElement"].map(name => [name, name]),
));
vi.mock("@tarojs/taro", () => ({
  default: {
    useRouter: () => ({ params: {} }),
    navigateTo: vi.fn(),
    getCurrentPages: () => [{}, {}],
    navigateBack: vi.fn(),
    reLaunch: vi.fn(),
  },
}));
const harness = vi.hoisted(() => ({ renderer: 'skyline' as 'skyline' | 'webview' }));
vi.mock("../../hooks/usePageRenderer", () => ({ usePageRenderer: () => harness.renderer }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../dimension", () => ({
  getNavInfo: () => ({
    capsulePaddingTop: 6, capsuleHeight: 32, capsuleWidth: 88,
    capsuleLeft: 330, screenWidth: 430, statusBarHeight: 44, marginSides: 16,
  }),
}));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("navbar shared-element opt-out", () => {
  it.each(["skyline", "webview"])("keeps settings actions outside ShareElement under %s", renderer => {
    harness.renderer = renderer as 'skyline' | 'webview';
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    const openSettings = () => Taro.navigateTo({ url: "/pages/secondary/settings/index" });
    const action = createElement("image", { onClick: openSettings });
    const tree = Navbar({ shared: false, leftAction: action });
    expect(tree.props.className).toBe("customNavbar");
    expect(elements(tree).some(element => element.type === "ShareElement" || element.props?.mapkey)).toBe(false);
    openSettings();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/secondary/settings/index" });
  });

  it("preserves the settings title and back action without a shared wrapper", () => {
    const tree = Navbar({ shared: false, title: "设置", back: true, titleStyle: { opacity: 1 } });
    const all = elements(tree);
    expect(all.some(element => element.type === "ShareElement")).toBe(false);
    expect(all.find(element => element.props?.className === "navTitle")?.props.children).toBe("设置");
    all.find(element => element.props?.className === "navCapsuleBtn")!.props.onClick();
    expect(Taro.navigateBack).toHaveBeenCalledOnce();
  });

  it("leaves other navbar shared keys unchanged", () => {
    expect(Navbar({ title: "帖子" })).toMatchObject({ type: "ShareElement", props: { mapkey: "navbar" } });
    expect(Navbar({ shareKey: "topic_nav" })).toMatchObject({ type: "ShareElement", props: { mapkey: "topic_nav" } });
  });
});
