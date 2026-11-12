import Taro from '@tarojs/taro';
import { rpxToPx } from './dimension';

/** Client identity, not window width: a narrow PC frameset pane is still desktop. */
export function isDesktopClient(): boolean {
  let device: { platform?: string; system?: string } | undefined;
  try {
    device = Taro.getDeviceInfo?.();
  } catch {
    // Older base libraries may only expose the combined system API.
  }
  if (!device?.platform && !device?.system) {
    try {
      device = Taro.getSystemInfoSync?.();
    } catch {
      return false;
    }
  }
  const platform = device?.platform?.trim().toLowerCase();
  if (platform) return /^(windows|win32|mac|macos)$/.test(platform);
  // Do not infer desktop from a devtools host OS when a simulated platform exists.
  return /^(windows|mac\s?os|macintosh)\b/i.test(device?.system?.trim() ?? '');
}

/** Desktop controls use a 375px design baseline; mobile keeps native rpx. */
export function uiRpxLength(rpx: number): string {
  return isDesktopClient() ? `${rpx / 2}px` : `${rpx}rpx`;
}

/** Own visual CSS values only: never pass forum-authored HTML or media geometry. */
export function uiCssRpxValue(value: string): string {
  if (!/rpx/i.test(value) || !isDesktopClient()) return value;
  // Skip quoted text, comments and URLs; match whole dimension tokens only.
  return value.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|url\((?:\\.|[^)])*\))|([+-]?(?:\d+(?:\.\d*)?|\.\d+)rpx(?![\w.-]))|([\w.-]+)/gi,
    (token, literal: string | undefined, dimension: string | undefined) => {
      if (literal || !dimension) return token;
      return `${parseFloat(dimension) / 2}px`;
    });
}

/** Numeric counterpart for native APIs that require logical pixels. */
export function uiRpxToPx(rpx: number): number {
  return isDesktopClient() ? rpx / 2 : rpxToPx(rpx);
}
