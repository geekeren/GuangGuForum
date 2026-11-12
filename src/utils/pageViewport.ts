import Taro from "@tarojs/taro";
import { DESKTOP_MIN_WIDTH, type ViewportSnapshot } from "./viewport";
import {
  createPageSelectorQuery,
  nextTickForPage,
  type PageOwner,
} from "./pageScope";

type WindowInfo = ReturnType<typeof Taro.getWindowInfo>;
function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
function readWindowInfo(): WindowInfo | undefined {
  try {
    const info = Taro.getWindowInfo();
    return { ...info, safeArea: info.safeArea && { ...info.safeArea } };
  } catch {
    return;
  }
}
function initialWindowInfo(): WindowInfo {
  return (
    readWindowInfo() ??
    ({
      windowWidth: 375,
      windowHeight: 667,
      screenWidth: 375,
      screenHeight: 667,
      pixelRatio: 1,
      statusBarHeight: 0,
      safeArea: undefined,
    } as unknown as WindowInfo)
  );
}
function windowMetadata(info: WindowInfo): string {
  // Window dimensions may belong to the whole frameset; never compare or publish them.
  return JSON.stringify([
    info.screenWidth,
    info.screenHeight,
    info.pixelRatio,
    info.statusBarHeight,
    info.safeArea,
  ]);
}

/** One store per native Page. Neither resize nor a second page can overwrite another pane. */
export class PageViewportStore {
  readonly isDesktopClient: boolean;
  readonly isWindowsClient: boolean;
  private snapshot: ViewportSnapshot;
  private window: WindowInfo;
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private disposed = false;
  constructor(private readonly owner?: PageOwner) {
    let platform: string | undefined;
    try {
      platform = Taro.getDeviceInfo?.().platform;
    } catch {}
    this.isDesktopClient = platform === "windows" || platform === "mac";
    this.isWindowsClient = platform === "windows";
    this.window = initialWindowInfo();
    // The global window API is not a pane measurement. Start narrow until this Page
    // delivers resize/Ready, rather than briefly applying three columns to a half-window.
    const width = owner ? 375 : positive(this.window.windowWidth, 375);
    const height = owner ? 667 : positive(this.window.windowHeight, 667);
    this.snapshot = { width, height, isDesktop: width >= DESKTOP_MIN_WIDTH };
  }
  getSnapshot = (): ViewportSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getWindowInfo = (): WindowInfo => ({
    ...this.window,
    windowWidth: this.snapshot.width,
    windowHeight: this.snapshot.height,
  });
  private publish(width: unknown, height: unknown): void {
    if (this.disposed) return;
    const window = readWindowInfo();
    const metadataChanged =
      window && windowMetadata(window) !== windowMetadata(this.window);
    if (window) this.window = window;
    const nextWidth = positive(width, this.snapshot.width),
      nextHeight = positive(height, this.snapshot.height);
    if (
      nextWidth === this.snapshot.width &&
      nextHeight === this.snapshot.height &&
      !metadataChanged
    )
      return;
    this.snapshot = {
      width: nextWidth,
      height: nextHeight,
      isDesktop: nextWidth >= DESKTOP_MIN_WIDTH,
    };
    for (const listener of [...this.listeners]) listener();
  }
  resize = (event: unknown): void => {
    const raw = event as {
      detail?: { size?: { windowWidth?: number; windowHeight?: number } };
      size?: { windowWidth?: number; windowHeight?: number };
    } | null;
    const size = raw?.detail?.size ?? raw?.size;
    if (!size) return;
    this.revision++;
    this.publish(size.windowWidth, size.windowHeight);
  };
  measure = (): void => {
    if (this.disposed) return;
    const revision = ++this.revision;
    nextTickForPage(this.owner, () => {
      if (this.disposed || revision !== this.revision) return;
      try {
        createPageSelectorQuery(this.owner)
          .selectViewport()
          .boundingClientRect((result) => {
            if (this.disposed || revision !== this.revision) return;
            const rect = Array.isArray(result) ? result[0] : result;
            this.publish(rect?.width, rect?.height);
          })
          .exec();
      } catch {
        /* Keep the last pane measurement until Ready/resize can measure it. */
      }
    });
  };
  dispose = (): void => {
    this.disposed = true;
    this.revision++;
    this.listeners.clear();
  };
}
const stores = new WeakMap<PageOwner, PageViewportStore>();
export function getPageViewportStore(owner?: PageOwner): PageViewportStore {
  if (!owner) return new PageViewportStore();
  let store = stores.get(owner);
  if (!store) {
    store = new PageViewportStore(owner);
    stores.set(owner, store);
  }
  return store;
}
