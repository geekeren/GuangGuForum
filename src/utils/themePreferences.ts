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
  },
  dark: {
    bg: "#10141d", surface: "#1b2230", "surface-alt": "#252e3f",
    "surface-soft": "#151c29", "surface-hover": "#2b3650",
    "text-primary": "#edf2fc", "text-sub": "#cdd6e7", "text-muted": "#a0aec5", "text-faint": "#7e8da6",
    border: "#303b50", "border-strong": "#46536c", "brand-soft": "#20345b", "accent-soft": "#3b2c25", "code-text": "#9bbbff",
    "surface-rgb": "27, 34, 48", "icon-filter": "brightness(1.8)",
    "shadow-sm": "0 4px 12rpx rgba(0, 0, 0, 0.18)",
    "shadow-md": "0 12rpx 32rpx rgba(0, 0, 0, 0.24)",
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
export function themePageStyle(theme: ColorTheme): string {
  const palette = THEME_PALETTES[theme];
  return Object.entries(palette).map(([name, value]) => `--theme-${name}:${value}`).join(";") +
    `;background-color:${palette.bg};color:${palette["text-primary"]}`;
}
