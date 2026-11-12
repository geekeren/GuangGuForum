import Taro from '@tarojs/taro';

type BackOptions = {
  delta: number;
  success: () => void;
  fail: () => void;
};
type PageRouter = { navigateBack: (options: BackOptions) => unknown };
type PageIdentity = { getPageId?: () => string; $taroPath?: string; pageRouter?: Partial<PageRouter> };
export interface DesktopPaneHistoryRuntime {
  getPages: () => readonly object[];
  navigateBack: (options: BackOptions) => unknown;
  nextTick?: (callback: () => void) => unknown;
}

function nativePageId(page: object): string | undefined {
  try {
    const id = (page as PageIdentity).getPageId?.();
    return typeof id === 'string' && id.length > 0 ? id : undefined;
  } catch { return undefined; }
}
function instancePath(page: object): string | undefined {
  try {
    const path = (page as PageIdentity).$taroPath;
    // Installed Taro qualifies each native page instance with this timestamp.
    return typeof path === 'string' && /[?&]\$taroTimestamp=\d+(?:&|$)/.test(path) ? path : undefined;
  } catch { return undefined; }
}
function samePage(first: object, second: object): boolean {
  if (first === second) return true;
  const firstId = nativePageId(first), secondId = nativePageId(second);
  if (firstId && secondId) return firstId === secondId;
  const path = instancePath(first);
  return !!path && path === instancePath(second);
}

/** Close only native pages above the owning Home; never recreate Home or touch storage. */
export function createDesktopPaneHistory(
  owner: object | undefined | (() => object | undefined),
  runtime: DesktopPaneHistoryRuntime = {
    getPages: () => Taro.getCurrentPages(),
    navigateBack: options => Taro.navigateBack(options),
    nextTick: callback => Taro.nextTick(callback),
  },
) {
  let disposed = false;
  let pending: Promise<boolean> | undefined;
  let cancel: (() => void) | undefined;
  const resolveOwner = () => {
    try { return typeof owner === 'function' ? owner() : owner; } catch { return undefined; }
  };
  const pages = (): readonly object[] => {
    try { return runtime.getPages(); } catch { return []; }
  };
  const atOwner = (target: object) => {
    const owningPage = resolveOwner(), current = pages();
    return !disposed && !!owningPage && samePage(owningPage, target)
      && !!current.length && samePage(current[current.length - 1], target);
  };

  return {
    reset(): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (pending) return pending;
      const owningPage = resolveOwner();
      if (!owningPage) return Promise.resolve(false);
      const current = pages();
      const matches = current.flatMap((page, index) => samePage(page, owningPage) ? [index] : []);
      // A route name is not an instance identity; ambiguous owners fail closed.
      if (matches.length !== 1) return Promise.resolve(false);
      const index = matches[0], target = current[index];
      const delta = current.length - index - 1;
      if (delta === 0) return Promise.resolve(true);

      let settle!: (ready: boolean) => void;
      const flight = new Promise<boolean>(resolve => { settle = resolve; });
      pending = flight;
      let finished = false, verifying = false;
      const finish = (success: boolean) => {
        if (finished) return;
        finished = true;
        if (pending === flight) pending = undefined;
        cancel = undefined;
        settle(success && atOwner(target));
      };
      const success = () => {
        if (finished || verifying) return;
        verifying = true;
        if (atOwner(target)) { finish(true); return; }
        // Native success can precede publication of the updated page stack.
        // One explicit tick is a synchronization boundary, not a polling loop.
        if (!runtime.nextTick) { finish(false); return; }
        try { runtime.nextTick(() => finish(true)); } catch { finish(false); }
      };
      const fail = () => { if (!verifying) finish(false); };
      cancel = () => finish(false);
      const options: BackOptions = { delta, success, fail };
      try {
        const candidate = (target as PageIdentity).pageRouter ?? (owningPage as PageIdentity).pageRouter;
        const result = typeof candidate?.navigateBack === 'function'
          ? candidate.navigateBack.call(candidate, options)
          : runtime.navigateBack(options);
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result).then(success, fail);
        }
      } catch { finish(false); }
      return flight;
    },
    dispose() {
      disposed = true;
      cancel?.();
    },
  };
}
