import { View, Text } from "@tarojs/components";
import { openLoginModal } from "../../utils/auth";
import "./index.scss";

interface LoginPromptProps {
  icon: string;
  title: string;
  desc: string;
}

const isEmoji = (s: string) => /\p{Emoji_Presentation}/u.test(s);

const LoginPrompt = ({ icon, title, desc }: LoginPromptProps) => {
  return (
    <View className="loginPrompt">
      {isEmoji(icon) ? (
        <Text className="loginPromptIcon">{icon}</Text>
      ) : (
        <View className="loginPromptBadge">{icon}</View>
      )}
      <Text className="loginPromptTitle">{title}</Text>
      <Text className="loginPromptDesc">{desc}</Text>
      <View className="loginPromptBtn" onClick={() => openLoginModal()}>
        去登录
      </View>
    </View>
  );
};

export default LoginPrompt;
