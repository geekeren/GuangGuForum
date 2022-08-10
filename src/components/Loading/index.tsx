import { AtActivityIndicator } from 'taro-ui'
import { View } from "@tarojs/components";
import "taro-ui/dist/style/components/activity-indicator.scss";
import 'taro-ui/dist/style/components/loading.scss';

interface LoadingInterface {
  size?: number
}
const Loading = (props: LoadingInterface) => {
  const { size = 60 } = props;
  return <View style={{ fontSize: 0.6 * size }}>
    <AtActivityIndicator size={size} mode='center' content='加载中....' />
  </View>;
}
export default Loading;
