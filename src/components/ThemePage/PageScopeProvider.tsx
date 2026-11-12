import Taro from "@tarojs/taro";
import { useState, type ReactNode } from "react";
import { PageScopeContext } from "../../hooks/usePageScope";
import { capturePageOwner, disposePageOwner } from "../../utils/pageScope";
import { getPageViewportStore } from "../../utils/pageViewport";

export default function PageScopeProvider({
  children,
}: {
  children?: ReactNode;
}) {
  const [scope] = useState(() => {
    const owner = capturePageOwner();
    const router = Taro.getCurrentInstance?.().router ?? {
      params: {},
      path: "",
    };
    return {
      owner,
      viewport: getPageViewportStore(owner),
      router: router as Taro.RouterInfo,
    };
  });
  Taro.useReady(scope.viewport.measure);
  Taro.useDidShow(scope.viewport.measure);
  Taro.useResize(scope.viewport.resize);
  Taro.useUnload(() => {
    scope.viewport.dispose();
    disposePageOwner(scope.owner);
  });
  return (
    <PageScopeContext.Provider value={scope}>
      {children}
    </PageScopeContext.Provider>
  );
}
