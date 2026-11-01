import { Fragment, type ReactNode } from "react";
import { NavigationBar, PageMeta, View } from "@tarojs/components";
import { useTheme } from "../../hooks/useTheme";
import { THEME_PALETTES, themePageStyle, themeVariables } from "../../utils/themePreferences";

// PageMeta's page-style does not establish a Skyline variable scope.
// A real View must host the variables; it also covers sibling page overlays.
export default function ThemePage({ children }: { children?: ReactNode }) {
  const { theme } = useTheme();
  const palette = THEME_PALETTES[theme];
  return (
    <Fragment>
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
      <View className='themePageHost' style={{ ...themeVariables(theme), width: "100%", minHeight: "100vh" }}>
        {children}
      </View>
    </Fragment>
  );
}
