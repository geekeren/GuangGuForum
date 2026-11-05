import { describe, expect, it, vi } from 'vitest';
import { THEME_PALETTES, themePageStyle, themeVariables } from '../themePreferences';

vi.mock('@tarojs/taro', () => ({ default: {} }));
vi.mock('../CacheService', () => ({ cacheService: {}, CacheCategory: { System: 'system' } }));

describe('bottom navigation elevation role', () => {
  it('provides an upward shadow in both palettes and exposes it on page variables', () => {
    for (const theme of ['light', 'dark'] as const) {
      const shadow = THEME_PALETTES[theme]['navigation-shadow'];
      expect(shadow).toMatch(/^0 -4rpx 16rpx rgba\(/);
      expect(themeVariables(theme)['--theme-navigation-shadow']).toBe(shadow);
      expect(themePageStyle(theme)).toContain(`--theme-navigation-shadow:${shadow}`);
    }
    expect(THEME_PALETTES.dark['navigation-shadow']).not.toBe(THEME_PALETTES.light['navigation-shadow']);
  });
});
