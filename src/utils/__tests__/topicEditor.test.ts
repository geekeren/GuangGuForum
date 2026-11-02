import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import TopicEditor from '../../pages/createTopic/TopicEditor';
import { getCommonEmojiUsage, recordCommentEmojiUsage } from '../emojiUsage';
import { STICKERS } from '../stickers';

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock('react', () => ({
  useEffect: () => {},
  useImperativeHandle: (ref: any, create: any) => { if (ref) ref.current = create(); },
  useRef: (initial: any) => { const i = harness.refCursor++; return harness.refs[i] ??= { current: initial }; },
  useState: (initial: any) => {
    const i = harness.cursor++;
    if (!(i in harness.state)) harness.state[i] = typeof initial === 'function' ? initial() : initial;
    return [harness.state[i], (value: any) => { harness.state[i] = typeof value === 'function' ? value(harness.state[i]) : value; }];
  },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { hideKeyboard: vi.fn(), showToast: vi.fn() } }));
vi.mock('../../components/MentionTextarea', () => ({ default: 'MentionTextarea' }));
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
function click(label: string) { all(render()).find(e => e.props?.ariaLabel === label)!.props.onClick(); }
beforeEach(() => {
  harness.state = []; harness.refs = []; vi.clearAllMocks();
  vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: [], stickers: [] });
  props = { value: '', placeholder: '', inputRef: { current: null }, previousRef: { current: null }, disabled: false, attachments: [], onChange: vi.fn(), onAttachmentsChange: update => { props.attachments = update(props.attachments); } };
});

describe('topic editor floating tools', () => {
  it('shows only after body focus, follows keyboard height and places mentions above the toolbar', () => {
    expect(find(render(), 'topicEditorDock')).toBeUndefined();
    find(render(), 'MentionTextarea').props.onFocus({ detail: { height: 320 } });
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('320px');
    expect(find(render(), 'MentionTextarea').props.candidatesStyle.bottom).toBe('calc(320px + 92rpx)');
    find(render(), 'MentionTextarea').props.onBlur();
    find(render(), 'MentionTextarea').props.onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), 'topicEditorDock')).toBeUndefined();
  });
  it('replaces the keyboard with a panel below the toolbar and survives delayed keyboard close events', () => {
    find(render(), 'MentionTextarea').props.onFocus({ detail: { height: 320 } });
    click('表情');
    find(render(), 'MentionTextarea').props.onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('0px');
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('320px');
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
    click('切换到键盘');
    find(render(), 'MentionTextarea').props.onKeyboardHeightChange({ detail: { height: 0 } });
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('320px');
    find(render(), 'MentionTextarea').props.onKeyboardHeightChange({ detail: { height: 300 } });
    expect(find(render(), 'topicEditorDock').props.style.bottom).toBe('300px');
  });
  it('records selections immediately and refreshes common before publishing', () => {
    find(render(), 'MentionTextarea').props.onFocus({ detail: { height: 320 } });
    click('表情');
    all(render()).find(e => e.props?.className === 'topicEditorTab' && e.props.children.props.children === '表情')!.props.onClick();
    const insertText = vi.fn();
    find(render(), 'MentionTextarea').props.editorRef.current = { insertText };
    vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: ['👍'], stickers: [STICKERS[0]] });
    click('插入表情👍');
    expect(insertText).toHaveBeenCalledWith('👍');
    expect(recordCommentEmojiUsage).toHaveBeenCalledWith('👍', []);
    all(render()).find(e => e.props?.className === 'topicEditorTab' && e.props.children.props.children === '常用')!.props.onClick();
    expect(all(render()).some(e => e.props?.ariaLabel === '插入表情👍')).toBe(true);
    click(`添加表情包${STICKERS[0].name}`);
    expect(recordCommentEmojiUsage).toHaveBeenCalledWith('', [STICKERS[0]]);
    expect(props.attachments).toHaveLength(1);
  });
});
