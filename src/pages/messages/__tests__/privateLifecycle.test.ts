import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePrivatePage } from '../usePrivatePage';
import { privateMessageMemory } from '../privateMemory';

const runtime = vi.hoisted(() => ({ account: 'fixture-user', states: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0, effects: [] as any[], effectIndex: 0,
  pendingEffects: [] as any[], show: null as any, hide: null as any, listeners: new Set<any>(), summary: null as any,
  fileGet: vi.fn(), filePut: vi.fn(), fileProtect: vi.fn(() => () => {}) }));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.stateIndex++; if (!(i in runtime.states)) runtime.states[i] = initial; return [runtime.states[i], (next: any) => { runtime.states[i] = typeof next === 'function' ? next(runtime.states[i]) : next; }]; },
  useRef: (initial: any) => { const i = runtime.refIndex++; if (!(i in runtime.refs)) runtime.refs[i] = { current: initial }; return runtime.refs[i]; },
  useCallback: (fn: any) => fn,
  useSyncExternalStore: (_subscribe: any, snapshot: any) => snapshot(),
  useEffect: (effect: any, dependencies: any[]) => { const i = runtime.effectIndex++; const old = runtime.effects[i]; if (!old || dependencies.some((value, index) => value !== old.dependencies[index])) runtime.pendingEffects.push(() => { old?.cleanup?.(); runtime.effects[i] = { dependencies, cleanup: effect() }; }); },
}));
vi.mock('@tarojs/taro', () => ({ useDidHide: (callback: any) => { runtime.hide = callback; }, useDidShow: (callback: any) => { runtime.show = callback; } }));
vi.mock('../../../hooks/useCurrentUsername', () => ({ useCurrentUsername: () => ({ username: runtime.account, loading: false, error: false, retry: () => {} }) }));
vi.mock('../../../utils/currentUser', () => ({ getCachedUsername: () => runtime.account, subscribeCurrentAccount: (listener: any) => { runtime.listeners.add(listener); return () => { runtime.listeners.delete(listener); }; } }));
vi.mock('guanggu-forum-api', () => ({ getMessageSummary: () => runtime.summary }));
vi.mock('../../../utils/privateMessageFileCache', () => ({ privateMessageFileCache: { get: runtime.fileGet, put: runtime.filePut, protect: runtime.fileProtect } }));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const empty = () => ({ text: '', draft: '' });
function RenderHarness(active = true) {
  runtime.stateIndex = runtime.refIndex = runtime.effectIndex = 0; const hook = usePrivatePage(empty, active);
  const work = runtime.pendingEffects.splice(0); work.forEach(effect => effect()); return hook;
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.states = []; runtime.refs = []; runtime.effects = []; runtime.pendingEffects = []; runtime.account = 'fixture-user';
  privateMessageMemory.accountChanged('signed-out'); runtime.fileGet.mockReset(); runtime.filePut.mockReset(); runtime.fileProtect.mockClear(); runtime.summary = Promise.resolve({ uid: 7, username: 'fixture-user' });
});

describe('actual private page hook lifecycle', () => {
  it('summary verifies UID before requests; hide clears visible draft but preserves completed UID cache and re-show freshly validates', async () => {
    RenderHarness(); await flush(); let hook = RenderHarness(); expect(hook.ready).toBe(true); expect(hook.snapshot.uid).toBe(7);
    hook.store.update(() => ({ text: 'fixture body', draft: 'fixture draft' })); privateMessageMemory.put(7, 'thread:11', { text: 'fixture body' });
    runtime.hide(); hook = RenderHarness(); expect(hook.ready).toBe(false); expect(hook.data.draft).toBe(''); expect(privateMessageMemory.get(7, 'thread:11')).toEqual({ text: 'fixture body' });
    const summary = deferred<any>(); runtime.summary = summary.promise; runtime.show(); RenderHarness(); hook = RenderHarness();
    expect(hook.ready).toBe(true); expect(hook.snapshot.verified).toBe(false); summary.resolve({ uid: 7 }); await flush(); expect(RenderHarness().snapshot.verified).toBe(true);
  });
  it('synchronous changed event clears drafts and invalidates old response without deleting completed other UID cache', async () => {
    RenderHarness(); await flush(); const hook = RenderHarness(); hook.store.update(() => ({ text: 'old private', draft: 'old draft' })); privateMessageMemory.put(7, 'thread:11', 'old fixture');
    const old = deferred<string>(); const success = vi.fn(); const work = hook.store.read('thread', () => old.promise, success, vi.fn());
    runtime.account = 'other-user'; runtime.summary = Promise.resolve({ uid: 8 }); runtime.listeners.forEach(listener => listener('changed'));
    expect(hook.store.snapshot().data.text).toBe(''); old.resolve('old'); await work; expect(success).not.toHaveBeenCalled();
    RenderHarness(); await flush(); expect(RenderHarness().snapshot.uid).toBe(8); expect(privateMessageMemory.get(7, 'thread:11')).toBe('old fixture');
  });
  it('signed-out while hidden clears the old UID completed cache even after binding invalidation', async () => {
    RenderHarness(); await flush(); RenderHarness(); privateMessageMemory.put(7, 'thread:11', 'fixture'); runtime.hide(); RenderHarness(); privateMessageMemory.invalidateBinding('fixture-user');
    runtime.account = ''; runtime.listeners.forEach(listener => listener('signed-out')); expect(privateMessageMemory.get(7, 'thread:11')).toBeUndefined(); expect(RenderHarness().ready).toBe(false);
  });
  it('failed identity verification has manual retry and no automatic polling', async () => {
    const summary = deferred<any>(); runtime.summary = summary.promise; RenderHarness(); summary.reject({ code: 'NETWORK' }); await flush(); const hook = RenderHarness(); expect(hook.identityError).toBe(true);
    runtime.summary = Promise.resolve({ uid: 7 }); hook.refresh(); RenderHarness(); await flush(); expect(RenderHarness().ready).toBe(true);
  });
  it('unmount invalidates in-flight private responses and removes account subscription', async () => {
    RenderHarness(); await flush(); const hook = RenderHarness(); const old = deferred<string>(); const success = vi.fn();
    const work = hook.store.read('thread', () => old.promise, success, vi.fn());
    runtime.effects.forEach(effect => effect.cleanup?.()); old.resolve('stale'); await work;
    expect(success).not.toHaveBeenCalled(); expect(hook.store.snapshot().visible).toBe(false); expect(runtime.listeners.size).toBe(1); // Only the module-lifetime cache observer remains.
  });
  it('logout with no mounted private page clears singleton cache and same-name relogin cannot reveal old content', async () => {
    RenderHarness(); await flush(); RenderHarness(); privateMessageMemory.put(7, 'thread:11', 'old private fixture');
    runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.refs = []; runtime.states = [];
    runtime.account = ''; runtime.listeners.forEach(listener => listener('signed-out'));
    expect(privateMessageMemory.size()).toBe(0); expect(privateMessageMemory.uid('fixture-user')).toBe(0);
    runtime.account = 'fixture-user'; const next = deferred<any>(); runtime.summary = next.promise; RenderHarness();
    expect(RenderHarness().ready).toBe(false); expect(privateMessageMemory.get(7, 'thread:11')).toBeUndefined();
    next.resolve({ uid: 7 }); await flush(); expect(RenderHarness().ready).toBe(true);
  });
  it('cold mount only hydrates files after a fresh summary verifies UID and does not rewrite disk TTL', async () => {
    runtime.fileGet.mockReturnValue({ items: [], next_cursor: null });
    const summary = deferred<any>(); runtime.summary = summary.promise;
    RenderHarness(); expect(RenderHarness().ready).toBe(false);
    expect(privateMessageMemory.get(7, 'list:0', 1, true)).toBeUndefined(); expect(runtime.fileGet).not.toHaveBeenCalled();
    summary.resolve({ uid: 7 }); await flush(); const hook = RenderHarness(); expect(hook.snapshot.verified).toBe(true);
    expect(privateMessageMemory.get(7, 'list:0', 1, true)).toEqual({ items: [], next_cursor: null });
    expect(runtime.fileGet).toHaveBeenCalledWith(7, 'list:0', 1); expect(runtime.filePut).not.toHaveBeenCalled();
  });
  it('logout retains files but blocks same-name cold remount until fresh UID verification', async () => {
    runtime.fileGet.mockReturnValue({ items: [], next_cursor: null }); RenderHarness(); await flush(); RenderHarness();
    privateMessageMemory.put(7, 'list:0', { items: [], next_cursor: null }); expect(runtime.filePut).toHaveBeenCalledTimes(1);
    runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.refs = []; runtime.states = [];
    runtime.account = ''; runtime.listeners.forEach(listener => listener('signed-out'));
    expect(privateMessageMemory.get(7, 'list:0', 1, true)).toBeUndefined(); expect(runtime.fileGet).not.toHaveBeenCalled();
    runtime.account = 'fixture-user'; const summary = deferred<any>(); runtime.summary = summary.promise; RenderHarness();
    expect(RenderHarness().ready).toBe(false); expect(runtime.filePut).toHaveBeenCalledTimes(1);
    summary.resolve({ uid: 7 }); await flush(); expect(RenderHarness().snapshot.verified).toBe(true);
    expect(privateMessageMemory.get(7, 'list:0', 1, true)).toEqual({ items: [], next_cursor: null });
  });
  it('changed account revokes old file authorization and stale completion cannot persist', async () => {
    RenderHarness(); await flush(); const hook = RenderHarness(); const response = deferred<any>();
    const work = hook.store.read('thread', () => response.promise, value => privateMessageMemory.put(7, 'thread:11', value), vi.fn());
    runtime.account = 'other-user'; const summary = deferred<any>(); runtime.summary = summary.promise;
    runtime.listeners.forEach(listener => listener('changed')); RenderHarness();
    response.resolve({ id: 11 }); await work;
    expect(runtime.filePut).not.toHaveBeenCalled(); expect(privateMessageMemory.get(7, 'thread:11', 1, true)).toBeUndefined(); expect(runtime.fileGet).not.toHaveBeenCalled();
    summary.resolve({ uid: 8 }); await flush(); expect(RenderHarness().snapshot.uid).toBe(8);
    privateMessageMemory.get(8, 'list:0', 1, true); expect(runtime.fileGet).toHaveBeenCalledWith(8, 'list:0', 1);
    privateMessageMemory.get(7, 'list:0', 1, true); expect(runtime.fileGet).toHaveBeenCalledTimes(1);
  });
  it('inactive message area never requests summary', async () => {
    const summary = deferred<any>(); runtime.summary = summary.promise; let hook = RenderHarness(false); expect(hook.ready).toBe(false); expect(hook.snapshot.visible).toBe(false);
    summary.resolve({ uid: 7 }); await flush(); hook = RenderHarness(false); expect(hook.snapshot.uid).toBe(0);
  });
});
