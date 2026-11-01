import Taro from "@tarojs/taro";
import { cacheService, CacheCategory } from "./CacheService";

export type ColorTheme = "light" | "dark";
export type ThemePreference = "system" | ColorTheme;
export const THEME_STORAGE_KEY = "theme_preference";
export const THEME_LABELS: Record<ThemePreference, string> = {
  system: "跟随系统", light: "浅色模式", dark: "深色模式",
};

export const THEME_PALETTES = {
  light: {
    bg: "#f4f5fa", surface: "#ffffff", "surface-alt": "#f0f3f8",
    "surface-soft": "#f5f8ff", "surface-hover": "#edf2fc",
    "text-primary": "#0f1626", "text-sub": "#2c3548", "text-muted": "#6b7488", "text-faint": "#a0a8b8",
    border: "#e8ebf2", "border-strong": "#d6dbe5", "brand-soft": "#e8efff", "accent-soft": "#fff1e6", "code-text": "#1954cc",
    "surface-rgb": "255, 255, 255", "icon-filter": "none",
    "shadow-sm": "0 4px 12rpx rgba(15, 22, 38, 0.04)",
    "shadow-md": "0 12rpx 32rpx rgba(15, 22, 38, 0.06)",
    "background-primary": "#f4f5fa", "background-secondary": "#ffffff", "background-tertiary": "#f0f3f8",
    "text-secondary": "#2c3548", "text-tertiary": "#6b7488", "border-subtle": "#e8ebf2",
    "accent-primary": "#1f69ff", "accent-muted": "#e8efff", "accent-text": "#0754d7",
    "tab-active-background": "#1f69ff", "tab-inactive-background": "#ffffff",
    "navigation-surface": "#ffffff", "compose-shadow": "0 8rpx 16rpx rgba(31, 105, 255, 0.25)",
    "profile-bg": "#f4f5fa", "profile-surface": "#ffffff", "profile-surface-alt": "#f0f3f8",
  },
  dark: {
    bg: "#000000", surface: "#1c1c1e", "surface-alt": "#2c2c2e",
    "surface-soft": "#141414", "surface-hover": "#363638",
    "text-primary": "#f2f2f2", "text-sub": "#d1d1d1", "text-muted": "#a6a6aa", "text-faint": "#858589",
    border: "#333335", "border-strong": "#48484a", "brand-soft": "#2b2b2e", "accent-soft": "#302c29", "code-text": "#a9bddd",
    "surface-rgb": "28, 28, 30", "icon-filter": "brightness(1.8)",
    "shadow-sm": "0 4px 12rpx rgba(0, 0, 0, 0.18)",
    "shadow-md": "0 12rpx 32rpx rgba(0, 0, 0, 0.24)",
    // Explicit homepage roles reuse the existing neutral semantic palette.
    "background-primary": "#000000", "background-secondary": "#1c1c1e", "background-tertiary": "#252527",
    "text-secondary": "#d1d1d1", "text-tertiary": "#a6a6aa", "border-subtle": "rgba(255, 255, 255, 0.07)",
    "accent-primary": "#3478ff", "accent-muted": "#202c40", "accent-text": "#8bb5ff",
    "tab-active-background": "#3478ff", "tab-inactive-background": "#1c1c1e",
    "navigation-surface": "#171719", "compose-shadow": "0 4rpx 10rpx rgba(0, 0, 0, 0.18)",
    "profile-bg": "#000000", "profile-surface": "#1c1c1e", "profile-surface-alt": "#2c2c2e",
  },
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
  return Object.fromEntries(Object.entries(THEME_PALETTES[theme])
    .map(([name, value]) => [`--theme-${name}`, value]));
}
export function themePageStyle(theme: ColorTheme): string {
  const palette = THEME_PALETTES[theme];
  return Object.entries(palette).map(([name, value]) => `--theme-${name}:${value}`).join(";") +
    `;background-color:${palette.bg};color:${palette["text-primary"]}`;
}
