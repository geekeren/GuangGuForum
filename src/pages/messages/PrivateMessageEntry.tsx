import { Text, View } from '@tarojs/components';
import { Envelope as MessageIcon } from "gzk-ui/icons";
import { usePageNavigation } from "../../hooks/usePageScope";
import ThemedIcon from '../../components/ThemedIcon';
import { APP_ROUTES } from '../../utils/appRoutes';

/** Standalone fallback entry; does not duplicate the hub's summary request. */
export default function PrivateMessageEntry({ active = true }: { active?: boolean }) {
  const pageNavigation = usePageNavigation();
  return <View className='notificationPrivateEntry' onClick={() => { if (active) void pageNavigation.navigateTo({ url: APP_ROUTES.messages }); }}>
    <ThemedIcon src={MessageIcon} tone='accent-text' className='notificationPrivateEntryIcon' />
    <View className='notificationPrivateEntryBody'><Text className='notificationPrivateEntryTitle'>私信</Text>
      <Text className='notificationPrivateEntryHint'>查看私信会话和消息请求</Text>
    </View><Text className='notificationPrivateEntryArrow'>›</Text>
  </View>;
}
