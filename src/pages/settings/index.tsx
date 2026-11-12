import { getScrollViewType } from "../../utils/renderer";
import { View, Text, ScrollView } from "@tarojs/components";
import { GzkButton as Button, GzkSwitch as Switch } from "gzk-ui/native-form";
import Taro from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import { logout } from "guanggu-forum-api";
import { ChevronRight as ArrowRightIcon } from "gzk-ui/icons";
import ThemedIcon from "../../components/ThemedIcon";
import { linkHandler } from "../../utils/linkHandler";
import { getCachedUsername, subscribeCurrentAccount } from "../../utils/currentUser";
import { APP_ROUTES } from '../../utils/appRoutes';
import { cacheService, CacheCategory, type CategoryStats } from "../../utils/CacheService";
import AddToDesktopGuide, { checkMiniProgramAdded } from "../../components/AddToDesktopGuide";
import Navbar from "../../components/Navbar";
import { isSkyline } from "../../utils/renderer";
import { useTheme } from "../../hooks/useTheme";
import { setThemePreference, THEME_LABELS, type ThemePreference } from "../../utils/themePreferences";
import { AD_DISABLE_KEY, disableAd, isAdDisabled, getAdDisabledDays } from "../../utils/ad";
import "./index.scss";

const FEEDBACK_URL = "https://www.guozaoke.com/t/91893";
const GITHUB_URL = "https://github.com/geekeren/GuangGuForum";
const REWARDED_AD_UNIT_ID = "adunit-d0ac20b3f633671e";

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

export function SettingsContent({ active = true, embedded = false }: { active?: boolean; embedded?: boolean } = {}) {
  const visible = useRef(active); visible.current = active;
  const pageVisible = useRef(true);
  const interactionRevision = useRef(0);
  const currentInteraction = () => {
    const revision = interactionRevision.current;
    return () => visible.current && pageVisible.current && revision === interactionRevision.current;
  };
  const skyline = isSkyline();
  const { preference: themePreference } = useTheme();
  const handleThemeChange = async () => {
    const current = currentInteraction(); if (!current()) return;
    const choices: ThemePreference[] = ["system", "light", "dark"];
    try {
      const { tapIndex } = await Taro.showActionSheet({ itemList: choices.map(choice => THEME_LABELS[choice]) });
      if (!current()) return;
      const selected = choices[tapIndex];
      if (selected && !setThemePreference(selected)) {
        Taro.showToast({ title: "外观设置保存失败，请重试", icon: "none" });
      }
    } catch { /* The user dismissed the choice sheet. */ }
  };
  const [showGuide, setShowGuide] = useState(false);
  const [miniProgramAdded, setMiniProgramAdded] = useState(false);
  const [adEnabled, setAdEnabled] = useState(!isAdDisabled());
  const [adLoading, setAdLoading] = useState(false);
  const videoAdRef = useRef<Taro.RewardedVideoAd | null>(null);
  const adInteraction = useRef<(() => boolean) | null>(null);

  const prepareVideoAd = () => {
    if (videoAdRef.current || !visible.current || !pageVisible.current) return;
    // A new instance per visible lifetime keeps old native callbacks from
    // authorizing a reward for a later visit.
    if (Taro.createRewardedVideoAd) {
      videoAdRef.current = Taro.createRewardedVideoAd({
        adUnitId: REWARDED_AD_UNIT_ID,
      });

      const ad = videoAdRef.current;
      ad.onLoad(() => {
        console.log("激励视频广告加载成功");
      });

      videoAdRef.current.onError((err) => {
        if (videoAdRef.current !== ad || !adInteraction.current?.()) return;
        adInteraction.current = null;
        console.error("激励视频广告加载失败", err);
        setAdLoading(false);
        Taro.showToast({ title: "广告加载失败，请稍后重试", icon: "none" });
        setAdEnabled(!isAdDisabled());
      });

      videoAdRef.current.onClose((res: { isEnded: boolean }) => {
        if (videoAdRef.current !== ad || !adInteraction.current?.()) return;
        adInteraction.current = null;
        setAdLoading(false);
        if (res && res.isEnded) {
          if (disableAd(30)) {
            setAdEnabled(false);
            Taro.showToast({ title: "广告已关闭30天", icon: "success" });
          } else {
            setAdEnabled(!isAdDisabled());
            Taro.showToast({ title: "免广告设置保存失败，请重试", icon: "none" });
          }
        } else {
          Taro.showToast({ title: "需看完广告才能关闭", icon: "none" });
          setAdEnabled(true);
        }
      });
    }

  };
  const destroyVideoAd = () => {
    const ad = videoAdRef.current; videoAdRef.current = null; adInteraction.current = null; ad?.destroy?.();
  };
  useEffect(() => { prepareVideoAd(); return destroyVideoAd; }, []);

  const handleExternalUrl = (url: string) => {
    linkHandler(url);
  };

  const handleAddToDesktop = async () => {
    const current = currentInteraction(); if (!current()) return;
    try {
      // @ts-expect-error addDesktopShortcut not in Taro types
      await Taro.addDesktopShortcut({
        title: "过早客",
        path: "/pages/home/index",
      });
    } catch {
      if (current()) setShowGuide(true);
    }
  };

  const handleAddToMiniProgram = () => {
    if (currentInteraction()()) setShowGuide(true);
  };

  const [cacheStats, setCacheStats] = useState<CategoryStats[]>([]);

  const statsRevision = useRef(0);
  const statsVisible = useRef(active);
  const hideContent = () => {
    interactionRevision.current++; destroyVideoAd();
    statsVisible.current = false; statsRevision.current++;
    setShowGuide(false); setAdLoading(false);
  };
  useEffect(() => () => { visible.current = false; interactionRevision.current++; adInteraction.current = null; statsVisible.current = false; statsRevision.current++; }, []);
  const hideContentRef = useRef(hideContent); hideContentRef.current = hideContent;
  useEffect(() => subscribeCurrentAccount(() => hideContentRef.current()), []);
  Taro.useDidHide(() => { pageVisible.current = false; hideContent(); });

  const refreshCacheStats = async () => {
    const revision = ++statsRevision.current;
    try {
      const stats = await cacheService.getAllCategoryStatsAsync();
      if (statsVisible.current && revision === statsRevision.current) setCacheStats(stats);
    } catch { /* Keep the previous snapshot if the filesystem is temporarily unavailable. */ }
  };

  const showContent = () => {
    if (!visible.current || !pageVisible.current) return;
    statsVisible.current = true; prepareVideoAd();
    setAdEnabled(!isAdDisabled());
    void refreshCacheStats();
    const revision = statsRevision.current;
    void checkMiniProgramAdded().then(added => {
      if (statsVisible.current && revision === statsRevision.current) setMiniProgramAdded(added);
    }).catch(() => {});
  };
  Taro.useDidShow(() => { pageVisible.current = true; showContent(); });
  const showContentRef = useRef(showContent); showContentRef.current = showContent;
  useEffect(() => {
    if (active) showContentRef.current(); else hideContentRef.current();
  }, [active]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const totalSize = cacheStats.reduce((sum, s) => sum + s.size, 0);

  const handleClearCategory = async (cat: CacheCategory, label: string) => {
    const current = currentInteraction(); if (!current()) return;
    if (cat === CacheCategory.System) {
      Taro.showToast({ title: "包含登录态及系统必须数据，不可删除", icon: "none" });
      return;
    }
    const { confirm } = await Taro.showModal({
      title: `清除${label}`,
      content: `确定要清除所有${label}吗？`,
    });
    if (confirm && current()) {
      try {
        await cacheService.clearCategoryAsync(cat);
        if (current()) Taro.showToast({ title: `${label}已清除`, icon: "success" });
      } catch {
        if (current()) Taro.showToast({ title: "部分缓存清理失败，请重试", icon: "none" });
      } finally { if (current()) void refreshCacheStats(); }
    }
  };

  const handleClearAll = async () => {
    const current = currentInteraction(); if (!current()) return;
    const { confirm } = await Taro.showModal({
      title: "清除缓存",
      content: "确定要清除缓存吗？登录状态等数据将保留。",
    });
    if (confirm && current()) {
      try {
        await cacheService.clearAllAsync(true);
        if (current()) Taro.showToast({ title: "缓存已清除", icon: "success" });
      } catch {
        if (current()) Taro.showToast({ title: "部分缓存清理失败，请重试", icon: "none" });
      } finally { if (current()) void refreshCacheStats(); }
    }
  };

  const handleForceClearAll = async () => {
    const current = currentInteraction(); if (!current()) return;
    const { confirm } = await Taro.showModal({
      title: "强制清除所有数据",
      content: "将清除所有本地数据，包括登录状态和偏好设置，需要重新登录。确定继续？",
      confirmColor: "#e74c3c",
    });
    if (confirm && current()) {
      try {
        await cacheService.clearAllAsync(false);
        if (current()) Taro.showToast({ title: "所有数据已清除", icon: "success" });
      } catch {
        if (current()) Taro.showToast({ title: "数据清理失败，请重试", icon: "none" });
      } finally { if (current()) void refreshCacheStats(); }
    }
  };

  const handleLogout = async () => {
    const current = currentInteraction(); if (!current()) return;
    const { confirm } = await Taro.showModal({
      title: "退出登录",
      content: "确定要退出登录吗？",
    });
    if (confirm && current()) {
      Taro.showLoading({ title: "退出中...", mask: true });
      try {
        await logout();
      } finally {
        Taro.hideLoading();
      }
      if (current()) Taro.reLaunch({ url: "/pages/home/index" });
    }
  };

  const handleAdSwitchChange = async (value: boolean) => {
    const current = currentInteraction(); if (!current() || adLoading || adInteraction.current) return;
    if (!value) {
      // 关闭广告需要看激励广告
      const { confirm } = await Taro.showModal({
        title: "关闭广告",
        content: "完整观看激励视频后，可关闭广告30天",
        confirmText: "观看广告",
        cancelText: "取消",
      });
      if (!confirm || !current()) return;

      adInteraction.current = current; setAdLoading(true);

      const ad = videoAdRef.current;
      if (ad) {
        try {
          try { await ad.show(); }
          catch {
            if (!current() || ad !== videoAdRef.current) return;
            await ad.load();
            if (!current() || ad !== videoAdRef.current) return;
            await ad.show();
          }
        } catch {
          if (current() && ad === videoAdRef.current) {
            adInteraction.current = null;
            Taro.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' }); setAdLoading(false);
          }
        }
      } else {
        adInteraction.current = null;
        Taro.showToast({ title: "当前环境不支持激励广告", icon: "none" }); setAdLoading(false);
      }
    } else {
      // 开启广告
      const removed = await cacheService.removeAsync(AD_DISABLE_KEY, true);
      if (!current()) return;
      if (removed) {
        setAdEnabled(true);
        Taro.showToast({ title: "广告已开启", icon: "success" });
      } else {
        setAdEnabled(!isAdDisabled());
        Taro.showToast({ title: "广告设置保存失败，请重试", icon: "none" });
      }
    }
  };

  const getAdSwitchDesc = () => {
    if (adEnabled) return "";
    const remainDays = getAdDisabledDays();
    return remainDays > 0 ? `免广告剩余 ${remainDays} 天` : "";
  };

  const isLoggedIn = !!getCachedUsername();

  const sections: MenuItem[][] = [
    [
      { label: "外观", desc: THEME_LABELS[themePreference], action: handleThemeChange },
      { label: '图床设置', desc: 'ImgURL Token · 图片压缩', action: () => {
        Taro.navigateTo({ url: APP_ROUTES.imageSettings });
      } },
    ],
    [
      { label: "意见反馈", desc: FEEDBACK_URL, action: () => handleExternalUrl(FEEDBACK_URL) },
      { label: "开源地址", desc: "GitHub", action: () => handleExternalUrl(GITHUB_URL) },
    ],
    [
      { label: "广告管理", switchControl: true, switchValue: adEnabled, onSwitchChange: handleAdSwitchChange, switchDesc: getAdSwitchDesc(), noArrow: true },
      { label: "推荐给朋友", shareButton: true },
      { label: "添加到桌面", action: handleAddToDesktop },
      { label: "添加到我的小程序", action: handleAddToMiniProgram, statusTag: miniProgramAdded ? "已添加" : "未添加" },
    ],
  ];

  return (
    <View className={`settingsPage${skyline ? " settingsPage--skyline" : ""}${embedded ? ' settingsPage--embedded' : ''}`}>
      {!embedded && <Navbar shared={false} back title='设置' titleStyle={{ opacity: 1 }} />}
      <ScrollView type={getScrollViewType()} scrollY className='settingsBody'>
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
                        onClick={() => item.onSwitchChange?.(!item.switchValue)}
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

      {active && showGuide && <AddToDesktopGuide force onClose={() => setShowGuide(false)} />}
    </View>
  );
}

export default function Settings() {
  Taro.useShareAppMessage(() => ({ title: '过早客 - 武汉本地生活社区', path: '/pages/home/index' }));
  return <SettingsContent />;
}
