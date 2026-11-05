import { usePageRenderer } from "../../hooks/usePageRenderer";
import { RootPortal, View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { ReactNode, useEffect, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { themeVariables } from "../../utils/themePreferences";
import "./index.scss";

interface BottomSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  heightRpx: number;
  className?: string;
}

export default function BottomSheet({ visible, title, onClose, children, footer, heightRpx, className = "" }: BottomSheetProps) {
  const { theme } = useTheme();
  const [present, setPresent] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [viewport, setViewport] = useState<ReturnType<typeof Taro.getWindowInfo>>();
  const skyline = usePageRenderer() === "skyline";

  useEffect(() => {
    if (visible) {
      setPresent(true);
      setKeyboardHeight(0);
      setViewport(Taro.getWindowInfo());
      return;
    }
    if (!present) return;
    const timer = setTimeout(() => setPresent(false), 250);
    return () => clearTimeout(timer);
  }, [visible, present]);

  useEffect(() => {
    if (!visible) return;
    const onKeyboard = ({ height }: { height: number }) => setKeyboardHeight(Math.max(0, height));
    Taro.onKeyboardHeightChange(onKeyboard);
    return () => Taro.offKeyboardHeightChange(onKeyboard);
  }, [visible]);

  if (!visible && !present) return null;
  const windowInfo = viewport || Taro.getWindowInfo();
  const safeBottom = keyboardHeight ? 0 : windowInfo.safeArea ? Math.max(0, windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0;
  const availableHeight = Math.max(0, windowInfo.windowHeight - keyboardHeight);
  const height = Math.min(Math.round(heightRpx * windowInfo.windowWidth / 750) + safeBottom, Math.floor(availableHeight * 0.85));
  const overlay = (
    <View className={`bottomSheetMask themeOverlay--${theme}${skyline ? " bottomSheetMask--skyline" : ""}${visible ? "" : " bottomSheetMask--closing"} ${className}`}
      style={{ ...themeVariables(theme), ...(skyline ? { width: `${windowInfo.windowWidth}px`, height: `${windowInfo.windowHeight}px` } : {}) }}
      onClick={() => { if (visible) onClose(); }}>
      <View className={`bottomSheetPanel${visible ? "" : " bottomSheetPanel--closing"}`}
        style={{ height: `${height}px`, ...(skyline ? { top: `${availableHeight - height}px`, width: `${windowInfo.windowWidth}px` } : { bottom: `${keyboardHeight}px` }) }}
        onClick={(e) => e.stopPropagation()}>
        <View className='bottomSheetHeader'>
          <Text className='bottomSheetTitle'>{title}</Text>
          <View className='bottomSheetClose' onClick={onClose}><Text>✕</Text></View>
        </View>
        <ScrollView type={skyline ? 'custom' : undefined} scrollY enhanced className='bottomSheetBody'>{children}</ScrollView>
        {footer && <View className='bottomSheetFooter' style={{ paddingBottom: `calc(20rpx + ${safeBottom}px)` }}>{footer}</View>}
      </View>
    </View>
  );
  return skyline ? <RootPortal>{overlay}</RootPortal> : overlay;
}
