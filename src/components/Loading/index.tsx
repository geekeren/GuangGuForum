import { AtActivityIndicator } from 'taro-ui'
import { View } from "@tarojs/components";
import "taro-ui/dist/style/components/activity-indicator.scss";
import 'taro-ui/dist/style/components/loading.scss';

const Loading = () => {
  return <View style={{fontSize: 40}}>
    <AtActivityIndicator size={60} mode='center' content='加载中....' />
  </View>;
}
export default Loading;
