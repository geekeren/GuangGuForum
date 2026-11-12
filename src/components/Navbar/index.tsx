import { View, Text, ShareElement } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { getNavInfo } from "../../utils/dimension";
import { useTheme } from "../../hooks/useTheme";
import { THEME_PALETTES } from "../../utils/themePreferences";
import { usePageRenderer } from "../../hooks/usePageRenderer";
import ThemedIcon from "../ThemedIcon";
import { ChevronLeft as ChevronLeftIcon } from "gzk-ui/icons";
import { Home as HomeIcon } from "gzk-ui/icons";
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
  shared?: boolean;
  leftAction?: React.ReactNode;
  children?: React.ReactNode;
  autoHeight?: boolean;
  centeredContent?: boolean;
  backgroundRGB?: string;
}

const Navbar = (props: Props) => {
  const { title, back = false, home = false, modal = false, scrollProgress = 0, workletDriven = false, titleStyle: customTitleStyle, left = false, shareKey, shared = true, leftAction, children, autoHeight = false, centeredContent = false, backgroundRGB } = props;
  const { theme } = useTheme();
  const skyline = usePageRenderer() === "skyline";
  const surfaceRGB = backgroundRGB ?? THEME_PALETTES[theme]["surface-rgb"];
  const { capsulePaddingTop, capsuleHeight, capsuleWidth, capsuleLeft, screenWidth, statusBarHeight, marginSides } = getNavInfo();
  const paddingRight = screenWidth - capsuleLeft + Math.max(marginSides, 12);
  const singleBtnWidth = (capsuleWidth - 0.5) / 2;
  const hasLeft = back || home || leftAction;
  // navLeft's existing content-box width includes an additional left padding.
  const leftReserved = hasLeft ? capsuleWidth + marginSides * 2 : marginSides;
  const balancedReserved = Math.max(leftReserved, paddingRight);

  const router = Taro.useRouter();
  const inModal = modal || router.params.modal === "true";

  const p = Math.min(Math.max(scrollProgress, 0), 1);

  const navBgStyle = workletDriven
    ? { paddingTop: inModal ? 0 : statusBarHeight + "px" }
    : {
        paddingTop: inModal ? 0 : statusBarHeight + "px",
        backdropFilter: `blur(${p * 20}px)`,
        backgroundColor: `rgba(${surfaceRGB}, ${p * 0.85})`,
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
      <View className="navBar" style={{ paddingTop: navBarPaddingTop + "px", paddingLeft: (centeredContent ? balancedReserved - (hasLeft ? leftReserved : 0) : hasLeft ? 0 : marginSides) + "px", paddingRight: (centeredContent ? balancedReserved : paddingRight) + "px" }}>
        {hasLeft && (
          <View className="navLeft" style={{ width: (capsuleWidth + marginSides) + "px", paddingLeft: marginSides + "px", ...(centeredContent ? { marginLeft: (leftReserved - balancedReserved) + "px", marginRight: (balancedReserved - leftReserved) + "px" } : {}) }}>
            {(back || home) && (
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
                    <ThemedIcon src={ChevronLeftIcon} tone='primary' lightColor='#333' className="navCapsuleIcon" />
                  </View>
                )}
                {back && home && <View className="navCapsuleDivider" />}
                {home && (
                  <View className="navCapsuleBtn" style={{ width: singleBtnWidth + "px" }} onClick={() => Taro.reLaunch({ url: "/pages/home/index" })}>
                    <ThemedIcon src={HomeIcon} tone='primary' lightColor='#333' className="navCapsuleIcon" />
                  </View>
                )}
              </View>
            )}
            {leftAction && !back && !home && (
              <View className="navCapsule" style={{ height: capsuleHeight + "px", borderRadius: (capsuleHeight / 2) + "px" }}>
                <View className="navCapsuleBtn" style={{ width: singleBtnWidth + "px" }}>
                  {leftAction}
                </View>
              </View>
            )}
          </View>
        )}
        <View className={`navContent ${left ? 'navContent--left' : ''}${autoHeight ? ' navContent--autoHeight' : ''}`} style={autoHeight ? { height: 'auto', minHeight: capsuleHeight + "px" } : { height: capsuleHeight + "px" }}>
          {title && !children && (
            <Text className="navTitle" style={titleStyle} maxLines={skyline ? 1 : undefined} overflow={skyline ? 'ellipsis' : undefined}>{title}</Text>
          )}
          {children && children}
        </View>
      </View>
    </View>
  );

  if (!shared) return content;

  return <ShareElement
    mapkey={shareKey ?? "navbar"}
    style={skyline ? { width: "100%", flexShrink: 0 } : undefined}
  >{content}</ShareElement>;
};

export default Navbar;
