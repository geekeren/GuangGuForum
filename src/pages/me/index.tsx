import { View, Text, Image, ScrollView } from "@tarojs/components";
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
import SettingsIcon from "../../assets/settings.svg";
import { useDataWithCache } from "../../hooks/useDataWithCache";

const Me = ({ active }: { active?: boolean }) => {
  const { username, loading: checkingLogin, error: loginError, retry } = useCurrentUsername(active);
  const { data: profile, request: fetchProfile } = useDataWithCache(getUserProfile);

  useEffect(() => {
    if (active && username) fetchProfile({ username }).catch(() => {});
  }, [active, username, fetchProfile]);

  const settingsAction = (
    <Image
      className='settingsIcon'
      src={SettingsIcon}
      svg
      onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
    />
  );

  if (!username || !profile || loginError) {
    return (
      <View className='meProfile meProfile--notLoggedIn' style={{ height: "100%" }}>
        <Navbar
          shared={false}
          leftAction={
            <Image
              className='navSettingsIcon'
              src={SettingsIcon}
              svg
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

  const navTopPadding = getNavInfo().appHeaderHeight;

  return (
    <ScrollView type='custom' scrollY className='meProfile' style={{ height: "100%" }}>
      <UserProfileDetail profile={profile} actions={settingsAction} navPaddingTop={navTopPadding} />
    </ScrollView>
  );
};

export default Me;
