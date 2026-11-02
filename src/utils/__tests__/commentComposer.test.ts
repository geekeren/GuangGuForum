import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { readFileSync } from "node:fs";
import { isSkyline } from "../renderer";
import CommentComposer from "../../pages/topicDetail/CommentComposer";

const harness = vi.hoisted(() => ({ state: [] as any[], cursor: 0, refs: [] as any[], refCursor: 0 }));
vi.mock("react", () => ({
  useRef: (initial: any) => { const i = harness.refCursor++; if (!(i in harness.refs)) harness.refs[i] = { current: initial }; return harness.refs[i]; },
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = initial;
    return [harness.state[index], (value: any) => { harness.state[index] = value; }];
  },
}));
vi.mock("@tarojs/taro", () => ({
  default: { getWindowInfo: vi.fn(() => ({ windowWidth: 390, windowHeight: 844, screenHeight: 844, safeArea: { bottom: 810 } })) },
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Button: "Button" }));
vi.mock("../../components/ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../components/MentionTextarea", () => ({ default: "MentionTextarea" }));
vi.mock("../renderer", () => ({ isSkyline: vi.fn(() => true) }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
const props = { value: "@first 正文内容", sending: false, onChange: vi.fn(), onClose: vi.fn(), onSend: vi.fn() };
function render() {
  harness.cursor = 0; harness.refCursor = 0;
  return CommentComposer(props);
}
function find(tree: any, name: string) {
  return elements(tree).find(e => e.type === name || e.props?.className?.split(" ").includes(name)).props;
}
beforeEach(() => {
  harness.state = []; harness.refs = [];
  props.value = "@first 正文内容"; props.sending = false;
  vi.clearAllMocks();
  vi.mocked(isSkyline).mockReturnValue(true);
});

describe("Skyline comment sheet with WebView fallback", () => {
  it("gives the overlay actual viewport dimensions and a full-width bottom sheet", () => {
    const tree = render();
    expect(tree.props.className).toContain("commentPopup--skyline");
    expect(tree.props.style).toEqual({ width: "390px", height: "844px" });
    expect(find(tree, "commentPopupBody").style).toEqual({ bottom: "0px", paddingBottom: "calc(24rpx + 34px)", maxHeight: "844px" });
    const styles = readFileSync("src/pages/topicDetail/index.scss", "utf8").split("&.commentPopup--skyline")[1];
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("bottom: 0;");
  });
  it("moves only the Skyline sheet above the keyboard without pushing the page", () => {
    const input = find(render(), "MentionTextarea");
    expect(input.adjustPosition).toBe(false);
    expect(input.cursorSpacing).toBe(0);
    expect(input.fixed).toBe(true);
    expect(input.autoHeight).toBe(false);
    input.onFocus({ detail: { height: 336 } });
    expect(find(render(), "commentPopupBody").style).toEqual({ bottom: "336px", paddingBottom: "calc(24rpx + 0px)", maxHeight: "508px" });
  });
  it("updates keyboard height and restores device safe padding when it closes", () => {
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: 360 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("360px");
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), "commentPopupBody").style.paddingBottom).toBe("calc(24rpx + 34px)");
  });
  it("rejects invalid keyboard height and clamps negative heights", () => {
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: NaN } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("0px");
    find(render(), "MentionTextarea").onKeyboardHeightChange({ detail: { height: -1 } });
    expect(find(render(), "commentPopupBody").style.bottom).toBe("0px");
  });
  it("keeps WebView's native adjust-position and CSS sheet layout", () => {
    vi.mocked(isSkyline).mockReturnValue(false);
    const tree = render();
    expect(tree.props.className).not.toContain("--skyline");
    expect(tree.props.style).toBeUndefined();
    expect(find(tree, "commentPopupBody").style).toBeUndefined();
    const input = find(tree, "MentionTextarea");
    expect(input.adjustPosition).toBe(true);
    expect(input.cursorSpacing).toBe(100);
    input.onKeyboardHeightChange({ detail: { height: 336 } });
    expect(find(render(), "commentPopupBody").style).toBeUndefined();
    expect(Taro.getWindowInfo).not.toHaveBeenCalled();
  });
  it("passes draft and whole-mention changes through without changing backend format", () => {
    const input = find(render(), "MentionTextarea");
    expect(input.value).toBe(props.value);
    input.onInput({ detail: { value: "@second 正文" } });
    expect(props.onChange).toHaveBeenCalledWith("@second 正文");
  });
  it("keeps dismissal and send in the bottom toolbar", () => {
    const tree = render();
    find(tree, "commentPopupCancel").onClick();
    expect(props.onClose).toHaveBeenCalledOnce();
    const send = find(tree, "commentPopupSend");
    expect(send.children.type).toBe("Text");
    expect(send.disabled).toBe(false);
    send.onClick();
    expect(props.onSend).toHaveBeenCalledOnce();
  });
  it("prevents sending whitespace, only recipients, short text or an in-flight comment", () => {
    for (const value of ["", "  ", "@first ", "@first 好的"]) {
      props.value = value;
      const send = find(render(), "commentPopupSend");
      expect(send.disabled).toBe(true);
      send.onClick();
    }
    props.value = "足够长的正文";
    props.sending = true;
    const send = find(render(), "commentPopupSend");
    expect(send.disabled).toBe(true);
    expect(send.loading).toBe(true);
    send.onClick();
    expect(props.onSend).not.toHaveBeenCalled();
  });
  it("connects mention and emoji tools to the editor and expands more emojis", () => {
    let tree = render();
    const controller = { openMentions: vi.fn(), insertText: vi.fn() };
    find(tree, "MentionTextarea").editorRef.current = controller;
    find(tree, "commentPopupMention").onClick();
    expect(controller.openMentions).toHaveBeenCalledOnce();
    find(tree, "commentPopupQuickEmoji").onClick();
    expect(controller.insertText).toHaveBeenCalledWith("👍");
    find(tree, "commentPopupEmoji").onClick();
    tree = render();
    expect(elements(tree).filter(e => e.props?.className === "commentPopupPanelEmoji")).toHaveLength(18);
    find(tree, "commentPopupPanelEmoji").onClick();
    expect(controller.insertText).toHaveBeenCalledWith("😊");
    find(tree, "commentPopupMention").onClick();
    expect(elements(render()).some(e => e.props?.className === "commentPopupEmojiPanel")).toBe(false);
  });
});
