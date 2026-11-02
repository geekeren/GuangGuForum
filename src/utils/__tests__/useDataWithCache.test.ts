import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDataWithCache } from '../../hooks/useDataWithCache';

const harness = vi.hoisted(() => ({
  values: [] as any[], refs: [] as any[], cursor: 0, refCursor: 0,
}));
vi.mock('react', () => ({
  useState(initial: any) {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: any) => { harness.values[index] = value; }];
  },
  useRef(initial: any) {
    const index = harness.refCursor++;
    return harness.refs[index] ??= { current: initial };
  },
  useCallback: (callback: any) => callback,
}));

function render(api: any) {
  harness.cursor = 0; harness.refCursor = 0;
  return useDataWithCache<{ tid: string }, string>(api);
}
function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { harness.values = []; harness.refs = []; });

describe('fresh API requests after publishing', () => {
  it('preserves normal cache defaults and explicitly bypasses cache for a fresh request', async () => {
    const api = vi.fn().mockResolvedValue('fresh');
    await render(api).request({ tid: '1' });
    expect(api).toHaveBeenLastCalledWith({ tid: '1' }, { onRefresh: expect.any(Function) });
    await render(api).requestFresh({ tid: '1' });
    expect(api).toHaveBeenLastCalledWith({ tid: '1' }, { cache: false, onRefresh: expect.any(Function) });
    expect(render(api)).toMatchObject({ data: 'fresh', loading: false });
  });

  it('does not let an old cached request or background refresh overwrite post-submit data', async () => {
    const old = deferred();
    const fresh = deferred();
    const api = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const oldRequest = render(api).request({ tid: '1' });
    const oldRefresh = api.mock.calls[0][1].onRefresh;
    const freshRequest = render(api).requestFresh({ tid: '1' });
    oldRefresh('stale background');
    expect(render(api).data).toBeUndefined();
    fresh.resolve('new reply');
    await freshRequest;
    old.resolve('old cached data');
    await oldRequest;
    oldRefresh('late stale background');
    expect(render(api)).toMatchObject({ data: 'new reply', loading: false });
  });

  it('preserves visible data when a fresh request fails', async () => {
    const api = vi.fn().mockResolvedValueOnce('existing replies').mockRejectedValueOnce(new Error('offline'));
    await render(api).request({ tid: '1' });
    await expect(render(api).requestFresh({ tid: '1' })).rejects.toThrow('offline');
    expect(render(api)).toMatchObject({ data: 'existing replies', loading: false });
  });
});
