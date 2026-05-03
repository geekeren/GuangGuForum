import { View, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect } from "react";
import { getUserProfile, UserProfile, getRecentTopics } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import "./index.scss";
import UserProfileDetail from "../../components/UserProfileDetail";
import LoginPrompt from "../../components/LoginPrompt";
import Navbar from "../../components/Navbar";
import { getCachedUsername } from "../../utils/currentUser";
import { cacheService } from "../../utils/CacheService";
import { getNavInfo } from "../../utils/dimension";
import SettingsIcon from "../../assets/settings.svg";
import { useDataWithCache } from "../../hooks/useDataWithCache";

const Me = ({ active }: { active?: boolean }) => {
  const username = getCachedUsername();
  const { data: profile, request: fetchProfile } = useDataWithCache(getUserProfile);

  useEffect(() => {
    if (!username) {
      const cookies = cacheService.get<Record<string, string>>("cookies");
      if (cookies) {
        getRecentTopics({ type: "default", page: 1 }).catch(() => {});
      }
      return;
    }
    fetchProfile({ username });
  }, [active]);

  const settingsAction = (
    <Image
      className="settingsIcon"
      src={SettingsIcon}
      svg
      onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
    />
  );

  if (!username) {
    return (
      <View className="meProfile meProfile--notLoggedIn" style={{ height: "100%" }}>
        <Navbar
          leftAction={
            <Image
              className="navSettingsIcon"
              src={SettingsIcon}
              svg
              onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
            />
          }
        />
        <View className="loginPromptWrap">
          <LoginPrompt
            icon="早"
            title="登录后查看个人信息"
            desc="武汉本地生活社区，欢迎回来"
          />
        </View>
      </View>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  const navTopPadding = getNavInfo().appHeaderHeight;

  return (
    <ScrollView scrollY className="meProfile" style={{ height: "100%" }}>
      <UserProfileDetail profile={profile} actions={settingsAction} navPaddingTop={navTopPadding} />
    </ScrollView>
  );
};

export default Me;
