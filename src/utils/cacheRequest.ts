import Taro from "@tarojs/taro";

export function withCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): { cached: T | null; refresh: Promise<T> } {
  let cached: T | null = null;
  try {
    const stored = Taro.getStorageSync(cacheKey);
    if (stored) cached = JSON.parse(stored) as T;
  } catch {}

  const refresh = fetcher().then((data) => {
    try {
      Taro.setStorageSync(cacheKey, JSON.stringify(data));
    } catch {}
    return data;
  });

  return { cached, refresh };
}
