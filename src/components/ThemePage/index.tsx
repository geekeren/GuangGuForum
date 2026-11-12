import { type ReactNode } from "react";
import { NavigationBar, PageMeta, View } from "@tarojs/components";
import { useTheme } from "../../hooks/useTheme";
import { PageRendererProvider } from "../../hooks/usePageRenderer";
import { THEME_PALETTES, themePageStyle, themeVariables } from "../../utils/themePreferences";

// PageMeta's page-style does not establish a Skyline variable scope.
// A real View must host the variables; it also covers sibling page overlays.
export default function ThemePage({ children }: { children?: ReactNode }) {
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme];
  return (
    <PageRendererProvider>
      <PageMeta
        pageStyle={themePageStyle(theme)}
        backgroundColor={palette.bg}
        backgroundColorTop={palette.bg}
        backgroundColorBottom={palette.bg}
        rootBackgroundColor={palette.bg}
        backgroundTextStyle={theme === "dark" ? "light" : "dark"}
      >
        <NavigationBar frontColor={theme === "dark" ? "#ffffff" : "#000000"} backgroundColor={palette.bg} />
      </PageMeta>
      <View className={`themePageHost themePageHost--${theme}`} style={{ ...themeVariables(theme), width: "100%", height: "100%", minHeight: 0 }}>
        {children}
      </View>
    </PageRendererProvider>
  );
}
