import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNavInfo } from "../../utils/dimension";
import ChevronLeftIcon from "../../assets/chevron-left.svg";
import "./index.scss";

interface Props {
  title?: string;
  back?: boolean;
  home?: boolean;
  scrollProgress?: number;
  children?: React.ReactNode;
}

const Navbar = (props: Props) => {
  const { title, back = false, home = false, scrollProgress = 0, children } = props;
  const { capsulePaddingTop, capsuleHeight, capsuleWidth, capsuleLeft, screenWidth, statusBarHeight, marginSides } = getNavInfo();
  const paddingRight = screenWidth - capsuleLeft;
  const singleBtnWidth = (capsuleWidth - 0.5) / 2;

  const p = Math.min(Math.max(scrollProgress, 0), 1);

  return (
    <View className="customNavbar" style={{
      paddingTop: statusBarHeight + "px",
      backdropFilter: `blur(${p * 20}px)`,
      backgroundColor: `rgba(255, 255, 255, ${p * 0.85})`,
    }}>
      <View className="navBar" style={{ paddingTop: capsulePaddingTop + "px", paddingLeft: (back || home ? 0 : marginSides) + "px", paddingRight: paddingRight + "px" }}>
        {(back || home) && (
          <View className="navLeft" style={{ width: (capsuleWidth + marginSides) + "px", paddingLeft: marginSides + "px" }}>
            <View className="navCapsule" style={{ height: capsuleHeight + "px", borderRadius: (capsuleHeight / 2) + "px" }}>
              {back && (
                <View className="navCapsuleBtn" style={{ width: singleBtnWidth + "px" }} onClick={() => {
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
                <View className="navCapsuleBtn" style={{ width: singleBtnWidth + "px" }} onClick={() => Taro.reLaunch({ url: "/pages/home/index" })}>
                  <Image src={require("../../assets/home.svg")} svg className="navCapsuleIcon" />
                </View>
              )}
            </View>
          </View>
        )}
        <View className="navContent" style={{ height: capsuleHeight + "px" }}>
          {title && !children && (
            <Text className="navTitle" style={{
              opacity: p,
              transform: `translateY(${(1 - p) * 8}px)`,
            }}>{title}</Text>
          )}
          {children}
        </View>
      </View>
    </View>
  );
};

export default Navbar;
