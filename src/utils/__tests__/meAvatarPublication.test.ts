import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserProfile } from 'guanggu-forum-api';
import Taro from '@tarojs/taro';
import Me from '../../pages/me';

// Synthetic hooks, real useDataWithCache and Me request/effect flow; no native page or storage.
const runtime = vi.hoisted(() => ({
  slots: [] as any[], cursor: 0, effects: [] as (() => void)[],
  account: 'A', username: 'A', loginError: undefined as any,
  requests: [] as { resolve: (value: any) => void; options: any }[],
}));
vi.mock('react', async importOriginal => {
  const changed = (before: any[] | undefined, next: any[]) => !before || before.length !== next.length || next.some((value, index) => !Object.is(value, before[index]));
  return {
    ...await importOriginal<any>(),
    useState(initial: any) {
      const index = runtime.cursor++;
      if (!(index in runtime.slots)) runtime.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [runtime.slots[index], (value: any) => { runtime.slots[index] = typeof value === 'function' ? value(runtime.slots[index]) : value; }];
    },
    useRef(initial: any) {
      const index = runtime.cursor++;
      if (!(index in runtime.slots)) runtime.slots[index] = { current: initial };
      return runtime.slots[index];
    },
    useCallback(callback: any, deps: any[]) {
      const index = runtime.cursor++;
      if (changed(runtime.slots[index]?.deps, deps)) runtime.slots[index] = { deps, callback };
      return runtime.slots[index].callback;
    },
    useEffect(effect: () => any, deps: any[]) {
      const index = runtime.cursor++;
      if (!changed(runtime.slots[index]?.deps, deps)) return;
      runtime.effects.push(() => { runtime.slots[index]?.cleanup?.(); runtime.slots[index] = { deps, cleanup: effect() }; });
    },
  };
});
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { eventCenter: { on: vi.fn(), off: vi.fn() }, navigateTo: vi.fn() } }));
vi.mock('guanggu-forum-api', () => ({ getUserProfile: vi.fn((_params: any, options: any) => new Promise(resolve => runtime.requests.push({ resolve, options }))) }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../hooks/useCurrentUsername', () => ({ useCurrentUsername: () => ({ username: runtime.username, loading: false, error: runtime.loginError }) }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => runtime.account }));
vi.mock('../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../components/UserProfileDetail', () => ({ default: 'UserProfileDetail' }));
vi.mock('../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));

function render(publish: any, active = true, hideSettings?: boolean) {
  runtime.cursor = 0;
  return Me({ active, onOwnAvatarChange: publish, hideSettings });
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...elements(tree.props?.children)];
}
function effects() { runtime.effects.splice(0).forEach(effect => effect()); }
async function complete(index: number, username: string, avatarUrl: string) {
  runtime.requests[index].resolve({ username, avatarUrl });
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
function account(value: string) { runtime.account = runtime.username = value; }
beforeEach(() => {
  runtime.slots = []; runtime.cursor = 0; runtime.effects = []; runtime.requests = [];
  runtime.account = runtime.username = 'A'; runtime.loginError = undefined; vi.clearAllMocks();
});

describe('Me publishes existing own-profile avatars in an account-bound effect', () => {
  it.each(['ready', 'signed-out', 'loading', 'error'])('hides only the profile settings action with explicit hideSettings in %s and restores the default consumer', async status => {
    const publish = vi.fn();
    if (status === 'ready') { render(publish); effects(); await complete(0, 'A', 'synthetic-avatar'); }
    if (status === 'signed-out') account('');
    if (status === 'error') runtime.loginError = new Error('synthetic offline');
    const requests = vi.mocked(getUserProfile).mock.calls.length;
    for (const hidden of [undefined, true, false, true]) {
      const tree = render(publish, true, hidden), navbars = elements(tree).filter(node => node.type === 'Navbar');
      expect(navbars).toHaveLength(1); expect(navbars[0].props.shared).toBe(false);
      if (hidden) expect(navbars[0].props.leftAction).toBeNull();
      else {
        expect(navbars[0].props.leftAction.props.className).toBe('navSettingsIcon');
        navbars[0].props.leftAction.props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/settings/index' });
      }
      const profile = elements(tree).find(node => node.type === 'UserProfileDetail');
      if (status === 'ready') { expect(profile.props.actions.props.className).toBe('meProfileEditIcon'); expect(profile.props.profile.avatarUrl).toBe('synthetic-avatar'); }
      else expect(profile).toBeUndefined();
    }
    expect(getUserProfile).toHaveBeenCalledTimes(requests);
  });
  it('adds zero requests, publishes after effect only, and forwards original background refresh and fresh settings requests', async () => {
    const publish = vi.fn(); render(publish); effects(); expect(getUserProfile).toHaveBeenCalledTimes(1);
    await complete(0, 'A', 'synthetic-avatar'); render(publish);
    expect(publish).not.toHaveBeenCalled(); effects();
    expect(publish).toHaveBeenCalledWith({ account: 'A', avatarUrl: 'synthetic-avatar' });
    render(publish); effects(); expect(getUserProfile).toHaveBeenCalledTimes(1); expect(publish).toHaveBeenCalledTimes(1);
    runtime.requests[0].options.onRefresh({ username: 'A', avatarUrl: 'background-avatar' }); render(publish); effects();
    expect(publish).toHaveBeenLastCalledWith({ account: 'A', avatarUrl: 'background-avatar' });
    // Invoke the existing own-profile settings event, not a new avatar fetch.
    vi.mocked(Taro.eventCenter.on).mock.calls.find(call => call[0] === 'ownProfileSettingsUpdated')![1]('A');
    expect(getUserProfile).toHaveBeenCalledTimes(2); expect(runtime.requests[1].options.cache).toBe(false);
    await complete(1, 'A', 'fresh-avatar'); render(publish); effects();
    expect(publish).toHaveBeenLastCalledWith({ account: 'A', avatarUrl: 'fresh-avatar' });
    runtime.requests[0].options.onRefresh({ username: 'A', avatarUrl: 'superseded-avatar' }); render(publish); effects();
    expect(publish).toHaveBeenLastCalledWith({ account: 'A', avatarUrl: 'fresh-avatar' }); expect(getUserProfile).toHaveBeenCalledTimes(2);
  });
  it('does not relabel retained A data with the new A publisher after A -> B -> A while hidden', async () => {
    const oldA = vi.fn(), b = vi.fn(), newA = vi.fn(); render(oldA); effects(); await complete(0, 'A', 'old-avatar'); render(oldA); effects();
    account('B'); render(b, false); effects(); account('A'); render(newA, false); effects();
    expect(newA).not.toHaveBeenCalled(); expect(b).not.toHaveBeenCalled(); expect(getUserProfile).toHaveBeenCalledTimes(1);
    runtime.requests[0].options.onRefresh({ username: 'A', avatarUrl: 'late-old-avatar' }); render(newA, false); effects(); expect(newA).not.toHaveBeenCalled();
    render(newA); effects(); expect(getUserProfile).toHaveBeenCalledTimes(2); await complete(1, 'A', 'new-avatar'); render(newA); effects();
    expect(newA).toHaveBeenCalledWith({ account: 'A', avatarUrl: 'new-avatar' });
  });
  it('rejects an old completion, signout, mismatched profile and login error without extra requests', async () => {
    const oldA = vi.fn(), b = vi.fn(); render(oldA); effects(); account('B'); render(b, false); effects();
    await complete(0, 'A', 'late-A'); render(b, false); effects(); expect(oldA).not.toHaveBeenCalled(); expect(b).not.toHaveBeenCalled();
    account(''); render(b, false); effects(); expect(b).not.toHaveBeenCalled();
    account('B'); render(b); effects(); await complete(1, 'other', 'wrong-profile'); render(b); effects(); expect(b).not.toHaveBeenCalled();
    runtime.loginError = new Error('synthetic offline'); runtime.requests[1].options.onRefresh({ username: 'B', avatarUrl: 'B' }); render(b); effects(); expect(b).not.toHaveBeenCalled(); expect(getUserProfile).toHaveBeenCalledTimes(2);
  });
  it('ignores avatar completion and refresh after unmount', async () => {
    const publish = vi.fn(); render(publish); effects(); runtime.slots.forEach(slot => slot?.cleanup?.());
    await complete(0, 'A', 'late-avatar'); runtime.requests[0].options.onRefresh({ username: 'A', avatarUrl: 'late-refresh' });
    render(publish); effects(); expect(publish).not.toHaveBeenCalled(); expect(getUserProfile).toHaveBeenCalledTimes(1);
  });
});
