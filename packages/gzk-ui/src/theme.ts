export type ColorTheme = "light" | "dark";
export type ThemePalette = Readonly<Record<string, string>>;

// Pure visual roles only. Preference persistence and application extensions live in the host.
export const BASE_THEME_PALETTES = {
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
    "accent-primary": "#1f69ff", "accent-muted": "#e8efff", "accent-text": "#0754d7", "input-caret": "#0754d7",
    "tab-active-background": "#1f69ff", "tab-inactive-background": "#ffffff",
  },
  dark: {
    bg: "#000000", surface: "#1c1c1e", "surface-alt": "#2c2c2e",
    "surface-soft": "#141414", "surface-hover": "#363638",
    "text-primary": "#f2f2f2", "text-sub": "#d1d1d1", "text-muted": "#a6a6aa", "text-faint": "#858589",
    border: "#333335", "border-strong": "#48484a", "brand-soft": "#2b2b2e", "accent-soft": "#302c29", "code-text": "#a9bddd",
    "surface-rgb": "28, 28, 30", "icon-filter": "brightness(1.8)",
    "shadow-sm": "0 4px 12rpx rgba(0, 0, 0, 0.18)",
    "shadow-md": "0 12rpx 32rpx rgba(0, 0, 0, 0.24)",
    "background-primary": "#000000", "background-secondary": "#1c1c1e", "background-tertiary": "#252527",
    "text-secondary": "#d1d1d1", "text-tertiary": "#a6a6aa", "border-subtle": "rgba(255, 255, 255, 0.07)",
    "accent-primary": "#3478ff", "accent-muted": "#202c40", "accent-text": "#8bb5ff", "input-caret": "#8bb5ff",
    "tab-active-background": "#3478ff", "tab-inactive-background": "#1c1c1e",
  },
} as const;

// The optional palette is the already-selected theme, merged with any host-specific roles.
export function themeVariables(theme: ColorTheme, palette: ThemePalette = BASE_THEME_PALETTES[theme]): Record<string, string> {
  return Object.fromEntries(Object.entries(palette)
    .map(([name, value]) => [`--theme-${name}`, value]));
}

export function themePageStyle(theme: ColorTheme, palette: ThemePalette = BASE_THEME_PALETTES[theme]): string {
  return Object.entries(palette).map(([name, value]) => `--theme-${name}:${value}`).join(";") +
    `;background-color:${palette.bg};color:${palette["text-primary"]}`;
}
