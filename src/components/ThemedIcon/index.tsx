import { GzkIcon, type GzkIconProps } from "gzk-ui/icon";
import { useTheme } from "../../hooks/useTheme";

type Props = Omit<GzkIconProps, "theme">;

export default function ThemedIcon(props: Props) {
  const { theme } = useTheme();
  return <GzkIcon {...props} theme={theme} />;
}
