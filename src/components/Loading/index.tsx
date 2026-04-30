import { View, Text } from "@tarojs/components";
import "./index.scss";

interface LoadingInterface {
  size?: number;
  fullscreen?: boolean;
}
const Loading = (props: LoadingInterface) => {
  const { size = 60, fullscreen = false } = props;
  const spinnerSize = size + "px";
  return (
    <View className={`loading ${fullscreen ? "loading--fullscreen" : ""}`}>
      <View className="spinner" style={{ width: spinnerSize, height: spinnerSize }}>
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
        <View className="spinnerBlade" />
      </View>
      <Text className="tip">加载中...</Text>
    </View>
  );
};
export default Loading;
