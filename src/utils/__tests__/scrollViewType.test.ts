import { beforeEach, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { getScrollViewType } from '../renderer';

vi.mock('@tarojs/taro', () => ({ default: {
  getDeviceInfo: vi.fn(() => ({ platform: 'ios' })),
  getCurrentInstance: vi.fn(() => ({ page: { renderer: 'skyline' } })),
} }));
beforeEach(() => vi.clearAllMocks());
it.each(['windows', 'mac', 'macos'])('preserves Skyline scrolling in a %s simulator', platform => {
  vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
  expect(getScrollViewType()).toBe('custom');
});
it('keeps custom scrolling on mobile Skyline', () => {
  vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'android' } as any);
  expect(getScrollViewType()).toBe('custom');
});
it('uses standard scrolling on WebView', () => {
  vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: { renderer: 'webview' } } as any);
  expect(getScrollViewType()).toBeUndefined();
});
