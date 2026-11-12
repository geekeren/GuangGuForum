import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getMessageConversations, type MessageConversationPage, type MessageSummary } from 'guanggu-forum-api';
import ThemePage from '../../components/ThemePage';
import Navbar from '../../components/Navbar';
import UserAvatar from '../../components/UserAvatar';
import LoginPrompt from '../../components/LoginPrompt';
import Loading from '../../components/Loading';
import ThemedIcon from '../../components/ThemedIcon';
import { Envelope as MessageIcon } from "gzk-ui/icons";
import { usePageScrollViewType } from '../../hooks/usePageRenderer';
import { getCachedUsername } from '../../utils/currentUser';
import { APP_ROUTES } from '../../utils/appRoutes';
import { groupMessageConversations, type PrivateMessageGroup } from '../../utils/privateMessageGroups';
import { usePrivatePage } from './usePrivatePage';
import { privateMessageMemory } from './privateMemory';
import { mergeById, messageErrorText } from './privateState';
import { emptyPrivateBuckets, PRIVATE_BUCKETS, PRIVATE_GROUP_EVENT, privateGroupNavigation, type PrivateBucketState } from './privateGroupState';
import { usePrivateRefresher } from './usePrivateRefresher';
import './index.scss';

interface ListState {
  buckets: Record<0 | 1, PrivateBucketState>;
}
export const emptyList = (): ListState => ({ buckets: emptyPrivateBuckets() });
interface MessageListProps {
  active?: boolean;
  embedded?: boolean;
  initialBucket?: 0 | 1; // Legacy entry hints now open the same unified list.
  header?: (summary: MessageSummary | null) => ReactNode;
}

export function MessageConversationList({ active = true, embedded = false, header }: MessageListProps = {}) {
  const scrollType = usePageScrollViewType();
  const { store, snapshot, data, summary, ready, username, loading: checkingLogin, error: loginError, identityError, refresh } = usePrivatePage(emptyList, active);
  const flights = useRef(new Map<0 | 1, { generation: number; account: string; uid: number; more: boolean; promise: Promise<void> }>());
  const load = useCallback((bucket: 0 | 1, more = false): Promise<void> | undefined => {
    if (!store.isVisible() || !store.snapshot().verified) return;
    const scope = store.snapshot();
    const sameScope = () => store.isVisible() && store.snapshot().verified && store.snapshot().generation === scope.generation
      && store.snapshot().account === scope.account && store.snapshot().uid === scope.uid;
    const pending = flights.current.get(bucket);
    if (pending && pending.generation === scope.generation && pending.account === scope.account && pending.uid === scope.uid) {
      // A pull joins a real first-page GET; a pending continuation must finish
      // before a fresh first page can replace it, without superseding its lane.
      if (!more && pending.more) return pending.promise.then(() => sameScope() ? load(bucket) : undefined);
      return pending.promise;
    }
    const previous = scope.data.buckets[bucket];
    if (more && !previous.cursor) return;
    const cursor = more ? previous.cursor : null;
    let settle!: () => void;
    const flight = { generation: scope.generation, account: scope.account, uid: scope.uid, more,
      promise: new Promise<void>(resolve => { settle = resolve; }) };
    // Publish the flight before synchronous store subscribers can reenter load.
    flights.current.set(bucket, flight);
    store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket], loading: !more && !previous.completed, loadingMore: more, error: '' } } }));
    void store.read(`list:${bucket}`, () => getMessageConversations({ bucket, ...(cursor ? { cursor } : {}) }), page => {
      if (!sameScope()) return;
      if (!more) privateMessageMemory.put(scope.uid, `list:${bucket}`, page);
      store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket],
        items: more ? mergeById(value.buckets[bucket].items, page.items) : page.items,
        cursor: page.next_cursor && page.next_cursor !== cursor ? page.next_cursor : null,
        loading: false, loadingMore: false, error: '', retryMore: false, completed: true } } }));
    }, error => { if (sameScope()) store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket],
      loading: false, loadingMore: false, retryMore: more, error: messageErrorText(error) } } })); })
      .catch(() => { /* Never expose arbitrary callback errors or leave a native pull pending. */ })
      .finally(() => { if (flights.current.get(bucket) === flight) flights.current.delete(bucket); settle(); });
    return flight.promise;
  }, [store]);

  useEffect(() => {
    if (!ready) return;
    const uid = store.snapshot().uid;
    const releases = PRIVATE_BUCKETS.map(bucket => {
      const release = privateMessageMemory.protect(uid, `list:${bucket}`, snapshot.verified);
      const cached = privateMessageMemory.get<MessageConversationPage>(uid, `list:${bucket}`, undefined, snapshot.verified);
      if (cached) store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket], items: cached.items, cursor: cached.next_cursor, completed: true } } }));
      if (snapshot.verified) load(bucket);
      return release;
    });
    return () => releases.forEach(release => release());
  }, [ready, snapshot.generation, snapshot.uid, snapshot.verified, store, load]);

  const groups = groupMessageConversations(data.buckets[0].items, data.buckets[1].items);
  const lanes = PRIVATE_BUCKETS.map(bucket => data.buckets[bucket]);
  const busy = lanes.some(lane => lane.loading || lane.loadingMore);
  const refresher = usePrivateRefresher(store, () => true,
    () => Promise.all(PRIVATE_BUCKETS.map(bucket => load(bucket))));
  const openThread = (group: PrivateMessageGroup) => {
    if (!store.isVisible()) return;
    const current = store.snapshot();
    const event = privateGroupNavigation(current.account, current.uid, group.peer.uid, group.conversations);
    void Taro.navigateTo({ url: `${APP_ROUTES.messageThread}?cid=${group.latest.id}&peer=${group.peer.uid}`,
      success: result => {
        if (getCachedUsername() === current.account && store.snapshot().generation === current.generation) result.eventChannel?.emit(PRIVATE_GROUP_EVENT, event);
      } });
  };

  return <View className={`privateMessagesPage ${embedded ? 'privateMessagesPage--embedded' : ''}`}>
    {!embedded && <Navbar back title='私信' titleStyle={{ opacity: 1, transform: 'none' }} shared={false} />}
    {header?.(summary)}
    {!username ? <View className='privateMessageStatus'>
      {checkingLogin ? <Loading /> : <LoginPrompt icon='私信' title='登录后查看私信' desc='私信内容仅在登录后可见' />}
      {loginError && <Text className='privateMessageAction' onClick={refresh}>账号加载失败，点击重试</Text>}
    </View> : identityError ? <View className='privateMessageStatus'><Text className='privateMessageError' onClick={refresh}>私信账号校验失败，点击重试</Text></View> : !ready ? <View className='privateMessageStatus' /> : <>
      {summary?.restriction_reason && <Text className='privateMessageNotice'>{summary.restriction_reason}</Text>}
      <ScrollView className='privateMessageList' type={scrollType} scrollY enhanced refresherEnabled={snapshot.verified} refresherBackground='transparent' {...refresher} onScrollToLower={() => PRIVATE_BUCKETS.forEach(bucket => load(bucket, true))}>
        {PRIVATE_BUCKETS.map(bucket => data.buckets[bucket].error && <Text key={`error:${bucket}`} className='privateMessageError' onClick={() => load(bucket, data.buckets[bucket].retryMore)}>{bucket === 0 ? '会话记录' : '请求记录'}：{data.buckets[bucket].error}，点击重试</Text>)}
        {groups.length === 0 && lanes.some(lane => !lane.completed) ? null
          : groups.length === 0 && lanes.every(lane => lane.completed && !lane.error) ? <View className='privateMessageEmpty'>
            <ThemedIcon src={MessageIcon} tone='accent-text' className='privateMessageEmptyIcon' />
            <Text className='privateMessageEmptyTitle'>暂无私信</Text><Text className='privateMessageMuted'>会话与消息请求会按联系人显示在这里</Text>
          </View> : groups.map(group => <View key={group.peer.uid} className='privateConversation' onClick={() => openThread(group)}>
            <UserAvatar username={group.peer.username} src={group.peer.avatar} size={96} className='privateConversationAvatar' style={{ borderRadius: '50%', overflow: 'hidden' }} onClick={event => {
              event.stopPropagation();
              const current = store.snapshot();
              if (!group.peer.username || !store.isVisible() || current.generation !== snapshot.generation || current.account !== snapshot.account) return;
              void Taro.navigateTo({ url: `/pages/user/index?username=${encodeURIComponent(group.peer.username)}` });
            }} />
            <View className='privateConversationBody'>
              <View className='privateConversationHeading'><Text className='privateConversationName' maxLines={1} overflow='ellipsis'>{group.peer.display_name.trim() || group.peer.username}</Text></View>
              <Text className='privateConversationPreview' maxLines={1} overflow='ellipsis'>{group.latest.preview || '暂无消息内容'}</Text>
            </View>
            <View className='privateConversationMeta'><Text className='privateMessageTime' maxLines={1} overflow='ellipsis'>{group.latest.updated}</Text>
              {group.unread > 0 && <Text className='privateMessageCount'>{group.unread > 99 ? '99+' : group.unread}</Text>}
            </View>
          </View>)}
        {groups.length > 0 && lanes.some(lane => lane.loadingMore) && !refresher.refresherTriggered && <Text className='privateMessageFooter'>加载中…</Text>}
        {!busy && lanes.some(lane => lane.cursor) && <Text className='privateMessageFooter privateMessageAction' onClick={() => PRIVATE_BUCKETS.forEach(bucket => load(bucket, true))}>加载更多</Text>}
      </ScrollView>
    </>}
  </View>;
}

export default function MessagesPage() { return <ThemePage><MessageConversationList /></ThemePage>; }
