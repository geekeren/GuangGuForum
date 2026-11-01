import { Image, type ImageProps } from "@tarojs/components";
import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { THEME_PALETTES } from "../../utils/themePreferences";
import { svgIconSource } from "../../utils/svgIcon";

type IconTone = "primary" | "secondary" | "muted" | "accent" | "accent-text";
interface Props extends Omit<ImageProps, "src" | "svg"> {
  // Import the vector document with Vite's ?raw, not its file URL.
  src: string;
  color?: string;
  tone?: IconTone;
  lightColor?: string;
}

export default function ThemedIcon({ src, color, tone = "secondary", lightColor, style, ...props }: Props) {
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme];
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
