import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { isDesktopClient, uiCssRpxValue, uiRpxLength, uiRpxToPx } from '../desktopLayout';

vi.mock('@tarojs/taro', () => ({ default: {
  getDeviceInfo: vi.fn(), getSystemInfoSync: vi.fn(), getWindowInfo: vi.fn(),
} }));
const device = vi.mocked(Taro.getDeviceInfo);
const system = vi.mocked(Taro.getSystemInfoSync);
const windowInfo = vi.mocked(Taro.getWindowInfo);

beforeEach(() => {
  device.mockReset(); system.mockReset(); windowInfo.mockReset();
  windowInfo.mockReturnValue({ windowWidth: 375 } as ReturnType<typeof Taro.getWindowInfo>);
});

describe('desktop control dimensions', () => {
  it.each(['windows', 'mac', 'macos', 'win32'])('recognizes %s even in a narrow pane', platform => {
    device.mockReturnValue({ platform } as ReturnType<typeof Taro.getDeviceInfo>);
    windowInfo.mockReturnValue({ windowWidth: 320 } as ReturnType<typeof Taro.getWindowInfo>);
    expect(isDesktopClient()).toBe(true);
    expect(uiRpxLength(56)).toBe('28px');
    expect(uiRpxToPx(28)).toBe(14);
    expect(windowInfo).not.toHaveBeenCalled();
  });
  it.each(['ios', 'android', 'devtools', 'unknown'])('does not infer desktop for %s from width or host OS', platform => {
    device.mockReturnValue({ platform, system: 'Windows 11' } as ReturnType<typeof Taro.getDeviceInfo>);
    windowInfo.mockReturnValue({ windowWidth: 1440 } as ReturnType<typeof Taro.getWindowInfo>);
    expect(isDesktopClient()).toBe(false);
    expect(uiRpxLength(56)).toBe('56rpx');
    expect(uiRpxToPx(28)).toBeCloseTo(28 * 1440 / 750);
  });
  it('keeps phone conversions at multiple logical widths', () => {
    device.mockReturnValue({ platform: 'ios' } as ReturnType<typeof Taro.getDeviceInfo>);
    for (const width of [320, 375, 430, 768]) {
      windowInfo.mockReturnValue({ windowWidth: width } as ReturnType<typeof Taro.getWindowInfo>);
      expect(uiRpxToPx(16)).toBeCloseTo(16 * width / 750);
      expect(uiRpxLength(16)).toBe('16rpx');
    }
  });
  it('falls back for older base libraries without caching client geometry', () => {
    device.mockImplementation(() => { throw new Error('unavailable'); });
    system.mockReturnValue({ platform: 'windows' } as ReturnType<typeof Taro.getSystemInfoSync>);
    expect(isDesktopClient()).toBe(true);
    system.mockReturnValue({ platform: 'ios' } as ReturnType<typeof Taro.getSystemInfoSync>);
    expect(isDesktopClient()).toBe(false);
  });
  it('uses a recognized system only when platform is absent', () => {
    device.mockReturnValue({ system: 'macOS 15' } as ReturnType<typeof Taro.getDeviceInfo>);
    expect(isDesktopClient()).toBe(true);
    device.mockReturnValue({ system: 'Android 15' } as ReturnType<typeof Taro.getDeviceInfo>);
    expect(isDesktopClient()).toBe(false);
  });
  it('converts only own desktop CSS dimensions, preserving native pixels and literals', () => {
    device.mockReturnValue({ platform: 'windows' } as ReturnType<typeof Taro.getDeviceInfo>);
    expect(uiCssRpxValue('0 -4rpx 16rpx rgba(15, 22, 38, 0.08)')).toBe('0 -2px 8px rgba(15, 22, 38, 0.08)');
    expect(uiCssRpxValue('calc(100% - .5RPX + 20px)')).toBe('calc(100% - 0.25px + 20px)');
    expect(uiCssRpxValue('12rpx-label label12rpx 12rpx')).toBe('12rpx-label label12rpx 6px');
    expect(uiCssRpxValue('url("96rpx.png") "96rpx" /* 96rpx */ --label-96rpx 12rpx')).toBe('url("96rpx.png") "96rpx" /* 96rpx */ --label-96rpx 6px');
  });
  it('preserves mobile runtime CSS strings byte for byte', () => {
    device.mockReturnValue({ platform: 'ios' } as ReturnType<typeof Taro.getDeviceInfo>);
    const value = '0 -4rpx 16rpx rgba(15, 22, 38, 0.08)';
    expect(uiCssRpxValue(value)).toBe(value);
  });
  it('falls back to mobile safely when device APIs fail or lack identity', () => {
    device.mockImplementation(() => { throw new Error('unavailable'); });
    system.mockImplementation(() => { throw new Error('unavailable'); });
    expect(isDesktopClient()).toBe(false);
    expect(uiRpxLength(0)).toBe('0rpx');
  });
});
