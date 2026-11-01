import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import MentionTextarea from "../../components/MentionTextarea";

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock("react", () => ({
  useState: (initial: any) => { const i = harness.cursor++; if (!(i in harness.state)) harness.state[i] = initial; return [harness.state[i], (value: any) => { harness.state[i] = typeof value === "function" ? value(harness.state[i]) : value; }]; },
  useRef: (initial: any) => { const i = harness.refCursor++; if (!(i in harness.refs)) harness.refs[i] = { current: initial }; return harness.refs[i]; },
}));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Textarea: "Textarea" }));
vi.mock("@tarojs/taro", () => ({ default: {} }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...all(tree.props?.children)];
}
function editor(value: string, onInput: any): any {
  harness.cursor = 0; harness.refCursor = 0;
  return MentionTextarea({ value, onInput });
}
function input(tree: any) { return all(tree).find(e => e.type === "Textarea").props; }
function tags(tree: any) { return all(tree).filter(e => e.props?.className === "mentionEditorTag"); }
beforeEach(() => { harness.state = []; harness.refs = []; });

describe("mention textarea interactions", () => {
  it("contains recipient tags and the native textarea within one editor surface", () => {
    const tree = editor("@first 内容", vi.fn());
    expect(tree.props.className).toContain("mentionEditor");
    expect(tree.props.children[0].props.className).toBe("mentionEditorTags");
    expect(tree.props.children[1].props.className).toBe("mentionEditorInput");
    const css = readFileSync("src/components/MentionTextarea/index.scss", "utf8");
    const wrapper = css.split(".mentionEditor {")[1].split("}")[0];
    expect(wrapper).toContain("background: $surfaceAlt;");
    expect(wrapper).toContain("border: 1rpx solid $border-color;");
    expect(wrapper).toContain("padding: 20rpx;");
    const textarea = css.split(".mentionEditorInput {")[1].split("}")[0];
    expect(textarea).toContain("background: transparent;");
    expect(textarea).toContain("padding: 0;");
  });
  it("deletes a whole tag without losing comment text", () => {
    const change = vi.fn();
    const tree = editor("@first @second 内容", change);
    expect(input(tree).value).toBe("内容");
    expect(tags(tree)).toHaveLength(2);
    tags(tree)[0].props.onClick({ stopPropagation: vi.fn() });
    expect(change.mock.calls[change.mock.calls.length - 1][0].detail.value).toBe("@second 内容");
    const updated = editor("@second 内容", change);
    expect(tags(updated)).toHaveLength(1);
    expect(input(updated).value).toBe("内容");
  });
  it("retains tags while typing and allows whitespace to complete a new tag", () => {
    const change = vi.fn();
    input(editor("@first 内容", change)).onInput({ detail: { value: "@second 新内容", cursor: 12 } });
    expect(change.mock.calls[change.mock.calls.length - 1][0].detail.value).toBe("@first @second 新内容");
    expect(tags(editor("@first @second 新内容", change))).toHaveLength(2);
  });
  it("removes the last whole tag on an empty backspace event", () => {
    const change = vi.fn();
    input(editor("@first @second ", change)).onInput({ detail: { value: "", cursor: 0 } });
    expect(change.mock.calls[change.mock.calls.length - 1][0].detail.value).toBe("@first ");
  });
  it("updates native text correctly when parent clears the draft", () => {
    const change = vi.fn();
    editor("@first 内容", change);
    const tree = editor("", change);
    expect(tags(tree)).toHaveLength(0);
    expect(input(tree).value).toBe("");
  });
});
