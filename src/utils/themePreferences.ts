import Taro from "@tarojs/taro";
import { cacheService, CacheCategory } from "./CacheService";
import {
  BASE_THEME_PALETTES,
  themeVariables as baseThemeVariables,
  themePageStyle as baseThemePageStyle,
  type ColorTheme,
} from "gzk-ui/theme";

export type { ColorTheme } from "gzk-ui/theme";
export type ThemePreference = "system" | ColorTheme;
export const THEME_STORAGE_KEY = "theme_preference";
export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "跟随系统", light: "浅色模式", dark: "深色模式",
};

// Navigation, composer and profile roles belong to this application, not GzkUi.
const APP_THEME_PALETTES = {
  light: {
    "navigation-surface": "#ffffff", "navigation-shadow": "0 -4rpx 16rpx rgba(15, 22, 38, 0.08)",
    "compose-shadow": "0 8rpx 16rpx rgba(31, 105, 255, 0.25)",
    "profile-bg": "#f4f5fa", "profile-surface": "#ffffff", "profile-surface-alt": "#f0f3f8",
  },
  dark: {
    "navigation-surface": "#171719", "navigation-shadow": "0 -4rpx 16rpx rgba(0, 0, 0, 0.28)",
    "compose-shadow": "0 4rpx 10rpx rgba(0, 0, 0, 0.18)",
    "profile-bg": "#000000", "profile-surface": "#1c1c1e", "profile-surface-alt": "#2c2c2e",
  },
} as const;
export const THEME_PALETTES = {
  light: { ...BASE_THEME_PALETTES.light, ...APP_THEME_PALETTES.light },
  dark: { ...BASE_THEME_PALETTES.dark, ...APP_THEME_PALETTES.dark },
} as const;

export interface ThemeSnapshot { preference: ThemePreference; theme: ColorTheme }
const listeners = new Set<() => void>();
let snapshot: ThemeSnapshot | undefined;
let systemTheme: ColorTheme = "light";
let stopSystemListener: (() => void) | undefined;

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function resolveTheme(preference: ThemePreference, system: unknown): ColorTheme {
  return preference === "system" ? system === "dark" ? "dark" : "light" : preference;
}
function readSystemTheme(): ColorTheme {
  try {
    const info = Taro.getAppBaseInfo?.();
    return info?.theme === "dark" ? "dark" : "light";
  } catch { return "light"; }
}
export function getThemeSnapshot(): ThemeSnapshot {
  if (!snapshot) {
    systemTheme = readSystemTheme();
    const preference = normalizeThemePreference(cacheService.get(THEME_STORAGE_KEY));
    snapshot = { preference, theme: resolveTheme(preference, systemTheme) };
  }
  return snapshot;
}
function publish(preference: ThemePreference) {
  const theme = resolveTheme(preference, systemTheme);
  const previous = snapshot;
  if (previous?.preference === preference && previous.theme === theme) return;
  snapshot = { preference, theme };
  listeners.forEach(listener => listener());
}
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setThemePreference(preference: ThemePreference): boolean {
  const next = normalizeThemePreference(preference);
  if (!cacheService.set(THEME_STORAGE_KEY, next, { category: CacheCategory.System })) return false;
  getThemeSnapshot();
  // System theme may have changed while the app was in the background.
  systemTheme = readSystemTheme();
  publish(next);
  return true;
}
export function refreshSystemTheme(): void {
  const { preference } = getThemeSnapshot();
  systemTheme = readSystemTheme();
  publish(preference);
}
export function startThemeListener(): () => void {
  if (stopSystemListener) return stopSystemListener;
  refreshSystemTheme();
  const handler = ({ theme }: { theme: ColorTheme }) => {
    const { preference } = getThemeSnapshot();
    systemTheme = theme === "dark" ? "dark" : "light";
    publish(preference);
  };
  Taro.onThemeChange?.(handler);
  stopSystemListener = () => {
    Taro.offThemeChange?.(handler);
    stopSystemListener = undefined;
  };
  return stopSystemListener;
}
export function themeVariables(theme: ColorTheme): Record<string, string> {
  return baseThemeVariables(theme, THEME_PALETTES[theme]);
}
export function themePageStyle(theme: ColorTheme): string {
  return baseThemePageStyle(theme, THEME_PALETTES[theme]);
}
