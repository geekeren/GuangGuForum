import { useEffect, useRef, useState } from 'react';
import { useDidHide } from '@tarojs/taro';
import type { PrivatePageState } from './privateState';

/** Native spinner tracks the existing read promises, never an account reset or synthetic timer. */
export function usePrivateRefresher<T>(store: PrivatePageState<T>, allowed: () => boolean, reload: () => Promise<unknown>) {
  const [triggered, setTriggered] = useState(false);
  const flight = useRef<{ generation: number; account: string } | null>(null);
  const mounted = useRef(true);
  const stop = () => { flight.current = null; if (mounted.current) setTriggered(false); };
  useDidHide(stop);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = store.subscribe(() => {
      const current = store.snapshot(); const pending = flight.current;
      if (pending && (!current.visible || current.generation !== pending.generation || current.account !== pending.account)) stop();
    });
    return () => { unsubscribe(); mounted.current = false; flight.current = null; };
  }, [store]);
  const refresh = async () => {
    if (flight.current) return;
    if (!store.isVisible() || !store.snapshot().verified || !allowed()) { stop(); return; }
    const { generation, account } = store.snapshot();
    const pending = { generation, account }; flight.current = pending; setTriggered(true);
    try { await reload(); }
    catch { /* Existing read callbacks own safe failure/retry presentation. */ }
    finally { if (flight.current === pending) stop(); }
  };
  return { refresherTriggered: triggered, onRefresherRefresh: refresh, onRefresherAbort: stop };
}
