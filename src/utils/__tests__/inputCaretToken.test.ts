import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_PALETTES, themePageStyle, themeVariables } from '../themePreferences';

vi.mock('@tarojs/taro', () => ({ default: {} }));
vi.mock('../CacheService', () => ({ cacheService: {}, CacheCategory: { System: 'system' } }));

describe('shared input caret theme role', () => {
  it('provides one readable caret token for each theme and portal variables', () => {
    for (const theme of ['light', 'dark'] as const) {
      const color = THEME_PALETTES[theme]['input-caret'];
      expect(color).toBe(THEME_PALETTES[theme]['accent-text']);
      expect(themeVariables(theme)['--theme-input-caret']).toBe(color);
      expect(themePageStyle(theme)).toContain(`--theme-input-caret:${color}`);
    }
  });
  it('makes native inputs, textareas and editor surfaces use the shared role globally', () => {
    const style = readFileSync('src/app.scss', 'utf8');
    expect(style).toContain('input, textarea, editor,');
    expect(style).toContain('.taro-textarea, .weui-input, .weui-textarea');
    expect(style).toContain('caret-color: var(--theme-input-caret, #0754d7);');
  });
});
