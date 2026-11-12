import { describe, expect, it, vi } from 'vitest';
import { PrivatePageState, messageErrorText, messageSourceRoute, messageStateLabel, messageTextError, mergeById, positiveRouteId, profileMessageRoute } from '../privateState';
import { PrivateMemory } from '../privateMemory';

vi.mock('../../../utils/currentUser', () => ({ subscribeCurrentAccount: () => () => {} }));
vi.mock('../../../utils/privateMessageFileCache', () => ({ privateMessageFileCache: { get: vi.fn(), put: vi.fn(), protect: vi.fn(() => () => {}) } }));

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
  let account = 'fixture-user';
  const store = new PrivatePageState(() => ({ text: '', error: '' }), () => account);
  store.activate(account); store.bindUid(7);
  return { store, account: (next: string) => { account = next; } };
}

describe('private page lifecycle and explicit requests', () => {
  it('drops old-account read responses and immediately clears visible private state', async () => {
    const { store, account } = fixture(); const pending = deferred<string>(); const success = vi.fn();
    store.update(() => ({ text: 'fixture only', error: '' }));
    const work = store.read('thread', () => pending.promise, success, vi.fn());
    account('other-user'); pending.resolve('old-response'); await work;
    expect(success).not.toHaveBeenCalled(); expect(store.snapshot().data.text).toBe(''); expect(store.snapshot().visible).toBe(false);
  });
  it('hide and same-account re-show invalidate requests, drafts and retry keys', async () => {
    const { store } = fixture(); const pending = deferred<string>(); const success = vi.fn();
    const work = store.read('thread', () => pending.promise, success, vi.fn());
    store.update(() => ({ text: 'draft fixture', error: '' }));
    store.hide(); store.activate('fixture-user'); store.bindUid(7); pending.resolve('stale'); await work;
    expect(success).not.toHaveBeenCalled(); expect(store.snapshot().data.text).toBe('');
  });
  it('later page refresh wins over stale pagination', async () => {
    const { store } = fixture(); const old = deferred<string>(); const fresh = deferred<string>(); const success = vi.fn();
    const first = store.read('list', () => old.promise, success, vi.fn());
    const second = store.read('list', () => fresh.promise, success, vi.fn());
    fresh.resolve('fresh'); await second; old.resolve('stale'); await first;
    expect(success).toHaveBeenCalledTimes(1); expect(success).toHaveBeenCalledWith('fresh');
  });
  it('cached UID can render before revalidation but cannot submit until summary verifies', async () => {
    const { store } = fixture(); store.bindUid(7, false); const mutation = vi.fn(async () => 'submitted');
    expect(await store.post(mutation, vi.fn(), vi.fn())).toBe(false); expect(mutation).not.toHaveBeenCalled();
    store.bindUid(7, true); await store.post(mutation, vi.fn(), vi.fn()); expect(mutation).toHaveBeenCalledTimes(1);
  });
  it('failed reads can be manually retried without automatic retry', async () => {
    const { store } = fixture(); const fail = vi.fn(); const success = vi.fn(); const request = vi.fn().mockRejectedValueOnce(new Error('fixture')).mockResolvedValueOnce('ok');
    await store.read('list', request, success, fail); expect(request).toHaveBeenCalledTimes(1);
    await store.read('list', request, success, fail); expect(request).toHaveBeenCalledTimes(2); expect(success).toHaveBeenCalledWith('ok');
  });
  it('synchronously locks double-tap POSTs including asynchronous client key generation', async () => {
    const { store } = fixture(); const pending = deferred<string>(); const request = vi.fn(() => pending.promise); const success = vi.fn();
    const first = store.post(request, success, vi.fn());
    expect(await store.post(request, success, vi.fn())).toBe(false); expect(request).toHaveBeenCalledTimes(1);
    pending.resolve('submitted'); await first; expect(success).toHaveBeenCalledTimes(1);
  });
  it('unchanged failed send reuses its key; changed text, success and hide reset it', async () => {
    const { store } = fixture(); const key = vi.fn().mockResolvedValueOnce('a'.repeat(32)).mockResolvedValueOnce('b'.repeat(32)).mockResolvedValueOnce('c'.repeat(32));
    const run = () => store.post(async valid => { const result = await store.sendKey('conversation:11', 'fixture', key, valid); throw { code: 'NETWORK', result }; }, vi.fn(), vi.fn());
    await run(); await run(); expect(key).toHaveBeenCalledTimes(1);
    store.draftChanged('changed'); await run(); expect(key).toHaveBeenCalledTimes(2);
    store.clearSendKey(); await run(); expect(key).toHaveBeenCalledTimes(3);
  });
  it('hide drops a late response from an already submitted POST and clears its draft', async () => {
    const { store } = fixture(); const pending = deferred<string>(); const success = vi.fn();
    store.update(() => ({ text: 'fixture draft', error: '' }));
    const work = store.post(() => pending.promise, success, vi.fn()); store.hide(); pending.resolve('submitted'); await work;
    expect(success).not.toHaveBeenCalled(); expect(store.snapshot().data.text).toBe('');
  });
  it('hide prevents late key generation from calling mutation and late POST response from updating state', async () => {
    const { store } = fixture(); const key = deferred<string>(); const mutation = vi.fn(); const success = vi.fn();
    const work = store.post(async valid => { const clientKey = await store.sendKey('new:2', 'fixture', () => key.promise, valid); if (valid()) mutation(clientKey); }, success, vi.fn());
    store.hide(); key.resolve('a'.repeat(32)); await work;
    expect(mutation).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
  });
});

describe('private completed-response memory cache', () => {
  it('retains completed same-UID cache across hide but never another UID', () => {
    const { store } = fixture(); const cache = new PrivateMemory(); cache.bind('fixture-user', 7); cache.put(7, 'thread:11', { text: 'fixture' });
    store.hide(); expect(cache.get(7, 'thread:11')).toEqual({ text: 'fixture' }); expect(cache.get(8, 'thread:11')).toBeUndefined();
  });
  it('enforces capacity and LRU while retaining currently protected thread', () => {
    const cache = new PrivateMemory(2); cache.put(7, 'thread:1', 'one'); cache.put(7, 'thread:2', 'two');
    const release = cache.protect(7, 'thread:1'); cache.put(7, 'thread:3', 'three');
    expect(cache.get(7, 'thread:1')).toBe('one'); expect(cache.get(7, 'thread:2')).toBeUndefined(); expect(cache.size()).toBe(2);
    release(); cache.put(7, 'thread:4', 'four'); expect(cache.get(7, 'thread:3')).toBeUndefined();
  });
  it('uses access order for ordinary eviction', () => {
    const cache = new PrivateMemory(2); cache.put(7, 'thread:1', 1); cache.put(7, 'thread:2', 2); cache.get(7, 'thread:1'); cache.put(7, 'thread:3', 3);
    expect(cache.get(7, 'thread:2')).toBeUndefined();
  });
  it('bounds list buckets independently to four first-page entries', () => {
    const cache = new PrivateMemory(2); for (let uid = 1; uid <= 3; uid++) for (let bucket = 0; bucket <= 1; bucket++) cache.put(uid, `list:${bucket}`, { items: [] });
    expect(cache.size()).toBe(4); expect(cache.get(1, 'list:0')).toBeUndefined();
  });
  it('expires lazily with no timers and invalidates version mismatch', () => {
    let now = 100; const cache = new PrivateMemory(2, () => now, 10); cache.put(7, 'thread:1', 'fixture'); cache.bind('fixture-user', 7);
    now = 110; expect(cache.get(7, 'thread:1')).toBeUndefined(); expect(cache.uid('fixture-user')).toBe(0); expect(cache.knownUid('fixture-user')).toBe(7);
    cache.put(7, 'thread:1', 'new', 1); expect(cache.get(7, 'thread:1', 2)).toBeUndefined();
  });
  it('account change invalidates UID binding, not completed UID cache; logout clears known UID after TTL', () => {
    let now = 0; const cache = new PrivateMemory(2, () => now, 10); cache.bind('fixture-user', 7); cache.put(7, 'thread:1', 'fixture'); cache.put(8, 'thread:1', 'other');
    cache.invalidateBinding('fixture-user'); expect(cache.uid('fixture-user')).toBe(0); expect(cache.get(7, 'thread:1')).toBe('fixture');
    now = 11; cache.clearUid(cache.knownUid('fixture-user')); expect(cache.knownUid('fixture-user')).toBe(0); expect(cache.size()).toBe(1);
  });
  it('protected active responses may exceed capacity until release then trim', () => {
    const cache = new PrivateMemory(1); const release1 = cache.protect(7, 'thread:1'); const release2 = cache.protect(7, 'thread:2');
    cache.put(7, 'thread:1', 1); cache.put(7, 'thread:2', 2); expect(cache.size()).toBe(2); release1(); expect(cache.size()).toBe(1); release2();
  });
});

describe('private completed-response file authorization', () => {
  function backend() { return { get: vi.fn(), put: vi.fn(), protect: vi.fn(() => vi.fn()) }; }
  it('binding a cached UID does not authorize disk; even global authorization requires per-page verified opt-in', () => {
    const file = backend(); file.get.mockReturnValue('fixture'); const cache = new PrivateMemory(2, Date.now, 10, file);
    cache.bind('fixture-user', 7); expect(cache.get(7, 'thread:1', 1, true)).toBeUndefined(); expect(file.get).not.toHaveBeenCalled();
    cache.authorize(7); expect(cache.get(7, 'thread:1')).toBeUndefined(); expect(file.get).not.toHaveBeenCalled();
    cache.protect(7, 'thread:1')(); expect(file.protect).not.toHaveBeenCalled();
    expect(cache.get(7, 'thread:1', 1, true)).toBe('fixture'); expect(file.put).not.toHaveBeenCalled();
    expect(cache.get(8, 'thread:1', 1, true)).toBeUndefined(); expect(file.get).toHaveBeenCalledTimes(1);
  });
  it('natural subsequent writes retry failed persistence without polling or changing memory', () => {
    const file = backend(); file.put.mockReturnValueOnce(false).mockReturnValueOnce(true); const cache = new PrivateMemory(2, Date.now, 10, file);
    cache.authorize(7); cache.put(7, 'thread:1', 'fixture'); expect(cache.get(7, 'thread:1')).toBe('fixture'); expect(file.put).toHaveBeenCalledTimes(1);
    cache.put(7, 'thread:1', 'fresh'); expect(file.put).toHaveBeenCalledTimes(2);
    cache.put(8, 'thread:1', 'other'); expect(file.put).toHaveBeenCalledTimes(2);
  });
  it('expired memory can hydrate a longer-lived file without extending its TTL; version mismatch remains invalid', () => {
    let now = 0; const file = backend(); file.get.mockReturnValueOnce('disk').mockReturnValueOnce(undefined); const cache = new PrivateMemory(2, () => now, 10, file);
    cache.authorize(7); cache.put(7, 'thread:1', 'memory'); now = 11;
    expect(cache.get(7, 'thread:1', 1, true)).toBe('disk'); expect(file.put).toHaveBeenCalledTimes(1);
    expect(cache.get(7, 'thread:1', 2, true)).toBeUndefined(); expect(file.get).toHaveBeenLastCalledWith(7, 'thread:1', 2);
  });
  it('changed/signout revoke disk access without deleting files and old lease release stays idempotent after logout', () => {
    const file = backend(); const cache = new PrivateMemory(1, Date.now, 10, file); cache.authorize(7);
    const release = cache.protect(7, 'thread:1', true); const fileRelease = file.protect.mock.results[0].value;
    cache.accountChanged('changed'); cache.get(7, 'thread:2', 1, true); expect(file.get).not.toHaveBeenCalled();
    cache.authorize(7); cache.accountChanged('signed-out'); release(); release(); expect(fileRelease).toHaveBeenCalledTimes(1);
    cache.get(7, 'thread:1', 1, true); expect(file.get).not.toHaveBeenCalled(); expect(cache.size()).toBe(0);
  });
});

describe('private UI safety contracts', () => {
  it('logout protection generation prevents old releases from cancelling a newly visible same-key thread', () => {
    const cache = new PrivateMemory(1); const oldRelease = cache.protect(7, 'thread:1'); cache.accountChanged('signed-out');
    const release = cache.protect(7, 'thread:1'); cache.put(7, 'thread:1', 'current'); oldRelease(); cache.put(7, 'thread:2', 'other');
    expect(cache.get(7, 'thread:1')).toBe('current'); expect(cache.get(7, 'thread:2')).toBeUndefined(); release();
  });
  it('only links verified matching positive topic IDs through an internal route', () => {
    expect(messageSourceRoute({ id: 12, title: 'fixture', url: '/t/12' })).toBe('/pages/topicDetail/index?tid=12');
    expect(messageSourceRoute({ id: 12, title: 'fixture', url: 'https://www.guozaoke.com/t/12' })).toBe('/pages/topicDetail/index?tid=12');
    for (const url of ['/t/13', 'https://evil.test/t/12', 'javascript:alert(1)', '//www.guozaoke.com/t/12', 'https://www.guozaoke.com/t/12?redirect=x', '/u/12', '/t/12/']) expect(messageSourceRoute({ id: 12, title: 'fixture', url })).toBeUndefined();
  });
  it('validates exact trimmed UTF16 first-request and existing-message limits', () => {
    expect(messageTextError(' '.repeat(4), false)).not.toBe(''); expect(messageTextError('x'.repeat(120), false)).toBe(''); expect(messageTextError('x'.repeat(121), false)).not.toBe('');
    expect(messageTextError('x'.repeat(500), true)).toBe(''); expect(messageTextError('x'.repeat(501), true)).not.toBe(''); expect(messageTextError('😀'.repeat(61), false)).not.toBe('');
  });
  it('never calls unknown moderation state delivered or renders raw failure payload', () => {
    expect(messageStateLabel('unknown')).toBe('状态待确认'); expect(messageStateLabel('review')).toBe('审核中');
    expect(messageErrorText(new Error('secret fixture token'))).not.toContain('secret'); expect(messageErrorText({ code: 'HTTP', payload: 'private fixture' })).not.toContain('private fixture');
  });
  it('explains content rejection with fixed safe copy without echoing the server payload', () => {
    expect(messageErrorText({ code: 'CONTENT_REJECTED', statusCode: 400, message: 'private fixture token', payload: '<script>fixture</script>' })).toBe('消息未通过检查，请修改内容后发送');
    expect(messageErrorText({ code: 'CONTENT_REJECTED', statusCode: 200 })).toBe('消息未通过检查，请修改内容后发送');
  });
  it('profile CTA uses only trusted optional recipient UID for signed-in non-self viewers', () => {
    expect(profileMessageRoute({ username: 'fixture-peer', messageRecipientId: 8 }, 'fixture-user')).toBe('/pages/secondary/messages/thread?to=8');
    expect(profileMessageRoute({ username: 'fixture-peer', messageRecipientId: 8 }, '')).toBeUndefined();
    expect(profileMessageRoute({ username: 'fixture-peer', messageRecipientId: 8 }, 'fixture-peer')).toBeUndefined();
    expect(profileMessageRoute({ username: '示例', messageRecipientId: 8 }, encodeURIComponent('示例'))).toBeUndefined();
    expect(profileMessageRoute({ username: 'fixture-peer' }, 'fixture-user')).toBeUndefined();
    for (const id of [0, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) expect(profileMessageRoute({ username: 'fixture-peer', messageRecipientId: id }, 'fixture-user')).toBeUndefined();
  });
  it('rejects invalid route IDs and merges pagination without duplicates', () => {
    for (const id of ['0', '-1', '1.1', '1e3', '9007199254740992']) expect(positiveRouteId(id)).toBeUndefined();
    expect(mergeById([{ id: 1, text: 'old' }], [{ id: 1, text: 'fresh' }, { id: 2, text: 'second' }])).toEqual([{ id: 1, text: 'fresh' }, { id: 2, text: 'second' }]);
  });
});
