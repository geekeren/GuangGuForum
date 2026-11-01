import { type ColorTheme, THEME_PALETTES } from "./themePreferences";
import { svgIconSource } from "./svgIcon";

// One vector scene, with a night palette rather than a second dark asset.
export function discoverySceneSource(source: string, theme: ColorTheme): string {
  const palette = THEME_PALETTES[theme];
  const night = {
    "#eef6ff": palette["background-secondary"],
    "#dceffd": palette["navigation-surface"],
    "#bee6ff": palette["background-tertiary"],
    "#eff6ff": palette["background-secondary"],
    "#fff": "#77777a",
  };
  const scene = theme === "light" ? source : source.replace(/#[\da-f]{6}\b|#[\da-f]{3}\b/gi, value => {
    const color = value.toLowerCase();
    if (color in night) return night[color];
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map(channel => channel + channel).join("") : hex;
    const rgb = [0, 2, 4].map(index => parseInt(full.slice(index, index + 2), 16));
    const gray = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    return "#" + rgb.map(channel => Math.round((gray * 0.65 + channel * 0.35) * 0.72).toString(16).padStart(2, "0")).join("");
  });
  return svgIconSource(scene, palette["text-secondary"]);
}
