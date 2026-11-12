import { View, Text, Image } from "@tarojs/components";
import { usePageOwner } from "../../hooks/usePageScope";
import { openLoginModal } from "../../utils/auth";
import "./index.scss";

interface LoginPromptProps {
  icon: string;
  iconSrc?: string;
  title: string;
  desc: string;
}

const LoginPrompt = ({ icon, iconSrc, title, desc }: LoginPromptProps) => {
  const owner = usePageOwner();
  return (
    <View className='loginPrompt'>
      {iconSrc ? (
        <View className='loginPromptBadge'>
          <Image src={iconSrc} svg className='loginPromptBadgeIcon' />
        </View>
      ) : (
        <View className='loginPromptBadge'><Text>{icon}</Text></View>
      )}
      <Text className='loginPromptTitle'>{title}</Text>
      <Text className='loginPromptDesc'>{desc}</Text>
      <View className='loginPromptBtn' onClick={() => openLoginModal(undefined, owner)}>
        <Text>去登录</Text>
      </View>
    </View>
  );
};

export default LoginPrompt;
