import { beforeEach, describe, expect, it, vi } from "vitest";
import type Taro from "@tarojs/taro";
import { PageViewportStore, getPageViewportStore } from "../pageViewport";
import type { PageOwner } from "../pageScope";

const device = vi.hoisted(() => ({ platform: "ios" }));
const metadata = vi.hoisted(() => ({
  screenHeight: 1080,
  safeArea: {
    top: 0,
    right: 1920,
    bottom: 1060,
    left: 0,
    width: 1920,
    height: 1060,
  },
}));

vi.mock("@tarojs/taro", () => ({
  default: {
    getWindowInfo: () => ({
      windowWidth: 1500,
      windowHeight: 900,
      screenWidth: 1920,
      ...metadata,
    }),
    getDeviceInfo: () => ({ platform: device.platform }),
    nextTick: (callback: () => void) => callback(),
  },
}));
const measurements: Array<(rect: { width: number; height: number }) => void> =
  [];
function owner(): PageOwner {
  return {
    createSelectorQuery: () =>
      ({
        selectViewport: () => ({
          boundingClientRect(callback: (rect: unknown) => void) {
            measurements.push(callback);
            return { exec() {} };
          },
        }),
      }) as unknown as Taro.SelectorQuery,
  };
}
beforeEach(() => {
  measurements.length = 0;
  device.platform = "ios";
  metadata.screenHeight = 1080;
  metadata.safeArea = {
    top: 0,
    right: 1920,
    bottom: 1060,
    left: 0,
    width: 1920,
    height: 1060,
  };
});

describe("independent frameset page viewports", () => {
  it("recognizes desktop clients independently of the native pane width", () => {
    for (const platform of ["windows", "mac"]) {
      device.platform = platform;
      const page = new PageViewportStore(owner());
      page.resize({ size: { windowWidth: 430, windowHeight: 800 } });
      expect(page.isDesktopClient).toBe(true);
      expect(page.isWindowsClient).toBe(platform === "windows");
      expect(page.getSnapshot().isDesktop).toBe(false);
    }
    device.platform = "ios";
    const tablet = new PageViewportStore(owner());
    tablet.resize({ size: { windowWidth: 1100, windowHeight: 800 } });
    expect(tablet.isDesktopClient).toBe(false);
    expect(tablet.getSnapshot().isDesktop).toBe(true);
  });

  it("shares a store within one page but never shares dimensions between pages", () => {
    const leftOwner = owner(),
      rightOwner = owner();
    const left = getPageViewportStore(leftOwner),
      right = getPageViewportStore(rightOwner);
    expect(getPageViewportStore(leftOwner)).toBe(left);
    expect(left).not.toBe(right);
    // Never start each pane at the 1500px host window size.
    expect(left.getSnapshot().isDesktop).toBe(false);
    left.resize({ detail: { size: { windowWidth: 730, windowHeight: 880 } } });
    right.resize({ size: { windowWidth: 770, windowHeight: 880 } });
    expect(left.getSnapshot()).toEqual({
      width: 730,
      height: 880,
      isDesktop: false,
    });
    expect(right.getSnapshot()).toEqual({
      width: 770,
      height: 880,
      isDesktop: false,
    });
    expect(left.getWindowInfo().windowWidth).toBe(730);
    right.resize({
      detail: { size: { windowWidth: 1100, windowHeight: 600 } },
    });
    expect(right.getSnapshot().isDesktop).toBe(true);
    expect(left.getSnapshot().width).toBe(730);
  });
  it("binds initial measurement to the page and ignores older reads after resize", () => {
    const store = new PageViewportStore(owner());
    const notify = vi.fn(),
      unsubscribe = store.subscribe(notify);
    store.measure();
    store.resize({ detail: { size: { windowWidth: 750, windowHeight: 850 } } });
    measurements[0]({ width: 1500, height: 900 });
    expect(store.getSnapshot().width).toBe(750);
    expect(notify).toHaveBeenCalledOnce();
    store.measure();
    measurements[1]({ width: 750, height: 600 });
    expect(store.getSnapshot().height).toBe(600);
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("retains stable snapshots on duplicate/invalid events and blocks unloaded reads", () => {
    const store = new PageViewportStore(owner());
    store.resize({ size: { windowWidth: 750, windowHeight: 850 } });
    const current = store.getSnapshot();
    store.resize({ detail: { size: { windowWidth: NaN, windowHeight: -1 } } });
    expect(store.getSnapshot()).toBe(current);
    store.measure();
    store.dispose();
    measurements[0]({ width: 1800, height: 1000 });
    store.resize({ size: { windowWidth: 1024, windowHeight: 700 } });
    expect(store.getSnapshot()).toBe(current);
  });
  it("refreshes safe area metadata without replacing pane dimensions with host dimensions", () => {
    const store = new PageViewportStore(owner());
    store.resize({ size: { windowWidth: 750, windowHeight: 850 } });
    const original = store.getSnapshot(),
      notify = vi.fn();
    store.subscribe(notify);
    // Include mutation-in-place because native window information can reuse nested objects.
    metadata.screenHeight = 1920;
    metadata.safeArea.bottom = 1886;
    store.resize({ size: { windowWidth: 750, windowHeight: 850 } });
    expect(store.getWindowInfo()).toMatchObject({
      windowWidth: 750,
      windowHeight: 850,
      screenHeight: 1920,
      safeArea: { bottom: 1886 },
    });
    expect(store.getSnapshot()).not.toBe(original);
    expect(notify).toHaveBeenCalledOnce();
    const current = store.getSnapshot();
    store.resize({ size: { windowWidth: 750, windowHeight: 850 } });
    expect(store.getSnapshot()).toBe(current);
  });
});
