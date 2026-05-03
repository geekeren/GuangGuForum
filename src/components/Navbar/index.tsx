import { View, Text, Image, ShareElement } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNavInfo } from "../../utils/dimension";
import ChevronLeftIcon from "../../assets/chevron-left.svg";
import HomeIcon from "../../assets/nav-home.svg";
import "./index.scss";

interface Props {
  title?: React.ReactNode;
  back?: boolean;
  home?: boolean;
  modal?: boolean;
  scrollProgress?: number;
  workletDriven?: boolean;
  titleStyle?: React.CSSProperties;
  left?: boolean;
  shareKey?: string;
  children?: React.ReactNode;
}

const Navbar = (props: Props) => {
  const { title, back = false, home = false, modal = false, scrollProgress = 0, workletDriven = false, titleStyle: customTitleStyle, left = false, shareKey, children } = props;
  const { capsulePaddingTop, capsuleHeight, capsuleWidth, capsuleLeft, screenWidth, statusBarHeight, marginSides } = getNavInfo();
  const paddingRight = screenWidth - capsuleLeft;
  const singleBtnWidth = (capsuleWidth - 0.5) / 2;

  const router = Taro.useRouter();
  const inModal = modal || router.params.modal === "true";

  const p = Math.min(Math.max(scrollProgress, 0), 1);

  const navBgStyle = workletDriven
    ? { paddingTop: inModal ? 0 : statusBarHeight + "px" }
    : {
        paddingTop: inModal ? 0 : statusBarHeight + "px",
        backdropFilter: `blur(${p * 20}px)`,
        backgroundColor: `rgba(255, 255, 255, ${p * 0.85})`,
      };

  const defaultTitleStyle = workletDriven
    ? {}
    : {
        opacity: p,
        transform: `translateY(${(1 - p) * 8}px)`,
      };

  const titleStyle = customTitleStyle !== undefined ? customTitleStyle : defaultTitleStyle;

  const navBarPaddingTop = inModal ? 16 : capsulePaddingTop;

  const content = (
    <View className="customNavbar" style={navBgStyle}>
      <View className="navBar" style={{ paddingTop: navBarPaddingTop + "px", paddingLeft: (back || home ? 0 : marginSides) + "px", paddingRight: paddingRight + "px" }}>
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
                  <Image src={HomeIcon} svg className="navCapsuleIcon" />
                </View>
              )}
            </View>
          </View>
        )}
        <View className={`navContent ${left ? 'navContent--left' : ''}`} style={{ height: capsuleHeight + "px" }}>
          {title && !children && (
            <Text className="navTitle" style={titleStyle}>{title}</Text>
          )}
          {children && children}
        </View>
      </View>
    </View>
  );

  if (shareKey) {
    return <ShareElement mapkey={shareKey}>{content}</ShareElement>;
  }
  return content;
};

export default Navbar;
