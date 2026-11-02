import { beforeEach, describe, expect, it, vi } from "vitest";
import MentionTextarea from "../../components/MentionTextarea";
import { isSkyline } from "../renderer";

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock("react", () => ({
  useEffect: () => {},
  useState: (initial: any) => { const i = harness.cursor++; if (!(i in harness.state)) harness.state[i] = initial; return [harness.state[i], (value: any) => { harness.state[i] = typeof value === "function" ? value(harness.state[i]) : value; }]; },
  useImperativeHandle: (ref: any, create: any) => { if (ref) ref.current = create(); },
  useRef: (initial: any) => { const i = harness.refCursor++; if (!(i in harness.refs)) harness.refs[i] = { current: initial }; return harness.refs[i]; },
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Textarea: "Textarea", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: { nextTick: (fn: any) => fn() } }));
vi.mock("../renderer", () => ({ isSkyline: vi.fn(() => false) }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...all(tree.props?.children)];
}
function editor(value: string, onInput: any, mentionUsers: string[] = [], editorRef?: any, extra = {}): any {
  harness.cursor = 0; harness.refCursor = 0;
  return MentionTextarea({ value, onInput, mentionUsers, editorRef, ...extra });
}
function input(tree: any) { return all(tree).find(e => e.type === "Textarea").props; }
function find(tree: any, cls: string) { return all(tree).find(e => e.props?.className === cls); }
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (typeof tree === "string") return tree;
  return tree?.props ? text(tree.props.children) : "";
}
beforeEach(() => { harness.state = []; harness.refs = []; vi.mocked(isSkyline).mockReturnValue(false); });

describe("inline mention editor", () => {
  it.each([false, true])("keeps a single native text buffer with paint-only highlighting (Skyline=%s)", (skyline) => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    const value = "前文 @Alice 后文";
    const tree = editor(value, vi.fn());
    expect(input(tree).value).toBe(value);
    expect(find(tree, "mentionEditorTags")).toBeUndefined();
    expect(find(tree, "mentionEditorInlineMention").props.children).toBe("@Alice");
    expect(text(find(tree, "mentionEditorMirror"))).toBe(value);
    expect(tree.props.className).toContain("mentionEditor--mirrored");
    expect(input(tree).className).toBe("mentionEditorInput");
    expect(input(tree).disableDefaultPadding).toBe(true);
    expect(tree.props.className.includes("--skyline")).toBe(skyline);
  });
  it("selects a recipient inline and preserves both surrounding text and native caret", () => {
    let value = "正文  后文";
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change, ["Alice", "Alice", "Bob"])).onInput({ detail: { value: "正文 @al 后文", cursor: 6 } });
    let tree = editor(value, change, ["Alice", "Alice", "Bob"]);
    expect(all(tree).filter(e => e.props?.className === "mentionCandidate")).toHaveLength(1);
    find(tree, "mentionCandidate").props.onClick();
    expect(value).toBe("正文 @Alice 后文");
    tree = editor(value, change);
    expect(input(tree).cursor).toBe(10);
    expect(find(tree, "mentionCandidates")).toBeUndefined();
  });
  it("keeps the intended insertion caret while native value updates report a temporary end selection", () => {
    let value = "正文 @al 后文";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    input(editor(value, change, ["Alice"], ref)).onInput({ detail: { value, cursor: 6 } });
    find(editor(value, change, ["Alice"], ref), "mentionCandidate").props.onClick();
    let tree = editor(value, change, ["Alice"], ref);
    expect(input(tree).focus).toBe(false);
    input(tree).onSelectionChange({ detail: { selectionStart: value.length, selectionEnd: value.length } });
    tree = editor(value, change, ["Alice"], ref);
    expect(input(tree).cursor).toBe(10);
    ref.current.insertText("👍");
    expect(value).toBe("正文 @Alice 👍后文");
  });
  it("never relocates or normalizes native edits, deletion, whitespace or newlines", () => {
    let value = "@Alice 内容";
    const change = vi.fn(event => { value = event.detail.value; });
    const next = "  前文\n@Ali 后文 ";
    input(editor(value, change)).onInput({ detail: { value: next, cursor: 10 } });
    expect(value).toBe(next);
    expect(input(editor(value, change)).value).toBe(next);
    input(editor(value, change)).onInput({ detail: { value: "", cursor: 0 } });
    expect(input(editor(value, change)).value).toBe("");
  });
  it("keeps the query available when native blur precedes the candidate tap", () => {
    let value = "";
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change, ["Bob"])).onInput({ detail: { value: "@", cursor: 1 } });
    let tree = editor(value, change, ["Bob"]);
    input(tree).onBlur({ detail: { value: "@", cursor: 1 } });
    tree = editor(value, change, ["Bob"]);
    find(tree, "mentionCandidate").props.onClick();
    expect(value).toBe("@Bob ");
  });
  it("uses native paint while selecting and restores blue mentions when the selection collapses", () => {
    const value = "@Alice 内容";
    const change = vi.fn();
    input(editor(value, change)).onSelectionChange({ detail: { selectionStart: 0, selectionEnd: 6 } });
    let tree = editor(value, change);
    expect(find(tree, "mentionEditorMirror")).toBeUndefined();
    expect(input(tree).value).toBe(value);
    input(tree).onSelectionChange({ detail: { selectionStart: value.length, selectionEnd: value.length } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeDefined();
    expect(change).not.toHaveBeenCalled();
  });
  it("uncovers native selection immediately on touch, before delayed selectionchange events", () => {
    let value = "@Alice 内容";
    const change = vi.fn(event => { value = event.detail.value; });
    find(editor(value, change), "mentionEditorSurface").props.onTouchStart();
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
    expect(input(editor(value, change)).value).toBe(value);
    input(editor(value, change)).onInput({ detail: { value: "@Alice 新内容", cursor: 10 } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeDefined();
  });
  it("uses native paint for internal scrolling without losing mentions or input", () => {
    const value = "@Alice 很长的正文";
    const change = vi.fn();
    input(editor(value, change)).onLineChange({ detail: { lineCount: 5 } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
    expect(input(editor(value, change)).value).toBe(value);
    input(editor(value, change)).onLineChange({ detail: { lineCount: 2 } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeDefined();
  });
  it("preserves Chinese IME preedit and ignores toolbar edits until composition finishes", () => {
    let value = "@Alice 内容";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    input(editor(value, change, [], ref)).onKeyboardCompositionStart({ detail: {} });
    expect(find(editor(value, change, [], ref), "mentionEditorMirror")).toBeUndefined();
    ref.current.insertText("👍");
    expect(change).not.toHaveBeenCalled();
    input(editor(value, change, [], ref)).onInput({ detail: { value: "@Alice 中文拼音", cursor: 11 } });
    expect(value).toBe("@Alice 中文拼音");
    input(editor(value, change, [], ref)).onKeyboardCompositionEnd({ detail: {} });
    expect(find(editor(value, change, [], ref), "mentionEditorMirror")).toBeDefined();
  });
  it("opens mentions through the toolbar without duplicating an active query", () => {
    let value = "你好";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    editor(value, change, ["Alice"], ref);
    ref.current.openMentions();
    expect(value).toBe("你好 @");
    const tree = editor(value, change, ["Alice"], ref);
    expect(find(tree, "mentionCandidate")).toBeDefined();
    ref.current.openMentions();
    expect(value).toBe("你好 @");
  });
  it("replaces a native selected range with an emoji without moving an earlier recipient", () => {
    let value = "@Alice 前文旧内容后文";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    input(editor(value, change, [], ref)).onSelectionChange({ detail: { selectionStart: 9, selectionEnd: 12 } });
    ref.current.insertText("👍");
    expect(value).toBe("@Alice 前文👍后文");
    expect(input(editor(value, change, [], ref)).cursor).toBe(11);
    ref.current.insertText("😂");
    expect(value).toBe("@Alice 前文👍😂后文");
  });
  it("retains the native maxlength for toolbar insertions", () => {
    let value = "1234";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    editor(value, change, [], ref, { maxlength: 5 });
    ref.current.insertText("👍");
    expect(value).toBe("1234");
    expect(change).not.toHaveBeenCalled();
  });
});
