import { View, Text, ScrollView } from "@tarojs/components";
import { GzkButton as Button, GzkSwitch as Switch } from "gzk-ui/native-form";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { logout } from "guanggu-forum-api";
import { ChevronRight as ArrowRightIcon } from "gzk-ui/icons";
import { usePageRenderer } from "../../hooks/usePageRenderer";
import { usePageOwner, usePageNavigation } from "../../hooks/usePageScope";
import ThemedIcon from "../../components/ThemedIcon";
import { linkHandler } from "../../utils/linkHandler";
import { getCachedUsername } from "../../utils/currentUser";
import { APP_ROUTES } from '../../utils/appRoutes';
import { CacheCategory } from "../../utils/CacheService";
import AddToDesktopGuide, { checkMiniProgramAdded } from "../../components/AddToDesktopGuide";
import Navbar from "../../components/Navbar";
import { useTheme } from "../../hooks/useTheme";
import { setThemePreference, THEME_LABELS, type ThemePreference } from "../../utils/themePreferences";
import { useRewardedAd } from "./useRewardedAd";
import { useCacheManagement, formatSize } from "./useCacheManagement";
import "./index.scss";

const FEEDBACK_URL = "https://www.guozaoke.com/t/91893";
const GITHUB_URL = "https://github.com/geekeren/GuangGuForum";

type MenuItem = {
  label: string;
  icon?: string;
  desc?: string;
  action?: () => void;
  danger?: boolean;
  noArrow?: boolean;
  shareButton?: boolean;
  switchControl?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  switchDesc?: string;
  statusTag?: string;
};

export default function Settings() {
  const owner = usePageOwner();
  const navigation = usePageNavigation();
  const skyline = usePageRenderer() === "skyline";
  const { preference: themePreference } = useTheme();
  const handleThemeChange = async () => {
    const choices: ThemePreference[] = ["system", "light", "dark"];
    try {
      const { tapIndex } = await Taro.showActionSheet({ itemList: choices.map(choice => THEME_LABELS[choice]) });
      const selected = choices[tapIndex];
      if (selected && !setThemePreference(selected)) {
        Taro.showToast({ title: "外观设置保存失败，请重试", icon: "none" });
      }
    } catch { /* The user dismissed the choice sheet. */ }
  };
  const [showGuide, setShowGuide] = useState(false);
  const [miniProgramAdded, setMiniProgramAdded] = useState(false);
  const { adEnabled, adLoading, handleAdSwitchChange, adSwitchDesc } = useRewardedAd();
  const { cacheStats, totalSize, handleClearCategory, handleClearAll, handleForceClearAll } = useCacheManagement();

  Taro.useDidShow(() => {
    checkMiniProgramAdded().then(setMiniProgramAdded);
  });

  Taro.useShareAppMessage(() => ({
    title: "过早客 - 武汉本地生活社区",
    path: "/pages/home/index",
  }));

  const handleExternalUrl = (url: string) => {
    linkHandler(url, owner);
  };

  const handleAddToDesktop = async () => {
    try {
      // @ts-expect-error addDesktopShortcut not in Taro types
      await Taro.addDesktopShortcut({
        title: "过早客",
        path: "/pages/home/index",
      });
    } catch {
      setShowGuide(true);
    }
  };

  const handleAddToMiniProgram = () => {
    setShowGuide(true);
  };

  const handleLogout = async () => {
    const { confirm } = await Taro.showModal({
      title: "退出登录",
      content: "确定要退出登录吗？",
    });
    if (confirm) {
      Taro.showLoading({ title: "退出中...", mask: true });
      try {
        await logout();
      } finally {
        Taro.hideLoading();
      }
      navigation.reLaunch({ url: "/pages/home/index" });
    }
  };

  const isLoggedIn = !!getCachedUsername();

  const sections: MenuItem[][] = [
    [
      { label: "外观", desc: THEME_LABELS[themePreference], action: handleThemeChange },
      { label: '图床设置', desc: 'ImgURL Token · 图片压缩', action: () => {
        navigation.navigateTo({ url: APP_ROUTES.imageSettings });
      } },
    ],
    [
      { label: "意见反馈", desc: FEEDBACK_URL, action: () => handleExternalUrl(FEEDBACK_URL) },
      { label: "开源地址", desc: "GitHub", action: () => handleExternalUrl(GITHUB_URL) },
    ],
    [
      { label: "广告管理", switchControl: true, switchValue: adEnabled, onSwitchChange: handleAdSwitchChange, switchDesc: adSwitchDesc, noArrow: true },
      { label: "推荐给朋友", shareButton: true },
      { label: "添加到桌面", action: handleAddToDesktop },
      { label: "添加到我的小程序", action: handleAddToMiniProgram, statusTag: miniProgramAdded ? "已添加" : "未添加" },
    ],
  ];

  return (
    <View className={`settingsPage${skyline ? " settingsPage--skyline" : ""}`}>
      <Navbar shared={false} back title='设置' titleStyle={{ opacity: 1 }} />
      <ScrollView type={skyline ? 'custom' : undefined} scrollY className='settingsBody'>
        {sections.map((group, gi) => (
          <View className='settingsGroup' key={gi}>
            {group.map((item, ii) => (
              <View
                key={ii}
                className={`settingsItem ${item.danger ? "settingsItem--danger" : ""}`}
                onClick={item.action}
              >
                {item.shareButton ? (
                  <Button className='settingsItemBtn' open-type='share'>
                    <View className='settingsItemBtnContent'>
                      <View className='settingsItemLeft'>
                        <Text className='settingsItemLabel'>{item.label}</Text>
                      </View>
                      <ThemedIcon src={ArrowRightIcon} tone='muted' lightColor='#8a8a8a' className='settingsItemArrow' />
                    </View>
                  </Button>
                ) : item.switchControl ? (
                  <>
                    <View className='settingsItemLeft'>
                      <Text className='settingsItemLabel'>{item.label}</Text>
                      {item.switchDesc && <Text className='settingsItemDesc' {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>{item.switchDesc}</Text>}
                    </View>
                    <View>
                      <Switch
                        onClick={() => { item.onSwitchChange?.(!item.switchValue); }}
                        checked={item.switchValue}
                        disabled={adLoading}
                        color='#1f69ff'
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View className='settingsItemLeft'>
                      <Text className='settingsItemLabel'>{item.label}</Text>
                      {item.desc && <Text className='settingsItemDesc' {...(skyline ? { overflow: "ellipsis", maxLines: 1 } as const : {})}>{item.desc}</Text>}
                    </View>
                    {item.statusTag ? (
                      <Text className={`settingsItemStatusTag ${item.statusTag === "已添加" ? "settingsItemStatusTag--added" : "settingsItemStatusTag--not"}`}>{item.statusTag}</Text>
                    ) : !item.noArrow ? (
                      <ThemedIcon src={ArrowRightIcon} tone='muted' lightColor='#8a8a8a' className='settingsItemArrow' />
                    ) : null}
                  </>
                )}
              </View>
            ))}
          </View>
        ))}

        <View className='cacheCard'>
          <View className='cacheHeader'>
            <Text className='cacheHeaderLabel'>本地数据</Text>
            <Text className='cacheHeaderSize'>{formatSize(totalSize)}</Text>
          </View>
          {cacheStats.length > 0 ? (
            cacheStats.map((stat) => (
              <View
                key={stat.category}
                className={`cacheRow ${stat.category === CacheCategory.System ? "cacheRow--system" : ""}`}
                onClick={() => handleClearCategory(stat.category, stat.label)}
              >
                <View className='cacheRowLeft'>
                  <Text className='cacheRowLabel'>{stat.label}</Text>
                  {stat.category === CacheCategory.System && <Text className='cacheRowHint'>不可删除</Text>}
                </View>
                <View className='cacheRowRight'>
                  <Text className='cacheRowSize'>{formatSize(stat.size)}</Text>
                  <Text className='cacheRowCount'>{stat.count} 项</Text>
                </View>
              </View>
            ))
          ) : (
            <View className='cacheRow cacheRow--empty'>
              <Text className='cacheRowLabel' style={{ color: "var(--text-faint, #a0a8b8)" }}>暂无缓存</Text>
            </View>
          )}
          <View className='cacheRow cacheRow--action' onClick={handleClearAll}>
            <Text className='cacheActionText'>清除缓存</Text>
          </View>
          <View className='cacheRow cacheRow--action' onClick={handleForceClearAll}>
            <Text className='cacheActionText' style={{ color: "#e74c3c" }}>清除所有数据</Text>
          </View>
        </View>

        {isLoggedIn && (
          <View className='settingsGroup'>
            <View className='settingsItem settingsItem--danger' onClick={handleLogout}>
              <Text className='settingsItemLabel'>退出登录</Text>
            </View>
          </View>
        )}

        <View className='settingsFooter'>
          <Text className='settingsFooterText'>过早客 · 武汉本地生活社区</Text>
        </View>
      </ScrollView>

      {showGuide && <AddToDesktopGuide force onClose={() => setShowGuide(false)} />}
    </View>
  );
}
