import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDidHide, useDidShow } from '@tarojs/taro';
import { getMessageSummary } from 'guanggu-forum-api';
import { useCurrentUsername } from '../../hooks/useCurrentUsername';
import { getCachedUsername, subscribeCurrentAccount } from '../../utils/currentUser';
import { PrivatePageState } from './privateState';
import { privateMessageMemory } from './privateMemory';

export function usePrivatePage<T>(empty: () => T, active = true) {
  const { username, loading, error, retry } = useCurrentUsername(active);
  const [pageVisible, setPageVisible] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [identityError, setIdentityError] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getMessageSummary>> | null>(null);
  const storeRef = useRef<PrivatePageState<T>>();
  if (!storeRef.current) storeRef.current = new PrivatePageState(empty, getCachedUsername);
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const activeRef = useRef(active);
  activeRef.current = active;
  const visibleRef = useRef(true);
  const lastScope = useRef({ account: '', uid: 0 });
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useDidHide(() => {
    visibleRef.current = false;
    store.hide();
    setSummary(null);
    setPageVisible(false);
  });
  useDidShow(() => {
    visibleRef.current = true;
    store.hide();
    setPageVisible(true);
    setEpoch(value => value + 1);
  });
  useEffect(() => subscribeCurrentAccount(reason => {
    const previous = store.snapshot();
    const oldAccount = previous.account || lastScope.current.account;
    const oldUid = previous.uid || lastScope.current.uid || privateMessageMemory.knownUid(oldAccount);
    if (reason === 'signed-out') {
      privateMessageMemory.clearUid(oldUid);
      lastScope.current = { account: '', uid: 0 };
    } else {
      privateMessageMemory.invalidateBinding(oldAccount);
      lastScope.current = { account: oldAccount, uid: oldUid };
    }
    store.hide();
    setSummary(null);
    if (visibleRef.current && activeRef.current) {
      retryRef.current();
      setEpoch(value => value + 1);
    }
  }), [store]);
  useEffect(() => {
    const account = getCachedUsername();
    setIdentityError(false);
    setSummary(null);
    if (active && pageVisible && username && username === account) {
      store.activate(account, true);
      // Same-account completed cache may render immediately; every show revalidates the UID.
      const cachedUid = privateMessageMemory.uid(account);
      lastScope.current = { account, uid: cachedUid };
      if (cachedUid) store.bindUid(cachedUid, false);
      void store.read('identity', getMessageSummary, result => {
        if (store.snapshot().uid && store.snapshot().uid !== result.uid) store.activate(account, true);
        privateMessageMemory.bind(account, result.uid);
        privateMessageMemory.authorize(result.uid);
        lastScope.current = { account, uid: result.uid };
        store.bindUid(result.uid);
        setSummary(result);
      }, () => {
        privateMessageMemory.invalidateBinding(account);
        store.hide();
        setIdentityError(true);
      });
    } else store.hide();
    return store.hide;
  }, [store, active, pageVisible, username, epoch]);
  useEffect(() => () => { visibleRef.current = false; store.hide(); }, [store]);

  // Never expose old-account content in a render while the identity hook catches up.
  const account = getCachedUsername();
  const ready = active && pageVisible && snapshot.visible && snapshot.uid > 0 && snapshot.account === account && account === username;
  const refresh = useCallback(() => {
    store.hide();
    retryRef.current();
    setEpoch(value => value + 1);
  }, [store]);
  return { store, snapshot, data: ready ? snapshot.data : empty(), summary: ready && snapshot.verified ? summary : null, ready, username: account, loading, error: error || identityError, identityError, refresh };
}
