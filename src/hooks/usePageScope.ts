import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from "react";
import Taro from "@tarojs/taro";
import {
  capturePageOwner,
  createPageNavigation,
  type PageOwner,
} from "../utils/pageScope";
import {
  getPageViewportStore,
  type PageViewportStore,
} from "../utils/pageViewport";

export interface PageScopeValue {
  owner?: PageOwner;
  viewport: PageViewportStore;
  router: Taro.RouterInfo;
}
export const PageScopeContext = createContext<PageScopeValue | undefined>(
  undefined,
);
export function usePageScope(): PageScopeValue {
  const scope = useContext(PageScopeContext);
  const [fallback] = useState(() => {
    if (scope) return scope;
    const owner = capturePageOwner();
    return {
      owner,
      viewport: getPageViewportStore(owner),
      router: Taro.getCurrentInstance?.().router ?? { params: {}, path: "" },
    } as PageScopeValue;
  });
  return scope ?? fallback;
}
export function usePageOwner(): PageOwner | undefined {
  return usePageScope().owner;
}
export function usePageNavigation() {
  const { owner } = usePageScope();
  const [navigation] = useState(() => createPageNavigation(owner));
  return navigation;
}
export function usePageWindowInfo() {
  const { viewport } = usePageScope();
  useSyncExternalStore(
    viewport.subscribe,
    viewport.getSnapshot,
    viewport.getSnapshot,
  );
  return viewport.getWindowInfo();
}
export function usePageRouter() {
  return usePageScope().router;
}
