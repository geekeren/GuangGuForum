import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { readFileSync } from "node:fs";
import NodePicker from "../../components/NodePicker";
import { isSkyline } from "../renderer";

vi.mock("react", () => ({ useState: (value: any) => [value, vi.fn()], useEffect: vi.fn() }));
vi.mock("@tarojs/components", () => ({ RootPortal: "RootPortal", View: "View", Text: "Text", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: { getWindowInfo: vi.fn(() => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, safeArea: { bottom: 810 } })) } }));
vi.mock("../renderer", () => ({ isSkyline: vi.fn(() => true) }));
const props = { visible: true, groups: [{ category: "生活", nodes: [{ slug: "house", name: "房产" }] }], selectedSlug: "house", allLabel: "全部节点", onSelect: vi.fn(), onClose: vi.fn() };
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  return tree && typeof tree === "object" ? [tree, ...all(tree.props?.children)] : [];
}
function find(tree: any, name: string) { return all(tree).find(e => e.props.className === name)!.props; }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(isSkyline).mockReturnValue(true); });
describe("board picker bottom positioning", () => {
  it("uses the actual native viewport and explicitly anchors the sheet to its bottom", () => {
    const tree = NodePicker(props)!;
    expect(tree.type).toBe("RootPortal");
    expect(tree.props.children.props.style).toEqual({ position: "fixed", top: 0, left: 0, width: "390px", height: "844px" });
    expect(find(tree, "nodePickerSheet").style).toEqual({ position: "absolute", top: "254px", left: 0, width: "390px", height: "590px" });
    expect(find(tree, "nodePickerScroll").style).toEqual({ paddingBottom: "calc(32rpx + 34px)" });
    const native = readFileSync("src/components/NodePicker/index.scss", "utf8").split(".nodePickerMask.nodePickerMask--skyline")[1];
    expect(native).toContain("position: absolute;");
    expect(native).toContain("bottom: 0;");
    expect(native).toContain("height: 0;");
    expect(native).toContain("flex: 1;");
  });
  it("keeps the sheet inside a shorter viewport and bounds tag rows to the scroll area", () => {
    vi.mocked(Taro.getWindowInfo).mockReturnValueOnce({ windowWidth: 320, windowHeight: 568, screenHeight: 568 } as any);
    const tree = NodePicker(props)!;
    const style = find(tree, "nodePickerSheet").style;
    expect(style).toMatchObject({ top: "171px", width: "320px", height: "397px" });
    expect(parseInt(style.top) + parseInt(style.height)).toBe(568);
    const native = readFileSync("src/components/NodePicker/index.scss", "utf8").split(".nodePickerMask.nodePickerMask--skyline")[1];
    expect(native).toContain(".nodeGroupTags {\n    width: 100%;\n    min-width: 0;\n    box-sizing: border-box;");
    expect(native).toContain(".nodeGroupTags { flex-wrap: wrap; }");
  });
  it("leaves WebView overlay sizing and animations on the existing CSS path", () => {
    vi.mocked(isSkyline).mockReturnValue(false);
    const tree = NodePicker(props)!;
    expect(tree.type).toBe("View");
    expect(tree.props.style).toBeUndefined();
    expect(find(tree, "nodePickerSheet").style).toBeUndefined();
    expect(find(tree, "nodePickerScroll").style).toBeUndefined();
    expect(Taro.getWindowInfo).not.toHaveBeenCalled();
  });
  it("does not mount or query the viewport when hidden", () => {
    expect(NodePicker({ ...props, visible: false })).toBeNull();
    expect(Taro.getWindowInfo).not.toHaveBeenCalled();
  });
  it("keeps board selection and sheet versus mask tap handling intact", () => {
    const tree = NodePicker(props)!;
    tree.props.children.props.onClick();
    expect(props.onClose).toHaveBeenCalledOnce();
    const event = { stopPropagation: vi.fn() };
    find(tree, "nodePickerSheet").onClick(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    all(tree).find(e => e.props.className === "nodeTag nodeTag--active")!.props.onClick();
    expect(props.onSelect).toHaveBeenCalledWith("house");
  });
});
