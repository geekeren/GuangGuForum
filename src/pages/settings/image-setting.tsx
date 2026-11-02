import { ScrollView, Switch, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import Navbar from '../../components/Navbar';
import { getScrollViewType, isSkyline } from '../../utils/renderer';
import { isImageCompressionEnabled, setImageCompressionEnabled } from '../../utils/imageCompressionPreferences';
import ImageHostSettings from './ImageHostSettings';
import './index.scss';
import './image-setting.scss';

export default function ImageSettings() {
  const skyline = isSkyline();
  const [compressionEnabled, updateCompressionEnabled] = useState(isImageCompressionEnabled);

  Taro.useDidShow(() => updateCompressionEnabled(isImageCompressionEnabled()));

  const changeCompression = (enabled: boolean) => {
    if (setImageCompressionEnabled(enabled)) updateCompressionEnabled(enabled);
    else Taro.showToast({ title: '图片压缩设置保存失败', icon: 'none' });
  };

  return <View className={`settingsPage imageSettingsPage${skyline ? ' settingsPage--skyline' : ''}`}>
    <Navbar shared={false} back title='图床设置' titleStyle={{ opacity: 1 }} />
    <ScrollView type={getScrollViewType()} scrollY className='settingsBody'>
      <ImageHostSettings />
      <View className='settingsGroup'>
        <View className='settingsItem imageCompressionSetting'>
          <View className='settingsItemLeft'>
            <Text className='settingsItemLabel'>图片压缩</Text>
            <Text className='settingsItemDesc'>开启压缩可以节省图床额度</Text>
          </View>
          <Switch checked={compressionEnabled} color='#1f69ff' ariaLabel='图片压缩'
            onChange={event => changeCompression(event.detail.value)} />
        </View>
        <Text className='imageCompressionHint'>拍照或选择照片后自动压缩，保持原比例，宽高不超过 1920 px。关闭后使用原图。</Text>
      </View>
    </ScrollView>
  </View>;
}
