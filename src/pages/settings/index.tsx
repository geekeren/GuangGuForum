import { View, Text, Image, Button, Switch } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import Navbar from "../../components/Navbar";
import { logout } from "guanggu-forum-api";
import ArrowRightIcon from "../../assets/arrow-right.svg";
import { linkHandler } from "../../utils/linkHandler";
import { getCachedUsername } from "../../utils/currentUser";
import { cacheService, CacheCategory, type CategoryStats } from "../../utils/CacheService";
import AddToDesktopGuide from "../../components/AddToDesktopGuide";
import "./index.scss";

const FEEDBACK_URL = "https://www.guozaoke.com/t/91893";
const GITHUB_URL = "https://github.com/geekeren/GuangGuForum";
const AD_DISABLE_KEY = "ad_disable_until";
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
};

function isAdDisabled(): boolean {
  return cacheService.get<number>(AD_DISABLE_KEY) != null && Date.now() < cacheService.get<number>(AD_DISABLE_KEY)!;
}

export default function Settings() {
  const [showGuide, setShowGuide] = useState(false);
  const [adEnabled, setAdEnabled] = useState(!isAdDisabled());
  const [adLoading, setAdLoading] = useState(false);
  const videoAdRef = useRef<Taro.RewardedVideoAd | null>(null);

  useEffect(() => {
    // setAdEnabled(!isAdDisabled());

    // 创建激励视频广告实例
    if (Taro.createRewardedVideoAd) {
      videoAdRef.current = Taro.createRewardedVideoAd({
        adUnitId: REWARDED_AD_UNIT_ID,
      });

      videoAdRef.current.onLoad(() => {
        console.log("激励视频广告加载成功");
      });

      videoAdRef.current.onError((err) => {
        console.error("激励视频广告加载失败", err);
        setAdLoading(false);
        Taro.showToast({ title: "广告加载失败，请稍后重试", icon: "none" });
        setAdEnabled(true);
      });

      videoAdRef.current.onClose((res: { isEnded: boolean }) => {
        setAdLoading(false);
        if (res && res.isEnded) {
          // 用户看完了广告，设置1个月后过期
          const oneMonthLater = Date.now() + 30 * 24 * 60 * 60 * 1000;
          cacheService.set(AD_DISABLE_KEY, oneMonthLater, { category: CacheCategory.Other });
          setAdEnabled(false);
          Taro.showToast({ title: "广告已关闭1个月", icon: "success" });
        } else {
          Taro.showToast({ title: "需看完广告才能关闭", icon: "none" });
          setAdEnabled(true);
        }
      });
    }

    return () => {
      // 销毁广告实例
      if (videoAdRef.current) {
        videoAdRef.current.destroy?.();
      }
    };
  }, []);

  Taro.useShareAppMessage(() => ({
    title: "过早客 - 武汉本地生活社区",
    path: "/pages/home/index",
  }));

  const handleExternalUrl = (url: string) => {
    linkHandler(url);
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

  const [cacheStats, setCacheStats] = useState<CategoryStats[]>([]);

  const refreshCacheStats = () => {
    setCacheStats(cacheService.getAllCategoryStats().filter((s) => s.category !== CacheCategory.System));
  };

  Taro.useDidShow(() => {
    refreshCacheStats();
  });

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const totalSize = cacheStats.reduce((sum, s) => sum + s.size, 0);

  const handleClearCategory = async (cat: CacheCategory, label: string) => {
    const { confirm } = await Taro.showModal({
      title: `清除${label}`,
      content: `确定要清除所有${label}吗？`,
    });
    if (confirm) {
      cacheService.category(cat).clear();
      refreshCacheStats();
      Taro.showToast({ title: `${label}已清除`, icon: "success" });
    }
  };

  const handleClearAll = async () => {
    const { confirm } = await Taro.showModal({
      title: "清除缓存",
      content: "确定要清除所有可清除的缓存吗？登录状态等数据将保留。",
    });
    if (confirm) {
      cacheService.clearAll(true);
      refreshCacheStats();
      Taro.showToast({ title: "缓存已清除", icon: "success" });
    }
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
      Taro.reLaunch({ url: "/pages/home/index" });
    }
  };

  const handleAdSwitchChange = async (value: boolean) => {
    if (!value) {
      // 关闭广告需要看激励广告
      const { confirm } = await Taro.showModal({
        title: "关闭广告",
        content: "观看激励视频广告后可关闭广告1个月",
        confirmText: "观看广告",
        cancelText: "取消",
      });
      if (!confirm) return;

      setAdLoading(true);

      if (videoAdRef.current) {
        videoAdRef.current
          .show()
          .catch(() => {
            // 失败重试
            videoAdRef.current
              ?.load()
              .then(() => videoAdRef.current?.show())
              .catch((err) => {
                console.error("激励视频广告显示失败", err);
                Taro.showToast({ title: "广告加载失败，请稍后重试", icon: "none" });
                setAdLoading(false);
              });
          });
      } else {
        Taro.showToast({ title: "当前环境不支持激励广告", icon: "none" });
        setAdLoading(false);
      }
    } else {
      // 开启广告
      cacheService.remove(AD_DISABLE_KEY, true);
      setAdEnabled(true);
      Taro.showToast({ title: "广告已开启", icon: "success" });
    }
  };

  const getAdSwitchDesc = () => {
    if (adEnabled) return "";
    const disableUntil = cacheService.get<number>(AD_DISABLE_KEY);
    if (!disableUntil) return "";
    const remainDays = Math.ceil((disableUntil - Date.now()) / (24 * 60 * 60 * 1000));
    if (remainDays <= 0) return "";
    return `已关闭 ${remainDays} 天`;
  };

  const isLoggedIn = !!getCachedUsername();

  const sections: MenuItem[][] = [
    [
      { label: "意见反馈", desc: FEEDBACK_URL, action: () => handleExternalUrl(FEEDBACK_URL) },
      { label: "开源地址", desc: "GitHub", action: () => handleExternalUrl(GITHUB_URL) },
    ],
    [
      // { label: "广告管理", switchControl: true, switchValue: adEnabled, onSwitchChange: handleAdSwitchChange, switchDesc: getAdSwitchDesc(), noArrow: true },
      { label: "推荐给朋友", shareButton: true, noArrow: true },
      { label: "添加到桌面", action: handleAddToDesktop, noArrow: true },
    ],
  ];

  return (
    <View className="settingsPage">
      <Navbar title="设置" back />
      <View className="settingsBody">
        {sections.map((group, gi) => (
          <View className="settingsGroup" key={gi}>
            {group.map((item, ii) => (
              <View
                key={ii}
                className={`settingsItem ${item.danger ? "settingsItem--danger" : ""}`}
                onClick={item.action}
              >
                {item.shareButton ? (
                  <Button className="settingsItemBtn" open-type="share">
                    <Text className="settingsItemLabel">{item.label}</Text>
                  </Button>
                ) : item.switchControl ? (
                  <>
                    <View className="settingsItemLeft">
                      <Text className="settingsItemLabel">{item.label}</Text>
                      {item.switchDesc && <Text className="settingsItemDesc">{item.switchDesc}</Text>}
                    </View>
                    <View>
                      <Switch
                        onClick={(e) => { item.onSwitchChange?.(!item.switchValue); }}
                        checked={item.switchValue}
                        disabled={adLoading}
                        color='#1f69ff'
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <View className="settingsItemLeft">
                      <Text className="settingsItemLabel">{item.label}</Text>
                      {item.desc && <Text className="settingsItemDesc">{item.desc}</Text>}
                    </View>
                    {!item.noArrow && (
                      <Image src={ArrowRightIcon} svg className="settingsItemArrow" />
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
        ))}

        <View className="cacheCard">
          <View className="cacheHeader">
            <Text className="cacheHeaderLabel">本地缓存</Text>
            <Text className="cacheHeaderSize">{formatSize(totalSize)}</Text>
          </View>
          {cacheStats.length > 0 ? (
            cacheStats.map((stat) => (
              <View
                key={stat.category}
                className="cacheRow"
                onClick={() => handleClearCategory(stat.category, stat.label)}
              >
                <Text className="cacheRowLabel">{stat.label}</Text>
                <View className="cacheRowRight">
                  <Text className="cacheRowSize">{formatSize(stat.size)}</Text>
                  <Text className="cacheRowCount">{stat.count} 项</Text>
                </View>
              </View>
            ))
          ) : (
            <View className="cacheRow cacheRow--empty">
              <Text className="cacheRowLabel" style={{ color: "var(--text-faint, #a0a8b8)" }}>暂无缓存</Text>
            </View>
          )}
          <View className="cacheRow cacheRow--action" onClick={handleClearAll}>
            <Text className="cacheActionText">清除可清除缓存</Text>
          </View>
        </View>

        {isLoggedIn && (
          <View className="settingsGroup">
            <View className="settingsItem settingsItem--danger" onClick={handleLogout}>
              <Text className="settingsItemLabel">退出登录</Text>
            </View>
          </View>
        )}

        <View className="settingsFooter">
          <Text className="settingsFooterText">过早客 · 武汉本地生活社区</Text>
        </View>
      </View>

      {showGuide && <AddToDesktopGuide force onClose={() => setShowGuide(false)} />}
    </View>
  );
}
