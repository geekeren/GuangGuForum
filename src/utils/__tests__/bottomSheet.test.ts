import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro from "@tarojs/taro";
import BottomSheet from "../../components/BottomSheet";
import { themeVariables } from "../themePreferences";

const theme = vi.hoisted(() => ({ current: "dark" as "light" | "dark" }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: theme.current }) }));
vi.mock("../CacheService", () => ({ cacheService: {}, CacheCategory: {} }));

const harness = vi.hoisted(() => ({ state: [] as any[], cursor: 0, effects: [] as (() => any)[] }));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const i = harness.cursor++;
    if (!(i in harness.state)) harness.state[i] = initial;
    return [harness.state[i], (value: any) => { harness.state[i] = value; }];
  },
  useEffect: (effect: () => any) => harness.effects.push(effect),
}));
vi.mock("@tarojs/components", () => ({ RootPortal: "RootPortal", View: "View", Text: "Text", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: {
  getWindowInfo: vi.fn(() => ({ windowWidth: 430, windowHeight: 932, screenHeight: 932, safeArea: { bottom: 898 } })),
  onKeyboardHeightChange: vi.fn(), offKeyboardHeightChange: vi.fn(),
} }));
const props = { visible: true, title: "高级筛选", heightRpx: 500, children: "fields", footer: "actions", onClose: vi.fn() };
function render(update: any = {}) {
  harness.cursor = 0; harness.effects = [];
  return BottomSheet({ ...props, ...update });
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}
function find(tree: any, name: string) { return elements(tree).find(e => String(e.props?.className || "").split(" ").includes(name))!.props; }
beforeEach(() => { vi.clearAllMocks(); theme.current = "dark"; harness.state = []; vi.useFakeTimers(); vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared bottom sheet", () => {
  it("anchors a compact native panel to the bottom with a bounded body and safe-area footer", () => {
    const tree = render();
    expect(tree.type).toBe("RootPortal");
    expect(find(tree, "bottomSheetMask").style).toEqual({ ...themeVariables("dark"), height: "932px", width: "430px" });
    expect(find(tree, "bottomSheetMask").className).toContain("themeOverlay--dark");
    expect(find(tree, "bottomSheetPanel").style).toEqual({ top: "611px", height: "321px", width: "430px" });
    expect(find(tree, "bottomSheetBody")).toMatchObject({ type: "custom", scrollY: true, enhanced: true });
    expect(find(tree, "bottomSheetFooter").style.paddingBottom).toBe("calc(20rpx + 34px)");
    expect(find(tree, "bottomSheetTitle").children).toBe(props.title);
    const css = readFileSync("src/components/BottomSheet/index.scss", "utf8");
    expect(css).toContain("border-radius: 28rpx 28rpx 0 0;");
    expect(css).toContain("animation: bottomSheetSlideUp 220ms ease-out;");
    expect(css).not.toMatch(/overflow: auto|position: sticky|display: grid/);
  });
  it("refreshes portal variables when the theme changes while open", () => {
    render();
    theme.current = "light";
    const mask = find(render(), "bottomSheetMask");
    expect(mask.className).toContain("themeOverlay--light");
    expect(mask.style).toMatchObject(themeVariables("light"));
  });
  it("moves above the keyboard without an unsafe bottom inset and unsubscribes", () => {
    render();
    const stop = harness.effects[1]();
    const listener = vi.mocked(Taro.onKeyboardHeightChange).mock.calls[0][0];
    listener({ height: 300 } as any);
    const tree = render();
    expect(find(tree, "bottomSheetPanel").style).toMatchObject({ top: "345px", height: "287px" });
    expect(find(tree, "bottomSheetFooter").style.paddingBottom).toBe("calc(20rpx + 0px)");
    stop();
    expect(Taro.offKeyboardHeightChange).toHaveBeenCalledWith(listener);
  });
  it("caps panel height on smaller devices and retains native keyboard events on WebView", () => {
    vi.mocked(Taro.getWindowInfo).mockReturnValueOnce({ windowWidth: 320, windowHeight: 568, screenHeight: 568 } as any);
    const tree = render({ heightRpx: 2000 });
    const panel = find(tree, "bottomSheetPanel").style;
    expect(parseInt(panel.top) + parseInt(panel.height)).toBe(568);
    expect(parseInt(panel.height)).toBeLessThanOrEqual(568 * 0.85);
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(render().type).toBe("View");
    expect(find(render(), "bottomSheetPanel").style).toMatchObject({ bottom: "0px" });
  });
  it("closes on mask or close button, but panel clicks do not dismiss", () => {
    const tree = render();
    const stopPropagation = vi.fn();
    find(tree, "bottomSheetPanel").onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(props.onClose).not.toHaveBeenCalled();
    find(tree, "bottomSheetMask").onClick();
    find(tree, "bottomSheetClose").onClick();
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
  it("cancels delayed unmount when reopened during the closing animation", () => {
    render(); harness.effects[0]();
    render({ visible: false });
    const cleanup = harness.effects[0]();
    cleanup();
    render(); harness.effects[0]();
    vi.advanceTimersByTime(300);
    const tree = render();
    expect(find(tree, "bottomSheetPanel").className).toBe("bottomSheetPanel");
  });
  it("does not query or subscribe while hidden and unmounts after the closing animation", () => {
    expect(render({ visible: false })).toBeNull();
    expect(Taro.getWindowInfo).not.toHaveBeenCalled();
    harness.effects.forEach(effect => effect());
    expect(Taro.onKeyboardHeightChange).not.toHaveBeenCalled();
    harness.state = [];
    render(); harness.effects[0]();
    let tree = render({ visible: false });
    expect(find(tree, "bottomSheetMask").className).toContain("bottomSheetMask--closing");
    harness.effects[0]();
    vi.advanceTimersByTime(250);
    expect(render({ visible: false })).toBeNull();
  });
});
