import { beforeEach, describe, expect, it, vi } from 'vitest';
import RichTopicBody from '../../pages/createTopic/RichTopicBody';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0, context: null as any }));
vi.mock('react', () => ({
  useState(initial: any) { const i = h.cursor++; if (!(i in h.state)) h.state[i] = initial; return [h.state[i], (v: any) => { h.state[i] = typeof v === 'function' ? v(h.state[i]) : v; }]; },
  useRef(initial: any) { return h.refs[h.refCursor++] ??= { current: initial }; },
  useEffect(effect: any) { h.effects.push(effect); },
  useImperativeHandle(ref: any, create: any) { ref.current = create(); },
}));
vi.mock('@tarojs/components', () => ({ Editor: 'Editor', Text: 'Text', View: 'View' }));
vi.mock('@tarojs/taro', () => ({ default: { createSelectorQuery: () => { const query = { select: () => query, context: (cb: any) => { cb({ context: h.context }); return query; }, exec: () => {} }; return query; } } }));
vi.mock('../../components/MentionTextarea', () => ({ default: 'MentionTextarea' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => 'tester' }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
let props: Parameters<typeof RichTopicBody>[0];
function render() { h.cursor = 0; h.refCursor = 0; return elements(RichTopicBody(props)); }
function editor() { return render().find(e => e.type === 'Editor')!.props; }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function input(text: string) { return editor().onInput({ detail: { delta: { ops: [{ insert: text + '\n' }] } } }); }
beforeEach(() => {
  h.state = []; h.refs = []; h.effects = []; vi.clearAllMocks();
  h.context = { setContents: vi.fn((cb: any) => cb.success({})), getContents: vi.fn((cb: any) => cb.success({ delta: { ops: [{ insert: '正文\n' }] } })),
    insertText: vi.fn((cb: any) => cb.success({})), insertImage: vi.fn((cb: any) => cb.success({})), format: vi.fn() };
  props = { value: '正文', attachments: [], disabled: false, focus: false, placeholder: 'body', handleRef: { current: null }, onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() };
});
describe('rich topic body native lifecycle', () => {
  it('fails closed before ready, hydrates once and never setContents for echoed typing', async () => {
    render(); await expect(props.handleRef.current!.snapshot()).rejects.toThrow('unavailable');
    editor().onReady(); await flush(); expect(editor().readOnly).toBe(false);
    input('新正文'); await flush();
    const change = vi.mocked(props.onChange).mock.calls.at(-1)!;
    props = { ...props, value: change[0], document: change[1] }; render();
    h.effects.at(-1)(); await flush(); expect(h.context.setContents).toHaveBeenCalledOnce();
    expect(change[0]).toBe('新正文');
  });
  it('allows reads while disabled and rejects failing native snapshots', async () => {
    editor().onReady(); await flush(); props.disabled = true; render();
    expect((await props.handleRef.current!.snapshot()).markdown).toBe('正文');
    h.context.getContents.mockImplementation((cb: any) => cb.fail(new Error('read failed')));
    await expect(props.handleRef.current!.snapshot()).rejects.toThrow('read failed');
  });
  it('reports successful image insertion even if follow-up read fails, and captures blur delta', async () => {
    editor().onReady(); await flush();
    render();
    h.context.getContents.mockImplementation((cb: any) => cb.fail(new Error('read failed')));
    expect(await props.handleRef.current!.insertImage('https://img.test/p.jpg', 'p', '图片')).toBe(true);
    editor().onBlur({ detail: { delta: { ops: [{ insert: '最后正文\n' }] } } });
    expect(props.onChange).toHaveBeenLastCalledWith('最后正文', expect.objectContaining({ version: 1 }));
  });
  it('preserves unsupported legacy source exactly with visible plain rendering notice', async () => {
    props.value = '```js\nconst x = 1;\n```';
    const tree = render(); const source = tree.find(e => e.type === 'MentionTextarea')!;
    expect(source.props.value).toBe(props.value);
    expect(tree.some(e => String(e.props?.children).includes('按原样文字'))).toBe(true);
    expect(await props.handleRef.current!.snapshot()).toEqual({ markdown: props.value, errors: [], unsupported: [] });
  });
  it('reconciles the actual partial Delta when the second shortcut deletion fails', async () => {
    props.value = '**正文*';
    props.document = { version: 1, delta: { ops: [{ insert: '**正文*\n' }] } };
    let nativeText = '**正文**\n';
    h.context.getSelection = vi.fn((cb: any) => cb.success({ range: { index: 6, length: 0 } }));
    h.context.setSelection = vi.fn((cb: any) => cb.success({}));
    h.context.deleteText = vi.fn().mockImplementationOnce((cb: any) => {
      nativeText = nativeText.slice(0, cb.index) + nativeText.slice(cb.index + cb.length);
      editor().onInput({ detail: { delta: { ops: [{ insert: nativeText }] } } });
      cb.success({});
    }).mockImplementationOnce((cb: any) => cb.fail(new Error('second delete failed')));
    h.context.getContents.mockImplementation((cb: any) => cb.success({ delta: { ops: [{ insert: nativeText }] } }));
    editor().onReady(); await flush();
    input('**正文**'); await flush(); await flush();
    expect(h.context.deleteText).toHaveBeenCalledTimes(2);
    expect(h.context.format).not.toHaveBeenCalled();
    expect(vi.mocked(props.onChange).mock.calls.at(-1)![1]!.delta.ops).toEqual([{ insert: '**正文\n' }]);
    expect(render().some(e => String(e.props?.children).includes('已同步当前正文'))).toBe(true);
  });
  it('does not publish a stale mutation resnapshot over newer native typing', async () => {
    editor().onReady(); await flush(); render();
    let complete!: (value: any) => void;
    h.context.getContents.mockImplementation((cb: any) => { complete = cb.success; });
    const mutation = props.handleRef.current!.insertText('旧内容'); await flush();
    input('最新正文'); await flush();
    complete({ delta: { ops: [{ insert: '旧快照\n' }] } }); await mutation;
    expect(props.onChange).toHaveBeenLastCalledWith('最新正文', expect.any(Object));
  });
  it('hydrates external document even if its Markdown projection is unchanged', async () => {
    editor().onReady(); await flush();
    props.document = { version: 1, delta: { ops: [{ insert: '正文', attributes: { bold: true } }, { insert: '\n' }] } };
    render(); h.effects.at(-1)(); await flush();
    expect(h.context.setContents).toHaveBeenLastCalledWith(expect.objectContaining({ delta: props.document.delta }));
  });
});
