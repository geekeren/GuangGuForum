import { Text, View, type ViewProps } from "@tarojs/components";
import { useTheme } from "../../hooks/useTheme";
import { THEME_PALETTES } from "../../utils/themePreferences";
import ThemedIcon from "../ThemedIcon";
import { TopicHash as HashIcon } from "gzk-ui/icons";
import { AnnouncementFilled as AnnouncementIcon } from "gzk-ui/icons";
import "./index.scss";

interface Props {
  label: string;
  announcement?: boolean;
  className?: string;
  onClick?: ViewProps["onClick"];
}

export default function TopicTag({ label, announcement = false, className = "", onClick }: Props) {
  const { theme } = useTheme();
  const color = THEME_PALETTES[theme]["accent-text"];
  return (
    <View className={`topicTag ${className}`} onClick={onClick} style={{ color }}>
      <ThemedIcon src={announcement ? AnnouncementIcon : HashIcon} color={color} className='topicTagIcon' />
      <Text className='topicTagText' overflow='ellipsis' maxLines={1}>{label}</Text>
    </View>
  );
}
