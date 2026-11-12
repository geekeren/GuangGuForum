import Taro from "@tarojs/taro";
import { invalidateNavInfo } from "./dimension";

export const DESKTOP_MIN_WIDTH = 1024;

export interface ViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly isDesktop: boolean;
}

type ResizeEvent = { size?: { windowWidth?: number; windowHeight?: number } };
const listeners = new Set<() => void>();
let snapshot: ViewportSnapshot | undefined;
let stopResize: (() => void) | undefined;

function dimension(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function readViewport(): ViewportSnapshot {
  let info: { windowWidth?: number; windowHeight?: number } = {};
  try {
    info = Taro.getWindowInfo?.() ?? Taro.getSystemInfoSync?.() ?? {};
  } catch {
    // Keep the last measured layout if the native window is temporarily unavailable.
  }
  const width = dimension(info.windowWidth, snapshot?.width ?? 375);
  const height = dimension(info.windowHeight, snapshot?.height ?? 667);
  return { width, height, isDesktop: width >= DESKTOP_MIN_WIDTH };
}

function publish(next: ViewportSnapshot): void {
  if (snapshot?.width === next.width && snapshot.height === next.height) return;
  snapshot = next;
  invalidateNavInfo();
  for (const listener of [...listeners]) listener();
}

export function getViewportSnapshot(): ViewportSnapshot {
  return (snapshot ??= readViewport());
}

/** Also refresh on page show: a hidden window may resize without a native event. */
export function refreshViewport(): void {
  publish(readViewport());
}

function onResize(rawEvent: unknown): void {
  const event: ResizeEvent =
    rawEvent && typeof rawEvent === "object" ? (rawEvent as ResizeEvent) : {};
  const measured = readViewport();
  const width = dimension(event.size?.windowWidth, measured.width);
  const height = dimension(event.size?.windowHeight, measured.height);
  publish({ width, height, isDesktop: width >= DESKTOP_MIN_WIDTH });
}

/** Share one native resize listener across class components and React hooks. */
export function subscribeViewport(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopResize) {
    Taro.onWindowResize?.(onResize);
    stopResize = () => {
      Taro.offWindowResize?.(onResize);
    };
    refreshViewport();
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      stopResize?.();
      stopResize = undefined;
    }
  };
}
