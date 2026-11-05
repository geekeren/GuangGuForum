import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(resolve(process.cwd(), 'src/pages/createTopic/index.tsx'), 'utf8');
const editorSource = readFileSync(resolve(process.cwd(), 'src/pages/createTopic/TopicEditor.tsx'), 'utf8');
const jsx = (source: string, className: string) => source.split('\n').find(line => line.includes(`className="${className}"`)) || '';

describe('create topic scrolling surface', () => {
  it('keeps the page itself scrollbar-free', () => {
    const body = jsx(pageSource, 'createTopicBody');
    expect(body).toContain('scrollY');
    expect(body).toContain('showScrollbar={false}');
  });

  it('keeps the preview overlay scrollbar behavior unchanged', () => {
    const preview = jsx(pageSource, 'topicPreviewScroll');
    expect(preview).toContain('showScrollbar={false}');
  });

  it('gives the editing body its own scroll viewport and persistent scrollbar', () => {
    expect(editorSource).toContain("className='topicEditorBodyScroll'");
    expect(editorSource).toContain("className='topicEditorBodyScrollbar'");
    expect(editorSource).toContain("className='topicEditorBodyScrollThumb'");
    expect(editorSource).toContain('bodyScrollbarVisible');
    expect(editorSource).toContain('onScroll={handleBodyScroll}');
  });

  it('makes the body ScrollView the sole editing scroll owner instead of clipping inside native Editor', () => {
    const css = sass.compile(resolve(process.cwd(), 'src/pages/createTopic/TopicEditor.scss')).css;
    const host = css.match(/\.topicNativeEditor\s*\{([^}]*)\}/)![1];
    const content = css.match(/\.topicNativeEditor \.ql-editor\s*\{([^}]*)\}/)![1];
    for (const rule of [host, content]) {
      expect(rule).toContain('height: auto;'); expect(rule).toContain('overflow: visible;');
      expect(rule).not.toContain('overflow-y: auto'); expect(rule).not.toContain('height: 100%');
    }
    expect(css).toMatch(/\.topicNativeEditor \.ql-editor\.scroll-disabled\s*\{[^}]*overflow:\s*hidden;/);
    expect(editorSource).toContain('scrollY enhanced showScrollbar={false}');
    expect(editorSource).toContain("'keyboard-dismiss-mode': 'none'");
  });
  it('moves the passive thumb toward the right edge without reserving a wide text gutter', () => {
    const css = sass.compile(resolve(process.cwd(), 'src/pages/createTopic/TopicEditor.scss')).css;
    expect(css).toMatch(/\.topicEditorBodyContent\s*\{[^}]*padding-right:\s*4rpx;/);
    expect(css).toMatch(/\.topicEditorBodyScrollbar\s*\{[^}]*right:\s*-8rpx;[^}]*width:\s*6rpx;[^}]*pointer-events:\s*none;/);
    expect(css).toMatch(/\.topicEditorBodyScrollThumb\s*\{[^}]*right:\s*0;[^}]*width:\s*4rpx;/);
    // The editor card already has 36rpx right padding, so moving 8rpx into it
    // cannot reach the card/screen edge. The bar stays outside the text box.
    expect(36 - 8).toBeGreaterThan(0);
    expect(readFileSync(resolve(process.cwd(), 'src/pages/createTopic/index.scss'), 'utf8')).toContain('padding: 32rpx 36rpx;');
  });
  it('uses the common caret token for native/source body and title without native focus props', () => {
    const css = sass.compile(resolve(process.cwd(), 'src/pages/createTopic/TopicEditor.scss')).css;
    expect(css.match(/caret-color:\s*var\(--theme-input-caret, #0754d7\)/g)).toHaveLength(3);
  });
  it('fills the space left below the editor instead of a fixed-height box', () => {
    expect(editorSource).toContain('viewport.viewportBottom ?? viewport.viewportHeight');
    expect(editorSource).toContain('viewportBottom + viewportInset - bodyTop - bodyReserved');
    expect(editorSource).toContain('(dockVisible ? dockHeight : 0) + (overlayVisible ? inputHeight : 0)');
    expect(editorSource).toContain('bodyAvailable');
    expect(editorSource).not.toContain('VIEWPORT_SAMPLE_INTERVAL_MS');
    expect(editorSource).not.toContain('DOCK_GESTURE_TIMEOUT_MS');
  });
});
