import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { acceptPrivateMessageRequest, getMessageCompose, getMessageConversations, getMessageThread, getUserProfile, sendPrivateMessage,
  type MessageCompose, type MessageConversation, type MessageConversationPage, type MessageThread } from 'guanggu-forum-api';
import ThemePage from '../../components/ThemePage';
import Navbar from '../../components/Navbar';
import UserAvatar from '../../components/UserAvatar';
import LoginPrompt from '../../components/LoginPrompt';
import Loading from '../../components/Loading';
import { usePageScrollViewType } from '../../hooks/usePageRenderer';
import { groupMessageConversations, isPrivateThreadSendable, orderMessageConversations, orderPrivateMessages, privateMessageKey } from '../../utils/privateMessageGroups';
import { usePrivatePage } from './usePrivatePage';
import { privateMessageMemory } from './privateMemory';
import PrivateMessageComposer from './PrivateMessageComposer';
import { mergeById, messageErrorText, messageSourceRoute, messageStateLabel, messageTextError, positiveRouteId } from './privateState';
import { emptyPrivateBuckets, PRIVATE_BUCKETS, PRIVATE_GROUP_EVENT, validatedPrivateGroupNavigation, type PrivateBucketState, type PrivateGroupNavigation } from './privateGroupState';
import './index.scss';

interface ConversationState {
  thread?: MessageThread;
  loading: boolean;
  loadingMore: boolean;
  error: string;
  retryMore: boolean;
  permissionsFresh: boolean;
}
const emptyConversation = (): ConversationState => ({ loading: false, loadingMore: false, error: '', retryMore: false, permissionsFresh: false });
export interface ThreadState {
  threadsByCid: Record<number, ConversationState>;
  known: MessageConversation[];
  buckets: Record<0 | 1, PrivateBucketState>;
  selectedCid: number;
  targetChosen: boolean;
  selfAvatar?: string;
  compose: MessageCompose | null;
  composeLoading: boolean;
  composeError: string;
  composeFresh: boolean;
  postError: string;
  posting: boolean;
  draft: string;
  notice: string;
}
export const emptyThread = (): ThreadState => ({ threadsByCid: {}, known: [], buckets: emptyPrivateBuckets(), selectedCid: 0, targetChosen: false,
  compose: null, composeLoading: false, composeError: '', composeFresh: false, postError: '', posting: false, draft: '', notice: '' });

async function newClientKey() {
  const result = await Taro.getRandomValues({ length: 16 });
  return Array.from(new Uint8Array(result.randomValues), value => value.toString(16).padStart(2, '0')).join('');
}

function MessageThreadView() {
  const { params } = Taro.useRouter();
  const cid = positiveRouteId(params.cid);
  const peerUid = positiveRouteId(params.peer);
  const recipientId = positiveRouteId(params.to);
  const sourceId = positiveRouteId(params.source);
  const invalidRoute = (!cid && !recipientId) || Boolean(params.cid && !cid) || Boolean(params.to && !recipientId) ||
    Boolean(params.source && !sourceId) || Boolean(params.peer && (!peerUid || !cid));
  const scrollType = usePageScrollViewType();
  const { store, snapshot, data, ready, username, loading: checkingLogin, error: loginError, identityError, refresh } = usePrivatePage(emptyThread);
  const [scrollIntoView, setScrollIntoView] = useState<string | undefined>();
  const pendingNavigation = useRef<{ generation: number; event: PrivateGroupNavigation }>();
  const leases = useRef(new Map<number, () => void>());

  const loadThread = useCallback((conversationId: number, more = false) => {
    const current = store.snapshot();
    const previous = current.data.threadsByCid[conversationId] || emptyConversation();
    if (!store.isVisible() || !current.verified || current.data.posting || invalidRoute || previous.loading || previous.loadingMore ||
      (more && !previous.thread?.has_more)) return;
    const before = more && previous.thread?.messages.length ? Math.min(...previous.thread.messages.map(message => message.seq)) : undefined;
    if (more && !before) return;
    if (!leases.current.has(conversationId)) leases.current.set(conversationId, privateMessageMemory.protect(current.uid, `thread:${conversationId}`, true));
    if (more) setScrollIntoView(undefined);
    store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid, [conversationId]: { ...previous,
      loading: !more, loadingMore: more, error: '', ...(!more ? { permissionsFresh: false } : {}) } } }));
    void store.read(`thread:${conversationId}`, async () => {
      const thread = await getMessageThread({ conversationId, ...(before ? { before } : {}) });
      const expectedPeerUid = peerUid || recipientId;
      if (thread.id !== conversationId || (expectedPeerUid && thread.peer.uid !== expectedPeerUid)) throw { code: 'INVALID_RESPONSE' };
      return thread;
    }, thread => {
      if (!more) {
        privateMessageMemory.put(store.snapshot().uid, `thread:${conversationId}`, thread);
        if (!peerUid) {
          const newest = orderPrivateMessages(thread.messages).slice(-1)[0];
          setScrollIntoView(newest ? `private-message-${conversationId}-${newest.id}` : undefined);
        }
      }
      store.update(value => {
        const old = value.threadsByCid[conversationId] || emptyConversation();
        return { ...value, threadsByCid: { ...value.threadsByCid, [conversationId]: { thread: { ...thread,
          messages: orderPrivateMessages(more && old.thread ? mergeById(old.thread.messages, thread.messages) : thread.messages),
          has_more: thread.has_more && (!more || thread.messages.some(message => message.seq < before!)) },
          loading: false, loadingMore: false, error: '', retryMore: false, permissionsFresh: more ? old.permissionsFresh : true } } };
      });
    }, error => store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid, [conversationId]: {
      ...value.threadsByCid[conversationId], loading: false, loadingMore: false, retryMore: more, error: messageErrorText(error) } } })));
  }, [store, invalidRoute, peerUid, recipientId]);

  const discover = useCallback((items: MessageConversation[]) => {
    if (!peerUid || !store.isVisible()) return;
    const current = store.snapshot();
    const groups = groupMessageConversations(current.data.known, items);
    const found = groups.find(group => group.peer.uid === peerUid)?.conversations || [];
    const newIds = found.filter(item => !current.data.threadsByCid[item.id]).map(item => item.id);
    store.update(value => ({ ...value, known: found, threadsByCid: { ...value.threadsByCid,
      ...Object.fromEntries(newIds.map(id => [id, emptyConversation()])) } }));
    newIds.forEach(id => {
      if (!leases.current.has(id)) leases.current.set(id, privateMessageMemory.protect(current.uid, `thread:${id}`, current.verified));
      const cached = privateMessageMemory.get<MessageThread>(current.uid, `thread:${id}`, undefined, current.verified);
      if (cached?.id === id && cached.peer.uid === peerUid) store.update(value => ({ ...value, threadsByCid: { ...value.threadsByCid,
        [id]: { ...value.threadsByCid[id], thread: cached, permissionsFresh: false } } }));
      if (current.verified) loadThread(id);
    });
  }, [store, peerUid, loadThread]);

  const loadBucket = useCallback((bucket: 0 | 1, more = false) => {
    const current = store.snapshot();
    const previous = current.data.buckets[bucket];
    if (!peerUid || !store.isVisible() || !current.verified || current.data.posting || previous.loading || previous.loadingMore || (more && !previous.cursor)) return;
    const cursor = more ? previous.cursor : null;
    store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...previous, loading: !more, loadingMore: more, error: '' } } }));
    void store.read(`discovery:${bucket}`, () => getMessageConversations({ bucket, ...(cursor ? { cursor } : {}) }), page => {
      if (!more) privateMessageMemory.put(store.snapshot().uid, `list:${bucket}`, page);
      store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket],
        items: [], cursor: page.next_cursor && page.next_cursor !== cursor ? page.next_cursor : null,
        completed: true, loading: false, loadingMore: false, error: '', retryMore: false } } }));
      discover(page.items);
    }, error => store.update(value => ({ ...value, buckets: { ...value.buckets, [bucket]: { ...value.buckets[bucket],
      loading: false, loadingMore: false, retryMore: more, error: messageErrorText(error) } } })));
  }, [store, peerUid, discover]);

  const loadCompose = useCallback(() => {
    const current = store.snapshot();
    if (!recipientId || invalidRoute || !store.isVisible() || !current.verified || current.data.posting || current.data.composeLoading) return;
    store.update(value => ({ ...value, composeLoading: true, composeError: '', composeFresh: false }));
    void store.read('compose', () => getMessageCompose({ recipientId, ...(sourceId ? { sourceId } : {}) }), compose => {
      store.update(value => ({ ...value, compose, composeLoading: false, composeFresh: true, composeError: '', selectedCid: compose.conversation_id }));
      if (compose.conversation_id) loadThread(compose.conversation_id);
    }, error => store.update(value => ({ ...value, composeLoading: false, composeError: messageErrorText(error) })));
  }, [store, recipientId, sourceId, invalidRoute, loadThread]);

  // The opener event is just metadata. Only this page's fresh summary can authorize use of its UID.
  useEffect(() => {
    if (!peerUid) return;
    const channel = Taro.getCurrentInstance?.().page?.getOpenerEventChannel?.();
    const receive = (value: unknown) => {
      const current = store.snapshot();
      if (!store.isVisible()) return;
      const event = validatedPrivateGroupNavigation(value, current.account, peerUid);
      if (!event) return;
      pendingNavigation.current = { generation: current.generation, event };
      if (current.verified && current.uid === event.uid) discover(event.conversations);
    };
    channel?.on?.(PRIVATE_GROUP_EVENT, receive);
    return () => { channel?.off?.(PRIVATE_GROUP_EVENT, receive); pendingNavigation.current = undefined; };
  }, [store, peerUid, discover]);

  useEffect(() => {
    const releaseAll = () => { leases.current.forEach(release => release()); leases.current.clear(); };
    releaseAll();
    if (!ready || invalidRoute) return;
    const current = store.snapshot();
    if (cid) {
      leases.current.set(cid, privateMessageMemory.protect(current.uid, `thread:${cid}`, current.verified));
      const cached = privateMessageMemory.get<MessageThread>(current.uid, `thread:${cid}`, undefined, current.verified);
      store.update(value => ({ ...value, selectedCid: value.selectedCid || cid, threadsByCid: { ...value.threadsByCid,
        [cid]: { ...emptyConversation(), ...(cached?.id === cid && (!(peerUid || recipientId) || cached.peer.uid === (peerUid || recipientId)) ? { thread: cached } : {}) } } }));
    }
    if (peerUid) {
      PRIVATE_BUCKETS.forEach(bucket => {
        leases.current.set(-bucket - 1, privateMessageMemory.protect(current.uid, `list:${bucket}`, current.verified));
        const cached = privateMessageMemory.get<MessageConversationPage>(current.uid, `list:${bucket}`, undefined, current.verified);
        if (cached) discover(cached.items);
      });
      const navigation = pendingNavigation.current;
      if (current.verified && navigation?.generation === current.generation && navigation.event.uid === current.uid) discover(navigation.event.conversations);
    }
    if (current.verified) {
      if (cid) loadThread(cid);
      else loadCompose();
      if (peerUid) {
        // Existing memory discoveries need their own fresh GET after an unverified render.
        Object.keys(store.snapshot().data.threadsByCid).map(Number).filter(id => id !== cid).forEach(id => loadThread(id));
        PRIVATE_BUCKETS.forEach(bucket => loadBucket(bucket));
      }
    }
    return releaseAll;
  }, [ready, snapshot.generation, snapshot.uid, snapshot.verified, cid, peerUid, invalidRoute, store, discover, loadThread, loadBucket, loadCompose]);

  useEffect(() => {
    if (!ready || !snapshot.verified || invalidRoute) return;
    const account = store.snapshot().account;
    void store.read('self-avatar', () => getUserProfile({ username: account }, { cache: false }), profile => {
      let decoded = account;
      try { decoded = decodeURIComponent(account); } catch { /* Keep legacy encoding unchanged. */ }
      if (profile.username === account || profile.username === decoded) store.update(value => ({ ...value, selfAvatar: profile.avatarUrl }));
    }, () => { /* Avatar failure uses the existing local fallback, never the peer avatar. */ });
  }, [ready, snapshot.verified, snapshot.generation, snapshot.uid, invalidRoute, store]);

  const orderedIds = [...orderMessageConversations(data.known).map(item => item.id), ...Object.keys(data.threadsByCid).map(Number).sort((a, b) => b - a)]
    .filter((id, index, ids) => ids.indexOf(id) === index && data.threadsByCid[id]);
  const eligibleIds = orderedIds.filter(id => {
    const entry = data.threadsByCid[id];
    return isPrivateThreadSendable(entry.thread, entry.permissionsFresh) && !entry.loading && !entry.loadingMore;
  });
  const selectedCid = data.targetChosen || !peerUid ? data.selectedCid : eligibleIds[0] || data.selectedCid;
  useEffect(() => {
    if (!ready || !snapshot.verified || !peerUid || data.targetChosen || !eligibleIds.length) return;
    if (PRIVATE_BUCKETS.some(bucket => data.buckets[bucket].loading || data.buckets[bucket].loadingMore) || orderedIds.some(id => data.threadsByCid[id].loading)) return;
    store.update(value => value.targetChosen ? value : { ...value, selectedCid: eligibleIds[0], targetChosen: true });
  }, [ready, snapshot.verified, peerUid, data, store]);
  const selected = data.threadsByCid[selectedCid];
  const peer = orderedIds.map(id => data.threadsByCid[id].thread?.peer).find(Boolean) || data.compose?.peer;
  const canSend = snapshot.verified && (selected ? isPrivateThreadSendable(selected.thread, selected.permissionsFresh) && !selected.loading && !selected.loadingMore
    : data.composeFresh && !data.composeLoading && data.compose?.conversation_id === 0 && data.compose.can_initiate);
  const maxLength = selected ? 500 : 120;

  const send = () => {
    const current = store.snapshot();
    const state = current.data;
    const eligible = orderMessageConversations(state.known).map(item => item.id);
    Object.keys(state.threadsByCid).map(Number).sort((a, b) => b - a).forEach(id => { if (!eligible.includes(id)) eligible.push(id); });
    const allowedIds = eligible.filter(id => { const entry = state.threadsByCid[id]; return isPrivateThreadSendable(entry.thread, entry.permissionsFresh) && !entry.loading && !entry.loadingMore; });
    const targetId = state.selectedCid;
    if (targetId && !allowedIds.includes(targetId)) return;
    const entry = targetId ? state.threadsByCid[targetId] : undefined;
    const compose = state.compose;
    if (!store.isVisible() || !current.verified || state.posting || (!entry && (!state.composeFresh || state.composeLoading || compose?.conversation_id !== 0 || !compose.can_initiate))) return;
    const text = state.draft.trim();
    const validation = messageTextError(text, Boolean(entry));
    if (validation) { store.update(value => ({ ...value, postError: validation })); return; }
    const freshSourceId = compose?.source?.id;
    const to = compose?.peer.uid;
    if (!targetId && !to) return;
    const target = targetId ? `conversation:${targetId}` : `recipient:${to}:source:${freshSourceId || 0}`;
    void store.post(async valid => {
      store.update(value => ({ ...value, posting: true, postError: '', notice: '' }));
      const clientKey = await store.sendKey(target, text, newClientKey, valid);
      if (!valid()) throw new Error('Private page is no longer visible');
      return targetId ? sendPrivateMessage({ conversationId: targetId, text, clientKey })
        : sendPrivateMessage({ recipientId: to!, ...(freshSourceId ? { sourceId: freshSourceId } : {}), text, clientKey });
    }, result => {
      store.clearSendKey();
      store.update(value => ({ ...value, draft: '', posting: false, postError: '', selectedCid: result.conversation_id,
        compose: null, composeFresh: false, notice: '已提交，审核及会话状态请以刷新结果为准' }));
      loadThread(result.conversation_id);
    }, error => store.update(value => ({ ...value, posting: false, postError: messageErrorText(error) })));
  };
  const accept = (conversationId: number) => {
    const current = store.snapshot();
    const entry = current.data.threadsByCid[conversationId];
    if (!store.isVisible() || !current.verified || current.data.posting || !entry?.permissionsFresh || entry.loading || entry.loadingMore ||
      !entry.thread?.incoming_request || entry.thread.state !== 'pending' || entry.thread.blocked) return;
    void store.post(async valid => {
      store.update(value => ({ ...value, posting: true, postError: '', notice: '' }));
      if (!valid()) throw new Error('Private page is no longer visible');
      await acceptPrivateMessageRequest({ conversationId });
    }, () => {
      store.update(value => ({ ...value, posting: false, notice: '已提交接受请求，正在刷新会话' }));
      loadThread(conversationId);
      if (peerUid) PRIVATE_BUCKETS.forEach(bucket => loadBucket(bucket));
    }, error => store.update(value => ({ ...value, posting: false, postError: messageErrorText(error) })));
  };

  return <View className='privateMessagesPage privateMessagesPage--thread'>
    <Navbar back title={!peer ? '私信' : undefined} titleStyle={{ opacity: 1, transform: 'none' }} shared={false}>
      {peer && <View className='privateThreadNavPeer'><UserAvatar username={peer.username} src={peer.avatar} size={52} /><View className='privateThreadNavPeerBody'>
        <Text className='privateThreadNavName' maxLines={1} overflow='ellipsis'>{peer.display_name.trim() || peer.username}</Text>
        <Text className='privateThreadNavState' maxLines={1} overflow='ellipsis'>{selected?.thread ? (selected.thread.blocked ? '会话不可用' : messageStateLabel(selected.thread.state)) : data.compose ? '发起消息请求' : '加载会话'}</Text>
      </View></View>}
    </Navbar>
    {invalidRoute ? <View className='privateMessageStatus'><Text className='privateMessageEmptyTitle'>私信链接无效</Text></View>
      : !username ? <View className='privateMessageStatus'>{checkingLogin ? <Loading /> : <LoginPrompt icon='私信' title='登录后查看私信' desc='私信内容仅对登录账号可见' />}
        {loginError && <Text className='privateMessageAction' onClick={refresh}>账号加载失败，点击重试</Text>}</View>
      : identityError ? <View className='privateMessageStatus'><Text className='privateMessageError' onClick={refresh}>私信账号校验失败，点击重试</Text></View>
      : !ready ? <View className='privateMessageStatus'><Loading /></View>
      : <>
        <ScrollView type={scrollType} className='privateThreadMessages' scrollY enhanced scrollIntoView={scrollIntoView} onScroll={() => setScrollIntoView(undefined)}>
          {data.composeLoading && <Text className='privateMessageFooter'>正在校验发起私信资格…</Text>}
          {data.composeError && <Text className='privateMessageError' onClick={loadCompose}>{data.composeError}，点击重试</Text>}
          {data.compose && !data.compose.conversation_id && <View className='privateThreadSystemCard'>
            <Text className='privateMessageMuted'>首条消息作为请求发送，对方接受前不能继续发送</Text>
            {data.compose.source && <SourceNotice source={data.compose.source} visible={store.isVisible} />}
            {(!data.compose.can_initiate || data.compose.qualification_message) && <Text className='privateMessageNotice'>{data.compose.qualification_message || '暂不具备发起私信的资格'}</Text>}
          </View>}
          {orderedIds.map(id => {
            const entry = data.threadsByCid[id]; const thread = entry.thread;
            const metadata = data.known.find(item => item.id === id);
            const pending = thread?.state === 'pending';
            return <View key={id} className='privateThreadSegment'>
              <View className='privateThreadSystemCard'>
                {peerUid && <Text className='privateMessageMuted'>会话记录 #{id}{metadata?.updated ? ` · ${metadata.updated}` : ''}</Text>}
                {thread && <>
                  <Text className='privateMessageMuted'>{messageStateLabel(thread.state)}</Text>
                  {thread.source && <SourceNotice source={thread.source} visible={store.isVisible} />}
                  {thread.blocked ? <Text className='privateMessageNotice'>会话不可用，不能发送私信</Text> : pending && <Text className='privateMessageNotice'>{thread.incoming_request ? '接受请求后才能继续交流' : '等待对方接受，暂不能继续发送'}</Text>}
                  {thread.can_reopen && thread.state !== 'active' && <Text className='privateMessageNotice'>此会话可重新开启；暂不提供重新开启操作</Text>}
                  {!entry.permissionsFresh && <Text className='privateMessageMuted'>缓存内容仅供查看，刷新会话成功后才能操作</Text>}
                  {thread.incoming_request && pending && !thread.blocked && <View className='privateAcceptRequest'>
                    <Text className='privateMessageMuted'>只有点击接受此会话请求，才会提交接受操作</Text>
                    <View className={`privateMessageButton ${data.posting || !snapshot.verified || !entry.permissionsFresh || entry.loading || entry.loadingMore ? 'privateMessageButton--disabled' : ''}`} onClick={() => accept(id)}><Text>{data.posting ? '提交中…' : '接受请求'}</Text></View>
                  </View>}
                </>}
                {entry.loading && <Text className='privateMessageMuted'>正在刷新此会话…</Text>}
                {entry.error && <Text className='privateMessageError' onClick={() => loadThread(id, entry.retryMore)}>{entry.error}，点击重试</Text>}
              </View>
              {thread?.has_more && <Text className='privateMessageFooter privateMessageAction' onClick={() => loadThread(id, true)}>{entry.loadingMore ? '加载中…' : '加载更早消息'}</Text>}
              {thread?.messages.map(message => <View key={privateMessageKey(id, message)} id={`private-message-${id}-${message.id}`} className={`privateMessageBubbleRow ${message.mine ? 'privateMessageBubbleRow--mine' : ''}`}>
                <UserAvatar className='privateMessageSenderAvatar' username={message.mine ? username : thread.peer.username} src={message.mine ? data.selfAvatar || '' : thread.peer.avatar} size={48} />
                <View className={`privateMessageBubble ${message.mine ? 'privateMessageBubble--mine' : ''}`}>
                  <Text className='privateMessageText' selectable>{message.text}</Text><Text className='privateMessageTime'>{message.created} · {messageStateLabel(message.state)}</Text>
                </View>
              </View>)}
              {thread && !thread.messages.length && <Text className='privateMessageFooter'>暂无可显示的消息</Text>}
            </View>;
          })}
          {peerUid && <View className='privateThreadDiscovery'>
            {PRIVATE_BUCKETS.map(bucket => data.buckets[bucket].error && <Text key={bucket} className='privateMessageError' onClick={() => loadBucket(bucket, data.buckets[bucket].retryMore)}>{bucket === 0 ? '会话记录' : '请求记录'}发现失败，点击重试</Text>)}
            {PRIVATE_BUCKETS.some(bucket => data.buckets[bucket].loading || data.buckets[bucket].loadingMore) ? <Text className='privateMessageFooter'>正在查找会话记录…</Text>
              : PRIVATE_BUCKETS.some(bucket => data.buckets[bucket].cursor) && <Text className='privateMessageFooter privateMessageAction' onClick={() => PRIVATE_BUCKETS.forEach(bucket => loadBucket(bucket, true))}>加载更多会话记录</Text>}
            <Text className='privateMessageFooter'>{PRIVATE_BUCKETS.some(bucket => !data.buckets[bucket].completed || data.buckets[bucket].cursor || data.buckets[bucket].error)
              ? '会话记录尚未全部加载，已发现的记录仍可查看' : '已显示当前发现的会话记录'}</Text>
          </View>}
          {data.notice && <Text className='privateMessageNotice'>{data.notice}</Text>}
          {data.postError && <Text className='privateMessageError'>{data.postError}。未提交成功时可手动重试</Text>}
        </ScrollView>
        {(eligibleIds.length > 1 || (eligibleIds.length > 0 && !eligibleIds.includes(selectedCid))) && <View className='privateThreadSendTargets'><Text className='privateMessageMuted'>发送到</Text>{eligibleIds.map(id => <Text key={id}
          className={`privateThreadSendTarget ${selectedCid === id ? 'privateThreadSendTarget--selected' : ''}`} onClick={() => {
            if (!store.isVisible() || store.snapshot().data.posting) return;
            store.clearSendKey(); store.update(value => ({ ...value, selectedCid: id, targetChosen: true, postError: '' }));
          }}>#{id}{data.threadsByCid[id].thread?.source ? ` · ${data.threadsByCid[id].thread!.source!.title}` : ''}</Text>)}</View>}
        {peer && <PrivateMessageComposer value={data.draft} limit={maxLength} disabled={!canSend} posting={data.posting}
          onChange={value => { store.draftChanged(value); store.update(current => ({ ...current, draft: value, postError: '' })); }} onSend={send} />}
      </>}
  </View>;
}

function SourceNotice({ source, visible }: { source: NonNullable<MessageThread['source']>; visible: () => boolean }) {
  const route = messageSourceRoute(source);
  return <View className={`privateMessageNotice ${route ? 'privateMessageAction' : ''}`} onClick={() => { if (route && visible()) void Taro.navigateTo({ url: route }); }}><Text>来自帖子：{source.title}</Text></View>;
}
export default function MessageThreadPage() { return <ThemePage><MessageThreadView /></ThemePage>; }
