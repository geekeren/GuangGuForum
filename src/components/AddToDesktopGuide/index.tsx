import { View, Text, Image } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState, useRef } from "react";
import MoreDotsIcon from "../../assets/more-dots.svg";
import { getNavInfo } from "../../utils/dimension";
import { cacheService, CacheCategory } from "../../utils/CacheService";
import "./index.scss";

const DISMISSED_KEY = "add_to_desktop_dismissed";
const ADDED_KEY = "add_to_desktop_already_added";
const SHOW_DELAY = 30_000;
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Scene values indicating user entered from 我的小程序 or desktop shortcut
const ADDED_SCENES = new Set([1089, 1044]);

const YEAR_TTL = 365 * 24 * 60 * 60 * 1000;

function checkAlreadyAdded(): boolean {
  if (cacheService.get<boolean>(ADDED_KEY)) return true;
  try {
    const { scene } = Taro.getLaunchOptionsSync();
    if (ADDED_SCENES.has(scene)) {
      cacheService.set(ADDED_KEY, true, { category: CacheCategory.System, priority: "low", ttl: YEAR_TTL });
      return true;
    }
  } catch {}
  return false;
}

export function checkMiniProgramAdded(): Promise<boolean> {
  return new Promise((resolve) => {
    Taro.checkIsAddedToMyMiniProgram({
      success: (res) => resolve(res.added),
      fail: () => resolve(false),
    });
  });
}

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
    if (checkAlreadyAdded()) return;
    if (cacheService.get<boolean>(DISMISSED_KEY)) return;

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
        cacheService.set(DISMISSED_KEY, true, { category: CacheCategory.Other, priority: "low", ttl: DISMISS_TTL });
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
          <Text className="guideTipText">点击 </Text>
          <Image src={MoreDotsIcon} svg className="guideMoreIcon" />
        </View>
        <Text className="guideTipSub">添加到「我的小程序」或桌面{"\n"}下次快速打开过早客</Text>
      </View>
      <View className="guideClose" onClick={handleClose}>
        <Text className="guideCloseText">我知道了</Text>
      </View>
    </View>
  );
}
