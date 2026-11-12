import { describe, expect, it, vi } from 'vitest';
import { createDesktopPaneHistory, type DesktopPaneHistoryRuntime } from '../desktopPaneHistory';

function setup(stack: object[]) {
  const state = { stack };
  const navigateBack = vi.fn();
  const runtime: DesktopPaneHistoryRuntime = { getPages: () => state.stack, navigateBack };
  return { state, navigateBack, runtime };
}

describe('retained desktop Home right-pane navigation history', () => {
  it('does nothing when Home is already the stack top', async () => {
    const owner = {}, fixture = setup([owner]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('returns exactly to the captured owner without closing pages below it', async () => {
    const before = {}, owner = {}, detail = {}, thread = {};
    const fixture = setup([before, owner, detail, thread]);
    const history = createDesktopPaneHistory(owner, fixture.runtime), result = history.reset();
    const options = fixture.navigateBack.mock.calls[0][0];
    expect(options.delta).toBe(2);
    fixture.state.stack = [before, owner]; options.success();
    expect(await result).toBe(true); expect(fixture.state.stack[0]).toBe(before);
  });
  it('prefers the retained pageRouter and binds its this value', async () => {
    const owner = { pageRouter: { navigateBack: vi.fn() } }, fixture = setup([owner, {}]);
    owner.pageRouter.navigateBack.mockImplementation(function (options) {
      expect(this).toBe(owner.pageRouter); fixture.state.stack = [owner]; options.success();
    });
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
    expect(owner.pageRouter.navigateBack).toHaveBeenCalledTimes(1);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('shares one in-flight pop across repeated navigation selections', async () => {
    const owner = {}, fixture = setup([owner, {}, {}]);
    const history = createDesktopPaneHistory(owner, fixture.runtime);
    const first = history.reset(), second = history.reset();
    expect(first).toBe(second); expect(fixture.navigateBack).toHaveBeenCalledTimes(1);
    fixture.state.stack = [owner]; fixture.navigateBack.mock.calls[0][0].success();
    expect(await first).toBe(true); expect(await history.reset()).toBe(true);
  });
  it('accepts promise-only native success after checking the actual stack', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    fixture.navigateBack.mockImplementation(() => { fixture.state.stack = [owner]; return Promise.resolve({}); });
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
  });
  it('does not accept a success callback that leaves another page above Home', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    fixture.navigateBack.mockImplementation(options => options.success());
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
  });
  it('does not target another Home instance with the same route', async () => {
    const owner = { route: 'pages/home/index' }, fixture = setup([{ route: 'pages/home/index' }, {}]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('rejects absent owner and failed stack reads without navigation', async () => {
    const fixture = setup([]);
    expect(await createDesktopPaneHistory(undefined, fixture.runtime).reset()).toBe(false);
    fixture.runtime.getPages = () => { throw Error('fixture failure'); };
    expect(await createDesktopPaneHistory({}, fixture.runtime).reset()).toBe(false);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('allows retry after a native failure', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    const history = createDesktopPaneHistory(owner, fixture.runtime), first = history.reset();
    fixture.navigateBack.mock.calls[0][0].fail(); expect(await first).toBe(false);
    const second = history.reset(); expect(fixture.navigateBack).toHaveBeenCalledTimes(2);
    fixture.state.stack = [owner]; fixture.navigateBack.mock.calls[1][0].success();
    expect(await second).toBe(true);
  });
  it('handles synchronous native throws and rejected promises', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    fixture.navigateBack.mockImplementation(() => { throw Error('fixture failure'); });
    const history = createDesktopPaneHistory(owner, fixture.runtime);
    expect(await history.reset()).toBe(false);
    fixture.navigateBack.mockImplementation(() => Promise.reject(Error('fixture failure')));
    expect(await history.reset()).toBe(false);
  });
  it('settles only once when both callback and promise report completion', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    fixture.navigateBack.mockImplementation(options => {
      fixture.state.stack = [owner]; options.success(); return Promise.reject(Error('late fixture failure'));
    });
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
    await Promise.resolve();
  });
  it('resolves the owning page lazily after native root context becomes available', async () => {
    let owner: object | undefined;
    const page = {}, fixture = setup([page]);
    const history = createDesktopPaneHistory(() => owner, fixture.runtime);
    expect(await history.reset()).toBe(false);
    owner = page;
    expect(await history.reset()).toBe(true);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('matches native wrappers by reliable page id, not JavaScript reference alone', async () => {
    const owner = { getPageId: () => 'home-native-id' };
    const page = { getPageId: () => 'home-native-id', pageRouter: { navigateBack: vi.fn() } };
    const fixture = setup([page, {}]);
    page.pageRouter.navigateBack.mockImplementation(options => { fixture.state.stack = [page]; options.success(); });
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
    expect(page.pageRouter.navigateBack).toHaveBeenCalledOnce();
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('uses a timestamp-qualified Taro instance path when native page ids are unavailable', async () => {
    const owner = { $taroPath: '/pages/home/index?$taroTimestamp=101' };
    const page = { $taroPath: owner.$taroPath }, fixture = setup([page]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(true);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('rejects empty ids, route-only paths and ambiguous instance matches', async () => {
    const route = '/pages/home/index';
    for (const owner of [{ getPageId: () => '' }, { $taroPath: route }]) {
      const fixture = setup([{ ...owner }]);
      expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
      expect(fixture.navigateBack).not.toHaveBeenCalled();
    }
    const owner = { getPageId: () => 'duplicate-id' }, fixture = setup([{ ...owner }, { ...owner }]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('does not use matching paths when reliable native page ids disagree', async () => {
    const path = '/pages/home/index?$taroTimestamp=101';
    const owner = { $taroPath: path, getPageId: () => 'first' };
    const fixture = setup([{ $taroPath: path, getPageId: () => 'second' }]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('checks once on the next native tick when success precedes stack synchronization', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    const ticks: (() => void)[] = [];
    fixture.runtime.nextTick = callback => { ticks.push(callback); };
    const history = createDesktopPaneHistory(owner, fixture.runtime), result = history.reset();
    fixture.navigateBack.mock.calls[0][0].success();
    expect(ticks).toHaveLength(1); expect(history.reset()).toBe(result);
    fixture.state.stack = [owner]; ticks[0]();
    expect(await result).toBe(true);
    expect(ticks).toHaveLength(1); expect(fixture.navigateBack).toHaveBeenCalledOnce();
  });
  it('fails safely after one synchronization tick without retry navigation or polling', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    const ticks: (() => void)[] = []; fixture.runtime.nextTick = callback => { ticks.push(callback); };
    const result = createDesktopPaneHistory(owner, fixture.runtime).reset();
    fixture.navigateBack.mock.calls[0][0].success(); ticks[0]();
    expect(await result).toBe(false); expect(ticks).toHaveLength(1);
    expect(fixture.navigateBack).toHaveBeenCalledOnce();
  });
  it('rejects a changed owner resolver and ignores a late synchronization tick after dispose', async () => {
    let owner = {};
    const fixture = setup([owner, {}]), ticks: (() => void)[] = [];
    fixture.runtime.nextTick = callback => { ticks.push(callback); };
    const history = createDesktopPaneHistory(() => owner, fixture.runtime), result = history.reset();
    fixture.navigateBack.mock.calls[0][0].success();
    const original = owner; owner = {}; fixture.state.stack = [original]; ticks[0]();
    expect(await result).toBe(false);
    owner = original; fixture.state.stack = [owner, {}];
    const pending = history.reset(); fixture.navigateBack.mock.calls[1][0].success(); history.dispose();
    expect(await pending).toBe(false); fixture.state.stack = [owner]; ticks[1]();
    expect(await history.reset()).toBe(false);
  });
  it('rejects throwing identity getters and owner resolvers without guessing', async () => {
    const owner = { getPageId: () => { throw Error('synthetic identity failure'); } };
    const fixture = setup([{ getPageId: () => 'other' }]);
    expect(await createDesktopPaneHistory(owner, fixture.runtime).reset()).toBe(false);
    expect(await createDesktopPaneHistory(() => { throw Error('synthetic resolver failure'); }, fixture.runtime).reset()).toBe(false);
    expect(fixture.navigateBack).not.toHaveBeenCalled();
  });
  it('disposal cancels pending selections and ignores late route completion', async () => {
    const owner = {}, fixture = setup([owner, {}]);
    const history = createDesktopPaneHistory(owner, fixture.runtime), result = history.reset();
    const options = fixture.navigateBack.mock.calls[0][0]; history.dispose();
    expect(await result).toBe(false);
    fixture.state.stack = [owner]; options.success();
    expect(await history.reset()).toBe(false); expect(fixture.navigateBack).toHaveBeenCalledTimes(1);
  });
});
