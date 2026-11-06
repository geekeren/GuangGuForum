import { View, Text } from "@tarojs/components";
import "./index.scss";

export interface GzkLoadingProps {
  size?: number;
  fullscreen?: boolean;
  className?: string;
  labelClassName?: string;
}

export function GzkLoading({ size = 32, fullscreen = false, className = "", labelClassName = "" }: GzkLoadingProps) {
  const spinnerSize = size + "px";
  return (
    <View className={`gzkLoading${fullscreen ? " gzkLoading--fullscreen" : ""}${className ? ` ${className}` : ""}`}>
      <View className="gzkLoadingSpinner" style={{ width: spinnerSize, height: spinnerSize }}>
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
        <View className="gzkLoadingBlade" />
      </View>
      <Text className={`gzkLoadingLabel${labelClassName ? ` ${labelClassName}` : ""}`}>加载中...</Text>
    </View>
  );
}
