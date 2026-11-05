import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/pages/createTopic/index.scss'), 'utf8');
const css = sass.compileString(source, {
  loadPaths: [resolve(process.cwd(), 'src/pages/createTopic')],
}).css;
const title = readFileSync(resolve(process.cwd(), 'src/pages/createTopic/TopicTitle.tsx'), 'utf8');

describe('topic title local first-line layout contract', () => {
  it('centers only the title clear button at the 54rpx first-line midpoint', () => {
    const overrides = [...css.matchAll(/([^{}]+)\{([^{}]*translateY\(-50%\)[^{}]*)\}/g)];
    expect(overrides).toHaveLength(1);
    expect(overrides[0][1].trim()).toBe('.createTopic .topicTitleSection .clearableBtn');
    expect(overrides[0][2]).toMatch(/top:\s*27rpx;/);
    expect(overrides[0][2]).toMatch(/transform:\s*translateY\(-50%\);/);
  });
  it('keeps title and count first-line heights equal without vertically centering a multiline textarea', () => {
    expect(css).toMatch(/\.createTopic \.topicTitleCount\s*\{[^}]*line-height:\s*54rpx;/);
    expect(css).toMatch(/\.createTopic \.titleInput\s*\{[^}]*font-size:\s*36rpx;[^}]*line-height:\s*1\.5;[^}]*min-height:\s*54rpx;/);
    expect(css).toMatch(/\.createTopic \.topicTitleSection\s*\{[^}]*align-items:\s*flex-start;/);
    expect(title).toContain('autoHeight');
  });
  it('preserves the independent title entry, maximum length and clearable textarea contract', () => {
    expect(title).toContain('export const TOPIC_TITLE_MAX_LENGTH = 50');
    expect(title).toContain('<ClearableTextarea');
    expect(title).toContain('maxlength={TOPIC_TITLE_MAX_LENGTH}');
    expect(title).toContain("placeholder = '标题（必填）'");
    expect(title).toContain('onInput(nextValue)');
  });
});
