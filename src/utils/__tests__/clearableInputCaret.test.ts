import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClearableInput, ClearableTextarea } from '../../components/ClearableInput';

// Actual production controls; this hook/tree harness does not simulate the native renderer.
const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock('react', () => ({
  useState: (initial: any) => {
    const i = harness.cursor++;
    if (!(i in harness.state)) harness.state[i] = initial;
    return [harness.state[i], (value: any) => { harness.state[i] = value; }];
  },
  useRef: (initial: any) => harness.refs[harness.refCursor++] ??= { current: initial },
  forwardRef: (render: any) => (props: any) => render(props, null),
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Input: 'Input', Textarea: 'Textarea' }));
function render(component: any, props: any) { harness.cursor = harness.refCursor = 0; return component(props); }
function elements(tree: any): any[] {
  return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : [];
}
function native(tree: any) { return elements(tree).find(node => node.type === 'Input' || node.type === 'Textarea'); }
function clear(tree: any) { return elements(tree).find(node => node.props.className?.split(' ').includes('clearableBtn')); }
beforeEach(() => { harness.state = []; harness.refs = []; });

describe('shared native control caret and focus contract', () => {
  it.each([ClearableInput, ClearableTextarea])('forwards style and disabled state while preserving natural focus, controlled input and clear', (component) => {
    const onInput = vi.fn(); const onFocus = vi.fn(); const onBlur = vi.fn();
    const props = { value: '', onInput, onFocus, onBlur, style: { caretColor: '#8bb5ff' }, disabled: false };
    let control = native(render(component, props));
    expect(control.props.style).toBe(props.style); expect(control.props.disabled).toBe(false);
    expect(control.props.focus).toBeUndefined(); expect(control.props.autoFocus).toBeUndefined();
    control.props.onFocus({ detail: {} }); expect(onFocus).toHaveBeenCalledTimes(1);
    control = native(render(component, props)); expect(control.props.value).toBe('');
    control.props.onInput({ detail: { value: '正常输入' } }); expect(onInput).toHaveBeenCalledWith('正常输入');
    const typed = render(component, { ...props, value: '正常输入' });
    expect(native(typed).props.value).toBe('正常输入');
    native(typed).props.onBlur({ detail: {} }); expect(onBlur).toHaveBeenCalledTimes(1);
    expect(native(render(component, { ...props, value: '正常输入' })).props.value).toBe('正常输入');
    clear(typed).props.onClick(); expect(onInput).toHaveBeenLastCalledWith('');
    const locked = render(component, { ...props, value: '正常输入', disabled: true });
    expect(native(locked).props.disabled).toBe(true); onInput.mockClear();
    native(locked).props.onInput({ detail: { value: '禁止更新' } }); clear(locked).props.onClick();
    expect(onInput).not.toHaveBeenCalled();
  });
  it.each([ClearableInput, ClearableTextarea])('keeps opt-in empty-delete handling and normal empty controls free of synthetic values', (component) => {
    const onInput = vi.fn(); const onDeleteWhenEmpty = vi.fn();
    const props = { value: '', onInput, onDeleteWhenEmpty };
    let control = native(render(component, props));
    control.props.onFocus({ detail: {} }); control = native(render(component, props));
    expect(control.props.value).toBe('​'); control.props.onInput({ detail: { value: '' } });
    expect(onDeleteWhenEmpty).toHaveBeenCalledTimes(1); expect(onInput).not.toHaveBeenCalled();
    control.props.onBlur({ detail: {} }); expect(native(render(component, props)).props.value).toBe('');
    expect(native(render(component, { value: '', onInput })).props.value).toBe('');
  });
  it('uses the genuine single-line native cursorColor prop and does not introduce a forced focus workaround', () => {
    expect(native(render(ClearableInput, { value: '', cursorColor: '#0754d7', onInput: vi.fn() })).props.cursorColor).toBe('#0754d7');
    const input = readFileSync(resolve(process.cwd(), 'packages/gzk-ui/src/components/Input/index.tsx'), 'utf8');
    const textarea = readFileSync(resolve(process.cwd(), 'packages/gzk-ui/src/components/Textarea/index.tsx'), 'utf8');
    for (const source of [input, textarea]) expect(source).not.toMatch(/setTimeout|setInterval|nextTick|\.focus\(/);
    expect(textarea).toContain('微信原生模板未绑定 cursor-color');
  });
});
