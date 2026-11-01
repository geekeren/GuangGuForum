import { useSyncExternalStore } from "react";
import { getThemeSnapshot, subscribeTheme } from "../utils/themePreferences";

export function useTheme() {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);
}
