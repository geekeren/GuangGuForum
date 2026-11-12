import { useSyncExternalStore } from "react";
import { usePageScope } from "./usePageScope";

export function useViewport() {
  const { viewport } = usePageScope();
  return useSyncExternalStore(
    viewport.subscribe,
    viewport.getSnapshot,
    viewport.getSnapshot,
  );
}
