import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getUserProfile, UserProfile, logout } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import "./index.scss";
import UserProfileDetail from "../../components/UserProfileDetail";
import { getCachedUsername } from "../../utils/currentUser";
import { withCache } from "../../utils/cacheRequest";
import { getNavInfo } from "../../utils/dimension";

const Me = ({ active }: { active?: boolean }) => {
  const [profile, setProfile] = useState<UserProfile>();
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProfile = () => {
    const username = getCachedUsername();
    if (!username) return;
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
    const navTopPadding = getNavInfo().appHeaderHeight;
    return (
      <View className="meProfile" style={{ paddingTop: navTopPadding + "px", height: "100%" }}>
        <View className="notLoggedIn">
          <View className="emptyAvatar">早</View>
          <View className="loginTip">登录后查看个人信息</View>
          <View className="loginSubTip">武汉本地生活社区，欢迎回来</View>
          <View
            className="loginBtn"
            onClick={() => Taro.reLaunch({ url: "/pages/login/index" })}
          >
            去登录
          </View>
        </View>
      </View>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  const actions = (
    <View
      className="logoutBtn"
      onClick={async () => {
        const { confirm } = await Taro.showModal({
          title: "退出登录",
          content: "确定要退出登录吗？",
        });
        if (confirm) {
          await logout();
          Taro.reLaunch({ url: "/pages/login/index" });
        }
      }}
    >
      退出登录
    </View>
  );

  const navTopPadding = getNavInfo().appHeaderHeight;

  return (
    <View
      className="meProfile"
      style={{
        height: "100%",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: "40rpx",
      }}
    >
      <UserProfileDetail profile={profile} actions={actions} navPaddingTop={navTopPadding} />
    </View>
  );
};

export default Me;
