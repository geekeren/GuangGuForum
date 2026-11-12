import { View, Text, ScrollView } from "@tarojs/components";
import { useEffect } from "react";
import { getUserProfile } from "guanggu-forum-api";
import { Envelope as MessageIcon } from "gzk-ui/icons";
import { usePageNavigation, usePageRouter } from "../../hooks/usePageScope";
import { usePageScrollViewType } from "../../hooks/usePageRenderer";
import Loading from "../../components/Loading";
import UserProfileDetail from "../../components/UserProfileDetail";
import Navbar from "../../components/Navbar";
import { useDataWithCache } from "../../hooks/useDataWithCache";
import { useCurrentUsername } from '../../hooks/useCurrentUsername';
import { getCachedUsername } from '../../utils/currentUser';
import { profileMessageRoute } from '../messages/privateState';
import ThemedIcon from '../../components/ThemedIcon';
import "./index.scss";

const UserProfilePage = () => {
  const pageNavigation = usePageNavigation();
  const scrollType = usePageScrollViewType();
  const router = usePageRouter();
  const username = router.params.username;
  const { username: currentUsername } = useCurrentUsername();
  const { data: profile, request: fetchProfile } = useDataWithCache(getUserProfile);

  useEffect(() => {
    if (!username) {
      pageNavigation.navigateBack();
      return;
    }
    fetchProfile({ username }).catch(() => {});
  }, [username, fetchProfile]);

  if (!profile) {
    return (
      <View className='userPage'>
        <View className='userProfileNavbar'><Navbar title='个人主页' back home shared={false} /></View>
        <Loading fullscreen />
      </View>
    );
  }

  const messageRoute = profileMessageRoute(profile, currentUsername);
  const messageAction = messageRoute ? <View className='userPrivateMessageAction' onClick={() => {
    const route = profileMessageRoute(profile, getCachedUsername());
    if (route) void pageNavigation.navigateTo({ url: route });
  }}
  ><ThemedIcon src={MessageIcon} tone='accent-text' className='userPrivateMessageIcon' /><Text>发私信</Text></View> : undefined;

  return (
    <View className='userPage'>
      <View className='userProfileNavbar'><Navbar title='个人主页' back home shared={false} /></View>
      <ScrollView type={scrollType} className='userScroll' scrollY enhanced showScrollbar={false}>
        <UserProfileDetail profile={profile} actions={messageAction} />
      </ScrollView>
    </View>
  );
};

export default UserProfilePage;
