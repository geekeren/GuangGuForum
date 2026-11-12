import Taro from "@tarojs/taro";

type WindowInfo = ReturnType<typeof Taro.getWindowInfo>;
let navInfo: ReturnType<typeof calculateNavInfo> | undefined;

/** Legacy single-page callers may cache geometry; scoped callers always use their own dimensions. */
export function invalidateNavInfo(): void {
  navInfo = undefined;
}
function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
function calculateNavInfo(info: Partial<WindowInfo>, scoped = false) {
  const statusBarHeight = Math.max(0, Number(info.statusBarHeight) || 0);
  const screenWidth = positive(
    info.windowWidth,
    positive(info.screenWidth, 375),
  );
  const windowHeight = positive(info.windowHeight, 667);
  const screenHeight = positive(info.screenHeight, windowHeight);
  let capsule:
    | ReturnType<typeof Taro.getMenuButtonBoundingClientRect>
    | undefined;
  let desktopClient = false;
  try {
    const platform = Taro.getDeviceInfo?.().platform;
    desktopClient = platform === "windows" || platform === "mac";
  } catch {}
  // A global desktop capsule may fit inside this pane but still belong to the other Page.
  // Until WeChat exposes owner-bound capsule geometry, reserve a conservative pane-local area.
  if (!scoped || !desktopClient) {
    try {
      capsule = Taro.getMenuButtonBoundingClientRect?.();
    } catch {}
  }
  const valid =
    capsule &&
    [
      capsule.width,
      capsule.height,
      capsule.left,
      capsule.top,
      capsule.right,
    ].every(Number.isFinite) &&
    capsule.width > 0 &&
    capsule.height > 0 &&
    capsule.left >= 0 &&
    capsule.top >= statusBarHeight &&
    capsule.right <= screenWidth &&
    capsule.right > capsule.left;
  // The global capsule can belong to the other pane. Never turn its coordinates into negative padding.
  const width = valid
    ? capsule!.width
    : Math.min(88, Math.max(0, screenWidth - 24));
  const height = valid ? capsule!.height : 32;
  const right = valid ? capsule!.right : screenWidth - 12;
  const left = valid ? capsule!.left : right - width;
  const top = valid ? capsule!.top : statusBarHeight + 6;
  const capsulePaddingTop = top - statusBarHeight;
  const titleBarHeight = height + capsulePaddingTop * 2;
  const appHeaderHeight = statusBarHeight + titleBarHeight;
  const marginSides = Math.max(0, screenWidth - right);
  return {
    statusBarHeight,
    titleBarHeight,
    titleBarWidth: Math.max(0, screenWidth - width - marginSides * 3),
    appHeaderHeight,
    marginSides,
    capsuleWidth: width,
    capsuleHeight: height,
    capsuleLeft: left,
    capsulePaddingTop,
    contentHeight: Math.max(0, windowHeight - appHeaderHeight),
    screenHeight,
    windowHeight,
    screenWidth,
  };
}

export function getNavInfo(scopedInfo?: WindowInfo) {
  if (scopedInfo) return calculateNavInfo(scopedInfo, true);
  if (navInfo) return navInfo;
  let info: Partial<WindowInfo> = {};
  try {
    info = Taro.getSystemInfoSync();
  } catch {}
  try {
    info = { ...info, ...Taro.getWindowInfo?.() };
  } catch {}
  return (navInfo = calculateNavInfo(info));
}
export function getBottomSafeAreaInset(scopedInfo?: WindowInfo): number {
  const info = scopedInfo ?? Taro.getWindowInfo();
  return info.safeArea
    ? Math.max(0, info.screenHeight - info.safeArea.bottom)
    : 0;
}
export function rpxToPx(rpx: number, scopedInfo?: WindowInfo): number {
  const width = positive((scopedInfo ?? Taro.getWindowInfo()).windowWidth, 375);
  return (rpx * width) / 750;
}
