import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CacheService, { CacheCategory } from '../CacheService';
import { subscribeCurrentAccount } from '../currentAccountEvents';

const runtime = vi.hoisted(() => ({ store: new Map<string, unknown>(), failWrite: '', failRemove: '' }));
vi.mock('@tarojs/taro', () => ({ default: {
  getStorageSync: (key: string) => runtime.store.get(key) ?? '',
  setStorageSync: (key: string, value: unknown) => {
    if (key === runtime.failWrite) throw new Error('fixture write failure');
    runtime.store.set(key, value);
  },
  removeStorageSync: (key: string) => {
    if (key === runtime.failRemove) throw new Error('fixture removal failure');
    runtime.store.delete(key);
  },
  getStorageInfoSync: () => ({ keys: [...runtime.store.keys()] }),
  clearStorageSync: () => runtime.store.clear(),
} }));
let service: CacheService;
let cleanups: Array<() => void>;
const system = { category: CacheCategory.System };
beforeEach(() => {
  runtime.store.clear(); runtime.failWrite = ''; runtime.failRemove = '';
  service = new CacheService(); cleanups = [];
});
afterEach(() => { cleanups.forEach(cleanup => cleanup()); });
function observe() {
  const listener = vi.fn(); cleanups.push(subscribeCurrentAccount(listener)); return listener;
}

describe('synchronous account invalidation without publishing identity', () => {
  it('notifies only a changed identity after storage commits', () => {
    service.set('current_username', 'first', system);
    const identities: Array<string | null> = [];
    const listener = observe();
    cleanups.push(subscribeCurrentAccount(() => identities.push(service.get('current_username'))));
    service.set('current_username', 'first', system);
    expect(listener).not.toHaveBeenCalled();
    service.set('current_username', 'second', system);
    expect(listener).toHaveBeenCalledExactlyOnceWith('changed');
    expect(identities).toEqual(['second']);
  });
  it('does not invalidate for normal cookie rotation or business cache writes', () => {
    const listener = observe();
    service.set('cookies', { _xsrf: 'fixture-one' }, system);
    service.set('cookies', { _xsrf: 'fixture-two' }, system);
    service.set('node_fixture', 'value', { category: CacheCategory.Node });
    expect(listener).not.toHaveBeenCalled();
  });
  it.each(['cookies', 'current_username'])('synchronously signals logout when removing %s', key => {
    service.set(key, 'fixture', system);
    const listener = observe();
    service.remove(key);
    expect(listener).not.toHaveBeenCalled();
    service.remove(key, true);
    expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
    expect(service.get(key)).toBeNull();
  });
  it('notifies even if metadata fails after an identity payload commits', () => {
    service.set('current_username', 'first', system);
    const listener = observe(); runtime.failWrite = '__cache_meta_current_username';
    expect(service.set('current_username', 'second', system)).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith('changed');
    expect(service.get('current_username')).toBe('second');
  });
  it('does not announce a failed payload write or failed removal', () => {
    service.set('current_username', 'first', system);
    const listener = observe(); runtime.failWrite = 'current_username';
    expect(service.set('current_username', 'second', system)).toBe(false);
    runtime.failRemove = 'current_username'; service.remove('current_username', true);
    expect(listener).not.toHaveBeenCalled();
    expect(service.get('current_username')).toBe('first');
  });
  it('shares commit behavior with asynchronous identity writes and removals', async () => {
    const listener = observe();
    await service.setAsync('current_username', 'first', system);
    expect(listener).toHaveBeenCalledExactlyOnceWith('changed'); listener.mockClear();
    expect(await service.removeAsync('current_username', true)).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
  });
  it('protected cache clearing preserves the account and emits no logout', () => {
    service.set('current_username', 'first', system);
    const listener = observe(); service.clearAll(true);
    expect(service.get('current_username')).toBe('first'); expect(listener).not.toHaveBeenCalled();
  });
  it('full storage clearing emits logout after removing identity', () => {
    service.set('current_username', 'first', system);
    const listener = observe(); service.clearAll(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
    expect(service.get('current_username')).toBeNull();
  });
  it('one observer failure cannot prevent another cleanup or logout', () => {
    service.set('current_username', 'first', system);
    cleanups.push(subscribeCurrentAccount(() => { throw new Error('fixture observer failure'); }));
    const listener = observe();
    expect(() => service.remove('current_username', true)).not.toThrow();
    expect(listener).toHaveBeenCalledExactlyOnceWith('signed-out');
  });
  it('unsubscribes without timers or exposing credentials in the event', () => {
    const listener = vi.fn(), dispose = subscribeCurrentAccount(listener);
    service.set('current_username', 'first', system);
    expect(listener.mock.calls).toEqual([['changed']]);
    dispose(); service.set('current_username', 'second', system);
    expect(listener).toHaveBeenCalledOnce();
  });
});
