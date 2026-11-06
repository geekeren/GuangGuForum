import { beforeEach, describe, expect, it, vi } from 'vitest';
import RichTopicBody from '../../pages/createTopic/RichTopicBody';
import TopicEditor from '../../pages/createTopic/TopicEditor';
import { createRequire } from 'node:module';
import { document as runtimeDocument, hydrate, TaroEvent } from '@tarojs/runtime';
import { sanitizeTopicDelta } from '../topicDocumentSanitizer';
import { serializeTopicDocumentHtml } from '../topicDocument';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0, context: null as any, theme: 'light' as 'light' | 'dark', account: 'tester' }));
vi.mock('react', () => ({
  useState(initial: any) { const i = h.cursor++; const state = h.state; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], (v: any) => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
  useRef(initial: any) { return h.refs[h.refCursor++] ??= { current: initial }; },
  useEffect(effect: any) { h.effects.push(effect); },
  useImperativeHandle(ref: any, create: any) { ref.current = create(); },
}));
vi.mock('@tarojs/components', () => ({ Editor: 'Editor', Text: 'Text', View: 'View', Image: 'Image', ScrollView: 'ScrollView', RootPortal: 'RootPortal' }));
vi.mock('@tarojs/taro', () => ({ default: {
  getWindowInfo: () => ({ windowWidth: 430, windowHeight: 900, screenHeight: 932, safeArea: { bottom: 898 } }),
  hideKeyboard: vi.fn().mockResolvedValue({ errMsg: 'hideKeyboard:ok' }), onKeyboardHeightChange: vi.fn(), offKeyboardHeightChange: vi.fn(), onWindowResize: vi.fn(), offWindowResize: vi.fn(), nextTick: (cb: () => void) => cb(),
  createSelectorQuery: () => { const query = { select: () => query, context: (cb: any) => { cb({ context: h.context }); return query; }, boundingClientRect: () => query, exec: () => {} }; return query; },
}, useDidHide: vi.fn(), useDidShow: vi.fn(), useReady: vi.fn() }));
vi.mock('guanggu-forum-api', () => ({ createImageUploadController: vi.fn(), ImageUploadError: class extends Error {}, uploadImage: vi.fn() }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => undefined }));
vi.mock('../emojiUsage', () => ({ getCommonEmojiUsage: () => ({ emojis: [], stickers: [] }), recordCommentEmojiUsage: vi.fn() }));
vi.mock('../imageUploadGuard', () => ({ ensureImageHostBound: vi.fn(), openImageHostSettings: vi.fn() }));
vi.mock('../keyboardAccessory', () => ({ tryHideKeyboardAccessoryView: vi.fn() }));
vi.mock('../../components/MentionTextarea', () => ({ default: 'MentionTextarea' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => h.account }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: h.theme }) }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
let props: Parameters<typeof RichTopicBody>[0];
function render() { h.cursor = 0; h.refCursor = 0; return elements(RichTopicBody(props)); }
function editor() { return render().find(e => e.type === 'Editor')!.props; }
function nativeBodyTarget() { return render().find(e => e.props?.className === 'topicNativeBodyTarget')!.props; }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function input(text: string) { return editor().onInput({ detail: { delta: { ops: [{ insert: text + '\n' }] } } }); }
const projectRequire = createRequire(`${process.cwd()}/package.json`);
function nativeTemplates() {
  const { Weapp } = projectRequire('@tarojs/plugin-platform-weapp');
  const helper = projectRequire('@tarojs/helper');
  const platform = new Weapp({ helper, paths: {}, modifyComponentConfig() {} }, { compiler: 'vite' }, {});
  platform.modifyTemplate({});
  const template = platform.template;
  const generated = template.buildTemplate({ includes: new Set(['editor', 'view', 'catch-view']), exclude: new Set(), thirdPartyComponents: new Map(), includeAll: false });
  const tag = (name: string) => generated.match(new RegExp(`<${name}\\s[^>]*>`))![0];
  // Use the ordinary View by its generated alias, not the earlier catch-view.
  const ordinaryView = generated.match(new RegExp(`<template name="tmpl_0_${template.componentsAlias.view._num}">([\\s\\S]*?)<\\/template>`))![1].match(/<view\s[^>]*>/)![0];
  return { editor: tag('editor'), view: ordinaryView, aliases: template.componentsAlias };
}
function boundBodyView() {
  const target = nativeBodyTarget();
  const node = runtimeDocument.createElement('view');
  const native = runtimeDocument.createElement('editor'); node.appendChild(native);
  for (const [event, callback] of Object.entries({ touchstart: target.onTouchStart, touchmove: target.onTouchMove, touchcancel: target.onTouchCancel, tap: target.onClick })) node.addEventListener(event, callback, {});
  return { node, native, dispatch(event: string) {
    // Editor has no native touch bindings. Its bubbling gesture reaches the
    // View's actual bind handler; dispatch there, never call Editor.start.
    const result = new TaroEvent(event, { bubbles: true, cancelable: true });
    node.dispatchEvent(result);
    expect(result._stop).toBe(false); expect(result.defaultPrevented).toBe(false);
  } };
}
beforeEach(() => {
  h.state = []; h.refs = []; h.effects = []; h.theme = 'light'; h.account = 'tester'; vi.clearAllMocks();
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
  it('uses actual ordinary View touch bindings rather than absent Editor bindings or catch-view', async () => {
    const templates = nativeTemplates();
    expect(templates.editor).toContain('bindtap="eh"');
    for (const event of ['touchstart', 'touchmove', 'touchcancel']) {
      expect(templates.editor).not.toContain(`bind${event}=`);
      expect(templates.view).toContain(`bind${event}="eh"`);
    }
    expect(templates.view).not.toContain('catchtouchmove');
    editor().onReady(); await flush();
    const bridge = boundBodyView();
    expect(hydrate(bridge.node).nn).toBe(templates.aliases.view._num);
    expect(bridge.node.props.catchMove).toBeUndefined();
    expect(nativeBodyTarget().style).toBeUndefined();
    expect(editor().onTouchStart).toBeUndefined(); expect(editor().onTouchMove).toBeUndefined(); expect(editor().onTouchCancel).toBeUndefined(); expect(editor().onClick).toBeUndefined();
    expect(nativeBodyTarget().children.type).toBe('Editor');
  });
  it.each(['collapse', 'image blur'] as const)('restores the real parent toolbar for three generated View gestures after %s without a second focus', async dismissedBy => {
    const parent = { state: [] as any[], refs: [] as any[] };
    const bodyHooks = { state: h.state, refs: h.refs };
    const parentProps: Parameters<typeof TopicEditor>[0] = { value: '正文', disabled: false, attachments: [], inputRef: { current: null }, previousRef: { current: null }, placeholder: '正文', onChange: vi.fn(), onAttachmentsChange: vi.fn() };
    const renderParent = () => {
      h.state = parent.state; h.refs = parent.refs; h.cursor = 0; h.refCursor = 0;
      const nodes = elements(TopicEditor(parentProps));
      props = nodes.find(node => node.type === RichTopicBody)!.props;
      h.state = bodyHooks.state; h.refs = bodyHooks.refs;
      return nodes;
    };
    renderParent(); editor().onReady(); await flush(); editor().onFocus();
    const templates = nativeTemplates();
    for (let round = 0; round < 3; round++) {
      let nodes = renderParent();
      expect(nodes.some(node => node.props?.className === 'topicEditorDock')).toBe(true);
      if (dismissedBy === 'collapse') nodes.find(node => node.props?.ariaLabel === '收起工具栏')!.props.onClick();
      else editor().onBlur({ detail: {} });
      nodes = renderParent(); expect(nodes.some(node => node.props?.className === 'topicEditorDock')).toBe(false);
      const bridge = boundBodyView();
      expect(hydrate(bridge.node).nn).toBe(templates.aliases.view._num);
      bridge.dispatch('touchstart');
      expect(renderParent().some(node => node.props?.className === 'topicEditorDock')).toBe(false);
      bridge.dispatch('tap');
      expect(renderParent().some(node => node.props?.className === 'topicEditorDock')).toBe(true);
      expect(props.focus).toBe(false);
    }
    expect(h.context.setContents).toHaveBeenCalledOnce(); expect(h.context.insertText).not.toHaveBeenCalled(); expect(h.context.insertImage).not.toHaveBeenCalled(); expect(h.context.format).not.toHaveBeenCalled(); expect(parentProps.onChange).not.toHaveBeenCalled();
  });
  it.each(['move', 'cancel'] as const)('lets generated View %s continue without restoring dismissed toolbar', async reason => {
    props.onBodyTap = vi.fn(); props.onTouchMove = vi.fn(); props.onTouchCancel = vi.fn(); editor().onReady(); await flush();
    const bridge = boundBodyView(); bridge.dispatch('touchstart'); bridge.dispatch(reason === 'move' ? 'touchmove' : 'touchcancel'); bridge.dispatch('tap');
    expect(props.onBodyTap).not.toHaveBeenCalled();
    expect(reason === 'move' ? props.onTouchMove : props.onTouchCancel).toHaveBeenCalledOnce();
  });
  it('binds native Editor theme color without rehydrating or formatting the draft', async () => {
    expect(editor().style.color).toBe('#0f1626');
    editor().onReady(); await flush(); render();
    h.theme = 'dark'; expect(editor().style.color).toBe('#f2f2f2');
    h.effects.at(-1)(); await flush();
    expect(h.context.setContents).toHaveBeenCalledOnce();
    expect(h.context.format).not.toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it('does not advertise native programmatic focus or textarea-only props', async () => {
    props.focus = true; props.onTouchStart = vi.fn();
    const native = editor();
    expect(props.handleRef.current!.canFocus()).toBe(false);
    expect(native.focus).toBeUndefined(); expect(native.holdKeyboard).toBeUndefined();
    expect(native.onTouchStart).toBeUndefined(); expect(native.onClick).toBeUndefined();
    nativeBodyTarget().onTouchStart(); expect(props.onTouchStart).not.toHaveBeenCalled();
    native.onReady(); await flush(); nativeBodyTarget().onTouchStart(); expect(props.onTouchStart).toHaveBeenCalledOnce();
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
  it('forwards repeated completed native body taps without extra focus or native document/selection mutations', async () => {
    props.onTouchStart = vi.fn(); props.onBodyTap = vi.fn(); editor().onReady(); await flush(); editor().onFocus();
    for (let round = 0; round < 3; round++) { nativeBodyTarget().onTouchStart(); nativeBodyTarget().onClick(); nativeBodyTarget().onClick(); }
    expect(props.onTouchStart).toHaveBeenCalledTimes(3); expect(props.onBodyTap).toHaveBeenCalledTimes(3); expect(props.onFocus).toHaveBeenCalledOnce();
    expect(props.handleRef.current!.canFocus()).toBe(false); expect(h.context.setContents).toHaveBeenCalledOnce();
    expect(h.context.insertText).not.toHaveBeenCalled(); expect(h.context.format).not.toHaveBeenCalled(); expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['unready', 'move', 'cancel', 'blur', 'disabled', 'account', 'reset', 'unmount'] as const)('refuses completed native taps after %s', async reason => {
    props.onBodyTap = vi.fn(); props.onTouchMove = vi.fn(); props.onTouchCancel = vi.fn();
    render(); const cleanup = h.effects[1];
    if (reason !== 'unready') { editor().onReady(); await flush(); }
    const target = nativeBodyTarget(); target.onTouchStart();
    if (reason === 'move') { target.onTouchMove(); expect(props.onTouchMove).toHaveBeenCalledOnce(); }
    if (reason === 'cancel') { target.onTouchCancel(); expect(props.onTouchCancel).toHaveBeenCalledOnce(); }
    if (reason === 'blur') editor().onBlur({ detail: {} });
    if (reason === 'disabled') { props.disabled = true; render(); }
    if (reason === 'account') h.account = 'other';
    if (reason === 'reset') { props.value = '外部草稿'; render(); h.effects.at(-1)(); await flush(); }
    if (reason === 'unmount') cleanup()();
    target.onClick(); expect(props.onBodyTap).not.toHaveBeenCalled();
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
