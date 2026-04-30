import { View, Text } from "@tarojs/components";
import "./index.scss";

interface LoadingInterface {
  size?: number;
}
const Loading = (props: LoadingInterface) => {
  const { size = 60 } = props;
  return (
    <View className="loading" style={{ "--spinner-size": size + "px" } as any}>
      <View className="spinner" />
      <Text className="tip">加载中...</Text>
    </View>
  );
};
export default Loading;
