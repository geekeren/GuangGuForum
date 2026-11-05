import { Image, View } from '@tarojs/components';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { getFromLocalCache } from '../../utils/localAssets';
import { DEFAULT_USER_AVATAR_SOURCE, userAvatarSource } from '../../utils/userAvatarSource';
import AiUserTag from '../AiUserTag';
import './index.scss';

type Props = Omit<ComponentProps<typeof Image>, 'children'> & {
  username?: string;
  size?: number;
  imageClassName?: string;
  compactAiTag?: boolean;
  children?: ReactNode;
};

export default function UserAvatar({ username, size = 54, src, className = '', style, imageClassName = '', compactAiTag = true, children, onClick, onError, svg, mode = 'aspectFill', ...imageProps }: Props) {
  const normalizedSource = userAvatarSource(src);
  const [failedSource, setFailedSource] = useState<string>();
  useEffect(() => { setFailedSource(undefined); }, [src]);
  const source = failedSource === normalizedSource ? DEFAULT_USER_AVATAR_SOURCE : normalizedSource;
  return <View className={`userAvatar${size <= 36 ? ' userAvatar--small' : ''} ${className}`}
    style={typeof style === 'string' ? `width:${size}rpx;height:${size}rpx;${style}` : { width: size + 'rpx', height: size + 'rpx', ...style }} onClick={onClick}>
    <Image {...imageProps} src={getFromLocalCache(source)} svg={source === DEFAULT_USER_AVATAR_SOURCE || (svg ?? false)}
      onError={event => { setFailedSource(normalizedSource); onError?.(event); }}
      mode={mode} className={`userAvatarImage ${imageClassName}`} style={{ width: '100%', height: '100%' }} />
    <AiUserTag username={username} compact={compactAiTag} className={`userAvatarTag${compactAiTag ? '' : ' userAvatarTag--full'}`} />
    {children}
  </View>;
}
