import Taro from "@tarojs/taro";

export const AD_DISABLE_KEY = "ad_disable_until";

/**
 * 检查广告是否被禁用
 */
export function isAdDisabled(): boolean {
  const disableUntil = Taro.getStorageSync(AD_DISABLE_KEY);
  if (!disableUntil) return false;

  // 如果过期时间已过，清除缓存
  if (Date.now() >= disableUntil) {
    Taro.removeStorageSync(AD_DISABLE_KEY);
    return false;
  }

  return true;
}

/**
 * 禁用广告（指定天数）
 */
export function disableAd(days: number = 30): void {
  const disableUntil = Date.now() + days * 24 * 60 * 60 * 1000;
  Taro.setStorageSync(AD_DISABLE_KEY, disableUntil);
}

/**
 * 启用广告
 */
export function enableAd(): void {
  Taro.removeStorageSync(AD_DISABLE_KEY);
}

/**
 * 获取广告禁用剩余天数
 */
export function getAdDisabledDays(): number {
  const disableUntil = Taro.getStorageSync(AD_DISABLE_KEY);
  if (!disableUntil) return 0;

  const remainMs = disableUntil - Date.now();
  if (remainMs <= 0) return 0;
  return Math.ceil(remainMs / (24 * 60 * 60 * 1000));
}
