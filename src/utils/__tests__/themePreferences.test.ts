import { beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import { cacheService } from "../CacheService";

const env = vi.hoisted(() => ({ system: "light", stored: undefined as unknown }));
vi.mock("@tarojs/taro", () => ({ default: {
  getAppBaseInfo: vi.fn(() => ({ theme: env.system })),
  onThemeChange: vi.fn(), offThemeChange: vi.fn(),
} }));
vi.mock("../CacheService", () => ({
  CacheCategory: { System: "system" },
  cacheService: { get: vi.fn(() => env.stored), set: vi.fn(() => true) },
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  env.system = "light"; env.stored = undefined;
  vi.mocked(cacheService.set).mockReturnValue(true);
  vi.mocked(Taro.getAppBaseInfo).mockImplementation(() => ({ theme: env.system } as any));
});

describe("appearance preferences", () => {
  it("defaults to system and safely rejects stale preferences", async () => {
    const theme = await import("../themePreferences");
    expect(theme.getThemeSnapshot()).toEqual({ preference: "system", theme: "light" });
    expect(theme.getThemeSnapshot()).toBe(theme.getThemeSnapshot());
    expect(theme.normalizeThemePreference("unknown")).toBe("system");
    expect(theme.resolveTheme("system", "dark")).toBe("dark");
  });
  it("loads persisted dark mode before rendering the first page", async () => {
    env.stored = "dark";
    const theme = await import("../themePreferences");
    expect(theme.getThemeSnapshot()).toEqual({ preference: "dark", theme: "dark" });
  });
  it("follows system changes but does not override a manual choice", async () => {
    const theme = await import("../themePreferences");
    const changed = vi.fn(); const unsubscribe = theme.subscribeTheme(changed);
    const stop = theme.startThemeListener();
    expect(theme.startThemeListener()).toBe(stop);
    expect(Taro.onThemeChange).toHaveBeenCalledOnce();
    const callback = vi.mocked(Taro.onThemeChange).mock.calls[0][0];
    callback({ theme: "dark" });
    expect(theme.getThemeSnapshot().theme).toBe("dark");
    theme.setThemePreference("light");
    const before = changed.mock.calls.length;
    callback({ theme: "dark" });
    expect(theme.getThemeSnapshot()).toEqual({ preference: "light", theme: "light" });
    expect(changed).toHaveBeenCalledTimes(before);
    unsubscribe(); stop();
    expect(Taro.offThemeChange).toHaveBeenCalledWith(callback);
  });
  it("persists only the appearance key and reports storage failure without changing appearance", async () => {
    const theme = await import("../themePreferences");
    theme.getThemeSnapshot();
    expect(theme.setThemePreference("dark")).toBe(true);
    expect(cacheService.set).toHaveBeenCalledWith("theme_preference", "dark", { category: "system" });
    vi.mocked(cacheService.set).mockReturnValue(false);
    expect(theme.setThemePreference("light")).toBe(false);
    expect(theme.getThemeSnapshot().theme).toBe("dark");
  });
  it("refreshes follow-system appearance when returning from the background", async () => {
    const theme = await import("../themePreferences");
    theme.getThemeSnapshot(); env.system = "dark";
    theme.refreshSystemTheme();
    expect(theme.getThemeSnapshot().theme).toBe("dark");
  });
  it("emits the same semantic variables for both themes, including page and portal colors", async () => {
    const theme = await import("../themePreferences");
    expect(Object.keys(theme.THEME_PALETTES.light)).toEqual(Object.keys(theme.THEME_PALETTES.dark));
    expect(theme.themePageStyle("dark")).toContain("--theme-surface:#1b2230");
    expect(theme.themePageStyle("dark")).toContain("background-color:#10141d;color:#edf2fc");
    expect(theme.THEME_PALETTES.dark["icon-filter"]).not.toContain(" ");
  });
  it("falls back to light when system theme APIs are unavailable", async () => {
    vi.mocked(Taro.getAppBaseInfo).mockImplementation(() => { throw new Error("unsupported"); });
    const theme = await import("../themePreferences");
    expect(theme.getThemeSnapshot().theme).toBe("light");
  });
});
