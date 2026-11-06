import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';
import { serializeTopicDocumentHtml } from '../topicDocument';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const compile = (file: string) => sass.compileString(read(file), { loadPaths: [resolve(process.cwd(), file, '..')] }).css;
describe('shared topic body and native list presentation', () => {
  it('uses the same body variant for preview and detail while comments retain default rendering', () => {
    expect(read('src/pages/createTopic/index.tsx')).toContain("<HtmlRender html={previewContent} variant='body' />");
    expect(read('src/pages/topicDetail/index.tsx')).toContain("<HtmlRender html={topicDetail.content} variant='body' fullBleedImages />");
    expect(read('src/pages/topicDetail/index.tsx')).toContain('<HtmlRender html={comment.content} />');
    expect(read('src/components/HtmlRender/index.tsx')).toContain("props.variant === 'body' ? ' htmlWrap--body' : ''");
  });
  it('keeps body typography and paragraph/image presentation in the shared stylesheet', () => {
    const css = compile('src/components/HtmlRender/index.scss');
    expect(css).toMatch(/\.htmlWrap--body\s*\{[^}]*font-size:\s*16\.05PX;[^}]*line-height:\s*1\.6;/);
    expect(css).toMatch(/\.htmlWrap--body \.html \.h5-p\s*\{[^}]*margin:\s*0 0 12rpx;/);
    expect(css).toMatch(/\.htmlWrap--body \.html \.h5-img\s*\{[^}]*margin:\s*12rpx 0;/);
    expect(css).toMatch(/\.html\s*\{[^}]*font-size:\s*17\.2PX;[^}]*line-height:\s*1\.7;/);
  });
  it('reserves an empty list line for shared ul and ol without changing counters or adding text', () => {
    const css = compile('src/components/HtmlRender/index.scss');
    expect(css).toMatch(/\.html \.h5-li\s*\{[^}]*line-height:\s*1\.6;[^}]*min-height:\s*1\.6em;/);
    expect(css).toContain('counter(ol-item)');
    const result = serializeTopicDocumentHtml({ ops: [{ insert: 'A' }, { insert: '\n', attributes: { list: 'bullet' } }, { insert: 'B' }, { insert: '\n', attributes: { list: 'ordered' } }, { insert: '\n', attributes: { list: 'ordered' } }] });
    expect(result.html + '<p>署名</p>').toBe('<ul><li>A</li></ul><ol><li>B</li><li><br></li></ol><p>署名</p>');
  });
  it('keeps shared preview bullets inside their existing positive text slot', () => {
    const css = compile('src/components/HtmlRender/index.scss');
    const item = css.match(/\.html \.h5-li\s*\{([^}]*)\}/)![1];
    const marker = css.match(/\.html \.h5-ul \.h5-li::before\s*\{([^}]*)\}/)![1];
    const nested = css.match(/\.html \.h5-li \.h5-ul \.h5-li::before\s*\{([^}]*)\}/)![1];
    const slot = Number(item.match(/padding-left:\s*([\d.]+)rpx/)![1]);
    const left = Number(marker.match(/left:\s*([\d.]+)rpx/)![1]);
    const width = Number(marker.match(/width:\s*([\d.]+)rpx/)![1]);
    const border = Number(nested.match(/border:\s*([\d.]+)rpx/)![1]);
    expect(marker).toContain('position: absolute'); expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width + border * 2).toBeLessThan(slot);
  });
  it('centers separate active glyph backgrounds without shrinking toolbar touch cells', () => {
    const css = compile('src/pages/createTopic/TopicEditor.scss');
    const cell = css.match(/\.topicEditorTool\s*\{([^}]*)\}/)![1];
    const glyph = css.match(/\.topicEditorToolGlyph\s*\{([^}]*)\}/)![1];
    const icon = css.match(/\.topicEditorToolIcon\s*\{([^}]*)\}/)![1];
    expect(cell).toContain('flex: none'); expect(cell).toContain('width: 72rpx'); expect(cell).toContain('height: 72rpx');
    expect(css).toMatch(/\.topicEditorTool--collapse\s*\{[^}]*margin-left: auto/);
    expect(css).toMatch(/\.topicEditorHeadingMenu\s*\{[^}]*bottom: 100%/);
    expect(cell).toContain('align-items: center'); expect(cell).toContain('justify-content: center');
    expect(glyph).toContain('width: 64rpx'); expect(glyph).toContain('height: 64rpx');
    expect(glyph).toContain('border-radius: 16rpx'); expect(glyph).toContain('flex: none');
    expect(icon).toContain('width: 40rpx'); expect(icon).toContain('height: 40rpx');
    expect(css).toMatch(/\.topicEditorTool--active \.topicEditorToolGlyph, \.topicEditorTool:active \.topicEditorToolGlyph\s*\{[^}]*background:\s*var\(--theme-brand-soft,/);
    expect(css).not.toMatch(/\.topicEditorTool--active\s*[,\{]/);
    for (const asset of ['editor-bold', 'editor-list', 'editor-add']) {
      expect(read(`packages/gzk-ui/src/icons/assets/${asset}.svg`)).toContain('viewBox="0 0 24 24"');
      expect(read(`packages/gzk-ui/src/icons/assets/${asset}.svg`)).toContain('stroke-width="1.8"');
      expect(read(`packages/gzk-ui/src/icons/assets/${asset}.svg`)).toContain('currentColor');
    }
    expect(read('packages/gzk-ui/src/icons/assets/editor-list.svg').match(/r="1\.4"/g)).toHaveLength(3);
  });
  it('scopes native empty-item/marker slots without rewriting native content, counters or indentation', () => {
    const css = compile('src/pages/createTopic/TopicEditor.scss');
    // Taro's html transform rewrites a bare `li` descendant selector to `.h5-li`,
    // which never matches the native editor's real <li> nodes. Keeping the tag
    // inside :is() is what makes this rule reach the editor content.
    expect(css).toMatch(/\.topicNativeEditor :is\(li\)\s*\{[^}]*padding-left:\s*1\.8em;[^}]*min-height:\s*1\.8em;/);
    expect(css).not.toMatch(/\.topicNativeEditor\s+li\b/);
    // A native content wrapper may own scroll sizing, but marker geometry must
    // still target real li directly and never depend on that wrapper's presence.
    expect(css).not.toMatch(/\.topicNativeEditor \.ql-editor[^{}]*:is\(li\)/);
    const item = css.match(/\.topicNativeEditor :is\(li\)\s*\{([^}]*)\}/)![1];
    const marker = css.match(/\.topicNativeEditor :is\(li\)::before\s*\{([^}]*)\}/)![1];
    // Reclaim the positive padding in normal inline flow. The marker's actual
    // left edge remains zero, so clipping cannot hide it and wrapped text stays
    // at the same indentation; its glyph shares the first line's baseline.
    expect(marker).toContain('position: static'); expect(marker).toContain('display: inline-block');
    expect(marker).toContain('vertical-align: baseline'); expect(marker).not.toMatch(/(?:left|top):\s*0;/);
    expect(marker).toContain('font-size: inherit'); expect(marker).toContain('line-height: inherit');
    expect(marker).toContain('text-align: right'); expect(marker).toContain('color: inherit');
    expect(item).toContain('color: inherit'); expect(item).toContain('line-height: inherit');
    const textStart = Number(item.match(/padding-left:\s*([\d.]+)em/)![1]);
    const markerWidth = Number(marker.match(/width:\s*([\d.]+)em/)![1]);
    const reclaim = Number(marker.match(/margin-left:\s*(-?[\d.]+)em/)![1]);
    const gap = Number(marker.match(/margin-right:\s*([\d.]+)em/)![1]);
    expect(textStart + reclaim).toBeCloseTo(0);
    expect(textStart + reclaim + markerWidth + gap).toBeCloseTo(textStart);
    expect(gap).toBeCloseTo(0.3);
    expect(marker).not.toContain('content:'); expect(marker).not.toContain('counter');
    expect(css).not.toContain('ql-indent'); expect(marker).not.toContain('padding');
    expect(item).not.toContain('overflow'); expect(marker).not.toContain('overflow');
  });
});
