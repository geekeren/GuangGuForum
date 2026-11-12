import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import TopicEditor, { restoreTopicAttachments } from '../../pages/createTopic/TopicEditor';
import ComposerEmojiPanel from '../../components/ComposerEmojiPanel';
import { EMPTY_FORMAT_STATUS } from '../../pages/createTopic/nativeEditorStatus';
import { getCommonEmojiUsage, recordCommentEmojiUsage } from '../emojiUsage';
import { ensureImageHostBound } from '../imageUploadGuard';
import { STICKERS } from '../stickers';
import { createImageUploadController, uploadImage } from 'guanggu-forum-api';

const harness = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0, effects: [] as any[], keyboard: null as any, hide: null as any, show: null as any, theme: 'light' as 'light' | 'dark', resize: null as any, geometry: null as any, cleanups: [] as Array<() => void>, bodyTop: 300, measuredDockHeight: 80, windowWidth: 430, account: 'tester' }));
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
  default: { getWindowInfo: () => ({ windowWidth: harness.windowWidth, windowHeight: 900, screenHeight: 932, safeArea: { bottom: 898 } }), onWindowResize: (cb: any) => { harness.resize = cb; }, offWindowResize: vi.fn(), hideKeyboard: vi.fn(), showToast: vi.fn(), chooseMedia: vi.fn(), onKeyboardHeightChange: (cb: any) => { harness.keyboard = cb; }, offKeyboardHeightChange: vi.fn(),
    nextTick: (cb: any) => cb(), createSelectorQuery: () => { const query = { select: () => query, boundingClientRect: (cb?: any) => { if (typeof cb === 'function') cb(harness.geometry); return query; }, exec: (cb?: any) => { if (typeof cb === 'function') cb([{ top: harness.bodyTop }, { height: 500 }, { height: 1000 }, { height: harness.measuredDockHeight }, harness.geometry]); } }; return query; } },
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
  const rendered = tree.type === ComposerEmojiPanel ? ComposerEmojiPanel(tree.props) : null;
  return [tree, ...all(rendered), ...all(tree.props?.children)];
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
  vi.restoreAllMocks();
  vi.useFakeTimers(); harness.state = []; harness.refs = []; harness.effects = []; harness.cleanups = []; harness.bodyTop = 300; harness.measuredDockHeight = 80; harness.windowWidth = 430; harness.geometry = { width: 430, top: 0, bottom: 900, height: 900 }; vi.clearAllMocks();
  vi.mocked(Taro.hideKeyboard).mockReset().mockResolvedValue({ errMsg: 'hideKeyboard:ok' });
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
  it('offers Heading before Bold but no italic, numbered list or first-level heading', () => {
    ready(); for (const label of ['斜体', '有序列表', '一级标题']) expect(all(render()).some(e => e.props?.ariaLabel === label)).toBe(false);
    const labels = all(find(render(), 'topicEditorToolbar')).filter(e => e.props?.ariaLabel).map(e => e.props.ariaLabel);
    expect(labels).toEqual(['标题', '加粗', '无序列表', '选择照片', '表情', '收起工具栏']);
  });
  it.each(['light', 'dark'] as const)('keeps six fixed full-cell targets with distinct themed glyph frames in %s theme', theme => {
    harness.theme = theme; ready(); status({ bold: true, list: 'bullet' });
    const tools = all(render()).filter(e => e.props?.className?.split(' ').includes('topicEditorTool'));
    expect(tools).toHaveLength(6);
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
    expect(tools).toHaveLength(6);
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
  it.each([2, 3] as const)('selects H%s using the native capture path and toggles the current level back to body', level => {
    process.env.TARO_ENV = 'weapp'; props.value = '保留正文'; const format = ready(); keyboard(320);
    click('标题'); const menu = find(render(), 'topicEditorHeadingMenu');
    expect(menu).toBeDefined(); expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined();
    const option = button(level === 2 ? '二级标题' : '三级标题');
    expect(option.onClick).toBeUndefined(); expect(option.onFormatend).toEqual(expect.any(Function));
    option.onFormatend(); expect(format).toHaveBeenCalledWith('header', `h${level}`);
    expect(find(render(), 'topicEditorHeadingMenu')).toBeUndefined(); expect(body().focus).toBe(true);
    status({ header: level }); click('标题'); expect(button(level === 2 ? '二级标题' : '三级标题').active).toBe(true);
    click(level === 2 ? '二级标题' : '三级标题'); expect(format).toHaveBeenLastCalledWith('header', '');
    expect(Taro.hideKeyboard).not.toHaveBeenCalled(); expect(props.value).toBe('保留正文'); expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['body', 'outside', 'collapse', 'hide', 'account', 'disabled', 'unmount', 'blur'] as const)('closes or refuses the captured heading choice after %s', reason => {
    process.env.TARO_ENV = 'weapp'; const format = ready(); click('标题'); const choice = button('二级标题');
    if (reason === 'body') body().onTouchStart();
    if (reason === 'outside') find(render(), 'topicEditorHeadingBackdrop').props.onTouchStart();
    if (reason === 'collapse') click('收起工具栏');
    if (reason === 'hide') harness.hide();
    if (reason === 'account') { harness.account = 'other'; render(); mountEffects(); }
    if (reason === 'disabled') { props.disabled = true; render(); mountEffects(); }
    if (reason === 'unmount') dispose();
    if (reason === 'blur') body().onBlur();
    choice.onFormatend(); expect(format).not.toHaveBeenCalled();
    if (reason !== 'unmount') expect(find(render(), 'topicEditorHeadingMenu')).toBeUndefined();
  });
});

describe('topic editor floating tools and attachments', () => {
  it('uses a fixed bounded overlay with an independent sibling emoji panel without a keyboard-open claim', () => {
    ready(); click('表情');
    const host = find(render(), 'topicEditorDockHost');
    expect(host.props.style).toMatchObject({ width: '430px', height: '900px', bottom: '0px' });
    const hostChildren = host.props.children.filter(Boolean);
    expect(hostChildren[0].props.className).toBe('topicEditorDock');
    expect(hostChildren[1].props.className).toBe('topicEditorPanelRegion');
    expect(dock().style).toMatchObject({ bottom: '300px', paddingBottom: '0px' });
    expect(find(render(), 'topicEditorPanelRegion').props.style).toEqual({ bottom: '0px', height: '300px', paddingBottom: '34px' });
    expect(body().focus).toBe(false); expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
  });
  it.each(['h5', 'weapp'] as const)('requests keyboard dismissal on three emoji opens without stacking or fabricating focus in %s', environment => {
    process.env.TARO_ENV = environment; props.value = '原正文'; props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }]; ready(); keyboard(320);
    const controls = () => all(find(render(), 'topicEditorToolbar')).filter(node => environment === 'weapp' ? node.type === 'topic-format-button' : node.props.className?.split(' ').includes('topicEditorTool'));
    const labels = () => controls().map(node => node.props.label || node.props.ariaLabel);
    const original = labels();
    for (let round = 0; round < 3; round++) {
      keyboard(320); click('表情'); expect(body().focus).toBe(false);
      expect(labels()).toEqual(original.map(label => label === '表情' ? '收起表情面板' : label));
      const panel = find(render(), 'topicEditorPanelRegion').props.style;
      expect(panel.bottom).toBe('0px'); expect(panel.paddingBottom).toBe('0px');
      expect(parseFloat(panel.height)).toBeLessThanOrEqual(300);
      expect(parseFloat(dock().style.bottom)).toBeCloseTo(parseFloat(panel.height));
      const host = find(render(), 'topicEditorDockHost'); expect(host.props.children.filter(Boolean).map(child => child.props.className)).toEqual(['topicEditorDock', 'topicEditorPanelRegion']);
      keyboard(0); expect(find(render(), 'topicEditorPanelRegion').props.style.paddingBottom).toBe('34px');
      click('收起表情面板'); expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined();
      expect(dock().style.bottom).toBe('0px'); expect(body().focus).toBe(false);
      body().onTouchStart(); body().onBodyTap(); expect(dock()).toBeDefined();
    }
    expect(Taro.hideKeyboard).toHaveBeenCalledTimes(3); expect(Taro.showToast).not.toHaveBeenCalled();
    expect(props.value).toBe('原正文'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['reject', 'throw'] as const)('keeps the draft, selection API and authoritative keyboard obstruction when emoji hide %s fails', async failure => {
    props.value = 'kept source'; props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }]; ready(); keyboard(360); await settle();
    const handle = { canFocus: vi.fn(() => false), blur: vi.fn(), insertText: vi.fn(), snapshot: vi.fn(), format: vi.fn() }; body().handleRef.current = handle;
    if (failure === 'reject') vi.mocked(Taro.hideKeyboard).mockRejectedValueOnce(new Error('native hide rejected'));
    else vi.mocked(Taro.hideKeyboard).mockImplementationOnce(() => { throw new Error('native hide unavailable'); });
    click('表情'); await Promise.resolve();
    expect(find(render(), 'topicEditorPanelRegion').props.style).toMatchObject({ bottom: '0px', height: '300px', paddingBottom: '0px' });
    expect(dock().style.bottom).toBe('300px');
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(900 - 300 - 80 - 360 - 24 * 430 / 750)}px`);
    expect(handle.blur).not.toHaveBeenCalled(); expect(handle.insertText).not.toHaveBeenCalled(); expect(handle.snapshot).not.toHaveBeenCalled(); expect(handle.format).not.toHaveBeenCalled(); expect(handle.canFocus).not.toHaveBeenCalled();
    click('收起表情面板'); expect(dock().style.bottom).toBe('360px'); expect(body().focus).toBe(false);
    expect(props.value).toBe('kept source'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it.each(['resolve', 'reject'] as const)('never writes current panel, scope or dismissal state from a late emoji-hide %s', async outcome => {
    for (const boundary of ['new panel', 'collapse', 'account', 'hide', 'unmount'] as const) {
      props.value = 'kept draft'; ready(); keyboard(320);
      let resolveHide!: (result: Awaited<ReturnType<typeof Taro.hideKeyboard>>) => void;
      let rejectHide!: (error: Error) => void;
      vi.mocked(Taro.hideKeyboard).mockImplementationOnce(() => new Promise((resolve, reject) => { resolveHide = resolve; rejectHide = reject; }));
      click('表情');
      if (boundary === 'new panel') { click('收起表情面板'); click('表情'); }
      if (boundary === 'collapse') click('收起工具栏');
      if (boundary === 'account') { harness.account = 'other'; render(); mountEffects(); }
      if (boundary === 'hide') harness.hide();
      if (boundary === 'unmount') dispose();
      const state = [...harness.state];
      if (outcome === 'resolve') resolveHide({ errMsg: 'hideKeyboard:ok' }); else rejectHide(new Error('late native failure'));
      await Promise.resolve(); await Promise.resolve(); expect(harness.state).toEqual(state); expect(props.value).toBe('kept draft'); expect(props.onChange).not.toHaveBeenCalled();
      if (boundary === 'unmount') break;
      harness.account = 'tester'; harness.show(); body().onTouchStart(); body().onBodyTap();
    }
  });
  it('withholds source focus during emoji replacement and waits for a genuine body tap instead of keyboard-icon refocus', () => {
    ready(); const canFocus = vi.fn(() => true); body().handleRef.current = { canFocus }; keyboard(320);
    click('表情'); expect(body().focus).toBe(false); keyboard(0); click('收起表情面板'); expect(body().focus).toBe(false); expect(dock().style.bottom).toBe('0px');
    expect(canFocus).not.toHaveBeenCalled();
    body().onTouchStart(); body().onBodyTap(); expect(body().focus).toBe(true); expect(canFocus).toHaveBeenCalled();
    expect(props.onChange).not.toHaveBeenCalled(); expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it('updates real keyboard height while the sheet stays open and accepts zero without any optimistic reopening', () => {
    ready(); keyboard(320); click('表情');
    const check = (height: number) => {
      keyboard(height); const panel = find(render(), 'topicEditorPanelRegion').props.style;
      expect(panel.bottom).toBe('0px');
      expect(parseFloat(dock().style.bottom)).toBeCloseTo(parseFloat(panel.height));
      expect(panel.paddingBottom).toBe(height === 0 ? '34px' : '0px');
    };
    check(280); check(0); expect(body().focus).toBe(false);
    click('收起表情面板'); expect(dock().style).toMatchObject({ bottom: '0px', paddingBottom: '34px' });
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce(); expect(Taro.showToast).not.toHaveBeenCalled();
    click('表情'); check(360); click('收起表情面板'); expect(dock().style.bottom).toBe('360px');
  });
  it.each([320, 410, 520])('caps a tight measured viewport around a %spx real keyboard while reserving two editable lines where possible', async height => {
    ready(); harness.geometry = { width: 430, top: 0, bottom: 580, height: 580 }; keyboard(height); click('表情'); await settle();
    const panel = find(render(), 'topicEditorPanelRegion').props.style;
    const bodyHeight = parseFloat(find(render(), 'topicEditorBodyScroll').props.style.height);
    const gap = 24 * 430 / 750;
    const panelHeight = Math.min(300, Math.max(0, 900 - 300 - 80 - gap - 72));
    expect(parseFloat(panel.height)).toBeCloseTo(panelHeight);
    expect(bodyHeight).toBeCloseTo(Math.round(Math.max(0, 900 - 300 - 80 - gap - Math.max(height, panelHeight))));
    expect(bodyHeight).toBeGreaterThanOrEqual(0);
    expect(parseFloat(panel.bottom)).toBe(0); expect(parseFloat(dock().style.bottom)).toBeCloseTo(parseFloat(panel.height));
    expect(panel.paddingBottom).toBe('0px'); expect(dock().style.paddingBottom).toBe('0px');
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce();
  });
  it('hands safe-area padding back to the measured toolbar when zero keyboard leaves no usable panel height', async () => {
    ready(); harness.bodyTop = 780; harness.measuredDockHeight = 114; await settle();
    keyboard(0); click('表情'); await settle();
    expect(find(render(), 'topicEditorPanelRegion').props.style).toEqual({ bottom: '0px', height: '0px', paddingBottom: '0px' });
    expect(dock().style).toMatchObject({ bottom: '0px', paddingBottom: '34px' });
    // The native measurement already includes this 34px safe padding; do not
    // reserve it again in bodyBottomGap or pretend a keyboard opened.
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('0px');
    click('收起表情面板'); expect(dock().style).toMatchObject({ bottom: '0px', paddingBottom: '34px' });
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce(); expect(Taro.showToast).not.toHaveBeenCalled();
  });
  it.each(['pan', 'resize'] as const)('counts keyboard, independent sheet, toolbar and safe padding once under native viewport %s', async change => {
    ready(); harness.bodyTop = change === 'pan' ? -20 : 300;
    harness.geometry = { width: 430, top: change === 'pan' ? -320 : 0, bottom: 580, height: change === 'pan' ? 900 : 580 }; keyboard(320); click('表情'); await settle();
    const host = find(render(), 'topicEditorDockHost').props.style;
    const panel = find(render(), 'topicEditorPanelRegion').props.style;
    const bodyHeight = parseFloat(find(render(), 'topicEditorBodyScroll').props.style.height);
    expect(host.bottom).toBe('-320px'); expect(panel.bottom).toBe('0px'); expect(panel.paddingBottom).toBe('0px');
    expect(bodyHeight).toBe(Math.round(900 - harness.bodyTop - 80 - 320 - 24 * 430 / 750));
    expect(bodyHeight + Math.max(parseFloat(panel.height), 320) + 80 + harness.bodyTop + 24 * 430 / 750).toBeCloseTo(900, 0);
    click('收起表情面板'); expect(dock().style.bottom).toBe('320px');
  });
  it.each(['pan', 'resize', 'first pan', 'no probe', 'short pan', 'narrow pan'] as const)('aligns actual card/viewport bottom with the dock client boundary under %s', async scenario => {
    const width = scenario === 'narrow pan' ? 320 : 430;
    harness.windowWidth = width;
    if (scenario === 'first pan' || scenario === 'no probe') {
      // Reset the initial pre-focus render as well; otherwise its already
      // successful normal probe remains a valid prior viewport measurement.
      harness.geometry = null; harness.state = []; harness.refs = []; render(); mountEffects();
    }
    harness.geometry = scenario === 'first pan' || scenario === 'no probe' ? null : { width, top: 0, bottom: 900, height: 900 };
    ready();
    const gap = 24 * width / 750;
    if (scenario === 'first pan' || scenario === 'no probe') {
      // A focus must not fabricate a normal viewport before the first sample.
      harness.geometry = null;
    } else await settle();
    const pan = !['resize', 'no probe'].includes(scenario);
    harness.bodyTop = scenario === 'short pan' ? 700 : pan ? -20 : 300;
    harness.geometry = scenario === 'no probe' ? null : { width, top: pan ? -320 : 0, bottom: 580, height: pan ? 900 : 580 };
    keyboard(320); await settle();
    const tree = render(), scroll = find(tree, 'topicEditorBodyScroll').props;
    if (scenario === 'no probe') { expect(scroll.style).toBeUndefined(); return; }
    const host = find(tree, 'topicEditorDockHost').props.style;
    // Native position:fixed bottom is relative to the current probe bottom;
    // negative inset raises that client bottom back to the normal dock boundary.
    const dockBottomClient = harness.geometry.bottom - parseFloat(host.bottom);
    const toolbarTopClient = dockBottomClient - parseFloat(dock().style.bottom) - 80;
    const height = parseFloat(scroll.style.height);
    const expected = Math.max(0, Math.round(toolbarTopClient - harness.bodyTop - gap));
    expect(height).toBe(expected);
    const cardBottomClient = harness.bodyTop + height;
    if (scenario === 'short pan') expect(height).toBe(0);
    else expect(Math.abs(toolbarTopClient - cardBottomClient - gap)).toBeLessThanOrEqual(0.5);
    // There is no second panel contribution, inverse-pan height subtraction,
    // card bottom padding or a guessed keyboard-zero baseline.
    expect(body().disabled).toBe(false); expect(props.onChange).not.toHaveBeenCalled();
  });
  it('keeps an extreme pan panel bounded at zero and restores its cap after a real hide/show sample', async () => {
    ready(); await settle(); harness.bodyTop = 700;
    harness.geometry = { width: 430, top: -320, bottom: 580, height: 900 }; keyboard(320); click('表情'); await settle();
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('0px');
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe('0px');
    expect(find(render(), 'topicEditorPanelRegion').props.style.bottom).toBe('0px');
    harness.hide(); harness.bodyTop = 300; harness.geometry = { width: 430, top: 0, bottom: 900, height: 900 }; harness.show();
    body().onTouchStart(); body().onBodyTap(); click('表情'); await settle();
    expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('300px');
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(900 - 300 - 80 - 300 - 24 * 430 / 750)}px`);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['new sample', 'hide', 'unmount', 'disabled', 'account', 'width', 'baseline'] as const)('rejects an old batched body/probe measurement after %s', async reason => {
    ready(); await settle(); const originalQuery = Taro.createSelectorQuery;
    const pending: Array<(result: any[]) => void> = [];
    vi.spyOn(Taro, 'createSelectorQuery').mockImplementation(() => {
      const query = originalQuery();
      const nodes: Taro.NodesRef = {
        boundingClientRect: () => query,
        context: () => query,
        fields: () => query,
        node: () => query,
        scrollOffset: () => query,
      };
      query.exec = cb => { if (cb) pending.push(cb); return nodes; };
      return query;
    });
    keyboard(320); await settle(); expect(pending).toHaveLength(1); const stale = pending.shift()!;
    if (reason === 'new sample') { keyboard(280); await settle(); pending.shift()!([{ top: 300 }, { height: 500 }, { height: 1000 }, { height: 80 }, { top: 0 }]); }
    if (reason === 'hide') { harness.hide(); harness.show(); }
    if (reason === 'unmount') dispose();
    if (reason === 'disabled') { props.disabled = true; render(); mountEffects(); props.disabled = false; render(); }
    if (reason === 'account') { harness.account = 'other'; render(); mountEffects(); harness.account = 'tester'; render(); }
    if (reason === 'width') { harness.geometry = { width: 320, top: 0, bottom: 900, height: 900 }; harness.resize(); }
    if (reason === 'baseline') { harness.geometry = { width: 430, top: 20, bottom: 920, height: 900 }; keyboard(0); }
    const state = [...harness.state];
    stale([{ top: -200 }, { height: 1 }, { height: 9999 }, { height: 999 }, { top: -320 }]);
    expect(harness.state).toEqual(state);
    expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['close', 'collapse', 'title', 'hide', 'disabled', 'account', 'unmount'] as const)('refuses old panel tab/sticker/emoji/keyboard callbacks after %s without draft writes', reason => {
    process.env.TARO_ENV = 'weapp'; props.value = 'kept body'; props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }];
    ready(); keyboard(320); const insertText = vi.fn(); body().handleRef.current = { insertText, canFocus: () => false }; click('表情');
    const shared = all(render()).find(node => node.type === ComposerEmojiPanel).props;
    shared.onTabChange('sticker');
    const capturedTab = all(find(render(), 'composerEmojiTabs')).find(node => node.type === 'topic-format-button' && node.props.label === '表情').props;
    const capturedSticker = button(`添加表情包${STICKERS[0].name}`);
    const capturedClose = button('收起表情面板');
    if (reason === 'close') { click('收起表情面板'); click('表情'); }
    if (reason === 'collapse') { click('收起工具栏'); body().onTouchStart(); body().onBodyTap(); click('表情'); }
    if (reason === 'title') props.inputRef.current.dismissTools();
    if (reason === 'hide') { harness.hide(); harness.show(); }
    if (reason === 'disabled') { props.disabled = true; render(); mountEffects(); props.disabled = false; render(); }
    if (reason === 'account') { harness.account = 'other'; render(); mountEffects(); harness.account = 'tester'; render(); }
    if (reason === 'unmount') dispose();
    const state = [...harness.state]; shared.onEmoji('👍'); shared.onSticker(STICKERS[0]); shared.onTabChange('emoji'); capturedTab.onFormatend(); capturedSticker.onFormatend(); capturedClose.onFormatend();
    expect(harness.state).toEqual(state); expect(insertText).not.toHaveBeenCalled();
    expect(props.value).toBe('kept body'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled();
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
  it('retains emoji during trailing keyboard close but Collapse dismisses tools and keyboard once', () => {
    ready(); keyboard(320); click('表情'); body().onBlur(); keyboard(0);
    expect(dock()).toBeDefined(); expect(find(render(), 'topicEditorPanelRegion').props.style.height).toBe('300px');
    const collapse = button('收起工具栏'); click('收起工具栏');
    expect(Taro.hideKeyboard).toHaveBeenCalledTimes(2); expect(dock()).toBeUndefined();
    expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined(); collapse.onClick(); expect(Taro.hideKeyboard).toHaveBeenCalledTimes(2);
    body().onFocus(); keyboard(320); expect(dock()).toBeUndefined();
    body().onTouchStart(); expect(dock()).toBeUndefined(); body().onBodyTap(); expect(dock()).toBeDefined();
  });
  it.each(['immediate', 'keyboard closed'] as const)('keeps body scrolling enabled after Collapse with %s keyboard state', async timing => {
    process.env.TARO_ENV = 'weapp'; props.value = '合成可滚动正文'; ready(); keyboard(320); await settle();
    const before = parseFloat(find(render(), 'topicEditorBodyScroll').props.style.height);
    click('收起工具栏');
    if (timing === 'keyboard closed') keyboard(0);
    await settle();
    const tree = render(), scroll = find(tree, 'topicEditorBodyScroll').props;
    expect(scroll.scrollY).toBe(true); expect(scroll.enhanced).toBe(true); expect(scroll.showScrollbar).toBe(false);
    expect(scroll['keyboard-dismiss-mode']).toBe('none'); expect(scroll.catchMove).toBeUndefined();
    expect(body().disabled).toBe(false); expect(find(tree, 'topicEditorDockHost')).toBeUndefined(); expect(find(tree, 'topicEditorHeadingBackdrop')).toBeUndefined();
    expect(parseFloat(scroll.style.height)).toBeGreaterThan(before);
    scroll.onScroll({ detail: { scrollTop: 250 } }); await vi.advanceTimersByTimeAsync(60);
    expect(find(render(), 'topicEditorBodyScrollThumb').props.style.transform).toBe('translateY(125px)');
    expect(dock()).toBeUndefined(); expect(props.onChange).not.toHaveBeenCalled(); expect(props.value).toBe('合成可滚动正文');
  });
  it('restores tools for three native retained-focus taps without a second focus or rewriting the draft', () => {
    process.env.TARO_ENV = 'weapp'; props.value = '保留草稿'; props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }];
    const format = ready();
    for (let round = 0; round < 3; round++) {
      click('收起工具栏'); body().onFocus(); keyboard(320); expect(dock()).toBeUndefined();
      body().onTouchStart(); expect(dock()).toBeUndefined();
      body().onBodyTap(); expect(dock()).toBeDefined(); expect(body().focus).toBe(false);
      click('加粗'); click('标题'); click('二级标题');
    }
    expect(format).toHaveBeenCalledTimes(6); expect(format).toHaveBeenLastCalledWith('header', 'h2');
    expect(props.value).toBe('保留草稿'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled();
  });
  it.each(['move', 'cancel', 'title', 'hide', 'disabled', 'account', 'unmount'] as const)('refuses a pending body tap invalidated by %s', reason => {
    ready(); click('收起工具栏'); const target = body(); target.onTouchStart();
    if (reason === 'move') target.onTouchMove();
    if (reason === 'cancel') target.onTouchCancel();
    if (reason === 'title') props.inputRef.current.dismissTools();
    if (reason === 'hide') { harness.hide(); harness.show(); }
    if (reason === 'disabled') { props.disabled = true; render(); mountEffects(); props.disabled = false; render(); }
    if (reason === 'account') { harness.account = 'other'; render(); mountEffects(); harness.account = 'tester'; render(); }
    if (reason === 'unmount') dispose();
    target.onBodyTap(); body().onFocus(); keyboard(320); expect(dock()).toBeUndefined();
  });
  it('requires a completed fresh tap after title and hide/show, and restores tools after real blur and panel close', () => {
    ready();
    for (const dismiss of [() => props.inputRef.current.dismissTools(), () => { harness.hide(); harness.show(); }]) {
      dismiss(); body().onFocus(); expect(dock()).toBeUndefined(); body().onBodyTap(); expect(dock()).toBeUndefined();
      body().onTouchStart(); body().onBodyTap(); expect(dock()).toBeDefined(); expect(body().focus).toBe(false);
    }
    click('表情'); body().onBlur(); keyboard(0); click('收起表情面板'); expect(dock()).toBeUndefined();
    body().onTouchStart(); body().onBodyTap(); expect(dock()).toBeDefined(); expect(body().focus).toBe(false);
    body().onBlur(); expect(dock()).toBeUndefined(); expect(props.onChange).not.toHaveBeenCalled();
  });
  it('refuses callbacks from the previous emoji panel after collapse and a fresh native tap reopens it', () => {
    process.env.TARO_ENV = 'weapp'; ready(); const insertText = vi.fn(); body().handleRef.current = { insertText, canFocus: () => false };
    click('表情'); const old = all(render()).find(node => node.type === ComposerEmojiPanel).props;
    old.onTabChange('emoji'); const emoji = button('插入表情👍'); click('收起工具栏');
    body().onTouchStart(); body().onBodyTap(); click('表情');
    const state = [...harness.state]; old.onTabChange('sticker'); old.onSticker(STICKERS[0]); old.onEmoji('👍'); emoji.onFormatend();
    expect(harness.state).toEqual(state); expect(props.attachments).toEqual([]); expect(insertText).not.toHaveBeenCalled(); expect(recordCommentEmojiUsage).not.toHaveBeenCalled();
    const current = all(render()).find(node => node.type === ComposerEmojiPanel).props; current.onEmoji('👍');
    expect(insertText).toHaveBeenCalledOnce(); expect(insertText).toHaveBeenCalledWith('👍');
  });
  it('preserves draft and attachments on hide failure and refuses stale captured panel callbacks after Collapse', async () => {
    process.env.TARO_ENV = 'weapp'; props.value = '原草稿'; props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }];
    ready(); const insertText = vi.fn(); body().handleRef.current = { insertText, canFocus: () => false }; click('表情');
    const shared = all(render()).find(node => node.type === ComposerEmojiPanel).props;
    shared.onTabChange('emoji'); const captured = button('插入表情👍');
    vi.mocked(Taro.hideKeyboard).mockRejectedValueOnce(new Error('native hide failed'));
    click('收起工具栏'); await Promise.resolve();
    const state = [...harness.state]; captured.onFormatend(); shared.onSticker(STICKERS[1]); shared.onTabChange('sticker');
    expect(harness.state).toEqual(state);
    expect(insertText).not.toHaveBeenCalled(); expect(recordCommentEmojiUsage).not.toHaveBeenCalled();
    expect(props.value).toBe('原草稿'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled();
    body().onFocus(); keyboard(350); expect(dock()).toBeUndefined();
  });
  it('accurately collapses a native panel without pretending to reopen the keyboard', () => {
    ready(); keyboard(320); click('表情'); body().onBlur(); keyboard(0); click('收起表情面板');
    expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined();
    expect(dock()).toBeUndefined(); expect(body().focus).toBe(false);
    expect(Taro.showToast).not.toHaveBeenCalled();
    keyboard(0); expect(dock()).toBeUndefined();
  });
  it('does not refocus even a focus-capable source textarea when closing the panel after a real blur', () => {
    ready(); const canFocus = vi.fn(() => true); body().handleRef.current = { canFocus }; keyboard(320); click('表情');
    expect(body().focus).toBe(false); body().onBlur(); keyboard(0);
    click('收起表情面板'); expect(body().focus).toBe(false); expect(dock()).toBeUndefined(); keyboard(0);
    expect(canFocus).not.toHaveBeenCalled();
    props.inputRef.current.focus(); expect(body().focus).toBe(true); expect(canFocus).toHaveBeenCalledOnce(); expect(dock()).toBeUndefined();
    body().onFocus(); expect(dock().style.bottom).toBe('0px'); keyboard(300); expect(dock().style.bottom).toBe('300px');
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
    const gap = 24 * 430 / 750;
    ready(); await settle(); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(520 - gap)}px`);
    keyboard(320); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(200 - gap)}px`);
    click('表情'); body().onBlur(); keyboard(0); expect(dock()).toBeDefined();
    expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(220 - gap)}px`);
    props.inputRef.current.dismissTools(); expect(dock()).toBeUndefined();
    keyboard(0); expect(find(render(), 'topicEditorBodyScroll').props.style.height).toBe(`${Math.round(600 - gap - 34)}px`);
  });
  it('cleans timers on hide/unmount and ignores late keyboard events', async () => {
    ready(); keyboard(300); harness.hide(); expect(vi.getTimerCount()).toBe(0);
    keyboard(340); expect(dock()).toBeUndefined(); harness.show(); await settle(); expect(dock()).toBeUndefined();
    dispose(); const state = [...harness.state]; keyboard(350); await settle(); expect(harness.state).toEqual(state);
  });
  it('preserves emoji insertion and records usage', () => {
    ready(); click('表情'); body().onBlur();
    all(render()).find(e => e.props?.className === 'composerEmojiTab' && e.props.children.props.children === '表情')!.props.onClick();
    const handle = { insertText: vi.fn(), openMentions: vi.fn(), format: vi.fn(), canFocus: () => false }; body().handleRef.current = handle;
    click('插入表情👍'); expect(handle.insertText).toHaveBeenCalledWith('👍'); expect(recordCommentEmojiUsage).toHaveBeenCalledWith('👍', []);
    expect(handle.openMentions).not.toHaveBeenCalled();
  });
  it('captures native tabs and sticker taps once after the single opening hide request, preserving selection contract and lazy aspectFit content', () => {
    process.env.TARO_ENV = 'weapp'; ready(); keyboard(320); click('表情');
    const tabs = all(find(render(), 'composerEmojiTabs')).filter(node => node.type === 'topic-format-button');
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) { expect(tab.props.captureOnly).toBe(true); expect(tab.props.style).toEqual({ height: `${14.91 * 1.4}px` }); expect(tab.props.onClick).toBeUndefined(); expect(tab.props.children.type).toBe('Text'); }
    tabs[2].props.onFormatend();
    const cell = all(render()).find(node => node.props.className === 'composerEmojiSticker');
    expect(cell.props.onClick).toBeUndefined(); const control = cell.props.children;
    expect(control.props.captureOnly).toBe(true); expect(control.props.style).toEqual({ height: '112rpx' }); expect(control.props.onClick).toBeUndefined();
    expect(control.props.children.type).toBe('Image');
    expect(control.props.children.props).toMatchObject({ lazyLoad: true, mode: 'aspectFit', src: STICKERS[0].url, className: 'composerEmojiStickerImage' });
    control.props.onFormatend(); expect(props.attachments).toHaveLength(1); expect(recordCommentEmojiUsage).toHaveBeenCalledOnce();
    expect(props.attachments[0]).toMatchObject({ kind: 'sticker', sticker: STICKERS[0] });
    expect(body().focus).toBe(false); expect(find(render(), 'topicEditorPanelRegion').props.style.bottom).toBe('0px');
    expect(Taro.hideKeyboard).toHaveBeenCalledOnce(); expect(props.onChange).not.toHaveBeenCalled();
    const scroll = all(find(render(), 'composerEmojiPanel')).find(node => node.type === 'ScrollView');
    expect(scroll.props['keyboard-dismiss-mode']).toBe('none'); expect(scroll.props.onTouchEnd).toBeUndefined();
  });
  it('expands the actual shared panel in weapp and inserts one native-captured emoji without changing draft or attachments', () => {
    process.env.TARO_ENV = 'weapp'; props.value = '保留原正文';
    props.attachments = [{ id: 'kept', kind: 'sticker', sticker: STICKERS[0] }];
    const handle = { insertText: vi.fn(), canFocus: () => false }; body().handleRef.current = handle;
    ready(); body().handleRef.current = handle; click('表情');
    const emojiTab = all(find(render(), 'composerEmojiTabs')).find(e => e.type === 'topic-format-button' && e.props.label === '表情')!;
    emojiTab.props.onFormatend();
    const control = button('插入表情👍');
    expect(control.captureOnly).toBe(true); expect(control.style).toEqual({ height: '100%' }); expect(control.icon).toBe(''); expect(control.onClick).toBeUndefined();
    expect(control.children.props.className).toBe('composerEmojiText'); expect(control.children.props.children).toBe('👍');
    control.onFormatend(); expect(handle.insertText).toHaveBeenCalledOnce(); expect(handle.insertText).toHaveBeenCalledWith('👍');
    expect(props.value).toBe('保留原正文'); expect(props.attachments.map(item => item.id)).toEqual(['kept']); expect(props.onChange).not.toHaveBeenCalled();
    props.disabled = true; render(); control.onFormatend(); expect(handle.insertText).toHaveBeenCalledOnce();
    expect(find(render(), 'topicEditorPanelRegion')).toBeUndefined();
    props.disabled = false; render(); harness.account = 'changed-account'; control.onFormatend(); expect(handle.insertText).toHaveBeenCalledOnce();
    harness.account = 'tester'; harness.hide(); control.onFormatend(); expect(handle.insertText).toHaveBeenCalledOnce();
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
    all(render()).find(e => e.props?.className === 'composerEmojiTab' && e.props.children.props.children === '过早客')!.props.onClick();
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
