import { Image, type ImageProps } from "@tarojs/components";
import { useMemo } from "react";
import { BASE_THEME_PALETTES, type ColorTheme } from "../../theme";
import { svgIconSource } from "../../svgIcon";

export type IconTone = "primary" | "secondary" | "muted" | "accent" | "accent-text";
export interface GzkIconProps extends Omit<ImageProps, "src" | "svg"> {
  // Import the vector document with Vite's ?raw, not its file URL.
  src: string;
  theme: ColorTheme;
  color?: string;
  tone?: IconTone;
  lightColor?: string;
}

export function GzkIcon({ src, theme, color, tone = "secondary", lightColor, style, ...props }: GzkIconProps) {
  const palette = BASE_THEME_PALETTES[theme];
  const roles = {
    primary: palette["text-primary"], secondary: palette["text-secondary"],
    muted: palette["text-tertiary"], accent: palette["accent-primary"], "accent-text": palette["accent-text"],
  };
  const resolvedColor = color ?? (theme === "light" && lightColor ? lightColor : roles[tone]);
  const image = useMemo(() => svgIconSource(src, resolvedColor), [src, resolvedColor]);
  const containerStyle = typeof style === "string"
    ? `${style};color:${resolvedColor};filter:none`
    : { ...style, color: resolvedColor, filter: "none" };
  return <Image {...props} src={image} svg style={containerStyle} />;
}
