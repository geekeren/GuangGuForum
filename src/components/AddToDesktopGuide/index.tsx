import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState, useRef } from "react";
import MoreDotsIcon from "../../assets/more-dots.svg";
import CapsuleCloseIcon from "../../assets/capsule-circle.svg";
import { getNavInfo } from "../../utils/dimension";
import "./index.scss";

const STORAGE_KEY = "add_to_desktop_dismissed";
const SHOW_DELAY = 30_000;

interface Props {
  force?: boolean;
  onClose?: () => void;
}

export default function AddToDesktopGuide({ force, onClose }: Props = {}) {
  const [visible, setVisible] = useState(!!force);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (force) {
      setVisible(true);
      return;
    }
    const dismissed = Taro.getStorageSync(STORAGE_KEY);
    if (dismissed) return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY);

    return () => clearTimeout(timer);
  }, [force]);

  const handleClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      if (!force) {
        Taro.setStorageSync(STORAGE_KEY, true);
      }
      onClose?.();
      closingRef.current = false;
    }, 250);
  };

  if (!visible) return null;

  const nav = getNavInfo();
  const dotsCenterX = nav.capsuleLeft + nav.capsuleWidth / 4;
  const arrowRight = nav.screenWidth - dotsCenterX - 8;

  return (
    <View className={`addToDesktopGuide ${closing ? "addToDesktopGuide--closing" : ""}`}>
      <View
        className="guideBubble"
        style={{
          top: nav.statusBarHeight + nav.capsulePaddingTop + nav.capsuleHeight + 12 + "px",
          right: nav.marginSides + "px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <View
          className="guideArrow"
          style={{ right: arrowRight + "px" }}
        />
        <View className="guideTipRow">
          <Text className="guideTipText">点击 ⋯</Text>
          <View className="guideCapsule" style={{ width: nav.capsuleWidth + "px", height: nav.capsuleHeight + "px" }}>
            <View className="guideCapsuleLeft">
              <Image src={MoreDotsIcon} svg className="guideCapsuleIcon--dots" />
            </View>
            <View className="guideCapsuleDivider" />
            <View className="guideCapsuleRight">
              <Image src={CapsuleCloseIcon} svg className="guideCapsuleIcon--close" />
            </View>
          </View>
        </View>
        <Text className="guideTipSub">添加到「我的小程序」或桌面{"\n"}下次快速打开过早客</Text>
      </View>
      <View className="guideClose" onClick={handleClose}>
        <Text className="guideCloseText">我知道了</Text>
      </View>
    </View>
  );
}
