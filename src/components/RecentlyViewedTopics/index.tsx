import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useRef, useState } from 'react';
import { clearRecentlyViewedTopics, getRecentlyViewedTopics, RecentlyViewedTopicsError } from 'guanggu-forum-api';
import UserAvatar from '../UserAvatar';
import { getCachedUsername } from '../../utils/currentUser';
import { clearLocalRecentlyViewedTopics, getLocalRecentlyViewedTopics, mergeRecentlyViewedTopics, subscribeRecentlyViewedTopics } from '../../utils/recentlyViewedTopics';
import { isSkyline } from '../../utils/renderer';
import './index.scss';

export default function RecentlyViewedTopics({ username, active }: { username: string; active: boolean }) {
  const [topics, setTopics] = useState(() => getLocalRecentlyViewedTopics(username));
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const revision = useRef(0);
  const visible = useRef(active);
  const clearingRef = useRef(false);
  visible.current = active;
  const sameAccount = () => getCachedUsername() === username;

  useEffect(() => subscribeRecentlyViewedTopics(() => {
    if (sameAccount()) setTopics(getLocalRecentlyViewedTopics(username));
  }), [username]);

  useEffect(() => {
    const token = ++revision.current;
    if (!active || clearingRef.current || !sameAccount()) return;
    setTopics(getLocalRecentlyViewedTopics(username));
    setError('');
    if (!username) return;
    setLoading(true);
    void getRecentlyViewedTopics(username).then(result => {
      if (revision.current !== token || !visible.current || !sameAccount()) return;
      setTopics(mergeRecentlyViewedTopics(result.topics, username));
    }).catch(failure => {
      if (revision.current === token && visible.current && sameAccount()) {
        setError(failure instanceof RecentlyViewedTopicsError ? failure.message : '服务器记录读取失败，已保留本地浏览记录');
      }
    }).finally(() => {
      if (revision.current === token) setLoading(false);
    });
    return () => { revision.current++; };
  }, [active, username, attempt]);

  const clear = async () => {
    if (clearingRef.current || !sameAccount()) return;
    clearingRef.current = true;
    const token = ++revision.current;
    setClearing(true);
    setLoading(false);
    try {
      const { confirm } = await Taro.showModal({
        title: '清除最近浏览', content: username ? '将清除当前账号的本地和服务器浏览记录，确定继续？' : '将清除本机的浏览记录，确定继续？', confirmText: '清除',
      });
      if (!confirm || revision.current !== token || !sameAccount()) return;
      if (username) {
        // Fetch a current form rather than reusing an expired XSRF token.
        const latest = await getRecentlyViewedTopics(username);
        if (revision.current !== token || !sameAccount()) return;
        await clearRecentlyViewedTopics(username, latest.clearForm);
      }
      if (revision.current !== token || !sameAccount()) return;
      if (!clearLocalRecentlyViewedTopics(username)) {
        setError(username ? '服务器记录已清除，本地记录清理失败，请重试' : '本地记录清理失败，请重试');
        Taro.showToast({ title: '本地记录清理失败，请重试', icon: 'none' });
        return;
      }
      setTopics([]);
      setError('');
      Taro.showToast({ title: '浏览记录已清除', icon: 'success' });
    } catch (failure) {
      if (revision.current === token && sameAccount()) {
        setError(failure instanceof RecentlyViewedTopicsError ? failure.message : '清除失败，浏览记录已保留');
        Taro.showToast({ title: '清除未完成，请刷新后重试', icon: 'none' });
      }
    } finally {
      clearingRef.current = false;
      setClearing(false);
    }
  };

  const skyline = isSkyline();
  if (!sameAccount()) return <Text className='emptyTip'>登录状态已变化，请重新进入“我的”</Text>;
  return <View className='recentlyViewedTopics'>
    <View className='recentViewedHeader'>
      <Text className='recentViewedSummary'>{topics.length ? `${topics.length} 条 · 最多保留 200 条` : '最多保留 200 条浏览记录'}</Text>
      <Button className='recentViewedClear' disabled={clearing || !topics.length} loading={clearing} onClick={clear}>清除</Button>
    </View>
    {loading && <Text className='recentViewedNotice'>正在同步服务器记录…</Text>}
    {error && <View className='recentViewedError' onClick={() => { if (!clearing) setAttempt(value => value + 1); }}>
      <Text>{error}，点击重试</Text>
    </View>}
    {topics.length ? topics.map(topic => <View className='recentViewedItem' key={topic.tid} onClick={() => {
      Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${topic.tid}` });
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
