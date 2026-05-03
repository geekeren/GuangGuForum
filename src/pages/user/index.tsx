import { View, ScrollView } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect } from "react";
import { getUserProfile, UserProfile } from "guanggu-forum-api";
import Loading from "../../components/Loading";
import UserProfileDetail from "../../components/UserProfileDetail";
import Navbar from "../../components/Navbar";
import { useDataWithCache } from "../../hooks/useDataWithCache";
import "./index.scss";

const UserProfilePage = () => {
  const router = useRouter();
  const username = router.params.username;
  const { data: profile, request: fetchProfile } = useDataWithCache(getUserProfile);

  useEffect(() => {
    if (!username) {
      Taro.navigateBack();
      return;
    }
    fetchProfile({ username }).catch(() => {});
  }, [router.params]);

  if (!profile) {
    return (
      <View className="userPage">
        <Navbar title="个人主页" back home />
        <Loading fullscreen />
      </View>
    );
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
