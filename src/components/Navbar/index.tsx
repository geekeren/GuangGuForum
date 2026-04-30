import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNavInfo } from "../../utils/dimension";
import ChevronLeftIcon from "../../assets/chevron-left.svg";
import "./index.scss";

interface Props {
  title?: string;
  back?: boolean;
  home?: boolean;
  onClickSearch?: () => void;
  children?: React.ReactNode;
}

const Navbar = (props: Props) => {
  const { title, back = false, home = false, onClickSearch, children } = props;
  const { capsulePaddingTop, capsuleHeight, capsuleLeft, screenWidth, statusBarHeight, capsuleWidth } = getNavInfo();
  const paddingRight = screenWidth - capsuleLeft;

  return (
    <View className="customNavbar" style={{ paddingTop: statusBarHeight + "px" }}>
      <View className="navBar" style={{ paddingTop: capsulePaddingTop + "px", paddingRight: paddingRight + "px", paddingLeft: "14px" }}>
        {(back || home) && (
          <View className="navCapsule" style={{ width: capsuleWidth + "px", height: capsuleHeight + "px", borderRadius: (capsuleHeight / 2) + "px" }}>
            {back && (
              <View className="navCapsuleBtn" style={{ width: ((capsuleWidth - (home ? 0.5 : 0)) / (home ? 2 : 1)) + "px" }} onClick={() => {
                const pages = Taro.getCurrentPages();
                if (pages.length > 1) {
                  Taro.navigateBack();
                } else {
                  Taro.reLaunch({ url: "/pages/home/index" });
                }
              }}>
                <Image src={ChevronLeftIcon} svg className="navCapsuleIcon" />
              </View>
            )}
            {back && home && <View className="navCapsuleDivider" />}
            {home && (
              <View className="navCapsuleBtn" style={{ width: ((capsuleWidth - (back ? 0.5 : 0)) / (back ? 2 : 1)) + "px" }} onClick={() => Taro.reLaunch({ url: "/pages/home/index" })}>
                <Image src={require("../../assets/home.svg")} svg className="navCapsuleIcon" />
              </View>
            )}
          </View>
        )}
        {title && !children && (
          <View className="navTitleContainer" style={{ left: "14px", right: paddingRight + "px", top: (statusBarHeight + capsulePaddingTop) + "px", height: capsuleHeight + "px" }}>
            <Text className="navTitle">{title}</Text>
          </View>
        )}
        {children}
        {!title && !children && !back && !home && (
          <>
            <Text className="navTitle" style={{ lineHeight: capsuleHeight + "px" }}>过早客</Text>
            <View className="searchEntry" style={{ height: capsuleHeight + "px", maxWidth: "60%" }} onClick={() => Taro.showToast({ title: "开发中，敬请期待", icon: "none" })}>
              <Text className="searchText">搜索</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
};

export default Navbar;
