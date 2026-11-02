import { getScrollViewType } from "../../utils/renderer";
import { View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect } from "react";
import { getUserProfile } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import "./index.scss";
import UserProfileDetail from "../../components/UserProfileDetail";
import LoginPrompt from "../../components/LoginPrompt";
import Navbar from "../../components/Navbar";
import { useCurrentUsername } from "../../hooks/useCurrentUsername";
import { getNavInfo } from "../../utils/dimension";
import SettingsIcon from "../../assets/settings.svg?raw";
import ThemedIcon from "../../components/ThemedIcon";
import { useDataWithCache } from "../../hooks/useDataWithCache";

const Me = ({ active }: { active?: boolean }) => {
  const { username, loading: checkingLogin, error: loginError, retry } = useCurrentUsername(active);
  const { data: profile, request: fetchProfile } = useDataWithCache(getUserProfile);

  useEffect(() => {
    if (active && username) fetchProfile({ username }).catch(() => {});
  }, [active, username, fetchProfile]);

  const settingsAction = (
    <ThemedIcon
      className='settingsIcon'
      src={SettingsIcon}
      tone='secondary'
      lightColor='#000000'
      onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
    />
  );

  if (!username || !profile || profile.username !== username || loginError) {
    return (
      <View className='meProfile meProfile--notLoggedIn' style={{ height: "100%" }}>
        <Navbar
          shared={false}
          leftAction={
            <ThemedIcon
              className='navSettingsIcon'
              src={SettingsIcon}
              tone='secondary'
              lightColor='#000000'
              onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
            />
          }
        />
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

  // Reserve the real status/capsule height; the Me-specific top row adds a small gap.
  const navTopPadding = getNavInfo().appHeaderHeight;

  return (
    <ScrollView type={getScrollViewType()} scrollY className='meProfile' style={{ height: "100%" }}>
      <UserProfileDetail className='userProfileDetail--me' profile={profile} actions={settingsAction} navPaddingTop={navTopPadding} showRecentlyViewed active={!!active} />
    </ScrollView>
  );
};

export default Me;
