import { View, Text } from '@tarojs/components'
import { getNavInfo } from "../../utils/dimension";
import './index.scss';
import { AtIcon } from "taro-ui";
import { useEffect } from "react";

interface Props {
  onClickSearch: () => void;
}
const Navbar = (props: Props) => {
  const { onClickSearch } = props;
  const {capsulePaddingTop, capsuleHeight, capsuleLeft, screenWidth} = getNavInfo();
  useEffect(() => {
    const intervalId = setInterval(() => {

    }, 3000);

    return () => {
      clearInterval(intervalId);
    }

  }, []);

  return (<View style={{
    paddingTop: getNavInfo().statusBarHeight + 'px',
  }}
  >
    <View style={{
      padding: `${capsulePaddingTop}px ${screenWidth- capsuleLeft}px ${capsulePaddingTop}px 14px`,
      height: capsuleHeight,
    }}
    >
      <View className='searchEntry' onClick={onClickSearch}>
        <AtIcon value='search' size='16' color='#333' />
        <Text className='text'>猜你喜欢：过早客支持微信小程序，开发如火如荼中</Text>
      </View>
    </View>
  </View>);
}
export default Navbar;
