import { View, Text } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNavInfo } from "../../utils/dimension";
import "./index.scss";
import { AtIcon } from "taro-ui";
import { useEffect } from "react";

interface Props {
  onClickSearch?: () => void;
  title?: string;
}
const Navbar = (props: Props) => {
  const { onClickSearch, title } = props;
  const { capsulePaddingTop, capsuleHeight, capsuleLeft, screenWidth } =
    getNavInfo();
  useEffect(() => {
    const intervalId = setInterval(() => {}, 3000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const barStyle = {
    paddingTop: `${capsulePaddingTop}px`,
    paddingBottom: '4px',
    paddingRight: `${screenWidth - capsuleLeft}px`,
    paddingLeft: '14px',
    height: capsuleHeight,
  };

  return (
    <View
      style={{
        paddingTop: getNavInfo().statusBarHeight + "px",
      }}
    >
      {title ? (
        <View
          style={{
            ...barStyle,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: "34rpx", fontWeight: "bold" }}>{title}</Text>
        </View>
      ) : (
        <View style={{ ...barStyle, display: "flex", alignItems: "center", gap: "16rpx" }}>
          <Text className="navTitle">过早客</Text>
          <View className="searchEntry" onClick={() => Taro.showToast({ title: "开发中，敬请期待", icon: "none" })}>
            <AtIcon value="search" size="16" color="#333" />
            <Text className="text">搜索</Text>
          </View>
        </View>
      )}
    </View>
  );
};
export default Navbar;
