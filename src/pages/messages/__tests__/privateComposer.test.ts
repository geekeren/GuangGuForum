import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import PrivateMessageComposer from '../PrivateMessageComposer';

const runtime = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], mounted: false, viewport: 800, resize: null as any, hide: null as any }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = initial; return [runtime.state[i], (next: any) => { runtime.state[i] = typeof next === 'function' ? next(runtime.state[i]) : next; }]; },
  useRef: (initial: any) => { const i = runtime.refCursor++; if (!(i in runtime.refs)) runtime.refs[i] = { current: initial }; return runtime.refs[i]; },
  useEffect: (fn: any) => { if (!runtime.mounted) runtime.effects.push(fn); },
}));
vi.mock('@tarojs/components', () => ({ Text: 'Text', Textarea: 'Textarea', View: 'View' }));
vi.mock('@tarojs/taro', () => ({ default: { getWindowInfo: () => ({ windowHeight: runtime.viewport, screenHeight: 800, safeArea: { bottom: 780 } }), nextTick: (callback: any) => callback(), onWindowResize: (callback: any) => { runtime.resize = callback; }, offWindowResize: () => { runtime.resize = null; } }, useDidHide: (callback: any) => { runtime.hide = callback; } }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
function all(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(all); if (!tree || typeof tree !== 'object') return []; return [tree, ...all(tree.props?.children)]; }
function render(extra = {}) {
  runtime.cursor = runtime.refCursor = 0; const nodes = all(PrivateMessageComposer({ value: 'fixture', limit: 500, disabled: false, posting: false, onChange: vi.fn(), onSend: vi.fn(), ...extra }));
  if (!runtime.mounted) { runtime.effects = runtime.effects.map(effect => effect()); runtime.mounted = true; } return nodes;
}
beforeEach(() => { runtime.effects.forEach(cleanup => cleanup?.()); runtime.state = []; runtime.refs = []; runtime.effects = []; runtime.viewport = 800; runtime.mounted = false; });

describe('compact text-only private composer', () => {
  it('uses auto-height native textarea, icon send and shared dock compensation without media/mention controls', () => {
    const nodes = render(); const input = nodes.find(node => node.type === 'Textarea');
    expect(input.props.autoHeight).toBe(true); expect(input.props.adjustPosition).toBe(false); expect(input.props.maxlength).toBe(500);
    expect(nodes.find(node => node.props.className === 'privateMessageSendIcon')).toBeDefined();
    expect(nodes.some(node => node.props.className?.includes('Emoji') || node.props.className?.includes('Photo') || node.props.className?.includes('Mention'))).toBe(false);
  });
  it('native private and shared comment controls explicitly use the shared caret token in compiled CSS', () => {
    const input = render().find(node => node.type === 'Textarea'); expect(input.props.className).toBe('privateMessageInput');
    const files = [
      ['src/pages/messages/index.scss', ['.privateMessageInput']],
      ['src/components/MentionTextarea/index.scss', ['.mentionEditorInput']],
      ['src/components/ClearableInput/index.scss', ['.clearableControl']],
    ] as const;
    for (const [file, selectors] of files) {
      const css = compileString(readFileSync(resolve(process.cwd(), file), 'utf8'), { loadPaths: [resolve(process.cwd(), file, '..')] }).css;
      for (const selector of selectors) expect(css).toContain(selector);
      expect(css).toContain('caret-color: var(--theme-input-caret, #0754d7)');
    }
  });
  it('two-line thread identity fits a 32px navbar capsule without changing font sizes', () => {
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/messages/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/messages')] }).css;
    const name = css.match(/\.privateThreadNavName\s*\{([^}]*)\}/)![1];
    const state = css.match(/\.privateThreadNavState\s*\{([^}]*)\}/)![1];
    expect(name).toContain('font-size: 14.91PX'); expect(state).toContain('font-size: 10.32PX');
    expect(name).toContain('line-height: 1.2'); expect(state).toContain('line-height: 1.2');
    expect((14.91 + 10.32) * 1.2).toBeLessThanOrEqual(32);
  });
  it('keyboard show lifts full inset when viewport unchanged, resize compensates and keyboard hide restores safe area', () => {
    let nodes = render(); const input = nodes.find(node => node.type === 'Textarea'); input.props.onKeyboardHeightChange({ detail: { height: 300 } });
    nodes = render(); expect(nodes.find(node => node.props.className === 'privateMessageKeyboardSlot').props.style.height).toBe('300px');
    runtime.viewport = 500; runtime.resize({ size: { windowHeight: 500 } }); nodes = render(); expect(nodes.find(node => node.props.className === 'privateMessageKeyboardSlot')).toBeUndefined();
    input.props.onKeyboardHeightChange({ detail: { height: 0 } }); runtime.viewport = 800; runtime.resize({ size: { windowHeight: 800 } }); nodes = render();
    expect(nodes.find(node => node.props.className === 'privateMessageKeyboardSlot')).toBeUndefined(); expect(nodes.find(node => node.props.className === 'privateMessageDock').props.style.paddingBottom).toBe('28px');
  });
  it('focus without height does not reset authoritative keyboard inset; hide clears dock', () => {
    let nodes = render(); const input = nodes.find(node => node.type === 'Textarea'); input.props.onKeyboardHeightChange({ detail: { height: 250 } }); input.props.onFocus({ detail: {} });
    nodes = render(); expect(nodes.find(node => node.props.className === 'privateMessageKeyboardSlot').props.style.height).toBe('250px');
    runtime.hide(); nodes = render(); expect(nodes.find(node => node.props.className === 'privateMessageKeyboardSlot')).toBeUndefined();
  });
  it('new-request textarea emits native input and explicitly sends after the controlled value updates', () => {
    const onChange = vi.fn(); const onSend = vi.fn(); let nodes = render({ value: '', limit: 120, onChange, onSend });
    const input = nodes.find(node => node.type === 'Textarea'); expect(input.props.disabled).toBe(false);
    input.props.onInput({ detail: { value: 'fixture new request' } }); expect(onChange).toHaveBeenCalledWith('fixture new request');
    nodes = render({ value: 'fixture new request', limit: 120, onChange, onSend });
    nodes.find(node => node.props.className?.startsWith('privateMessageSend ')).props.onClick(); expect(onSend).toHaveBeenCalledTimes(1);
  });
  it('disables send and input for blocked/qualification/posting states and enforces text capacity', () => {
    for (const extra of [{ disabled: true }, { posting: true }, { value: 'x'.repeat(121), limit: 120 }]) {
      const send = vi.fn(); const nodes = render({ ...extra, onSend: send }); nodes.find(node => node.props.className?.startsWith('privateMessageSend ')).props.onClick(); expect(send).not.toHaveBeenCalled();
    }
    const send = vi.fn(); let nodes = render({ onSend: send, value: 'x'.repeat(120), limit: 120 }); nodes.find(node => node.props.className?.startsWith('privateMessageSend ')).props.onClick(); expect(send).toHaveBeenCalledTimes(1);
  });
});
