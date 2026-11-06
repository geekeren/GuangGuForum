import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { compileString } from 'sass';
import { resolve } from 'node:path';
import ComposerEmojiPanel, { type ComposerEmojiPanelProps } from '../../components/ComposerEmojiPanel';
import { EMOJIS } from '../emojiUsage';
import { STICKERS } from '../stickers';

vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView' }));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }
function cells(tree: any, name: string) { return all(tree).filter(node => node.props.className?.split(' ').includes(name)); }
const props = (): ComposerEmojiPanelProps => ({ tab: 'common', common: { emojis: [], stickers: [] }, disabled: false, scrollViewType: 'custom', onTabChange: vi.fn(), onEmoji: vi.fn(), onSticker: vi.fn() });
const read = (file: string) => readFileSync(resolve(file), 'utf8');

describe('one real comment and topic emoji panel', () => {
  it('uses the same component and sole stylesheet in both production consumers', () => {
    for (const file of ['src/pages/topicDetail/CommentComposer.tsx', 'src/pages/createTopic/TopicEditor.tsx']) {
      const source = read(file);
      expect(source).toContain("import ComposerEmojiPanel from '../../components/ComposerEmojiPanel'");
      expect(source).toContain('<ComposerEmojiPanel');
      expect(source).not.toMatch(/Math\.ceil\((?:panelEmojis|emojis|panelStickers|stickers)\.length/);
    }
    for (const file of ['src/pages/topicDetail/index.scss', 'src/pages/createTopic/TopicEditor.scss']) {
      expect(read(file)).not.toMatch(/\.(?:topicPanelEmoji|topicPanelSticker|commentPopupPanelEmoji|commentPopupStickerImage)\s*\{/);
    }
    const css = compileString(read('src/components/ComposerEmojiPanel/index.scss'), { loadPaths: [resolve('src/components/ComposerEmojiPanel')] }).css;
    expect(css).toMatch(/\.composerEmojiTabs\s*\{[^}]*height: 72rpx/);
    expect(css).toMatch(/\.composerEmojiCell\s*\{[^}]*width: 12\.5%;[^}]*height: 64rpx/);
    expect(css).toMatch(/\.composerEmojiText\s*\{[^}]*font-size: 21\.79PX/);
    expect(css).toMatch(/\.composerEmojiSticker\s*\{[^}]*width: 20%/);
    expect(css).toMatch(/\.composerEmojiStickerImage\s*\{[^}]*width: 112rpx;[^}]*height: 112rpx/);
    expect(css).toContain('padding: 16rpx 24rpx'); expect(css).toContain('var(--theme-surface');
  });
  it('shares full empty copy, tab labels, common ordering and native scroll ownership', () => {
    const p = props(); let tree = ComposerEmojiPanel(p);
    expect(cells(tree, 'composerEmojiTab').map(node => node.props.children.props.children)).toEqual(['常用', '表情', '过早客']);
    expect(cells(tree, 'composerEmojiEmpty').map(node => node.props.children)).toEqual(['选择后，常用 Emoji 会显示在这里', '选择后，常用自定义表情会显示在这里']);
    expect(all(tree).find(node => node.type === 'ScrollView').props).toMatchObject({ type: 'custom', scrollY: true, 'keyboard-dismiss-mode': 'none' });
    p.common = { emojis: ['👍', '😂'], stickers: [STICKERS[0]] }; tree = ComposerEmojiPanel(p);
    expect(cells(tree, 'composerEmojiCell').map(node => node.props.children.props.children)).toEqual(['👍', '😂']);
    expect(cells(tree, 'composerEmojiHeading').map(node => node.props.children)).toEqual(['Emoji', '自定义表情']);
    const nodes = all(tree); expect(nodes.indexOf(cells(tree, 'composerEmojiCell')[0])).toBeLessThan(nodes.indexOf(cells(tree, 'composerEmojiSticker')[0]));
    cells(tree, 'composerEmojiCell')[0].props.onClick(); expect(p.onEmoji).toHaveBeenCalledWith('👍');
    cells(tree, 'composerEmojiSticker')[0].props.onClick(); expect(p.onSticker).toHaveBeenCalledWith(STICKERS[0]);
  });
  it('renders the actual complete shared data with eight emoji or five sticker cells per row', () => {
    const p = props(); p.tab = 'emoji'; let tree = ComposerEmojiPanel(p);
    expect(cells(tree, 'composerEmojiCell')).toHaveLength(EMOJIS.length); expect(cells(tree, 'composerEmojiSticker')).toHaveLength(0);
    const rows = cells(tree, 'composerEmojiRow'); expect(rows).toHaveLength(Math.ceil(EMOJIS.length / 8));
    expect(rows.every(row => cells(row, 'composerEmojiCell').length <= 8)).toBe(true);
    p.tab = 'sticker'; tree = ComposerEmojiPanel(p);
    expect(cells(tree, 'composerEmojiSticker')).toHaveLength(STICKERS.length); expect(cells(tree, 'composerEmojiCell')).toHaveLength(0);
    expect(cells(tree, 'composerEmojiRow').every(row => cells(row, 'composerEmojiSticker').length <= 5)).toBe(true);
  });
  it('offers optional native tab and sticker capture slots without duplicate click targets or changed content/row geometry', () => {
    const p = props(); p.common = { emojis: ['👍'], stickers: [STICKERS[0]] };
    p.renderTabControl = (tab, select, content) => createElement('captured-tab', { tab, onFormatend: select }, content);
    p.renderStickerControl = (sticker, select, content) => createElement('captured-sticker', { sticker, onFormatend: select }, content);
    const tree = ComposerEmojiPanel(p);
    const tabs = cells(tree, 'composerEmojiTab');
    expect(tabs).toHaveLength(3); expect(tabs.every(node => !node.props.onClick && !node.props.ariaRole)).toBe(true);
    expect(tabs.map(node => node.props.children.props.children.props.children)).toEqual(['常用', '表情', '过早客']);
    tabs[1].props.children.props.onFormatend(); expect(p.onTabChange).toHaveBeenCalledOnce(); expect(p.onTabChange).toHaveBeenCalledWith('emoji');
    const sticker = cells(tree, 'composerEmojiSticker')[0]; expect(sticker.props.onClick).toBeUndefined();
    const capture = sticker.props.children; const image = capture.props.children;
    expect(image.type).toBe('Image'); expect(image.props).toMatchObject({ lazyLoad: true, mode: 'aspectFit', src: STICKERS[0].url, className: 'composerEmojiStickerImage' });
    capture.props.onFormatend(); expect(p.onSticker).toHaveBeenCalledOnce(); expect(p.onSticker).toHaveBeenCalledWith(STICKERS[0]);
    expect(all(tree).find(node => node.type === 'ScrollView').props['keyboard-dismiss-mode']).toBe('none');
    const comment = read('src/pages/topicDetail/CommentComposer.tsx');
    expect(comment).not.toContain('renderTabControl'); expect(comment).not.toContain('renderStickerControl');
  });
  it('blocks tabs, text and sticker callbacks while disabled, including captured native selections', () => {
    const p = props(); p.disabled = true; p.common = { emojis: ['👍'], stickers: [STICKERS[0]] };
    let tree = ComposerEmojiPanel(p);
    cells(tree, 'composerEmojiTab')[1].props.onClick(); cells(tree, 'composerEmojiCell')[0].props.onClick(); cells(tree, 'composerEmojiSticker')[0].props.onClick();
    expect(p.onTabChange).not.toHaveBeenCalled(); expect(p.onEmoji).not.toHaveBeenCalled(); expect(p.onSticker).not.toHaveBeenCalled();
    p.renderEmojiControl = (_emoji, select, content) => createElement('captured-control', { onFormatend: select }, content);
    tree = ComposerEmojiPanel(p); all(tree).find(node => node.type === 'captured-control').props.onFormatend(); expect(p.onEmoji).not.toHaveBeenCalled();
    expect(cells(tree, 'composerEmojiCell')[0].props.onClick).toBeUndefined();
    p.renderTabControl = (_tab, select, content) => createElement('captured-tab', { onFormatend: select }, content);
    p.renderStickerControl = (_sticker, select, content) => createElement('captured-sticker', { onFormatend: select }, content);
    tree = ComposerEmojiPanel(p);
    all(tree).find(node => node.type === 'captured-tab').props.onFormatend();
    all(tree).find(node => node.type === 'captured-sticker').props.onFormatend();
    expect(p.onTabChange).not.toHaveBeenCalled(); expect(p.onSticker).not.toHaveBeenCalled();
  });
});

describe('native capture-only slot keeps default controls intact', () => {
  it.each(['tab', 'sticker'] as const)('runs one completed %s capture and refuses move/cancel/disabled without a second tap action', kind => {
    let definition: any; runInNewContext(read('src/native-components/topic-format-button/index.js'), { Component: (value: any) => { definition = value; } });
    const p = props(); p.common = { emojis: [], stickers: [STICKERS[0]] };
    p.renderTabControl = (_tab, select, content) => createElement('captured-tab', { onFormatend: select }, content);
    p.renderStickerControl = (_sticker, select, content) => createElement('captured-sticker', { onFormatend: select }, content);
    const tree = ComposerEmojiPanel(p); const captured = all(tree).find(node => node.type === `captured-${kind}`);
    const triggerEvent = vi.fn(() => captured.props.onFormatend());
    const control = { properties: { disabled: false, captureOnly: true }, triggerEvent, touchCancelled: true };
    const method = (name: string) => definition.methods[name].call(control);
    method('formatStart'); method('formatMove'); method('formatEnd'); method('formatTap');
    method('formatStart'); method('formatCancel'); method('formatEnd'); method('formatTap');
    expect(triggerEvent).not.toHaveBeenCalled();
    method('formatStart'); method('formatEnd'); method('formatTap'); method('formatEnd');
    expect(triggerEvent).toHaveBeenCalledOnce();
    expect(kind === 'tab' ? p.onTabChange : p.onSticker).toHaveBeenCalledOnce();
    control.properties.disabled = true; method('formatStart'); method('formatEnd'); method('formatTap');
    expect(triggerEvent).toHaveBeenCalledOnce();
    const entry = read('src/native-components/topic-format-button/index.wxml');
    expect(entry).toContain('catchtouchend="formatEnd"'); expect(entry).toContain('bindtouchmove="formatMove"'); expect(entry).toContain('catchtouchcancel="formatCancel"');
  });
  it('preserves default icon/thumbnail branches and captures touches around a real slot', () => {
    const source = read('src/native-components/topic-format-button/index.js');
    let definition: any; runInNewContext(source, { Component: (value: any) => { definition = value; } });
    expect(definition.properties.captureOnly.value).toBe(false);
    const triggerEvent = vi.fn(); const control = { properties: { disabled: false, captureOnly: true }, triggerEvent, touchCancelled: true };
    definition.methods.formatStart.call(control); definition.methods.formatEnd.call(control); definition.methods.formatTap.call(control);
    expect(triggerEvent).toHaveBeenCalledTimes(1); expect(triggerEvent).toHaveBeenCalledWith('formatend');
    definition.methods.formatStart.call(control); definition.methods.formatMove.call(control); definition.methods.formatEnd.call(control); expect(triggerEvent).toHaveBeenCalledTimes(1);
    control.properties.disabled = true; definition.methods.formatStart.call(control); definition.methods.formatEnd.call(control); expect(triggerEvent).toHaveBeenCalledTimes(1);
    const wxml = read('src/native-components/topic-format-button/content.wxml');
    const entry = read('src/native-components/topic-format-button/index.wxml');
    expect(entry).toContain('wx:if="{{captureOnly}}"'); expect(entry).toContain('<slot />');
    expect(entry).toContain('<template wx:else is="topic-control-content"');
    expect(entry).toContain('catchtouchend="formatEnd"'); expect(entry).toContain('catchtap="formatTap"');
    expect(entry).not.toContain('src="{{icon}}"'); expect(wxml).not.toContain('<slot');
    expect(wxml).toContain('wx:if="{{!thumbnail}}"'); expect(wxml).toContain('catchtouchend="formatEnd"'); expect(wxml).toContain('catchtap="formatTap"');
    expect(read('src/native-components/topic-format-button/index.wxss')).toContain('.format-button--capture-only { height: 100%; }');
    const topic = read('src/pages/createTopic/TopicEditor.tsx');
    expect(topic).toContain("captureOnly style={{ height: `${14.91 * 1.4}px` }}");
    expect(topic).toContain("captureOnly style={{ height: '112rpx' }}");
    const panelCss = compileString(read('src/components/ComposerEmojiPanel/index.scss'), { loadPaths: [resolve('src/components/ComposerEmojiPanel')] }).css;
    expect(panelCss).toMatch(/\.composerEmojiTab\s*\{[^}]*padding: 12rpx 24rpx;[^}]*font-size: 14\.91PX;/);
    expect(panelCss).toMatch(/\.composerEmojiSticker\s*\{[^}]*padding: 8rpx;/);
    expect(panelCss).toMatch(/\.composerEmojiStickerImage\s*\{[^}]*height: 112rpx;/);
    expect(read('src/app.scss')).toMatch(/line-height:\s*1\.4;/);
    expect(topic).toContain("captureOnly style={{ height: '100%' }} onFormatend={select}>{content}</topic-format-button>");
    expect(topic).toContain('editor.current?.insertText(emoji)');
    expect(topic).toContain('// Stickers share the independent attachment tray, not the native Delta.');
  });
});
