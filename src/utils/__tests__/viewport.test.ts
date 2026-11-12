import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";

vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read(),
}));

const native = vi.hoisted(() => ({
  width: 375,
  height: 667,
  unavailable: false,
  deviceWidth: undefined as number | undefined,
  legacyWindowWidth: undefined as number | undefined,
  resize: undefined as
    | ((event: {
        size?: { windowWidth?: number; windowHeight?: number };
      }) => void)
    | undefined,
  platform: "ios",
}));

vi.mock("@tarojs/taro", () => ({
  default: {
    getWindowInfo: vi.fn(() => {
      if (native.unavailable) throw new Error("Window unavailable");
      return { windowWidth: native.width, windowHeight: native.height };
    }),
    getDeviceInfo: () => ({ platform: native.platform }),
    getSystemInfoSync: vi.fn(() => ({
      screenWidth: native.deviceWidth ?? native.width,
      windowWidth: native.legacyWindowWidth,
      screenHeight: native.height,
      windowHeight: native.height,
    })),
    getMenuButtonBoundingClientRect: vi.fn(() => ({
      width: 80,
      height: 32,
      left: native.width - 90,
      right: native.width - 10,
      top: 10,
    })),
    onWindowResize: vi.fn((callback) => {
      native.resize = callback;
    }),
    offWindowResize: vi.fn(() => {
      native.resize = undefined;
    }),
    useDidShow: vi.fn(),
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  native.width = 375;
  native.height = 667;
  native.unavailable = false;
  native.deviceWidth = undefined;
  native.legacyWindowWidth = undefined;
  native.resize = undefined;
  native.platform = "ios";
});

describe("shared native viewport", () => {
  it("does not accept another desktop pane's global capsule even when it fits locally", async () => {
    native.platform = "windows";
    native.width = 430;
    const { getNavInfo } = await import("../dimension");
    const info = {
      windowWidth: 730,
      windowHeight: 880,
      screenHeight: 1080,
    } as ReturnType<typeof Taro.getWindowInfo>;
    const geometry = getNavInfo(info);
    expect(Taro.getMenuButtonBoundingClientRect).not.toHaveBeenCalled();
    expect(geometry.capsuleLeft).toBe(630);
    expect(geometry.marginSides).toBe(12);
    expect(geometry.contentHeight).toBeGreaterThan(0);
  });
  it("uses window-relative capsule coordinates even on a larger desktop monitor", async () => {
    native.width = 1100;
    native.deviceWidth = 1920;
    const { getNavInfo } = await import("../dimension");
    const geometry = getNavInfo();
    expect(geometry.screenWidth).toBe(1100);
    expect(geometry.marginSides).toBe(10);
    expect(geometry.titleBarWidth).toBe(990);
  });

  it("falls back to legacy window or device width when window info is unavailable", async () => {
    native.unavailable = true;
    native.deviceWidth = 1920;
    native.legacyWindowWidth = 1100;
    const { getNavInfo, invalidateNavInfo } = await import("../dimension");
    expect(getNavInfo().screenWidth).toBe(1100);
    native.legacyWindowWidth = undefined;
    invalidateNavInfo();
    expect(getNavInfo().screenWidth).toBe(1920);
  });

  it("invalidates cached navigation geometry before publishing a new size", async () => {
    const viewport = await import("../viewport");
    const { getNavInfo } = await import("../dimension");
    viewport.getViewportSnapshot();
    expect(getNavInfo().screenWidth).toBe(375);
    const widths: number[] = [];
    const dispose = viewport.subscribeViewport(() =>
      widths.push(getNavInfo().screenWidth),
    );
    native.width = 1280;
    native.resize?.({ size: { windowWidth: 1280, windowHeight: 800 } });
    expect(widths).toEqual([1280]);
    expect(getNavInfo().capsuleLeft).toBe(1190);
    dispose();
  });

  it("uses window width instead of device width and keeps snapshots stable", async () => {
    const viewport = await import("../viewport");
    const initial = viewport.getViewportSnapshot();
    expect(initial).toEqual({ width: 375, height: 667, isDesktop: false });
    expect(viewport.getViewportSnapshot()).toBe(initial);
    viewport.refreshViewport();
    expect(viewport.getViewportSnapshot()).toBe(initial);
    native.width = 1024;
    viewport.refreshViewport();
    expect(viewport.getViewportSnapshot().isDesktop).toBe(true);
    native.width = 1023;
    viewport.refreshViewport();
    expect(viewport.getViewportSnapshot().isDesktop).toBe(false);
  });

  it("shares and releases the native listener, then remeasures on subscription", async () => {
    const viewport = await import("../viewport");
    const first = vi.fn(),
      second = vi.fn();
    const offFirst = viewport.subscribeViewport(first);
    const offSecond = viewport.subscribeViewport(second);
    expect(Taro.onWindowResize).toHaveBeenCalledOnce();
    native.resize?.({ size: { windowWidth: 1440, windowHeight: 900 } });
    expect(viewport.getViewportSnapshot()).toEqual({
      width: 1440,
      height: 900,
      isDesktop: true,
    });
    expect(first).toHaveBeenCalledTimes(2); // Initial measurement and resize.
    expect(second).toHaveBeenCalledOnce();
    offFirst();
    expect(Taro.offWindowResize).not.toHaveBeenCalled();
    offSecond();
    expect(Taro.offWindowResize).toHaveBeenCalledOnce();
    native.width = 768;
    const offNew = viewport.subscribeViewport(vi.fn());
    expect(viewport.getViewportSnapshot().width).toBe(768);
    expect(Taro.onWindowResize).toHaveBeenCalledTimes(2);
    offNew();
  });

  it("refreshes after a hidden-window change and ignores duplicate sizes", async () => {
    const viewport = await import("../viewport");
    const listener = vi.fn();
    const dispose = viewport.subscribeViewport(listener);
    listener.mockClear();
    native.resize?.({ size: { windowWidth: 375, windowHeight: 667 } });
    expect(listener).not.toHaveBeenCalled();
    native.width = 1280;
    native.height = 720;
    viewport.refreshViewport();
    expect(viewport.getViewportSnapshot()).toEqual({
      width: 1280,
      height: 720,
      isDesktop: true,
    });
    expect(listener).toHaveBeenCalledOnce();
    dispose();
  });

  it("retains the last valid measurement and falls back safely before first measurement", async () => {
    native.unavailable = true;
    const viewport = await import("../viewport");
    expect(viewport.getViewportSnapshot()).toEqual({
      width: 375,
      height: 667,
      isDesktop: false,
    });
    const dispose = viewport.subscribeViewport(vi.fn());
    native.resize?.({ size: { windowWidth: 1100, windowHeight: 800 } });
    const valid = viewport.getViewportSnapshot();
    native.resize?.({ size: { windowWidth: NaN, windowHeight: -1 } });
    expect(viewport.getViewportSnapshot()).toBe(valid);
    viewport.refreshViewport();
    expect(viewport.getViewportSnapshot()).toBe(valid);
    dispose();
  });
});
