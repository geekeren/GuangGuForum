import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import ThemedIcon from '../../components/ThemedIcon';
import MessageIcon from '../../assets/notification.svg?raw';
import { APP_ROUTES } from '../../utils/appRoutes';

/** Standalone fallback entry; does not duplicate the hub's summary request. */
export default function PrivateMessageEntry({ active = true }: { active?: boolean }) {
  return <View className='notificationPrivateEntry' onClick={() => { if (active) void Taro.navigateTo({ url: APP_ROUTES.messages }); }}>
    <ThemedIcon src={MessageIcon} tone='accent-text' className='notificationPrivateEntryIcon' />
    <View className='notificationPrivateEntryBody'><Text className='notificationPrivateEntryTitle'>私信</Text>
      <Text className='notificationPrivateEntryHint'>查看私信会话和消息请求</Text>
    </View><Text className='notificationPrivateEntryArrow'>›</Text>
  </View>;
}
