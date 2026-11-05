import { usePageScrollViewType } from "../../hooks/usePageRenderer";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useRef } from "react";
import { getUserProfile } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import "./index.scss";
import UserProfileDetail from "../../components/UserProfileDetail";
import LoginPrompt from "../../components/LoginPrompt";
import Navbar from "../../components/Navbar";
import { useCurrentUsername } from "../../hooks/useCurrentUsername";
import ArrowRightIcon from '../../assets/arrow-right.svg?raw';
import { getCachedUsername } from '../../utils/currentUser';
import SettingsIcon from "../../assets/settings.svg?raw";
import ThemedIcon from "../../components/ThemedIcon";
import { useDataWithCache } from "../../hooks/useDataWithCache";
import { APP_ROUTES } from '../../utils/appRoutes';

const Me = ({ active }: { active?: boolean }) => {
  const scrollViewType = usePageScrollViewType();
  const { username, loading: checkingLogin, error: loginError, retry } = useCurrentUsername(active);
  const { data: profile, request: fetchProfile, requestFresh: fetchFreshProfile } = useDataWithCache(getUserProfile);
  const pendingProfileRefresh = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    pendingProfileRefresh.current = false;
    const changed = (account: string) => {
      if (account !== username || getCachedUsername() !== username) return;
      pendingProfileRefresh.current = true;
      if (activeRef.current) {
        pendingProfileRefresh.current = false;
        void fetchFreshProfile({ username }).catch(() => { pendingProfileRefresh.current = true; });
      }
    };
    Taro.eventCenter.on('ownProfileSettingsUpdated', changed);
    return () => { Taro.eventCenter.off('ownProfileSettingsUpdated', changed); };
  }, [username, fetchFreshProfile]);

  useEffect(() => {
    if (!active || !username || getCachedUsername() !== username) return;
    if (pendingProfileRefresh.current) {
      pendingProfileRefresh.current = false;
      void fetchFreshProfile({ username }).catch(() => { pendingProfileRefresh.current = true; });
    } else void fetchProfile({ username }).catch(() => {});
  }, [active, username, fetchProfile, fetchFreshProfile]);

  let decodedUsername = username;
  try { decodedUsername = decodeURIComponent(username); } catch { /* Keep legacy encoding unchanged. */ }
  const ownProfile = profile && (profile.username === username || profile.username === decodedUsername);

  const settingsAction = (
    <ThemedIcon
      className='navSettingsIcon'
      src={SettingsIcon}
      tone='secondary'
      lightColor='#000000'
      onClick={() => Taro.navigateTo({ url: APP_ROUTES.settings })}
    />
  );

  if (!username || !profile || !ownProfile || loginError) {
    return (
      <View className='meProfile meProfile--notLoggedIn' style={{ height: "100%" }}>
        <View className='meProfileNavbar'>
          <Navbar shared={false} leftAction={settingsAction} />
        </View>
        <View className='meStatusBody'>
          {checkingLogin && !username ? <Loading fullscreen /> : loginError ? (
            <View className='loginPromptWrap' onClick={retry}><Text>账号信息加载失败，点击重试</Text></View>
          ) : !username ? (
            <View className='loginPromptWrap'>
              <LoginPrompt
                icon='早'
                title='登录后查看个人信息'
                desc='武汉本地生活社区，欢迎回来'
              />
            </View>
          ) : <Loading fullscreen />}
        </View>
      </View>
    );
  }

  const editAction = <ThemedIcon className='meProfileEditIcon' src={ArrowRightIcon} tone='secondary' lightColor='#000000'
    onClick={() => {
      if (getCachedUsername() === username && ownProfile) void Taro.navigateTo({ url: APP_ROUTES.editProfile });
    }} />;

  return (
    <View className='meProfile meProfile--ready' style={{ height: '100%' }}>
      <View className='meProfileNavbar'>
        <Navbar shared={false} leftAction={settingsAction} />
      </View>
      <ScrollView type={scrollViewType} scrollY enhanced className='meProfileScroll'>
        <UserProfileDetail className='userProfileDetail--me' profile={profile} actions={editAction} navPaddingTop={0} backgroundOwner='page' showRecentlyViewed active={!!active} />
      </ScrollView>
    </View>
  );
};

export default Me;
