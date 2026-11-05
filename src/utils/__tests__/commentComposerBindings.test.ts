import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import CommentComposer from '../../pages/topicDetail/CommentComposer';
vi.mock('react', () => ({ useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: (initial: any) => ({ current: initial }), useEffect: () => {} }));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView', Button: 'Button' }));
vi.mock('@tarojs/taro', () => ({ default: { getWindowInfo: () => ({ windowWidth: 375, windowHeight: 800, screenHeight: 800 }) } }));
vi.mock('../renderer', () => ({ isSkyline: () => true }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../components/MentionTextarea', () => ({ default: 'MentionTextarea' }));
vi.mock('../emojiUsage', () => ({ EMOJIS: [], getCommonEmojiUsage: () => ({ emojis: [], stickers: [] }), recordCommentEmojiUsage: vi.fn() }));
vi.mock('../imageUploadGuard', () => ({ ensureImageHostBound: vi.fn() }));
vi.mock('../imageCompressionPreferences', () => ({ isImageCompressionEnabled: () => true }));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }
describe('comment composer optional identity plumbing', () => {
  it('passes verified targets and explicit insertion callback without changing string input or send callbacks', () => {
    const targets = [{ label: '复杂 名👍', uid: 42 }], inserted = vi.fn(), change = vi.fn(), send = vi.fn();
    const nodes = all(CommentComposer({ value: 'synthetic reply', mentionUsers: ['复杂 名👍'], mentionTargets: targets, onMentionInsert: inserted, sending: false, onChange: change, onClose: vi.fn(), onSend: send }));
    const input = nodes.find(node => node.type === 'MentionTextarea')!;
    expect(input.props.mentionTargets).toBe(targets); expect(input.props.onMentionInsert).toBe(inserted);
    input.props.onInput({ detail: { value: 'next synthetic reply' } }); expect(change).toHaveBeenCalledWith('next synthetic reply');
    const binding = { uid: 42, reply_id: 0, start: 0, end: 7, label: '@复杂 名👍' };
    input.props.onMentionInsert(binding); expect(inserted).toHaveBeenCalledWith(binding);
    nodes.find(node => node.type === 'Button')!.props.onClick(); expect(send).toHaveBeenCalledWith();
  });
  it('leaves optional identity props absent for existing string-only callers and has no focus workaround', () => {
    const nodes = all(CommentComposer({ value: 'synthetic reply', sending: false, onChange: vi.fn(), onClose: vi.fn(), onSend: vi.fn() }));
    const input = nodes.find(node => node.type === 'MentionTextarea')!;
    expect(input.props.mentionTargets).toBeUndefined(); expect(input.props.onMentionInsert).toBeUndefined();
    const editor = readFileSync('src/components/MentionTextarea/index.tsx', 'utf8');
    expect(editor).not.toMatch(/setTimeout|setInterval|\.focus\(/);
  });
});
