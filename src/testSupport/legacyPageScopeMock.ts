/** Compatibility for old single-page unit harnesses. Multi-page tests use real owners/stores. */
export function legacyPageScopeMock(taro: any, router?: () => any, nativeOwner = false) {
  const owner = nativeOwner ? { createSelectorQuery: () => taro.createSelectorQuery() } : undefined;
  const getOwner = () => taro.getCurrentInstance?.().page ?? owner;
  const getWindowInfo = () => ({ windowWidth: 375, windowHeight: 667, screenHeight: 667, screenWidth: 375, statusBarHeight: 0,
    ...(taro.getWindowInfo?.() ?? taro.getSystemInfoSync?.() ?? {}) });
  const viewport = {
    isDesktopClient: false,
    getWindowInfo,
    getSnapshot: () => { const info = getWindowInfo(); return { width: info.windowWidth, height: info.windowHeight, isDesktop: info.windowWidth >= 1024 }; },
    subscribe: (callback: () => void) => { taro.onWindowResize?.(callback); return () => taro.offWindowResize?.(callback); },
    measure: () => {},
  };
  const usePageRouter = () => router?.() ?? taro.useRouter?.() ?? taro.getCurrentInstance?.().router ?? { params: {}, path: '' };
  return {
    PageScopeContext: undefined,
    usePageOwner: getOwner, usePageNavigation: () => taro, usePageWindowInfo: getWindowInfo,
    usePageRouter, usePageScope: () => ({ owner: getOwner(), viewport, router: usePageRouter() }),
  };
}
