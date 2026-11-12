import { createContext, useContext, useState, type ReactNode } from "react";
import { isSkyline } from "../utils/renderer";
import { usePageOwner } from "./usePageScope";

export type PageRenderer = "skyline" | "webview";
export const PageRendererContext = createContext<PageRenderer | undefined>(
  undefined,
);

const detectPageRenderer = (): PageRenderer =>
  isSkyline() ? "skyline" : "webview";

export function PageRendererProvider({ children }: { children?: ReactNode }) {
  const owner = usePageOwner();
  // Taro sets Current.page before mounting a route. Hidden pages keep this value.
  const [renderer] = useState<PageRenderer>(() =>
    owner?.renderer === "skyline"
      ? "skyline"
      : owner?.renderer === "webview"
        ? "webview"
        : detectPageRenderer(),
  );
  return (
    <PageRendererContext.Provider value={renderer}>
      {children}
    </PageRendererContext.Provider>
  );
}

export function usePageRenderer(): PageRenderer {
  const renderer = useContext(PageRendererContext);
  const [fallback] = useState(() => renderer ?? detectPageRenderer());
  return renderer ?? fallback;
}

export function usePageScrollViewType(): "custom" | undefined {
  return usePageRenderer() === "skyline" ? "custom" : undefined;
}
