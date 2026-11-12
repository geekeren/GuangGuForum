import { useCallback, useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { cacheService } from "../../utils/CacheService";
import { AD_DISABLE_KEY, disableAd, isAdDisabled, getAdDisabledDays } from "../../utils/ad";

const REWARDED_AD_UNIT_ID = "adunit-d0ac20b3f633671e";

export function useRewardedAd() {
  const [adEnabled, setAdEnabled] = useState(() => !isAdDisabled());
  const [adLoading, setAdLoading] = useState(false);
  const videoAdRef = useRef<Taro.RewardedVideoAd | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const operation = useRef(0);

  const finish = useCallback(() => {
    busy.current = false;
    operation.current++;
    if (mounted.current) setAdLoading(false);
  }, []);
  const showFailure = useCallback((title: string) => {
    if (!mounted.current) return;
    finish();
    setAdEnabled(!isAdDisabled());
    Taro.showToast({ title, icon: "none" });
  }, [finish]);

  useEffect(() => {
    mounted.current = true;
    setAdEnabled(!isAdDisabled());
    const ad = Taro.createRewardedVideoAd?.({ adUnitId: REWARDED_AD_UNIT_ID });
    videoAdRef.current = ad ?? null;
    const onError = () => {
      if (mounted.current && busy.current) showFailure("广告加载失败，请稍后重试");
    };
    const onClose = (result: { isEnded: boolean }) => {
      if (!mounted.current || !busy.current) return;
      finish();
      if (!result?.isEnded) {
        setAdEnabled(!isAdDisabled());
        Taro.showToast({ title: "需看完广告才能关闭", icon: "none" });
      } else if (disableAd(30)) {
        setAdEnabled(false);
        Taro.showToast({ title: "广告已关闭30天", icon: "success" });
      } else {
        showFailure("免广告设置保存失败，请重试");
      }
    };
    ad?.onError(onError);
    ad?.onClose(onClose);
    return () => {
      mounted.current = false;
      finish();
      videoAdRef.current = null;
      ad?.offError(onError);
      ad?.offClose(onClose);
      ad?.destroy?.();
    };
  }, [finish, showFailure]);

  Taro.useDidShow(() => setAdEnabled(!isAdDisabled()));

  const handleAdSwitchChange = async (value: boolean) => {
    if (!mounted.current || busy.current) return;
    // Lock synchronously, including the confirmation sheet and persistence call.
    busy.current = true;
    setAdLoading(true);
    const revision = ++operation.current;
    const active = () => mounted.current && revision === operation.current;
    if (value) {
      try {
        const saved = await cacheService.removeAsync(AD_DISABLE_KEY, true);
        if (!active()) return;
        if (saved) {
          setAdEnabled(true);
          Taro.showToast({ title: "广告已开启", icon: "success" });
        } else {
          showFailure("广告设置保存失败，请重试");
        }
      } catch {
        if (active()) showFailure("广告设置保存失败，请重试");
      } finally {
        if (active()) finish();
      }
      return;
    }

    try {
      const { confirm } = await Taro.showModal({
        title: "关闭广告",
        content: "完整观看激励视频后，可关闭广告30天",
        confirmText: "观看广告",
        cancelText: "取消",
      });
      if (!active()) return;
      if (!confirm) { finish(); return; }
      const ad = videoAdRef.current;
      if (!ad) { showFailure("当前环境不支持激励广告"); return; }
      try {
        await ad.show();
      } catch {
        if (!active()) return;
        await ad.load();
        if (!active()) return;
        await ad.show();
      }
      // Keep the lock until the SDK reports completion or an error.
    } catch {
      if (active()) showFailure("广告加载失败，请稍后重试");
    }
  };

  const remainDays = adEnabled ? 0 : getAdDisabledDays();
  const adSwitchDesc = remainDays > 0 ? `免广告剩余 ${remainDays} 天` : "";
  return { adEnabled, adLoading, handleAdSwitchChange, adSwitchDesc };
}
