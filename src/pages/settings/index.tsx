import { View, Text, Image, Button, Switch } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState, useEffect, useRef } from "react";
import Navbar from "../../components/Navbar";
import { logout } from "guanggu-forum-api";
import ArrowRightIcon from "../../assets/arrow-right.svg";
import { linkHandler } from "../../utils/linkHandler";
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
  const disableUntil = Taro.getStorageSync(AD_DISABLE_KEY);
  if (!disableUntil) return false;
  return Date.now() < disableUntil;
}

export default function Settings() {
  const [showGuide, setShowGuide] = useState(false);
  const [adEnabled, setAdEnabled] = useState(!isAdDisabled());
  const [adLoading, setAdLoading] = useState(false);
  const videoAdRef = useRef<Taro.RewardedVideoAd | null>(null);

  useEffect(() => {
    setAdEnabled(!isAdDisabled());

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
      });

      videoAdRef.current.onClose((res: { isEnded: boolean }) => {
        setAdLoading(false);
        if (res && res.isEnded) {
          // 用户看完了广告，设置1个月后过期
          const oneMonthLater = Date.now() + 30 * 24 * 60 * 60 * 1000;
          Taro.setStorageSync(AD_DISABLE_KEY, oneMonthLater);
          setAdEnabled(false);
          Taro.showToast({ title: "广告已关闭1个月", icon: "success" });
        } else {
          Taro.showToast({ title: "需看完广告才能关闭", icon: "none" });
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

  const handleClearCache = async () => {
    const { confirm } = await Taro.showModal({
      title: "清除缓存",
      content: "确定要清除本地缓存吗？",
    });
    if (confirm) {
      const res = Taro.getStorageInfoSync();
      const KEEP_KEYS = new Set(["cookies", "current_username", "saved_accounts", AD_DISABLE_KEY]);
      res.keys.forEach((key) => {
        if (!KEEP_KEYS.has(key) && !key.startsWith("ggf_auth")) {
          Taro.removeStorage({ key });
        }
      });
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
      Taro.removeStorageSync(AD_DISABLE_KEY);
      setAdEnabled(true);
      Taro.showToast({ title: "广告已开启", icon: "success" });
    }
  };

  // 计算广告关闭剩余时间描述
  const getAdSwitchDesc = () => {
    if (adEnabled) return "";
    const disableUntil = Taro.getStorageSync(AD_DISABLE_KEY);
    if (!disableUntil) return "";
    const remainDays = Math.ceil((disableUntil - Date.now()) / (24 * 60 * 60 * 1000));
    if (remainDays <= 0) return "";
    return `已关闭 ${remainDays} 天`;
  };

  const sections: MenuItem[][] = [
    [
      { label: "意见反馈", desc: FEEDBACK_URL, action: () => handleExternalUrl(FEEDBACK_URL) },
      { label: "开源地址", desc: "GitHub", action: () => handleExternalUrl(GITHUB_URL) },
    ],
    [
      { label: "广告管理", switchControl: true, switchValue: adEnabled, onSwitchChange: handleAdSwitchChange, switchDesc: getAdSwitchDesc(), noArrow: true },
      { label: "推荐给朋友", shareButton: true, noArrow: true },
      { label: "添加到桌面", action: handleAddToDesktop, noArrow: true },
      { label: "清除缓存", action: handleClearCache, noArrow: true },
    ],
    [
      { label: "退出登录", action: handleLogout, danger: true, noArrow: true },
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
                    <Switch
                      checked={item.switchValue}
                      onChange={(e) => item.onSwitchChange?.(e.detail.value)}
                      disabled={adLoading}
                      color="#1f69ff"
                    />
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

        <View className="settingsFooter">
          <Text className="settingsFooterText">过早客 · 武汉本地生活社区</Text>
        </View>
      </View>

      {showGuide && <AddToDesktopGuide force onClose={() => setShowGuide(false)} />}
    </View>
  );
}
