import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import * as Native from '@tarojs/components';
import { GzkInput } from '../components/Input';
import { GzkTextarea } from '../components/Textarea';
import * as Form from '../components/NativeForm';
import { GzkFormField } from '../components/FormField';
import { GzkSelect } from '../components/Select';
import { GzkIcon } from '../components/Icon';
import { BASE_THEME_PALETTES } from '../theme';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';

const hooks = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0 }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useMemo: (compute: () => unknown) => compute(),
  useState: (initial: any) => { const i = hooks.cursor++; if (!(i in hooks.state)) hooks.state[i] = initial; return [hooks.state[i], (value: any) => { hooks.state[i] = value; }]; },
  useRef: (initial: any) => hooks.refs[hooks.refCursor++] ??= { current: initial },
  forwardRef: (render: any) => (props: any, ref: any) => render(props, ref),
}));
vi.mock('@tarojs/components', () => Object.fromEntries(['View', 'Text', 'Image', 'Input', 'Textarea', 'Picker', 'Button', 'Switch', 'Radio', 'RadioGroup'].map(name => [name, name])));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }
function render(component: any, props: any, ref?: any) { hooks.cursor = hooks.refCursor = 0; return component(props, ref); }
function native(tree: any) { return all(tree).find(node => node.type === 'Input' || node.type === 'Textarea')!; }
function css(name: string) { const directory = resolve('packages/gzk-ui/src/components', name); return compileString(readFileSync(resolve(directory, 'index.scss'), 'utf8'), { loadPaths: [directory] }).css; }
beforeEach(() => { hooks.state = []; hooks.refs = []; });

describe('controlled string form contracts', () => {
  it.each([GzkInput, GzkTextarea])('preserves refs, controlled strings, clear and disabled input (%s)', component => {
    const onInput = vi.fn(); const ref = { current: null }; const style = { caretColor: '#8bb5ff' };
    const tree = render(component, { value: '草稿', onInput, disabled: false, style, maxlength: -1, onConfirm: onInput }, ref);
    const input = native(tree); expect(input.ref || input.props.ref).toBe(ref); expect(input.props.style).toBe(style); expect(input.props.value).toBe('草稿'); expect(input.props.maxlength).toBe(-1);
    input.props.onInput({ detail: { value: '更新' } }); expect(onInput).toHaveBeenLastCalledWith('更新');
    all(tree).find(node => node.props.className?.split(' ').includes('clearableBtn'))!.props.onClick(); expect(onInput).toHaveBeenLastCalledWith('');
    onInput.mockClear(); const locked = render(component, { value: '草稿', onInput, disabled: true });
    native(locked).props.onInput({ detail: { value: '禁止' } }); all(locked).find(node => node.props.className?.split(' ').includes('clearableBtn'))!.props.onClick(); expect(onInput).not.toHaveBeenCalled();
  });
  it.each([GzkInput, GzkTextarea])('preserves opt-in zero-width empty-delete and normal empty controls (%s)', component => {
    const onInput = vi.fn(); const onDeleteWhenEmpty = vi.fn(); const props = { value: '', onInput, onDeleteWhenEmpty };
    native(render(component, props)).props.onFocus({}); const input = native(render(component, props));
    expect(input.props.value).toBe('​'); input.props.onInput({ detail: { value: '' } }); expect(onDeleteWhenEmpty).toHaveBeenCalledOnce(); expect(onInput).not.toHaveBeenCalled();
    input.props.onBlur({}); expect(native(render(component, props)).props.value).toBe(''); expect(native(render(component, { value: '', onInput })).props.value).toBe('');
  });
  it('forwards input caret/password/confirm and textarea keyboard geometry without event translation', () => {
    const onConfirm = vi.fn(); const input = native(render(GzkInput, { value: '', onInput: vi.fn(), cursorColor: '#0754d7', password: true, type: 'text', confirmType: 'search', focus: true, autoFocus: false, onConfirm }));
    expect(input.props).toMatchObject({ cursorColor: '#0754d7', password: true, type: 'text', confirmType: 'search', focus: true, autoFocus: false, onConfirm });
    const textarea = native(render(GzkTextarea, { value: '', onInput: vi.fn(), autoHeight: true, cursorSpacing: 0, adjustPosition: false, showConfirmBar: false, confirmType: 'done', onConfirm }));
    expect(textarea.props).toMatchObject({ autoHeight: true, cursorSpacing: 0, adjustPosition: false, showConfirmBar: false, confirmType: 'done', onConfirm });
  });
});

describe('transparent native primitives', () => {
  it('aliases the exact native components, retaining their event/ref/openType contracts without wrappers', () => {
    const names = { GzkNativeInput: 'Input', GzkNativeTextarea: 'Textarea', GzkPicker: 'Picker', GzkButton: 'Button', GzkSwitch: 'Switch', GzkRadio: 'Radio', GzkRadioGroup: 'RadioGroup' } as const;
    for (const [name, nativeName] of Object.entries(names)) expect(Form[name]).toBe(Native[nativeName]);
    const source = readFileSync(resolve('packages/gzk-ui/src/components/NativeForm/index.tsx'), 'utf8');
    expect(source).not.toMatch(/<View|onClick=|onInput=|onChange=|preventDefault|stopPropagation/);
  });
});

describe('standard inline field and selector', () => {
  it('renders one label/control row with namespaced hooks and multiline opt-in', () => {
    const child = createElement('input');
    const field = GzkFormField({ label: '个人简介', children: child, multiline: true, className: 'host', labelClassName: 'label', controlClassName: 'control' });
    expect(field.props.className).toBe('gzkFormField gzkFormField--multiline host');
    expect(field.props.children[0].props).toMatchObject({ className: 'gzkFormFieldLabel label', children: '个人简介' });
    expect(field.props.children[1].props).toMatchObject({ className: 'gzkFormFieldControl control', children: child });
    const compiled = css('FormField'); expect(compiled).toContain('width: 128rpx'); expect(compiled).toContain('min-width: 0'); expect(compiled).toContain('align-items: flex-start');
  });
  it('maps the selected API value to native range/index and emits only a validated option value', () => {
    const options = [{ value: 'a', label: '完整选项一' }, { value: 'b', label: '完整选项二' }]; const onChange = vi.fn();
    const picker = GzkSelect({ options, value: 'b', theme: 'dark', onChange });
    expect(picker.props.range).toEqual(['完整选项一', '完整选项二']); expect(picker.props.value).toBe(1);
    expect(all(picker).find(node => node.props.className === 'gzkSelectValue')!.props.children).toBe('完整选项二');
    picker.props.onChange({ detail: { value: '0' } }); expect(onChange).toHaveBeenLastCalledWith('a');
    picker.props.onChange({ detail: { value: 1 } }); expect(onChange).toHaveBeenLastCalledWith('b');
    onChange.mockClear(); for (const value of [-1, 2, 0.5, NaN, '1x', '', null, true]) picker.props.onChange({ detail: { value } }); expect(onChange).not.toHaveBeenCalled();
    const disabled = GzkSelect({ options, value: 'b', theme: 'dark', disabled: true, onChange }); disabled.props.onChange({ detail: { value: 0 } }); expect(onChange).not.toHaveBeenCalled();
  });
  it.each(['light', 'dark'] as const)('owns a muted %s chevron, full selected label and empty fallback rather than duplicated selection text', theme => {
    const picker = GzkSelect({ options: [], value: '', theme, onChange: vi.fn(), placeholder: '未设置' });
    const label = all(picker).find(node => node.props.className === 'gzkSelectValue')!; expect(label.props.children).toBe('未设置');
    const icon = all(picker).find(node => node.type === GzkIcon)!; expect(icon.props.theme).toBe(theme); expect(icon.props.tone).toBe('muted');
    const document = GzkIcon(icon.props).props.src; expect(decodeURIComponent(document)).toContain(BASE_THEME_PALETTES[theme]['text-tertiary']);
    const compiled = css('Select'); expect(compiled).toContain('word-break: break-all'); expect(compiled).toContain('width: 24rpx'); expect(compiled).not.toMatch(/ellipsis|nowrap/);
  });
});
