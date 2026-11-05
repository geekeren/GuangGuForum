import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import TopicEditor, { restoreTopicAttachments } from '../../pages/createTopic/TopicEditor';
import { EMPTY_FORMAT_STATUS } from '../../pages/createTopic/nativeEditorStatus';
import { getCommonEmojiUsage, recordCommentEmojiUsage } from '../emojiUsage';
import { ensureImageHostBound } from '../imageUploadGuard';
import { STICKERS } from '../stickers';
import { createImageUploadController, uploadImage } from 'guanggu-forum-api';

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], keyboard: null as any, hide: null as any, show: null as any, theme: 'light' as 'light' | 'dark', resize: null as any, geometry: null as any, cleanups: [] as Array<() => void>, account: 'tester' }));
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
// Current production uses page lifecycle, RootPortal and native viewport measurement.
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView', RootPortal: 'RootPortal' }));
vi.mock('@tarojs/taro', () => ({
  default: { getWindowInfo: () => ({ windowWidth: 430, windowHeight: 900, screenHeight: 932, safeArea: { bottom: 898 } }), onWindowResize: (cb: any) => { harness.resize = cb; }, offWindowResize: vi.fn(), hideKeyboard: vi.fn(), showToast: vi.fn(), chooseMedia: vi.fn(), onKeyboardHeightChange: (cb: any) => { harness.keyboard = cb; }, offKeyboardHeightChange: vi.fn(),
    nextTick: (cb: any) => cb(), createSelectorQuery: () => { const query = { select: () => query, boundingClientRect: (cb?: any) => { if (typeof cb === 'function') cb(harness.geometry); return query; }, exec: (cb?: any) => { if (typeof cb === 'function') cb([{ top: 300 }, { height: 500 }, { height: 1000 }, { height: 80 }]); } }; return query; } },
  useDidHide: (cb: any) => { harness.hide = cb; }, useDidShow: (cb: any) => { harness.show = cb; }, useReady: vi.fn(),
}));
vi.mock('guanggu-forum-api', () => ({ createImageUploadController: vi.fn(), ImageUploadError: class extends Error {}, uploadImage: vi.fn() }));
vi.mock('../../pages/createTopic/RichTopicBody', () => ({ default: 'RichTopicBody' }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: harness.theme }) }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => undefined }));
vi.mock('../keyboardAccessory', () => ({ tryHideKeyboardAccessoryView: vi.fn() }));
vi.mock('../imageUploadGuard', () => ({ ensureImageHostBound: vi.fn(), openImageHostSettings: vi.fn() }));
vi.mock('../imageCompressionPreferences', () => ({ isImageCompressionEnabled: () => false }));
vi.mock('../commentPhotos', () => ({ compressCommentPhoto: vi.fn() }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => harness.account }));
vi.mock('../emojiUsage', () => ({ EMOJIS: ['👍', '😂'], getCommonEmojiUsage: vi.fn(), recordCommentEmojiUsage: vi.fn() }));
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...all(tree.props?.children)];
}
let props: Parameters<typeof TopicEditor>[0];
let dispose: () => void;
const initialTaroEnv = process.env.TARO_ENV;
function render() { harness.cursor = 0; harness.refCursor = 0; return TopicEditor(props); }
function find(tree: any, name: string) { return all(tree).find(e => e.type === name || e.props?.className?.split(' ').includes(name)); }
function event() { return { stopPropagation: vi.fn() }; }
function button(label: string) { return all(render()).find(e => e.props?.ariaLabel === label || e.type === 'topic-format-button' && e.props?.label === label)!.props; }
function click(label: string) { const tool = button(label); return (tool.onFormatend ?? tool.onClick)(event()); }
function body() { return find(render(), 'RichTopicBody').props; }
function keyboard(height: number) { harness.keyboard({ height }); }
function dock() { return find(render(), 'topicEditorDock')?.props; }
function status(changes = {}) { body().onFormatStatusChange({ ...EMPTY_FORMAT_STATUS, available: true, ...changes }); render(); }
function ready() { body().onFocus(); status(); const format = vi.fn(); body().handleRef.current = { format, canFocus: () => false }; return format; }
function mountEffects() { for (const effect of harness.effects.splice(0)) { const cleanup = effect(); if (typeof cleanup === 'function') harness.cleanups.push(cleanup); } }
async function settle() { await vi.advanceTimersByTimeAsync(600); }
beforeEach(() => {
  process.env.TARO_ENV = 'h5'; harness.account = 'tester';
  vi.useFakeTimers(); harness.state = []; harness.refs = []; harness.effects = []; harness.cleanups = []; harness.geometry = { width: 430, top: 0, bottom: 900, height: 900 }; vi.clearAllMocks();
  vi.mocked(getCommonEmojiUsage).mockReturnValue({ emojis: [], stickers: [] });
  vi.mocked(createImageUploadController).mockReturnValue({ abort: vi.fn(), signal: {} } as any);
  vi.mocked(uploadImage).mockReset().mockResolvedValue({ url: 'https://img.test/uploaded.jpg', id: 'upload-fixture' } as any);
  vi.mocked(ensureImageHostBound).mockResolvedValue(true);
  props = { value: '', placeholder: '', inputRef: { current: null }, previousRef: { current: null }, disabled: false, attachments: [], onChange: vi.fn(), onAttachmentsChange: update => { props.attachments = update(props.attachments); } };
  render(); mountEffects(); dispose = () => { for (const cleanup of harness.cleanups.splice(0).reverse()) cleanup(); };
});
afterEach(() => { dispose?.(); harness.theme = 'light'; process.env.TARO_ENV = initialTaroEnv; vi.useRealTimers(); });

describe('topic editor format toolbar', () => {
  it.each(['加粗', '无序列表'])('uses one click for %s without a gesture lease or refocus', label => {
    process.env.TARO_ENV = 'weapp'; const format = ready(); const tool = button(label);
    expect(all(render()).filter(e => e.type === 'topic-format-button' && e.props?.label === label)).toHaveLength(1);
    expect(tool.onClick).toBeUndefined(); expect(tool.onFormatend).toEqual(expect.any(Function));
    expect(tool.onTouchStart).toBeUndefined(); expect(tool.onTouchEnd).toBeUndefined();
    expect(tool.onTouchCancel).toBeUndefined();
    click(label);
    expect(format).toHaveBeenCalledOnce();
    expect(format).toHaveBeenCalledWith(label === '加粗' ? 'bold' : 'list', label === '加粗' ? undefined : 'bullet');
    expect(body().focus).toBe(true); expect(dock()).toBeDefined();
    expect(Taro.hideKeyboard).not.toHaveBeenCalled();
  });
  it('allows consecutive native ends and clears the current bullet list', () => {
    process.env.TARO_ENV = 'weapp'; const format = ready(); click('无序列表'); status({ list: 'bullet' }); click('无序列表');
    expect(format).toHaveBeenCalledTimes(2); expect(format).toHaveBeenLastCalledWith('list', '');
    expect(button('无序列表').active).toBe(true);
  });
  it('cancels bold once on captured native end without changing focus or hiding the keyboard', () => {
    process.env.TARO_ENV = 'weapp'; const format = ready(); status({ bold: true }); keyboard(320);
    const tool = button('加粗'); expect(tool.active).toBe(true); expect(tool.onClick).toBeUndefined();
    tool.onFormatend(); expect(format).toHaveBeenCalledOnce(); expect(format).toHaveBeenCalledWith('bold', undefined);
    status({ bold: false }); expect(button('加粗').active).toBe(false);
    expect(body().focus).toBe(true); expect(dock().style.bottom).toBe('320px');
    expect(Taro.hideKeyboard).not.toHaveBeenCalled();
  });
  it.each(['disabled', 'unavailable', 'missing editor', 'blurred', 'hidden', 'unmounted'])('does not execute a stale click while %s', condition => {
    process.env.TARO_ENV = 'weapp'; const format = ready(), tool = button('加粗');
    if (condition === 'disabled') { props.disabled = true; render(); }
    if (condition === 'unavailable') status({ available: false });
    if (condition === 'missing editor') body().handleRef.current = null;
    if (condition === 'blurred') body().onBlur();
    if (condition === 'hidden') harness.hide();
    if (condition === 'unmounted') dispose();
    tool.onFormatend(); expect(format).not.toHaveBeenCalled();
  });
  it('does not offer italic, numbered-list or heading toolbar buttons', () => {
    ready(); for (const label of ['斜体', '有序列表', '标题']) expect(all(render()).some(e => e.props?.ariaLabel === label)).toBe(false);
  });
  it.each(['light', 'dark'] as const)('keeps five full-cell targets with distinct themed glyph frames in %s theme', theme => {
    harness.theme = theme; ready(); status({ bold: true, list: 'bullet' });
    const tools = all(render()).filter(e => e.props?.className?.split(' ').includes('topicEditorTool'));
    expect(tools).toHaveLength(5);
    expect(tools.filter(e => e.props.className.includes('topicEditorTool--active'))).toHaveLength(2);
    for (const tool of tools) {
      expect(tool.props.ariaRole).toBe('button'); expect(tool.props.onClick).toEqual(expect.any(Function));
      const glyph = tool.props.children;
      expect(glyph.props.className).toBe('topicEditorToolGlyph');
      expect(glyph.props.onClick).toBeUndefined(); expect(glyph.props.onTouchEnd).toBeUndefined();
      expect(glyph.props.children.type).toBe('ThemedIcon');
      expect(glyph.props.children.props.className).toBe('topicEditorToolIcon');
      if (tool.props.className.includes('topicEditorTool--active')) expect(glyph.props.children.props.tone).toBe('accent');
    }
  });
  it.each(['light', 'dark'] as const)('uses one native capture bridge per full toolbar cell with %s palette', theme => {
    process.env.TARO_ENV = 'weapp'; harness.theme = theme; ready(); status({ bold: true, list: 'bullet' });
    const tools = all(render()).filter(e => e.props?.className?.split(' ').includes('topicEditorTool'));
    expect(tools).toHaveLength(5);
    for (const tool of tools) {
      expect(tool.props.onClick).toBeUndefined(); expect(tool.props.ariaRole).toBeUndefined();
      const control = tool.props.children;
      expect(control.type).toBe('topic-format-button'); expect(control.props.onFormatend).toEqual(expect.any(Function));
      expect(control.props.onClick).toBeUndefined(); expect(control.props.onFormattap).toBeUndefined();
      expect(control.props.icon).toMatch(/^data:image\/svg\+xml,/);
      expect(control.props.background).toBe(theme === 'light' ? '#e8efff' : '#2b2b2e');
    }
    expect(button('加粗').active).toBe(true); expect(button('无序列表').active).toBe(true);
  });
  it('applies native disabled opacity only inside the capture component', () => {
    process.env.TARO_ENV = 'weapp'; ready(); status({ available: false });
    const bold = all(render()).find(e => e.props?.className?.split(' ').includes('topicEditorTool') && e.props.children.props.label === '加粗');
    expect(bold.props.className).not.toContain('topicEditorTool--disabled');
    expect(bold.props.children.props.disabled).toBe(true);
  });
  it('keeps body-format recovery in More', () => {
    const format = ready(); click('更多功能'); body().onBlur(); click('恢复正文格式');
    expect(format).toHaveBeenCalledOnce(); expect(format).toHaveBeenCalledWith('header', '');
  });
});

describe('topic editor floating tools and attachments', () => {
  it.each(['更多功能', '表情'])('uses a fixed bounded overlay with a sibling %s panel', label => {
    ready(); click(label);
    const host = find(render(), 'topicEditorDockHost');
    expect(host.props.style).toMatchObject({ width: '430px', height: '900px', bottom: '0px' });
    expect(host.props.children[0].props.className).toBe('topicEditorDock');
    expect(host.props.children[1].props.className).toBe('topicEditorPanelRegion');
    expect(dock().style).toMatchObject({ bottom: '300px', paddingBottom: '0px' });
    expect(find(render(), 'topicEditorPanelRegion').props.style).toEqual({ height: '300px', paddingBottom: '34px' });
  });
  it('shows the toolbar only during real body focus, never from keyboard height, touch or focus requests', async () => {
    expect(dock()).toBeUndefined(); keyboard(320); expect(dock()).toBeUndefined();
    body().onTouchStart(); expect(dock()).toBeUndefined();
    props.inputRef.current.focus(); expect(dock()).toBeUndefined();
    ready(); expect(dock()).toBeDefined(); keyboard(0); expect(dock()).toBeDefined();
    body().onBlur(); expect(dock()).toBeUndefined(); keyboard(340); expect(dock()).toBeUndefined();
    await settle(); expect(vi.getTimerCount()).toBe(0);
    body().onFocus(); expect(dock()).toBeDefined();
  });
  it('hides on body blur even while another input keeps the keyboard open', () => {
    ready(); keyboard(320); body().onBlur(); expect(dock()).toBeUndefined();
    expect(find(render(), 'topicEditorDockHost')).toBeUndefined();
    expect(Taro.hideKeyboard).not.toHaveBeenCalled();
  });
  it('follows keyboard events, clamps invalid heights and cleans listeners', () => {
    ready(); keyboard(320); expect(dock().style.bottom).toBe('320px');
    keyboard(NaN); expect(dock().style.bottom).toBe('320px');
    keyboard(9999); expect(dock().style.bottom).toBe('900px');
    keyboard(-10); expect(dock().style).toMatchObject({ bottom: '0px', paddingBottom: '34px' });
    dispose(); expect(Taro.offKeyboardHeightChange).toHaveBeenCalledOnce(); expect(Taro.offWindowResize).toHaveBeenCalledOnce();
  });
  it('retains a panel during trailing keyboard close and switches panels without rehiding', () => {
    ready(); keyboard(320); click('表情'); body().onBlur(); keyboard(0);
    expect(dock()).toBeUndefined();
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('320px');
    click('更多功能'); expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('320px');
  });
  it('accurately collapses a native panel without pretending to reopen the keyboard', () => {
    ready(); keyboard(320); click('表情'); body().onBlur(); keyboard(0); click('收起面板');
    expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined();
    expect(dock()).toBeUndefined(); expect(body().focus).toBe(false);
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '请点击正文唤起键盘', icon: 'none' });
    keyboard(0); expect(dock()).toBeUndefined();
  });
  it('reopens the source textarea and guards its delayed keyboard-close event', () => {
    ready(); body().handleRef.current = { canFocus: () => true }; keyboard(320); click('表情'); body().onBlur(); keyboard(0);
    click('切换到键盘'); expect(body().focus).toBe(true); expect(dock()).toBeUndefined(); keyboard(0);
    body().onFocus(); expect(dock().style.bottom).toBe('320px'); keyboard(300); expect(dock().style.bottom).toBe('300px');
    expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it('closes the panel on native body touch and then accepts actual native focus', () => {
    ready(); click('表情'); body().onBlur(); keyboard(0); body().onTouchStart();
    expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined(); expect(body().focus).toBe(false);
    body().onFocus(); keyboard(310); expect(body().focus).toBe(true); expect(dock().style.bottom).toBe('310px');
  });
  it.each([{ top: 0, bottom: 580, height: 580 }, { top: -320, bottom: 580, height: 900 }])('corrects the full overlay for viewport resizing/panning %j once per event', geometry => {
    ready(); harness.geometry = { width: 430, ...geometry }; keyboard(320);
    expect(find(render(), 'topicEditorDockHost').props.style.bottom).toBe('-320px');
    expect(dock().style.bottom).toBe('320px');
  });
  it('reserves measured sheet height plus the keyboard/panel once, with no minimum-height overlap', async () => {
    ready(); await settle(); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('520px');
    keyboard(320); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('200px');
    click('表情'); body().onBlur(); keyboard(0); expect(dock()).toBeUndefined();
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('280px');
    props.inputRef.current.dismissTools(); expect(dock()).toBeUndefined(); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('600px');
  });
  it('cleans timers on hide/unmount and ignores late keyboard events', async () => {
    ready(); keyboard(300); harness.hide(); expect(vi.getTimerCount()).toBe(0);
    keyboard(340); expect(dock()).toBeUndefined(); harness.show(); await settle(); expect(dock()).toBeUndefined();
    dispose(); const state = [...harness.state]; keyboard(350); await settle(); expect(harness.state).toEqual(state);
  });
  it('preserves emoji and mention actions and records usage', () => {
    ready(); click('表情'); body().onBlur();
    all(render()).find(e => e.props?.className === 'topicEditorTab' && e.props.children.props.children === '表情')!.props.onClick();
    const handle = { insertText: vi.fn(), openMentions: vi.fn(), format: vi.fn(), canFocus: () => false }; body().handleRef.current = handle;
    click('插入表情👍'); expect(handle.insertText).toHaveBeenCalledWith('👍'); expect(recordCommentEmojiUsage).toHaveBeenCalledWith('👍', []);
    click('更多功能'); click('提及用户'); expect(handle.openMentions).toHaveBeenCalledOnce();
  });
  it('keeps completed media independent above the body and allows removal without editor reads', async () => {
    props.attachments = [{ id: 'photo', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg' }];
    const insertImage = vi.fn(), snapshot = vi.fn(); body().handleRef.current = { insertImage, snapshot };
    const nodes = all(render());
    expect(nodes.findIndex(e => e.props?.className === 'topicAttachmentRegion')).toBeLessThan(nodes.findIndex(e => e.type === 'RichTopicBody'));
    nodes.find(e => e.props?.className === 'topicAttachmentImage')!.props.onClick();
    expect(insertImage).not.toHaveBeenCalled(); expect(props.attachments[0].richManaged).toBeUndefined();
    expect(find(render(), 'topicUploadHint').props.children).toBe('图片作为独立附件发布');
    click('移除附件'); await Promise.resolve(); expect(props.attachments).toHaveLength(0); expect(snapshot).not.toHaveBeenCalled();
  });
  it('opens the system photo picker from one native end without application keyboard dismissal', async () => {
    process.env.TARO_ENV = 'weapp'; ready(); keyboard(320);
    vi.mocked(ensureImageHostBound).mockResolvedValue(true);
    vi.mocked(Taro.chooseMedia).mockResolvedValue({ tempFiles: [], type: 'image', errMsg: 'chooseMedia:ok' });
    click('选择照片'); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(Taro.chooseMedia).toHaveBeenCalledOnce(); expect(Taro.hideKeyboard).not.toHaveBeenCalled();
    expect(body().focus).toBe(true); expect(dock().style.bottom).toBe('320px');
    body().onBlur(); expect(dock()).toBeUndefined();
    body().onFocus(); expect(dock()).toBeDefined();
  });
  it('keeps native completed thumbnails inert without keyboard dismissal or Delta insertion', async () => {
    process.env.TARO_ENV = 'weapp'; ready(); keyboard(320);
    props.attachments = [{ id: 'photo', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg' }];
    const insertImage = vi.fn(); body().handleRef.current = { insertImage, canFocus: () => false };
    const tool = button('图片附件'); expect(tool.thumbnail).toBe(true); expect(tool.onClick).toBeUndefined();
    tool.onFormatend(); tool.onFormatend(); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(insertImage).not.toHaveBeenCalled(); expect(props.attachments[0].richManaged).toBeUndefined();
    expect(body().focus).toBe(true); expect(Taro.hideKeyboard).not.toHaveBeenCalled(); expect(dock().style.bottom).toBe('320px');
  });
  it.each(['disabled', 'hidden', 'unmounted', 'foreign owner'])('rejects captured stale attachment insertion when %s', condition => {
    process.env.TARO_ENV = 'weapp'; ready();
    props.attachments = [{ id: 'photo', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg' }];
    const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    const tool = button('图片附件');
    if (condition === 'disabled') { props.disabled = true; render(); }
    if (condition === 'hidden') harness.hide();
    if (condition === 'unmounted') dispose();
    if (condition === 'foreign owner') { props.attachments = [{ ...props.attachments[0], owner: 'other' } as any]; render(); }
    tool.onFormatend(); expect(insertImage).not.toHaveBeenCalled();
  });
  it('uploads picker photos to the independent tray without inserting into Delta', async () => {
    process.env.TARO_ENV = 'weapp'; ready();
    const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    vi.mocked(Taro.chooseMedia).mockResolvedValueOnce({ tempFiles: [{ tempFilePath: 'wxfile://synthetic', size: 5 }], type: 'image', errMsg: 'chooseMedia:ok' });
    click('选择照片'); for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(uploadImage).toHaveBeenCalledOnce(); expect(insertImage).not.toHaveBeenCalled();
    expect(props.attachments[0]).toMatchObject({ kind: 'photo', owner: 'tester', phase: 'complete', url: 'https://img.test/uploaded.jpg' });
    expect(props.attachments[0].richManaged).toBeUndefined(); expect(props.onChange).not.toHaveBeenCalled();
  });
  it('retries upload only, preserves the attachment ID and never inserts into Delta', async () => {
    props.attachments = [{ id: 'retry', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'failed', progress: null }];
    const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    click('图片上传中'); for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(uploadImage).toHaveBeenCalledOnce(); expect(insertImage).not.toHaveBeenCalled();
    expect(props.attachments[0]).toMatchObject({ id: 'retry', phase: 'complete' });
  });
  it('adds stickers independently and records usage without inserting into Delta', () => {
    ready(); click('表情');
    const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    all(render()).find(e => e.props?.className === 'topicEditorTab' && e.props.children.props.children === '过早客')!.props.onClick();
    click(`添加表情包${STICKERS[0].name}`);
    expect(props.attachments[0]).toMatchObject({ kind: 'sticker', sticker: STICKERS[0] });
    expect(insertImage).not.toHaveBeenCalled(); expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['account', 'removed', 'unmounted'])('rejects late upload completion after %s', async boundary => {
    props.attachments = [{ id: 'late', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'failed', progress: null }];
    const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    let complete!: (value: any) => void; vi.mocked(uploadImage).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    click('图片上传中'); for (let i = 0; i < 12; i++) await Promise.resolve();
    const abort = vi.mocked(createImageUploadController).mock.results.at(-1)!.value.abort;
    if (boundary === 'account') harness.account = 'other';
    if (boundary === 'removed') click('移除附件');
    if (boundary === 'unmounted') dispose();
    complete({ url: 'https://img.test/late.jpg', id: 'late-upload' }); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(props.attachments.some(item => item.kind === 'photo' && item.url === 'https://img.test/late.jpg')).toBe(false);
    expect(insertImage).not.toHaveBeenCalled();
    if (boundary !== 'account') expect(abort).toHaveBeenCalledOnce();
  });
  it('keeps the five-attachment limit and cancelled picker leaves the body and draft unchanged', async () => {
    ready(); const insertImage = vi.fn(); body().handleRef.current = { insertImage };
    props.attachments = Array.from({ length: 5 }, (_, i) => ({ id: `sticker-${i}`, kind: 'sticker' as const, sticker: STICKERS[0] }));
    click('选择照片'); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(Taro.chooseMedia).not.toHaveBeenCalled(); expect(props.attachments).toHaveLength(5);
    props.attachments = [];
    vi.mocked(Taro.chooseMedia).mockRejectedValueOnce({ errMsg: 'chooseMedia:fail cancel' });
    click('选择照片'); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(props.attachments).toHaveLength(0); expect(uploadImage).not.toHaveBeenCalled();
    expect(insertImage).not.toHaveBeenCalled(); expect(props.onChange).not.toHaveBeenCalled();
  });
  it('restores independent completed photos without legacy insertion obligations', () => {
    const photo = { id: 'saved', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg', richManaged: false };
    expect(restoreTopicAttachments([photo])[0]).toMatchObject(photo);
    expect(restoreTopicAttachments([photo])[0].insertionState).toBeUndefined();
  });
  it('retains ambiguous legacy insertion until inspection or safe removal without reinserting', async () => {
    process.env.TARO_ENV = 'weapp';
    props.attachments = [{ id: 'legacy', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url: 'https://img.test/p.jpg', insertionState: 'uncertain' }];
    const insertImage = vi.fn(), confirmImage = vi.fn().mockResolvedValue(false);
    const snapshot = vi.fn().mockResolvedValue({ markdown: 'body', referencedAttachmentIds: [], errors: [], unsupported: [] });
    body().handleRef.current = { insertImage, confirmImage, snapshot };
    click('检查图片插入状态'); for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(confirmImage).toHaveBeenCalledOnce(); expect(insertImage).not.toHaveBeenCalled();
    expect(props.attachments[0].insertionState).toBe('uncertain');
    click('移除附件'); for (let i = 0; i < 12; i++) await Promise.resolve(); expect(props.attachments).toHaveLength(0);
  });
  it('retains managed ownership metadata for untagged rich and encoded source images', () => {
    // Managed attachments no longer have preview/remove controls; reconcile through body onChange.
    const url = 'https://img.test/p(1).jpg', encoded = 'https://img.test/p%281%29.jpg';
    props.attachments = [{ id: 'roundtrip', kind: 'photo', path: 'wxfile://p', owner: 'tester', phase: 'complete', progress: 100, url, richManaged: true }];
    expect(all(render()).some(e => e.props?.ariaLabel === '移除附件')).toBe(false);
    for (const src of [url, encoded]) {
      body().onChange('', { version: 1, delta: { ops: [{ insert: { image: src } }, { insert: '\n' }] } });
      expect(props.attachments).toHaveLength(1);
    }
    body().onChange(`![图片](${encoded})`); expect(props.attachments).toHaveLength(1);
    body().onChange('真实删除后', { version: 1, delta: { ops: [{ insert: '真实删除后\n' }] } }); expect(props.attachments).toHaveLength(0);
  });
  it('reclaims a managed orphan after body deletion, but keeps a referenced embed', () => {
    props.attachments = [{ id: 'sticker', kind: 'sticker', sticker: STICKERS[0], richManaged: true }];
    body().onChange('', { version: 1, delta: { ops: [{ insert: { image: STICKERS[0].url }, attributes: { 'data-custom': 'attachmentId=sticker' } }, { insert: '\n' }] } });
    expect(props.attachments).toHaveLength(1);
    body().onChange('', { version: 1, delta: { ops: [{ insert: '\n' }] } }); expect(props.attachments).toHaveLength(0);
  });
  it('preserves managed ownership on restore while interrupted insertion becomes uncertain', () => {
    const managed = { id: 'sticker', kind: 'sticker', sticker: STICKERS[0], richManaged: true };
    expect(restoreTopicAttachments([managed])[0].richManaged).toBe(true);
    expect(restoreTopicAttachments([{ ...managed, richManaged: false, insertionState: 'pending' }])[0].insertionState).toBe('uncertain');
  });
});
