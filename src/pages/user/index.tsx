import { View, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getUserProfile, UserProfile } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import { withCache } from "../../utils/cacheRequest";
import UserProfileDetail from "../../components/UserProfileDetail";
import Navbar from "../../components/Navbar";
import "./index.scss";

const UserProfilePage = () => {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>();
  const [error, setError] = useState(false);

  useEffect(() => {
    const { username } = router.params;
    if (!username) {
      Taro.navigateBack();
      return;
    }
    setError(false);
    const { cached, refresh } = withCache<UserProfile>(
      `user_profile_${username}`,
      () => getUserProfile(username),
    );
    if (cached) setProfile(cached);
    refresh.then((data) => {
      if (data) {
        setProfile(data);
      } else {
        setError(true);
      }
    }).catch(() => {
      setError(true);
    });
  }, [router.params]);

  if (error) {
    return (
      <View className="userPage" style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", color: "#999", fontSize: "28rpx" }}>
        加载失败
      </View>
    );
  }

  if (!profile) {
    return <Loading />;
  }

  return (
    <View className="userPage">
      <Navbar title="个人主页" back home />
      <ScrollView className="userScroll" scrollY enhanced showScrollbar={false}>
        <UserProfileDetail profile={profile} />
      </ScrollView>
    </View>
  );
};

export default UserProfilePage;
