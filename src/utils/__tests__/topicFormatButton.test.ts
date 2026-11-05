import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const directory = resolve(process.cwd(), 'src/native-components/topic-format-button');
function component() {
  let definition: any;
  runInNewContext(readFileSync(resolve(directory, 'index.js'), 'utf8'), { Component: (value: any) => { definition = value; } });
  return definition;
}
function instance(disabled = false) {
  const definition = component(), events: string[] = [];
  const context: any = { properties: { disabled }, triggerEvent: (name: string) => events.push(name) };
  return { events, context, run: (method: string) => definition.methods[method].call(context) };
}
describe('native topic control capture bridge', () => {
  it('registers a compiler-resolvable source path rather than a runtime-only absolute copy path', () => {
    const pageDirectory = resolve(process.cwd(), 'src/pages/createTopic');
    const pageConfig = readFileSync(resolve(pageDirectory, 'index.config.ts'), 'utf8');
    const componentPath = pageConfig.match(/'topic-format-button':\s*'([^']+)'/)![1];
    // Vite's native component collector resolves relative to the page script.
    // An absolute mini-program path is not a source path: copied files alone
    // cannot populate thirdPartyComponents or generate base.wxml templates.
    expect(componentPath).toBe('../../native-components/topic-format-button/index');
    expect(resolve(pageDirectory, componentPath)).toBe(resolve(directory, 'index'));
    for (const extension of ['js', 'json', 'wxml', 'wxss']) expect(existsSync(resolve(pageDirectory, `${componentPath}.${extension}`))).toBe(true);
    expect(pageConfig).not.toContain("'topic-format-button': '/native-components/");
  });
  it('keeps only static, existing asset sources in the compiler entry and passes all props into its native template', () => {
    const entry = readFileSync(resolve(directory, 'index.wxml'), 'utf8');
    const assets = [...entry.matchAll(/\bsrc="([^"]+)"/g)].map(match => match[1]);
    expect(assets).toEqual(['./content.wxml']);
    for (const asset of assets) expect(existsSync(resolve(directory, asset))).toBe(true);
    expect(entry).toContain('is="topic-control-content"');
    expect(entry).toContain('data="{{icon, label, disabled, active, background, thumbnail, caption, loading}}"');
    const content = readFileSync(resolve(directory, 'content.wxml'), 'utf8');
    expect(content).toContain('<template name="topic-control-content">');
    expect(content).toContain('src="{{icon}}"'); expect(content).toContain('catchtouchend="formatEnd"');
  });
  it('uses evaluated WXML conditions instead of truthy literal strings for glyph and upload overlays', () => {
    const template = readFileSync(resolve(directory, 'content.wxml'), 'utf8');
    const conditions = [...template.matchAll(/wx:if="([^"]+)"/g)].map(match => match[1]);
    expect(conditions).toEqual(['{{!thumbnail}}', '{{caption || loading}}', '{{loading}}', '{{caption}}']);
    const evaluate = (values: { thumbnail: boolean; caption: string; loading: boolean }) => conditions.map(condition =>
      Boolean(runInNewContext(condition.slice(2, -2), values)));
    expect(evaluate({ thumbnail: false, caption: '', loading: false })).toEqual([true, false, false, false]);
    expect(evaluate({ thumbnail: true, caption: '', loading: false })).toEqual([false, false, false, false]);
    expect(evaluate({ thumbnail: true, caption: '处理中', loading: true })).toEqual([false, true, true, true]);
    expect(evaluate({ thumbnail: true, caption: '点击重试', loading: false })).toEqual([false, true, false, true]);
  });
  it('captures real native touch events and owns its icon/label without a slot', () => {
    const template = readFileSync(resolve(directory, 'content.wxml'), 'utf8');
    for (const binding of ['bindtouchstart="formatStart"', 'catchtouchend="formatEnd"', 'bindtouchmove="formatMove"', 'catchtouchcancel="formatCancel"', 'catchtap="formatTap"']) expect(template).toContain(binding);
    // Start/move may reach the horizontal attachment ScrollView; only end/tap
    // must stop propagation to preserve Editor focus and prevent duplicate actions.
    expect(template).not.toContain('catchtouchstart'); expect(template).not.toContain('catchtouchmove');
    expect(template).not.toContain('<slot'); expect(template).not.toContain('bindtouchend');
    expect(template).toContain('src="{{icon}}"'); expect(template).toContain('aria-label="{{label}}"');
    expect(JSON.parse(readFileSync(resolve(directory, 'index.json'), 'utf8')).component).toBe(true);
  });
  it('makes the catchtouchend owner the only native hit target while start/move still reach the scroll view', () => {
    const template = readFileSync(resolve(directory, 'content.wxml'), 'utf8');
    const css = readFileSync(resolve(directory, 'index.wxss'), 'utf8');
    expect(template).toMatch(/<view class="format-button [^>]*bindtouchstart="formatStart"[^>]*catchtouchend="formatEnd"[^>]*bindtouchmove="formatMove"/);
    expect(css).toMatch(/\.format-button\s*\{[^}]*pointer-events:\s*auto;/);
    const decorative = css.match(/([^{}]+)\{\s*pointer-events:\s*none;\s*\}/)![1];
    for (const child of ['glyph', 'icon', 'thumbnail', 'overlay', 'spinner', 'caption']) expect(decorative).toContain(`.format-button__${child}`);
    expect(decorative).not.toMatch(/\.format-button\s*[,\{]/);
    expect(css).not.toContain('touch-action: none');
    expect(template).not.toContain('catchtouchmove'); expect(template).not.toContain('catchtouchstart');
  });
  it('executes only one end event per completed touch, never the following tap', () => {
    const control = instance();
    control.run('formatEnd'); expect(control.events).toEqual([]);
    control.run('formatStart'); control.run('formatEnd'); control.run('formatTap'); control.run('formatEnd');
    expect(control.events).toEqual(['formatend']);
    control.run('formatStart'); control.run('formatEnd'); control.run('formatTap');
    expect(control.events).toEqual(['formatend', 'formatend']);
  });
  it.each(['formatMove', 'formatCancel'])('cancels %s without formatting after end/tap', method => {
    const control = instance(); control.run('formatStart'); control.run(method); control.run('formatEnd'); control.run('formatTap');
    expect(control.events).toEqual([]);
    control.run('formatStart'); control.run('formatEnd'); expect(control.events).toEqual(['formatend']);
  });
  it('guards disabled touches, including disable after start', () => {
    const control = instance(true); control.run('formatStart'); control.run('formatEnd');
    control.context.properties.disabled = false; control.run('formatStart'); control.context.properties.disabled = true;
    control.run('formatEnd'); control.run('formatTap'); expect(control.events).toEqual([]);
  });
  it('does not format, focus, hide the keyboard or create timers inside the bridge', () => {
    const source = readFileSync(resolve(directory, 'index.js'), 'utf8');
    for (const forbidden of ['setTimeout', 'Date.now', 'editor.', 'hideKeyboard', 'focus(']) expect(source).not.toContain(forbidden);
    expect(Object.keys(component().properties)).toEqual(['icon', 'label', 'disabled', 'active', 'background', 'thumbnail', 'caption', 'loading']);
  });
  it('mirrors the independent glyph size and supports captured thumbnail/retry content', () => {
    const template = readFileSync(resolve(directory, 'content.wxml'), 'utf8');
    const css = readFileSync(resolve(directory, 'index.wxss'), 'utf8');
    expect(template).toContain("{{active ? background : 'transparent'}}");
    expect(template).toContain('format-button__thumbnail'); expect(template).toContain('{{caption}}');
    expect(css).toMatch(/\.format-button\s*\{[^}]*height:\s*72rpx/);
    expect(css).toMatch(/\.format-button__glyph\s*\{[^}]*width:\s*64rpx;[^}]*height:\s*64rpx;[^}]*border-radius:\s*16rpx/);
    expect(css).toMatch(/\.format-button__icon\s*\{[^}]*width:\s*40rpx;[^}]*height:\s*40rpx/);
    expect(css).toMatch(/\.format-button--thumbnail\s*\{[^}]*height:\s*128rpx/);
  });
});
