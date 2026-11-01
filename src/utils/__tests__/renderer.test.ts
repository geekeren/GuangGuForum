import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { isSkyline } from "../renderer";

vi.mock("@tarojs/taro", () => ({ default: { getCurrentInstance: vi.fn(), getCurrentPages: vi.fn() } }));
beforeEach(() => {
  vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: null } as any);
  vi.mocked(Taro.getCurrentPages).mockReturnValue([]);
});
afterEach(() => vi.unstubAllGlobals());
describe("actual page renderer detection", () => {
  it("recognizes the current Taro page before it enters the platform page stack", () => {
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: { renderer: "skyline" } } as any);
    expect(isSkyline()).toBe(true);
    expect(Taro.getCurrentPages).not.toHaveBeenCalled();
  });
  it("respects WebView pages even if a previous page used Skyline", () => {
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: { renderer: "webview" } } as any);
    vi.mocked(Taro.getCurrentPages).mockReturnValue([{ renderer: "skyline" }] as any);
    expect(isSkyline()).toBe(false);
  });
  it("falls back to the platform stack without modifying it", () => {
    const pages = [{ renderer: "webview" }, { renderer: "skyline" }];
    vi.mocked(Taro.getCurrentPages).mockReturnValue(pages as any);
    expect(isSkyline()).toBe(true);
    expect(pages).toHaveLength(2);
  });
  it("keeps the compatibility baseline when no page exists", () => {
    expect(isSkyline()).toBe(false);
  });
});
