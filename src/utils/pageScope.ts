import Taro from "@tarojs/taro";

export type PageNavigation = Pick<
  typeof Taro,
  "navigateTo" | "navigateBack" | "redirectTo" | "reLaunch" | "switchTab"
>;
type Method = keyof PageNavigation;
type NativeRouter = Partial<
  Record<Method, (options: Record<string, unknown>) => unknown>
>;
export interface PageOwner {
  $taroPath?: string;
  route?: string;
  renderer?: string;
  options?: Record<string, unknown>;
  pageRouter?: NativeRouter;
  createSelectorQuery?: () => Taro.SelectorQuery;
}
const disposedPages = new WeakSet<PageOwner>();

/** Capture during the page's initial mount, never from a delayed event callback. */
export function capturePageOwner(): PageOwner | undefined {
  const instance = Taro.getCurrentInstance?.();
  const owner = instance?.page as PageOwner | undefined;
  if (
    owner?.$taroPath &&
    instance?.router?.$taroPath &&
    owner.$taroPath !== instance.router.$taroPath
  )
    return;
  return owner;
}

export function disposePageOwner(owner?: PageOwner): void {
  if (owner) disposedPages.add(owner);
}

export function createPageSelectorQuery(owner?: PageOwner): Taro.SelectorQuery {
  if (owner && disposedPages.has(owner)) throw new Error("Page is unloaded");
  if (owner?.createSelectorQuery) return owner.createSelectorQuery.call(owner);
  const query = Taro.createSelectorQuery();
  if (owner) {
    if (typeof query.in !== "function")
      throw new Error("Page-scoped query is unavailable");
    return query.in(owner as Parameters<Taro.SelectorQuery["in"]>[0]);
  }
  if (process.env.TARO_ENV === "weapp")
    throw new Error("Missing query page owner");
  return query; // Isolated non-native renderers and tests have no native Page instance.
}

/** Avoid Taro.nextTick's global Current.router when two native pages are visible. */
export function nextTickForPage(
  owner: PageOwner | undefined,
  callback: () => void,
): void {
  const run = () => {
    if (!owner || !disposedPages.has(owner)) callback();
  };
  const native = (
    globalThis as typeof globalThis & {
      wx?: { nextTick?: (callback: () => void) => void };
    }
  ).wx;
  if (owner && native?.nextTick) native.nextTick(run);
  else Taro.nextTick(run);
}

/** Native PageRouter is callback-based; keep the Promise contract used by Taro callers. */
export function createPageNavigation(owner?: PageOwner): PageNavigation {
  const invoke = (method: Method, options: Record<string, unknown> = {}) => {
    if (owner && disposedPages.has(owner))
      return Promise.reject(new Error("Page is unloaded"));
    const router = owner?.pageRouter;
    const nativeMethod = router?.[method];
    if (!nativeMethod) {
      if (process.env.TARO_ENV === "weapp" && !owner)
        return Promise.reject(new Error("Missing navigation page owner"));
      // Older clients without PageRouter retain the existing absolute-path native flow.
      return (Taro[method] as (options: unknown) => Promise<unknown>)(options);
    }
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const success = (result: unknown) => {
        if (settled) return;
        settled = true;
        try {
          if (typeof options.success === "function") options.success(result);
        } finally {
          resolve(result);
        }
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        try {
          if (typeof options.fail === "function") options.fail(error);
        } finally {
          reject(error);
        }
      };
      try {
        const result = nativeMethod.call(router, { ...options, success, fail });
        if (
          result &&
          typeof (result as PromiseLike<unknown>).then === "function"
        ) {
          (result as PromiseLike<unknown>).then(success, fail);
        }
      } catch (error) {
        fail(error);
      }
    });
  };
  return Object.fromEntries(
    ["navigateTo", "navigateBack", "redirectTo", "reLaunch", "switchTab"].map(
      (method) => [
        method,
        (options?: Record<string, unknown>) =>
          invoke(method as Method, options),
      ],
    ),
  ) as unknown as PageNavigation;
}
