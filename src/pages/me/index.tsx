import { View, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getUserProfile, UserProfile, getRecentTopics } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import "./index.scss";
import UserProfileDetail from "../../components/UserProfileDetail";
import LoginPrompt from "../../components/LoginPrompt";
import { getCachedUsername } from "../../utils/currentUser";
import { withCache } from "../../utils/cacheRequest";
import { getNavInfo } from "../../utils/dimension";
import SettingsIcon from "../../assets/settings.svg";

const Me = ({ active }: { active?: boolean }) => {
  const [profile, setProfile] = useState<UserProfile>();
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProfile = () => {
    const username = getCachedUsername();
    if (!username) {
      // 登录后 proxy 请求不会写入 current_username，尝试一次非 proxy 请求触发解析
      const cookies = Taro.getStorageSync("cookies");
      if (cookies) {
        getRecentTopics({ type: "default", page: 1 })
          .then(() => setRefreshKey((k) => k + 1))
          .catch(() => {});
      }
      return;
    }
    const { cached, refresh } = withCache<UserProfile>(
      `user_profile_${username}`,
      () => getUserProfile(username),
    );
    if (cached) setProfile(cached);
    refresh.then(setProfile);
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    if (active) fetchProfile();
  }, [active, refreshKey]);

  if (!getCachedUsername()) {
    return (
      <View className="meProfile" style={{ height: "100%" }}>
        <LoginPrompt
          icon="早"
          title="登录后查看个人信息"
          desc="武汉本地生活社区，欢迎回来"
        />
      </View>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  const actions = (
    <Image
      className="settingsIcon"
      src={SettingsIcon}
      svg
      onClick={() => Taro.navigateTo({ url: "/pages/settings/index" })}
    />
  );

  const navTopPadding = getNavInfo().appHeaderHeight;

  return (
    <ScrollView scrollY className="meProfile" style={{ height: "100%" }}>
      <UserProfileDetail profile={profile} actions={actions} navPaddingTop={navTopPadding} />
    </ScrollView>
  );
};

export default Me;
