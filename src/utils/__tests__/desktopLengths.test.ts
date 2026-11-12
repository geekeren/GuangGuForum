import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const requireProject = createRequire(`${process.cwd()}/package.json`);
const postcss = requireProject('postcss');
const desktopLengths = requireProject('./config/desktopLengths');
const pxtransform = requireProject('postcss-pxtransform');
const fixedReadingFonts = requireProject('./config/fixedReadingFonts');
async function build(css: string, pipeline = false) {
  return (await postcss([
    ...(pipeline ? [pxtransform({ platform: 'weapp', designWidth: 750, deviceRatio: { 750: 1 } }), fixedReadingFonts()] : []),
    desktopLengths(),
  ]).process(css, { from: '/app/src/components/index.module.scss' })).root;
}
function values(root: any, selector: string) {
  const out: Record<string, string> = {};
  root.walkRules((rule: any) => {
    if (rule.selector === selector) rule.walkDecls((d: any) => { out[d.prop] = d.value; });
  });
  return out;
}
describe('common desktop lengths in the real PostCSS pipeline', () => {
  it('keeps selector specificity, source order and existing desktop overrides', async () => {
    const root = await build('.card {padding: 20rpx; padding-left: 12rpx}.dark .card {padding: 16rpx}.themePageHost--desktop .card {padding: 7PX}');
    const selectors: string[] = [];
    root.walkRules((r: any) => selectors.push(r.selector));
    expect(selectors).toEqual(['.card', '.dark .card', '.themePageHost--desktop .card', '.themePageHost--desktop']);
    expect(values(root, '.card')).toEqual({ padding: 'var(--gzk-rpx-20, 20rpx)', 'padding-left': 'var(--gzk-rpx-12, 12rpx)' });
    expect(values(root, '.themePageHost--desktop .card').padding).toBe('7PX');
    expect(values(root, '.themePageHost--desktop')['--gzk-rpx-20']).toBe('10px');
  });
  it('supports signed/fractional dimensions, calc, shadows, fallback vars and keyframes', async () => {
    const root = await build('.card {margin: -12rpx +2.5rpx .5RPX; width: calc(100% - 32rpx); box-shadow: var(--theme-shadow, 0 4rpx 12rpx #000); height: max(20rpx, env(safe-area-inset-bottom))} @keyframes enter {from {transform: translateY(-4rpx)}}');
    expect(values(root, '.card').margin).toBe('var(--gzk-rpx-n12, -12rpx) var(--gzk-rpx-2d5, +2.5rpx) var(--gzk-rpx-0d5, .5RPX)');
    expect(values(root, '.card').width).toBe('calc(100% - var(--gzk-rpx-32, 32rpx))');
    expect(values(root, 'from').transform).toBe('translateY(var(--gzk-rpx-n4, -4rpx))');
    expect(values(root, '.themePageHost--desktop')['--gzk-rpx-n12']).toBe('-6px');
    expect(values(root, '.card')['box-shadow']).toContain('var(--gzk-rpx-12, 12rpx)');
  });
  it('leaves URLs, strings, comments, percentages, fixed px and unitless values alone', async () => {
    const root = await build('.card {background: url("96rpx.png"); content: "96rpx"; border: 1px solid red; width: 100%; line-height: 1.5; padding: 16rpx /* 96rpx */}');
    expect(values(root, '.card')).toMatchObject({ background: 'url("96rpx.png")', content: '"96rpx"', border: '1px solid red', width: '100%', 'line-height': '1.5' });
    expect(values(root, '.themePageHost--desktop')['--gzk-rpx-96']).toBeUndefined();
  });
  it('is idempotent without wrapping generated fallbacks or making variable cycles', async () => {
    const first = await build('.card {width: var(--avatar, 96rpx); --custom-gap: 16rpx}');
    const second = await build(first.toString());
    expect(second.toString()).toBe(first.toString());
    expect(values(second, '.themePageHost--desktop')['--gzk-rpx-96']).toBe('48px');
    expect(values(second, '.themePageHost--desktop')['--gzk-rpx-16']).toBe('8px');
  });
  it('runs after reading fonts and keeps native input and mirror metrics together', async () => {
    const root = await build('.topicList .title {font-size: 30px; padding: 20px}.mentionEditor {font-size: 28rpx}.mentionEditorMirrorText {font-size: inherit}', true);
    expect(values(root, '.topicList .title')).toEqual({ 'font-size': '17px', padding: 'var(--gzk-rpx-20, 20rpx)' });
    expect(values(root, '.mentionEditor')['font-size']).toBe('var(--gzk-rpx-28, 28rpx)');
    expect(values(root, '.mentionEditorMirrorText')['font-size']).toBe('inherit');
  });
  it('provides locally used tokens for CSS Modules, library and subpackage styles', async () => {
    for (const selector of ['.index_module__avatar_hash', '.gzkFormField', '.privateConversation']) {
      const root = await build(`${selector} {width: 96rpx; border-radius: 20rpx !important}`);
      expect(values(root, selector).width).toBe('var(--gzk-rpx-96, 96rpx)');
      expect(values(root, '.themePageHost--desktop')).toMatchObject({ '--gzk-rpx-96': '48px', '--gzk-rpx-20': '10px' });
    }
  });
  it('keeps actual shared profile, private UI and announcement mobile declarations equivalent', async () => {
    const sass = requireProject('sass');
    for (const file of ['src/components/UserProfileDetail/index.scss', 'src/pages/messages/index.scss', 'src/components/PinnedTopicCard/index.scss', 'packages/gzk-ui/src/components/Tag/index.module.scss', 'packages/gzk-ui/src/components/FormField/index.scss']) {
      const css = sass.compile(file, { logger: { warn() {}, debug() {} } }).css;
      const baseline = (await postcss([
        pxtransform({ platform: 'weapp', designWidth: 750, deviceRatio: { 750: 1 } }), fixedReadingFonts(),
      ]).process(css, { from: file })).root;
      const transformed = await build(baseline.toString());
      const parser = requireProject('postcss-value-parser');
      function declarations(root: any) {
        const out: unknown[] = [];
        root.walkDecls((decl: any) => {
          if (decl.prop.startsWith('--gzk-rpx-')) return;
          const value = parser(decl.value);
          value.walk((part: any) => {
            if (part.type !== 'function' || part.value !== 'var' || !part.nodes[0]?.value?.startsWith('--gzk-rpx-')) return;
            const comma = part.nodes.findIndex((node: any) => node.type === 'div' && node.value === ',');
            part.type = 'word';
            part.value = parser.stringify(part.nodes.slice(comma + 1));
            delete part.nodes;
            return false;
          });
          out.push([decl.parent.selector, decl.prop, value.toString(), decl.important]);
        });
        return out;
      }
      expect(declarations(transformed)).toEqual(declarations(baseline));
    }
  });
  it('does not create tokens when all dimensions are already native or proportional', async () => {
    const root = await build('.card {width: 100%; height: 36PX; min-height: 0}');
    expect(values(root, '.themePageHost--desktop')).toEqual({});
  });
});
