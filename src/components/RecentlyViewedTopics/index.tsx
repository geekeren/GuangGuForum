import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import UserAvatar from '../UserAvatar';
import { getCachedUsername } from '../../utils/currentUser';
import { getLocalRecentlyViewedTopics, subscribeRecentlyViewedTopics } from '../../utils/recentlyViewedTopics';
import { usePageRenderer } from '../../hooks/usePageRenderer';
import './index.scss';

export default function RecentlyViewedTopics({ username, active }: { username: string; active: boolean }) {
  const [snapshot, setSnapshot] = useState(() => ({ account: username, topics: getLocalRecentlyViewedTopics(username) }));
  useEffect(() => {
    const update = () => {
      if (getCachedUsername() === username) setSnapshot({ account: username, topics: getLocalRecentlyViewedTopics(username) });
    };
    update();
    return subscribeRecentlyViewedTopics(update);
  }, [username, active]);

  const skyline = usePageRenderer() === 'skyline';
  // Hide old-account state before effects run when the parent changes its account scope.
  const sameAccount = getCachedUsername() === username;
  const topics = sameAccount && snapshot.account === username ? snapshot.topics : [];
  if (!sameAccount) return <Text className='emptyTip'>登录状态已变化，请重新进入“我的”</Text>;
  return <View className='recentlyViewedTopics'>
    <View className='recentViewedHeader'>
      <Text className='recentViewedSummary'>{topics.length ? `${topics.length} 条 · 最多保留 200 条` : '最多保留 200 条浏览记录'}</Text>
    </View>
    {topics.length ? topics.map(topic => <View className='recentViewedItem' key={topic.tid} onClick={() => {
      if (getCachedUsername() === username) void Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${topic.tid}` });
    }}>
      <UserAvatar src={topic.avatarUrl} username={topic.author} size={54} />
      <View className='recentViewedItemBody'>
        <Text className='recentViewedTitle' {...(skyline ? { maxLines: 2, overflow: 'ellipsis' } as const : {})}>{topic.title}</Text>
        {!!topic.viewedAt && <Text className='recentViewedTime'>{new Date(topic.viewedAt).toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}</Text>}
      </View>
    </View>) : <Text className='emptyTip'>暂无浏览记录，进入帖子后会显示在这里</Text>}
  </View>;
}
