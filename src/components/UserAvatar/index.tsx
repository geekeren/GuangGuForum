import { Image, View } from '@tarojs/components';
import type { ComponentProps, ReactNode } from 'react';
import { getFromLocalCache } from '../../utils/localAssets';
import AiUserTag from '../AiUserTag';
import './index.scss';

type Props = Omit<ComponentProps<typeof Image>, 'children'> & {
  username?: string;
  size?: number;
  imageClassName?: string;
  compactAiTag?: boolean;
  children?: ReactNode;
};

export default function UserAvatar({ username, size = 54, src, className = '', style, imageClassName = '', compactAiTag = true, children, onClick, svg, mode = 'aspectFill', ...imageProps }: Props) {
  const source = src || '/static/m_default.png';
  return <View className={`userAvatar${size <= 36 ? ' userAvatar--small' : ''} ${className}`}
    style={{ width: size + 'rpx', height: size + 'rpx', ...style }} onClick={onClick}>
    <Image {...imageProps} src={getFromLocalCache(source)} svg={svg ?? source.endsWith('/m_default.png')}
      mode={mode} className={`userAvatarImage ${imageClassName}`} style={{ width: '100%', height: '100%' }} />
    <AiUserTag username={username} compact={compactAiTag} className={`userAvatarTag${compactAiTag ? '' : ' userAvatarTag--full'}`} />
    {children}
  </View>;
}
