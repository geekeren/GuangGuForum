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
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Textarea: "Textarea", ScrollView: "ScrollView", Image: "Image" }));
vi.mock("@tarojs/taro", () => ({ default: {
  nextTick: (fn: any) => fn(),
  getWindowInfo: () => ({ windowWidth: 375 }),
  createSelectorQuery: () => {
    const query = { select: () => query, boundingClientRect: (callback: any) => { callback({ width: 300 }); return query; }, exec: () => {} };
    return query;
  },
} }));
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
function find(tree: any, cls: string) { return all(tree).find(e => e.props?.className?.split(" ").includes(cls)); }
beforeEach(() => { harness.state = []; harness.refs = []; vi.mocked(isSkyline).mockReturnValue(false); });

describe("inline mention editor", () => {
  it.each([false, true])('automatically includes the AI once and labels it and the topic author (Skyline=%s)', skyline => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    let value = '';
    const change = vi.fn(event => { value = event.detail.value; });
    const users = ['author', 'ordinary', 'huanxituo', 'huanxituo'];
    const extra = { topicAuthor: 'author', focus: true, holdKeyboard: true };
    input(editor(value, change, users, undefined, extra)).onInput({ detail: { value: '@', cursor: 1 } });
    let tree = editor(value, change, users, undefined, extra);
    const candidates = all(tree).filter(e => e.props?.className === 'mentionCandidate');
    expect(candidates.map(e => e.props.ariaLabel)).toEqual(['提及author', '提及ordinary', '提及huanxituo']);
    expect(find(candidates[0], 'mentionCandidateBadge').props.children).toBe('楼主');
    expect(find(candidates[1], 'mentionCandidateBadge')).toBeUndefined();
    expect(find(candidates[2], 'mentionCandidateBadge--ai').props.children).toBe('AI');
    candidates[2].props.onClick();
    expect(value).toBe('@huanxituo ');
    tree = editor(value, change, users, undefined, extra);
    expect(input(tree).focus).toBe(true);
    expect(input(tree).holdKeyboard).toBe(true);
    expect(input(tree).topicAuthor).toBeUndefined();
  });
  it('offers AI without any participants and filters it by the query', () => {
    let value = '';
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change)).onInput({ detail: { value: '@', cursor: 1 } });
    expect(find(editor(value, change), 'mentionCandidateName').props.children).toBe('huanxituo');
    input(editor(value, change)).onInput({ detail: { value: '@huan', cursor: 5 } });
    expect(find(editor(value, change), 'mentionCandidateName').props.children).toBe('huanxituo');
    input(editor(value, change)).onInput({ detail: { value: '@unknown', cursor: 8 } });
    expect(find(editor(value, change), 'mentionCandidate')).toBeUndefined();
  });
  it('does not suggest an already mentioned AI and allows it to have both badges', () => {
    let value = '';
    const change = vi.fn(event => { value = event.detail.value; });
    const extra = { topicAuthor: 'huanxituo' };
    input(editor(value, change, [], undefined, extra)).onInput({ detail: { value: '@', cursor: 1 } });
    let tree = editor(value, change, [], undefined, extra);
    expect(all(tree).filter(e => e.props?.className?.split(' ').includes('mentionCandidateBadge')).map(e => e.props.children)).toEqual(['楼主', 'AI']);
    input(tree).onInput({ detail: { value: '@huanxituo @', cursor: 11 } });
    tree = editor(value, change, [], undefined, extra);
    expect(find(tree, 'mentionCandidate')).toBeUndefined();
  });
  it.each([false, true])("renders mentions as ordinary native textarea text (Skyline=%s)", (skyline) => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    const value = "前文 @Alice 后文";
    const tree = editor(value, vi.fn());
    expect(input(tree).value).toBe(value);
    expect(find(tree, "mentionEditorTags")).toBeUndefined();
    expect(find(tree, "mentionEditorInlineMention")).toBeUndefined();
    expect(find(tree, "mentionEditorMirror")).toBeUndefined();
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
    expect(input(tree).holdKeyboard).toBe(true);
    expect(input(tree).focus).toBeUndefined();
    tree = editor(value, change);
    expect(input(tree).cursor).toBe(10);
    expect(find(tree, "mentionCandidates--visible")).toBeUndefined();
  });
  it("keeps the intended insertion caret while native value updates report a temporary end selection", () => {
    let value = "正文 @al 后文";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    input(editor(value, change, ["Alice"], ref)).onInput({ detail: { value, cursor: 6 } });
    find(editor(value, change, ["Alice"], ref), "mentionCandidate").props.onClick();
    let tree = editor(value, change, ["Alice"], ref);
    expect(input(tree).focus).toBeUndefined();
    input(tree).onSelectionChange({ detail: { selectionStart: value.length, selectionEnd: value.length } });
    tree = editor(value, change, ["Alice"], ref);
    expect(input(tree).cursor).toBe(10);
    ref.current.insertText("👍");
    expect(value).toBe("正文 @Alice 👍后文");
  });
  it.each(["前文 @Alice 后文", "@Alice"])("selects a completed mention before deleting it on the next press (%s)", (initial) => {
    let value = initial;
    const change = vi.fn(event => { value = event.detail.value; });
    const end = initial.indexOf("@Alice") + 6;
    input(editor(value, change)).onInput({ detail: { value: initial.slice(0, end - 1) + initial.slice(end), cursor: end - 1 } });
    let tree = editor(value, change);
    expect(value).toBe(initial);
    expect(change).not.toHaveBeenCalled();
    expect(input(tree).selectionStart).toBe(initial.indexOf('@Alice'));
    expect(input(tree).selectionEnd).toBe(end);
    input(tree).onSelectionChange({ detail: { selectionStart: initial.indexOf('@Alice'), selectionEnd: end } });
    tree = editor(value, change);
    input(tree).onInput({ detail: { value: initial.replace('@Alice', ''), cursor: initial.indexOf('@Alice') } });
    tree = editor(value, change);
    expect(value).toBe(initial.replace("@Alice", ""));
    expect(input(tree).cursor).toBe(initial.indexOf("@Alice"));
  });
  it('restores the native value and selects the mention without toggling keyboard focus', () => {
    const initial = '前 @Alice 后';
    const change = vi.fn();
    const tree = editor(initial, change, [], undefined, { focus: true });
    const native = { value: '前 @Alic 后', setAttribute: vi.fn() };
    all(tree).find(element => element.type === 'Textarea').ref.current = native;
    input(tree).onInput({ detail: { value: native.value, cursor: 7 } });
    expect(native.value).toBe(initial);
    expect(native.setAttribute).toHaveBeenCalledWith('selectionStart', 2);
    expect(native.setAttribute).toHaveBeenCalledWith('selectionEnd', 8);
    const next = editor(initial, change, [], undefined, { focus: true });
    expect(input(next).focus).toBe(true);
    expect(input(next).holdKeyboard).toBe(true);
    expect(change).not.toHaveBeenCalled();
  });
  it('does not turn a completed mention into an unfinished query when its trailing space is deleted', () => {
    let value = '@Alice ';
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change)).onInput({ detail: { value: '@Alice', cursor: 6 } });
    input(editor(value, change)).onInput({ detail: { value: '@Alic', cursor: 5 } });
    let tree = editor(value, change);
    expect(value).toBe('@Alice');
    expect(input(tree).selectionStart).toBe(0);
    expect(input(tree).selectionEnd).toBe(6);
    // A fast second press may arrive before native selection acknowledgement.
    input(tree).onInput({ detail: { value: '@Alic', cursor: 5 } });
    tree = editor(value, change);
    expect(value).toBe('');
    expect(input(tree).cursor).toBe(0);
  });
  it('allows typing over the selected mention or moving the caret to cancel two-step deletion', () => {
    let value = '@Alice 后';
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change)).onInput({ detail: { value: '@Alic 后', cursor: 5 } });
    let tree = editor(value, change);
    input(tree).onInput({ detail: { value: '新 后', cursor: 1 } });
    tree = editor(value, change);
    expect(value).toBe('新 后');
    expect(input(tree).selectionStart).toBe(-1);
    input(tree).onInput({ detail: { value: '@Bob 后', cursor: 6 } });
    input(editor(value, change)).onInput({ detail: { value: '@Bo 后', cursor: 3 } });
    tree = editor(value, change);
    input(tree).onSelectionChange({ detail: { selectionStart: 0, selectionEnd: 4 } });
    input(tree).onSelectionChange({ detail: { selectionStart: 6, selectionEnd: 6 } });
    tree = editor(value, change);
    input(tree).onInput({ detail: { value: '@Bob ', cursor: 5 } });
    expect(value).toBe('@Bob ');
  });
  it("keeps deletion within an unfinished mention query native", () => {
    let value = "";
    const change = vi.fn(event => { value = event.detail.value; });
    input(editor(value, change)).onInput({ detail: { value: "@Ali", cursor: 4 } });
    input(editor(value, change)).onInput({ detail: { value: "@Al", cursor: 3 } });
    expect(value).toBe("@Al");
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
  it.each(["👍", " @Alice "])("releases the insertion caret before native deletion (%s)", (inserted) => {
    let value = "前文后文";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    input(editor(value, change, [], ref)).onSelectionChange({ detail: { selectionStart: 2, selectionEnd: 2 } });
    ref.current.insertText(inserted);
    let tree = editor(value, change, [], ref);
    const cursor = 2 + inserted.length;
    expect(input(tree).cursor).toBe(cursor);
    input(tree).onSelectionChange({ detail: { selectionStart: cursor, selectionEnd: cursor } });
    tree = editor(value, change, [], ref);
    expect(input(tree).cursor).toBe(-1);
    expect(input(tree).selectionStart).toBe(-1);
    expect(input(tree).selectionEnd).toBe(-1);
    const next = "前文后文";
    input(tree).onInput({ detail: { value: next, cursor: 2 } });
    tree = editor(value, change, [], ref);
    expect(input(tree).cursor).toBe(-1);
    ref.current.insertText("新");
    expect(value).toBe("前文新后文");
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
  it("preserves native selection and collapsed caret without a highlight overlay", () => {
    const value = "@Alice 内容";
    const change = vi.fn();
    input(editor(value, change)).onSelectionChange({ detail: { selectionStart: 0, selectionEnd: 6 } });
    let tree = editor(value, change);
    expect(find(tree, "mentionEditorMirror")).toBeUndefined();
    expect(input(tree).value).toBe(value);
    input(tree).onSelectionChange({ detail: { selectionStart: value.length, selectionEnd: value.length } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
    expect(change).not.toHaveBeenCalled();
  });
  it("preserves the native buffer when touching the input", () => {
    let value = "@Alice 内容";
    const change = vi.fn(event => { value = event.detail.value; });
    find(editor(value, change), "mentionEditorSurface").props.onTouchStart();
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
    expect(input(editor(value, change)).value).toBe(value);
    input(editor(value, change)).onInput({ detail: { value: "@Alice 新内容", cursor: 10 } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
  });
  it("forwards native line changes without losing mentions or input", () => {
    const value = "@Alice 很长的正文";
    const change = vi.fn();
    const onLineChange = vi.fn();
    input(editor(value, change, [], undefined, { onLineChange })).onLineChange({ detail: { lineCount: 5 } });
    expect(onLineChange).toHaveBeenCalledWith({ detail: { lineCount: 5 } });
    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
    expect(input(editor(value, change)).value).toBe(value);

    expect(find(editor(value, change), "mentionEditorMirror")).toBeUndefined();
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
    expect(find(editor(value, change, [], ref), "mentionEditorMirror")).toBeUndefined();
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
  it.each([true, false])("preserves keyboard focus while inserting consecutive emojis (focus=%s)", (focus) => {
    let value = "前后";
    const change = vi.fn(event => { value = event.detail.value; });
    const ref = { current: null as any };
    let tree = editor(value, change, [], ref, { focus, holdKeyboard: focus });
    input(tree).onSelectionChange({ detail: { selectionStart: 1, selectionEnd: 1 } });
    ref.current.insertText("👍");
    tree = editor(value, change, [], ref, { focus, holdKeyboard: focus });
    expect(input(tree).focus).toBe(focus);
    expect(input(tree).holdKeyboard).toBe(focus);
    expect(input(tree).cursor).toBe(3);
    // Native value updates may temporarily report the old/end selection.
    input(tree).onSelectionChange({ detail: { selectionStart: value.length, selectionEnd: value.length } });
    input(tree).onBlur({ detail: { cursor: value.length } });
    ref.current.insertText("😂");
    tree = editor(value, change, [], ref, { focus, holdKeyboard: focus });
    expect(value).toBe("前👍😂后");
    expect(input(tree).focus).toBe(focus);
    expect(input(tree).cursor).toBe(5);
  });
  it("shows horizontal avatar candidates above the native input and keeps focus on selection", () => {
    let value = "";
    const change = vi.fn(event => { value = event.detail.value; });
    const extra = { focus: true, mentionAvatars: { Alice: "https://example.com/alice.png" } };
    input(editor(value, change, ["Alice", "Bob"], undefined, extra)).onInput({ detail: { value: "@", cursor: 1 } });
    let tree = editor(value, change, ["Alice", "Bob"], undefined, extra);
    const children = tree.props.children;
    expect(children[0].props.className).toContain("mentionCandidates--visible");
    expect(children[1].props.className).toBe("mentionEditorSurface");
    const list = find(tree, "mentionCandidatesList").props;
    expect(find(tree, 'mentionCandidatesList').type).toBe('View');
    expect(list.catchMove).toBe(true);
    expect(all(tree).some(e => e.type === 'ScrollView')).toBe(false);
    expect(find(tree, "mentionCandidateAvatar").props.src).toBe(extra.mentionAvatars.Alice);
    expect(find(tree, "mentionCandidateName").props.children).toBe("Alice");
    find(tree, "mentionCandidate").props.onClick();
    tree = editor(value, change, ["Alice", "Bob"], undefined, extra);
    expect(value).toBe("@Alice ");
    expect(input(tree).focus).toBe(true);
    expect(input(tree).holdKeyboard).toBe(true);
    // Keep the collapsed container mounted so its height can animate both ways.
    expect(find(tree, "mentionCandidates")).toBeDefined();
    expect(find(tree, "mentionCandidates--visible")).toBeUndefined();
  });
  it.each([false, true])('pans candidates without a native scroll gesture or a focus change (Skyline=%s)', skyline => {
    vi.mocked(isSkyline).mockReturnValue(skyline);
    let value = '';
    const change = vi.fn(event => { value = event.detail.value; });
    const extra = { focus: true, holdKeyboard: true };
    const users = Array.from({ length: 10 }, (_, index) => `User${index}`);
    input(editor(value, change, users, undefined, extra)).onInput({ detail: { value: '@', cursor: 1 } });
    const tree = editor(value, change, users, undefined, extra);
    const list = find(tree, 'mentionCandidatesList').props;
    change.mockClear();
    const event = { stopPropagation: vi.fn(), preventDefault: vi.fn(), touches: [{ clientX: 200 }] };
    list.onTouchStart(event);
    event.touches[0].clientX = 100;
    list.onTouchMove(event);
    list.onTouchEnd(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(3);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    let next = editor(value, change, users, undefined, extra);
    expect(find(next, 'mentionCandidatesTrack').props.style.transform).toBe('translateX(-100px)');
    expect(input(next).focus).toBe(true);
    expect(input(next).holdKeyboard).toBe(true);
    expect(input(next).cursor).toBe(input(tree).cursor);
    expect(find(next, 'mentionCandidates--visible')).toBeDefined();
    find(next, 'mentionCandidate').props.onClick();
    expect(change).not.toHaveBeenCalled();
    const updatedList = find(next, 'mentionCandidatesList').props;
    event.touches[0].clientX = 100;
    updatedList.onTouchStart(event);
    event.touches[0].clientX = -1000;
    updatedList.onTouchMove(event);
    next = editor(value, change, users, undefined, extra);
    expect(find(next, 'mentionCandidatesTrack').props.style.transform).toBe('translateX(-360px)');
    const endList = find(next, 'mentionCandidatesList').props;
    event.touches[0].clientX = 100;
    endList.onTouchStart(event);
    event.touches[0].clientX = 1000;
    endList.onTouchMove(event);
    next = editor(value, change, users, undefined, extra);
    expect(find(next, 'mentionCandidatesTrack').props.style.transform).toBe('translateX(0px)');
    find(next, 'mentionCandidatesList').props.onTouchStart({ ...event, touches: [{ clientX: 100 }] });
    find(next, 'mentionCandidate').props.onClick();
    expect(value).toBe('@User0 ');
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
