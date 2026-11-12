import { usePageRenderer } from "../../hooks/usePageRenderer";
import { RootPortal, View, Text, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { NodeGroup } from "guanggu-forum-api";
import { useTheme } from "../../hooks/useTheme";
import { themeVariables } from "../../utils/themePreferences";
import { isDesktopClient, uiRpxLength } from "../../utils/desktopLayout";
import "./index.scss";

interface NodePickerProps {
  visible: boolean;
  groups: NodeGroup[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
  allLabel?: string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}

export default function NodePicker({
  visible, groups, selectedSlug, onSelect, onClose, allLabel, loading, error, onRetry,
}: NodePickerProps) {
  const skyline = usePageRenderer() === "skyline";
  const desktop = isDesktopClient();
  const { theme } = useTheme();
  const [present, setPresent] = useState(visible);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (visible) {
      setPresent(true);
      setClosing(false);
      return;
    }
    if (!present) return;
    setClosing(true);
    const timer = setTimeout(() => setPresent(false), 250);
    return () => clearTimeout(timer);
  }, [visible, present]);

  if (!visible && !present) return null;

  const windowInfo = skyline || desktop ? Taro.getWindowInfo() : undefined;
  const safeBottom = windowInfo?.safeArea ? Math.max(0, windowInfo.screenHeight - windowInfo.safeArea.bottom) : 0;
  const sheetHeight = windowInfo ? Math.floor(windowInfo.windowHeight * 0.7) : 0;
  const maskStyle = desktop ? {
    position: "fixed" as const, top: 0, left: 0, width: "100%", height: "100%",
  } : windowInfo ? {
    position: "fixed" as const, top: 0, left: 0,
    width: windowInfo.windowWidth + "px", height: windowInfo.windowHeight + "px",
  } : undefined;
  const sheetStyle = desktop ? {
    position: "absolute" as const, left: 0, bottom: 0, width: "100%", height: "70%", maxHeight: "70%",
  } : windowInfo ? {
    position: "absolute" as const, left: 0, top: windowInfo.windowHeight - sheetHeight + "px",
    width: windowInfo.windowWidth + "px", height: sheetHeight + "px",
  } : undefined;
  const scrollStyle = desktop ? { height: 0, flex: 1, minHeight: 0, paddingBottom: `calc(${uiRpxLength(32)} + ${safeBottom}px)` }
    : windowInfo ? { paddingBottom: `calc(${uiRpxLength(32)} + ${safeBottom}px)` } : undefined;

  const overlay = (
    <View className={`nodePickerMask themeOverlay--${theme}${desktop ? " themePageHost--desktop" : ""}${skyline ? " nodePickerMask--skyline" : ""}${closing ? " nodePickerMask--closing" : ""}`} style={{ ...themeVariables(theme), ...maskStyle }} onClick={onClose}>
      <View className={`nodePickerSheet${closing ? " nodePickerSheet--closing" : ""}`} style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <View className='nodePickerHeader'>
          <Text className='nodePickerTitle'>选择板块</Text>
          <View className='nodePickerClose' onClick={onClose}>
            <Text className='nodePickerCloseText'>✕</Text>
          </View>
        </View>
        <ScrollView type={skyline ? 'custom' : undefined} scrollY className='nodePickerScroll' style={scrollStyle}>
          {loading && <Text className='nodePickerStatus'>正在加载板块筛选…</Text>}
          {error && <View className='nodePickerStatus'>
            <Text>{error}</Text>
            {onRetry && <Text className='nodePickerRetry' onClick={onRetry}>重试</Text>}
          </View>}
          {allLabel && <View className='nodeGroup'>
            <View className='nodeGroupTags'>
              <View className={`nodeTag ${selectedSlug === "0" ? "nodeTag--active" : ""}`} onClick={() => { if (visible) onSelect("0"); }}>
                <Text className='nodeTagText'>{allLabel}</Text>
              </View>
            </View>
          </View>}
          {groups.map((group) => (
            <View className='nodeGroup' key={group.category}>
              <Text className='nodeGroupLabel'>{group.category}</Text>
              <View className='nodeGroupTags'>
                {group.nodes.map((node) => (
                  <View
                    key={node.slug}
                    className={`nodeTag ${selectedSlug === node.slug ? "nodeTag--active" : ""}`}
                    onClick={() => { if (visible) onSelect(node.slug); }}
                  >
                    <Text className='nodeTagText'>{node.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
  return skyline ? <RootPortal>{overlay}</RootPortal> : overlay;
}
