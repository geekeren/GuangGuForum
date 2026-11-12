import { beforeEach, describe, expect, it, vi } from 'vitest';
import MentionTextarea from '../../components/MentionTextarea';
import type { CommentMentionBinding } from '../commentMentionBindings';
const runtime = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = initial; return [runtime.state[i], (next: any) => runtime.state[i] = typeof next === 'function' ? next(runtime.state[i]) : next]; },
  useRef: (initial: any) => { const i = runtime.refCursor++; return runtime.refs[i] ??= { current: initial }; },
  useImperativeHandle: (ref: any, make: any) => { if (ref) ref.current = make(); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Textarea: 'Textarea' }));
vi.mock('@tarojs/taro', () => ({ default: { getWindowInfo: () => ({ windowWidth: 375 }) } }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline' }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }
function render(props: any) { runtime.cursor = runtime.refCursor = 0; return all(MentionTextarea(props)); }
beforeEach(() => { runtime.state = []; runtime.refs = []; });
describe('opt-in explicit native mention selection bindings', () => {
  it('emits an exact complex display label and UTF-16 range only after text change', () => {
    let value = '👍 @'; const order: string[] = [], inserted = vi.fn((_binding: CommentMentionBinding) => { order.push('binding'); });
    const props = () => ({ value, mentionUsers: ['复杂 名👍'], mentionTargets: [{ label: '复杂 名👍', uid: 42 }], onInput: (event: any) => { value = event.detail.value; order.push('text'); }, onMentionInsert: inserted });
    render(props()).find(node => node.type === 'Textarea')!.props.onInput({ detail: { value, cursor: value.length } });
    order.length = 0;
    render(props()).find(node => node.props.className === 'mentionCandidate')!.props.onClick();
    expect(value).toBe('👍 @复杂 名👍 ');
    expect(order).toEqual(['text', 'binding']);
    const binding = inserted.mock.calls[0][0];
    expect(binding).toEqual({ uid: 42, reply_id: 0, start: 3, end: 10, label: '@复杂 名👍' });
    expect(value.slice(binding.start, binding.end)).toBe(binding.label);
    const native = render(props()).find(node => node.type === 'Textarea')!;
    expect(native.props.mentionTargets).toBeUndefined(); expect(native.props.onMentionInsert).toBeUndefined();
    expect(native.props.focus).toBeUndefined();
  });
  it.each(['unknown', 'ambiguous', 'unsafe'])('does not fabricate a %s candidate identity', kind => {
    let value = '@'; const inserted = vi.fn();
    const targets = kind === 'unknown' ? [] : kind === 'ambiguous' ? [{ label: 'Alice', uid: 42 }, { label: 'Alice', uid: 43 }] : [{ label: 'Alice', uid: 0 }];
    const props = () => ({ value, mentionUsers: ['Alice'], mentionTargets: targets, onInput: (event: any) => value = event.detail.value, onMentionInsert: inserted });
    render(props()).find(node => node.type === 'Textarea')!.props.onInput({ detail: { value, cursor: 1 } });
    render(props()).find(node => node.props.className === 'mentionCandidate')!.props.onClick();
    expect(value).toBe('@Alice '); expect(inserted).not.toHaveBeenCalled();
  });
  it('manual text and disabled edits emit no identity even with a matching target', () => {
    const inserted = vi.fn(), input = vi.fn();
    render({ value: '', mentionUsers: ['Alice'], mentionTargets: [{ label: 'Alice', uid: 42 }], onMentionInsert: inserted, onInput: input }).find(node => node.type === 'Textarea')!.props.onInput({ detail: { value: '@Alice ', cursor: 7 } });
    expect(inserted).not.toHaveBeenCalled();
    const nodes = render({ value: '@', disabled: true, mentionUsers: ['Alice'], mentionTargets: [{ label: 'Alice', uid: 42 }], onMentionInsert: inserted, onInput: input });
    nodes.find(node => node.props.className === 'mentionCandidate')?.props.onClick();
    expect(inserted).not.toHaveBeenCalled();
  });
});
