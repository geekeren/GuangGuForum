import { cacheService, CacheCategory } from "./CacheService";

export const AD_DISABLE_KEY = "ad_disable_until";

export function isAdDisabled(): boolean {
  const disableUntil = cacheService.get<number>(AD_DISABLE_KEY);
  if (!disableUntil) return false;
  if (Date.now() >= disableUntil) {
    cacheService.remove(AD_DISABLE_KEY);
    return false;
  }
  return true;
}

export function disableAd(days: number = 30): void {
  const disableUntil = Date.now() + days * 24 * 60 * 60 * 1000;
  cacheService.set(AD_DISABLE_KEY, disableUntil, { category: CacheCategory.Other });
}

export function enableAd(): void {
  cacheService.remove(AD_DISABLE_KEY);
}

export function getAdDisabledDays(): number {
  const disableUntil = cacheService.get<number>(AD_DISABLE_KEY);
  if (!disableUntil) return 0;
  const remainMs = disableUntil - Date.now();
  if (remainMs <= 0) return 0;
  return Math.ceil(remainMs / (24 * 60 * 60 * 1000));
}
