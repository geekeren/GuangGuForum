import { Fragment, type ReactNode } from "react";
import { NavigationBar, PageMeta } from "@tarojs/components";
import { useTheme } from "../../hooks/useTheme";
import { THEME_PALETTES, themePageStyle } from "../../utils/themePreferences";

// The Taro App receives one PageWrapper element per mounted native page.
// Keep PageMeta inside each wrapper, as the page's first node (not in App's root).
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
      {children}
    </Fragment>
  );
}
