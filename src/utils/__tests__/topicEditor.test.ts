import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import TopicEditor from '../../pages/createTopic/TopicEditor';
import { getCommonEmojiUsage, recordCommentEmojiUsage } from '../emojiUsage';
import { STICKERS } from '../stickers';

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], keyboard: null as any }));
vi.mock('react', () => ({
  useEffect: (effect: any) => harness.effects.push(effect),
  useImperativeHandle: (ref: any, create: any) => { if (ref) ref.current = create(); },
  useRef: (initial: any) => { const i = harness.refCursor++; return harness.refs[i] ??= { current: initial }; },
  useState: (initial: any) => {
    const i = harness.cursor++;
    if (!(i in harness.state)) harness.state[i] = typeof initial === 'function' ? initial() : initial;
    return [harness.state[i], (value: any) => { harness.state[i] = typeof value === 'function' ? value(harness.state[i]) : value; }];
  },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { hideKeyboard: vi.fn(), showToast: vi.fn(), onKeyboardHeightChange: (cb: any) => { harness.keyboard = cb; }, offKeyboardHeightChange: vi.fn() } }));
vi.mock('../../pages/createTopic/RichTopicBody', () => ({ default: 'RichTopicBody' }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => 'tester' }));
vi.mock('../emojiUsage', () => ({ EMOJIS: ['👍', '😂'], getCommonEmojiUsage: vi.fn(), recordCommentEmojiUsage: vi.fn() }));
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...all(tree.props?.children)];
}
let props: Parameters<typeof TopicEditor>[0];
function render() { harness.cursor = 0; harness.refCursor = 0; return TopicEditor(props); }
function find(tree: any, name: string) { return all(tree).find(e => e.type === name || e.props?.className?.split(' ').includes(name)); }
function click(label: string) { return all(render()).find(e => e.props?.ariaLabel === label)!.props.onClick(); }
function body() { return find(render(), 'RichTopicBody').props; }
function keyboard(height: number) { harness.keyboard({ height }); }
beforeEach(() => {
  harness.state = []; harness.refs = []; harness.effects = []; vi.clearAllMocks();
  vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: [], stickers: [] });
  props = { value: '', placeholder: '', inputRef: { current: null }, previousRef: { current: null }, disabled: false, attachments: [], onChange: vi.fn(), onAttachmentsChange: update => { props.attachments = update(props.attachments); } };
  render(); harness.effects[0]();
});
afterEach(() => vi.useRealTimers());

function dock() { return find(render(), 'topicEditorDock')?.props; }
function nativeTap(label: string) {
  click(label); dock()?.onClick();
}

describe('topic editor floating tools', () => {
  it.each(['更多功能', '表情', '正文'])('retains the %s target through native start/blur/end/tap without pretending focus', label => {
    vi.useFakeTimers(); body().onFocus();
    const format = vi.fn(); body().handleRef.current = { format };
    dock().onTouchStart(); body().onBlur(); keyboard(0);
    expect(body().focus).toBe(false); expect(dock()).toBeDefined();
    dock().onTouchEnd({ stopPropagation: vi.fn() }); body().onBlur(); nativeTap(label);
    if (label === '正文') {
      expect(format).toHaveBeenCalledWith('header', ''); expect(dock()).toBeUndefined();
    } else {
      expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('300px');
      expect(dock()).toBeDefined();
      if (label === '更多功能') expect(all(render()).some(e => e.props?.ariaLabel === '照片')).toBe(true);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels a pending gesture when disabled changes before native tap', () => {
    vi.useFakeTimers(); body().onFocus(); dock().onTouchStart();
    props.disabled = true; render(); harness.effects.at(-1)();
    expect(vi.getTimerCount()).toBe(0);
    body().onBlur(); expect(dock()).toBeUndefined();
  });
  it('releases a missing native tap exactly at the bounded touchend deadline', async () => {
    vi.useFakeTimers(); body().onFocus(); dock().onTouchStart();
    dock().onTouchEnd({ stopPropagation: vi.fn() }); body().onBlur(); keyboard(0);
    await vi.advanceTimersByTimeAsync(349); expect(dock()).toBeDefined();
    await vi.advanceTimersByTimeAsync(1); expect(dock()).toBeUndefined();
  });
  it.each(['onTouchCancel', 'onTouchMove'])('releases %s immediately and normal external blur stays immediate', event => {
    vi.useFakeTimers(); body().onFocus(); dock().onTouchStart(); body().onBlur(); keyboard(0);
    dock()[event](); expect(dock()).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
    body().onFocus(); body().onBlur(); expect(dock()).toBeUndefined();
  });
  it('cleans incomplete gesture deadlines on dispose and cannot activate disabled tools', async () => {
    vi.useFakeTimers(); body().onFocus(); dock().onTouchStart(); body().onBlur();
    await vi.advanceTimersByTimeAsync(5000); expect(dock()).toBeUndefined();
    body().onFocus(); dock().onTouchStart(); const state = [...harness.state];
    harness.effects[0]()(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000); expect(harness.state).toEqual(state);
    harness.state = []; harness.refs = []; harness.effects = []; props.disabled = true;
    render(); harness.effects[0](); body().onFocus();
    const format = vi.fn(); body().handleRef.current = { format };
    dock().onTouchStart(); click('正文'); click('更多功能'); body().onBlur();
    expect(format).not.toHaveBeenCalled(); expect(dock()).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  });
  it('follows global native keyboard events and cleans listener on unmount', () => {
    expect(find(render(), 'topicEditorDock')).toBeUndefined();
    body().onFocus(); keyboard(320);
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('320px');
    body().onBlur(); keyboard(0);
    expect(find(render(), 'topicEditorDock')).toBeUndefined();
    const cleanup = harness.effects[0](); cleanup();
    expect(Taro.offKeyboardHeightChange).toHaveBeenCalled();
  });
  it('keeps the emoji panel after delayed keyboard close events', () => {
    body().onFocus(); keyboard(320); click('表情'); keyboard(0);
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('320px');
    click('切换到键盘'); keyboard(0);
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('320px');
    keyboard(300); expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('300px');
  });
  it('preserves emoji/mention/format actions and records usage', () => {
    body().onFocus(); click('表情');
    all(render()).find(e => e.props?.className === 'topicEditorTab' && e.props.children.props.children === '表情')!.props.onClick();
    const handle = { insertText: vi.fn(), openMentions: vi.fn(), format: vi.fn() }; body().handleRef.current = handle;
    click('插入表情👍'); expect(handle.insertText).toHaveBeenCalledWith('👍');
    expect(recordCommentEmojiUsage).toHaveBeenCalledWith('👍', []);
    click('提及用户'); expect(handle.openMentions).toHaveBeenCalled();
    click('正文'); expect(handle.format).toHaveBeenCalledWith('header', '');
  });
  it('inserts completed media only on tap and marks managed only on native success', async () => {
    props.attachments = [{ id: 'photo', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg' }];
    const insertImage = vi.fn().mockResolvedValue(false); body().handleRef.current = { insertImage };
    const tap = () => all(render()).find(e => e.props?.className === 'topicAttachmentImage')!.props.onClick();
    expect(insertImage).not.toHaveBeenCalled(); await tap();
    expect(props.attachments[0].richManaged).toBeUndefined();
    insertImage.mockResolvedValue(true); await tap();
    expect(insertImage).toHaveBeenCalledWith('https://img.test/p.jpg', 'photo', '图片');
    expect(props.attachments[0].richManaged).toBe(true);
  });
  it('retains managed ownership metadata for untagged rich and encoded source images', async () => {
    const url = 'https://img.test/p(1).jpg', encoded = 'https://img.test/p%281%29.jpg';
    props.attachments = [{ id: 'roundtrip', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url, richManaged: true }];
    const snapshot = vi.fn(); body().handleRef.current = { snapshot };
    for (const src of [url, encoded]) {
      snapshot.mockResolvedValue({ markdown: '', document: { version: 1, delta: { ops: [{ insert: { image: src } }, { insert: '\n' }] } }, referencedAttachmentIds: [] });
      await click('移除附件'); expect(props.attachments).toHaveLength(1);
    }
    snapshot.mockResolvedValue({ markdown: `![图片](${encoded})`, referencedAttachmentIds: [] });
    await click('移除附件'); expect(props.attachments).toHaveLength(1);
    snapshot.mockRejectedValue(new Error('read failed'));
    await click('移除附件'); expect(props.attachments).toHaveLength(1);
    snapshot.mockResolvedValue({ markdown: '真实删除后', document: { version: 1, delta: { ops: [{ insert: '真实删除后\n' }] } }, referencedAttachmentIds: [] });
    await click('移除附件'); expect(props.attachments).toHaveLength(0);
  });
  it('reclaims a managed orphan after body deletion, but keeps a referenced embed', async () => {
    props.attachments = [{ id: 'sticker', kind: 'sticker', sticker: STICKERS[0], richManaged: true }];
    const snapshot = vi.fn().mockResolvedValue({ markdown: '', document: { version: 1, delta: { ops: [] } }, referencedAttachmentIds: ['sticker'] });
    body().handleRef.current = { snapshot };
    await click('移除附件'); expect(props.attachments).toHaveLength(1);
    snapshot.mockResolvedValue({ markdown: '', document: { version: 1, delta: { ops: [] } }, referencedAttachmentIds: [] });
    await click('移除附件'); expect(props.attachments).toHaveLength(0);
  });
});
