import Taro from "@tarojs/taro";
import { trimStrings } from "./trimStrings";

export function withCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): { cached: T | null; refresh: Promise<T> } {
  let cached: T | null = null;
  try {
    const stored = Taro.getStorageSync(cacheKey);
    if (stored) cached = trimStrings(JSON.parse(stored)) as T;
  } catch {}

  const refresh = fetcher().then((data) => {
    const trimmed = trimStrings(data);
    try {
      Taro.setStorageSync(cacheKey, JSON.stringify(trimmed));
    } catch {}
    return trimmed;
  });

  return { cached, refresh };
}
