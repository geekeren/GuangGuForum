import { beforeEach, describe, expect, it, vi } from 'vitest';
import RichTopicBody from '../../pages/createTopic/RichTopicBody';
import { sanitizeTopicDelta } from '../topicDocumentSanitizer';
import { serializeTopicDocumentHtml } from '../topicDocument';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0, context: null as any, theme: 'light' as 'light' | 'dark' }));
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
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: h.theme }) }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
let props: Parameters<typeof RichTopicBody>[0];
function render() { h.cursor = 0; h.refCursor = 0; return elements(RichTopicBody(props)); }
function editor() { return render().find(e => e.type === 'Editor')!.props; }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function input(text: string) { return editor().onInput({ detail: { delta: { ops: [{ insert: text + '\n' }] } } }); }
beforeEach(() => {
  h.state = []; h.refs = []; h.effects = []; h.theme = 'light'; vi.clearAllMocks();
  h.context = { setContents: vi.fn((cb: any) => cb.success({})), getContents: vi.fn((cb: any) => cb.success({ delta: { ops: [{ insert: '正文\n' }] } })),
    insertText: vi.fn((cb: any) => cb.success({})), insertImage: vi.fn((cb: any) => cb.success({})), format: vi.fn() };
  props = { value: '正文', attachments: [], disabled: false, focus: false, placeholder: 'body', handleRef: { current: null }, onChange: vi.fn(), onFocus: vi.fn(), onBlur: vi.fn() };
});
describe('rich topic body native rich-paste normalization', () => {
  const pasted = { ops: [{ insert: '网页中文🙂', attributes: { bold: true, color: '#000', link: 'https://example.com', header: 5 } }, { insert: '\n' },
    { insert: '条目', attributes: { italic: true, indent: 2, list: 'ordered' } }, { insert: '\n' }, { insert: { image: 'https://img.test/external.jpg' }, attributes: { alt: '图', width: '200px' } }, { insert: '\n' }] };
  const notice = () => render().find(e => e.props?.className === 'topicEditorNotice')?.props.children;
  it('normalizes native input and snapshot identically without rewriting the native document', async () => {
    editor().onReady(); await flush(); const normalized = sanitizeTopicDelta(pasted).delta;
    editor().onInput({ detail: { delta: pasted } }); await flush();
    const change = vi.mocked(props.onChange).mock.calls.at(-1)!; expect(change[1]!.delta).toEqual(normalized);
    expect(notice()).toContain('已转换');
    props = { ...props, value: change[0], document: change[1] }; render(); h.effects.at(-1)();
    h.context.getContents.mockImplementation((cb: any) => cb.success({ delta: pasted }));
    const snapshot = await props.handleRef.current!.snapshot(); expect(snapshot.document!.delta).toEqual(normalized);
    expect(snapshot.errors).toEqual([]); expect(snapshot.unsupported).toEqual([]);
    expect(serializeTopicDocumentHtml(snapshot.document!.delta).html).toContain('<h3><strong>网页中文🙂</strong></h3>');
    expect(h.context.setContents).toHaveBeenCalledOnce(); expect(notice()).toContain('已转换');
    // An echoed clean snapshot must not immediately erase the paste downgrade notice.
    h.context.getContents.mockImplementation((cb: any) => cb.success({ delta: normalized }));
    await props.handleRef.current!.snapshot(); expect(notice()).toContain('已转换');
  });
  it('rejects a stale rich-paste snapshot after newer input without overwriting the normalized draft', async () => {
    editor().onReady(); await flush(); render(); let complete!: (value: any) => void;
    h.context.getContents.mockImplementation((cb: any) => { complete = cb.success; });
    const snapshot = props.handleRef.current!.snapshot(); const rejection = expect(snapshot).rejects.toThrow('changed'); await flush();
    const latest = { ops: [{ insert: '最新🙂', attributes: { italic: true, background: '#fff' } }, { insert: '\n' }] };
    editor().onInput({ detail: { delta: latest } }); await flush(); complete({ delta: pasted }); await rejection;
    expect(vi.mocked(props.onChange).mock.calls.at(-1)![1]!.delta).toEqual(sanitizeTopicDelta(latest).delta);
    expect(h.context.setContents).toHaveBeenCalledOnce();
  });
  it('normalizes a native snapshot even when the paste input event was missed', async () => {
    editor().onReady(); await flush(); render(); h.context.getContents.mockImplementation((cb: any) => cb.success({ delta: pasted }));
    const snapshot = await props.handleRef.current!.snapshot(); expect(snapshot.document!.delta).toEqual(sanitizeTopicDelta(pasted).delta);
    expect(snapshot.errors).toEqual([]); expect(notice()).toContain('已转换'); expect(h.context.setContents).toHaveBeenCalledOnce();
  });
  it.each(['wxfile://pasted.jpg', 'data:image/png;base64,a'])('keeps unsafe pasted image %s visibly invalid rather than deleting it', async src => {
    editor().onReady(); await flush(); render(); const delta = { ops: [{ insert: '文字' }, { insert: { image: src } }, { insert: '\n' }] };
    h.context.getContents.mockImplementation((cb: any) => cb.success({ delta }));
    const snapshot = await props.handleRef.current!.snapshot(); expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.document!.delta.ops.some(op => typeof op.insert === 'object' && op.insert.image === src)).toBe(true);
    expect(serializeTopicDocumentHtml(snapshot.document!.delta).html).not.toContain('<img');
  });
  it('retains foreign attachment identity and malformed embed errors at the snapshot boundary', async () => {
    editor().onReady(); await flush(); render(); const delta = { ops: [{ insert: '文字' }, { insert: { image: 'https://img.test/p.jpg' }, attributes: { attachmentId: 'foreign' } }, { insert: { video: 'unsupported' } }, { insert: '\n' }] };
    h.context.getContents.mockImplementation((cb: any) => cb.success({ delta }));
    const snapshot = await props.handleRef.current!.snapshot(); expect(snapshot.errors.length).toBeGreaterThan(0);
    expect(snapshot.document!.delta.validationErrors).toContain('文档包含不支持的嵌入内容');
    expect(snapshot.referencedAttachmentIds).toContain('foreign');
  });
});

describe('rich topic body native lifecycle', () => {
  it('binds native Editor theme color without rehydrating or formatting the draft', async () => {
    expect(editor().style.color).toBe('#0f1626');
    editor().onReady(); await flush(); render();
    h.theme = 'dark'; expect(editor().style.color).toBe('#f2f2f2');
    h.effects.at(-1)(); await flush();
    expect(h.context.setContents).toHaveBeenCalledOnce();
    expect(h.context.format).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it('does not advertise native programmatic focus or textarea-only props', () => {
    props.focus = true; props.onTouchStart = vi.fn();
    const native = editor();
    expect(props.handleRef.current!.canFocus()).toBe(false);
    expect(native.focus).toBeUndefined(); expect(native.holdKeyboard).toBeUndefined();
    native.onTouchStart(); expect(props.onTouchStart).toHaveBeenCalledOnce();
  });
  it('allows focus only for the enabled source textarea and forwards body touch', () => {
    props.value = '```js\nconst x = 1;\n```'; props.focus = true; props.onTouchStart = vi.fn();
    let source = render().find(e => e.type === 'MentionTextarea')!.props;
    expect(props.handleRef.current!.canFocus()).toBe(true);
    expect(source.focus).toBe(true); expect(source.holdKeyboard).toBe(true);
    source.onTouchStart(); expect(props.onTouchStart).toHaveBeenCalledOnce();
    props.focus = false; source = render().find(e => e.type === 'MentionTextarea')!.props;
    expect(source.holdKeyboard).toBe(false);
    props.disabled = true; render(); expect(props.handleRef.current!.canFocus()).toBe(false);
  });
  it('formats the native selection without rehydrating the whole document', async () => {
    editor().onReady(); await flush(); render();
    props.handleRef.current!.format('bold'); await flush();
    expect(h.context.format).toHaveBeenCalledOnce(); expect(h.context.format).toHaveBeenCalledWith('bold');
    expect(h.context.setContents).toHaveBeenCalledOnce();
  });
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
  it('fails closed when the pre-insertion snapshot fails, and captures blur delta', async () => {
    editor().onReady(); await flush();
    render();
    h.context.getContents.mockImplementation((cb: any) => cb.fail(new Error('read failed')));
    expect(await props.handleRef.current!.insertImage('https://img.test/p.jpg', 'p', '图片')).toBe('retry');
    expect(h.context.insertImage).not.toHaveBeenCalled();
    editor().onBlur({ detail: { delta: { ops: [{ insert: '最后正文\n' }] } } });
    expect(props.onChange).toHaveBeenLastCalledWith('最后正文', expect.objectContaining({ version: 1 }));
  });
  it('preserves unsupported legacy source exactly with visible plain rendering notice', async () => {
    props.value = '```js\nconst x = 1;\n```';
    const tree = render(); const source = tree.find(e => e.type === 'MentionTextarea')!;
    expect(source.props.value).toBe(props.value);
    expect(tree.some(e => String(e.props?.children).includes('按原样文字'))).toBe(true);
    expect(await props.handleRef.current!.snapshot()).toEqual({ markdown: props.value, errors: [], unsupported: [], referencedAttachmentIds: [] });
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
