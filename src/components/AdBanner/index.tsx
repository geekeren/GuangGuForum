import { AdCustom } from "@tarojs/components";
import { useEffect, useState } from "react";
import { isAdDisabled } from "../../utils/ad";
import "./index.scss";

interface AdBannerProps {
  unitId: string;
  className?: string;
}

export default function AdBanner({ unitId, className }: AdBannerProps) {
  const [showAd, setShowAd] = useState(!isAdDisabled());

  useEffect(() => {
    // 监听广告状态变化（从设置页返回时刷新）
    const checkAdStatus = () => {
      setShowAd(!isAdDisabled());
    };

    // 页面显示时检查状态
    checkAdStatus();

    // 定期检查状态（处理过期等情况）
    const timer = setInterval(checkAdStatus, 60 * 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  if (!showAd) return null;

  return (
    <AdCustom
      className={className}
      unitId={unitId}
      onLoad={() => console.log("ad onLoad")}
      onError={(e) => console.log("ad onError", e)}
    />
  );
}
