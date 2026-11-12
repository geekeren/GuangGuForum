import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { logout } from 'guanggu-forum-api';
import Settings, { SettingsContent } from '../../pages/settings';
import { cacheService } from '../CacheService';
import { setThemePreference } from '../themePreferences';
import { disableAd } from '../ad';
import { checkMiniProgramAdded } from '../../components/AddToDesktopGuide';

const h = vi.hoisted(() => ({ state: [] as any[], refs: [] as any[], effects: [] as (() => any)[], cursor: 0, refCursor: 0, account: 'synthetic', listeners: [] as (() => void)[], ads: [] as any[] }));
vi.mock('react', () => ({
  useState(initial: any) { const i = h.cursor++; if (!(i in h.state)) h.state[i] = typeof initial === 'function' ? initial() : initial; return [h.state[i], (value: any) => { h.state[i] = typeof value === 'function' ? value(h.state[i]) : value; }]; },
  useRef(initial: any) { return h.refs[h.refCursor++] ??= { current: initial }; },
  useEffect(effect: () => any) { h.effects.push(effect); },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('gzk-ui/native-form', () => ({ GzkButton: 'Button', GzkSwitch: 'Switch' }));
vi.mock('gzk-ui/icons', () => ({ ChevronRight: 'arrow' }));
vi.mock('@tarojs/taro', () => ({ default: {
  useDidHide: vi.fn(), useDidShow: vi.fn(), useShareAppMessage: vi.fn(), showActionSheet: vi.fn(), showModal: vi.fn(), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), reLaunch: vi.fn(), navigateTo: vi.fn(), addDesktopShortcut: vi.fn(),
  createRewardedVideoAd: () => {
    const ad = { close: null as any, error: null as any, onLoad: vi.fn(), onError: (fn: any) => { ad.error = fn; }, onClose: (fn: any) => { ad.close = fn; }, destroy: vi.fn(), show: vi.fn().mockResolvedValue({}), load: vi.fn().mockResolvedValue({}) }; h.ads.push(ad); return ad;
  },
} }));
vi.mock('guanggu-forum-api', () => ({ logout: vi.fn().mockResolvedValue({}) }));
vi.mock('../renderer', () => ({ isSkyline: () => true, getScrollViewType: () => 'list' }));
vi.mock('../currentUser', () => ({ getCachedUsername: () => h.account, subscribeCurrentAccount: (fn: () => void) => { h.listeners.push(fn); return () => {}; } }));
vi.mock('../CacheService', () => ({ CacheCategory: { System: 'system', Topic: 'topic' }, cacheService: { getAllCategoryStatsAsync: vi.fn().mockResolvedValue([]), clearCategoryAsync: vi.fn().mockResolvedValue(undefined), clearAllAsync: vi.fn().mockResolvedValue(undefined), removeAsync: vi.fn().mockResolvedValue(true) } }));
vi.mock('../themePreferences', () => ({ THEME_LABELS: { system: '跟随系统', light: '浅色', dark: '深色' }, setThemePreference: vi.fn().mockReturnValue(true) }));
vi.mock('../ad', () => ({ AD_DISABLE_KEY: 'synthetic-ad', isAdDisabled: () => false, disableAd: vi.fn().mockReturnValue(true), getAdDisabledDays: () => 0 }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ preference: 'system' }) }));
vi.mock('../linkHandler', () => ({ linkHandler: vi.fn() }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../components/AddToDesktopGuide', () => ({ default: 'Guide', checkMiniProgramAdded: vi.fn().mockResolvedValue(false) }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
let props = { active: true, embedded: true };
function render() { h.cursor = 0; h.refCursor = 0; return elements(SettingsContent(props)); }
function row(label: string) { return render().find(node => node.props?.onClick && elements(node.props.children).some(child => child.type === 'Text' && child.props.children === label))!; }
function activate(active: boolean) { props.active = active; render(); h.effects.at(-1)!(); }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error?: any) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: () => reject(new Error('synthetic rejection')) }; }
beforeEach(() => { props = { active: true, embedded: true }; h.state = []; h.refs = []; h.effects = []; h.listeners = []; h.ads = []; h.account = 'synthetic'; vi.clearAllMocks(); render(); h.effects.forEach(effect => effect()); });
describe('retained embedded settings lifecycle', () => {
  it('refreshes immediately after lazy mount without a second Navbar/share hook and preserves the standalone wrapper', async () => {
    await flush(); expect(cacheService.getAllCategoryStatsAsync).toHaveBeenCalledOnce(); expect(checkMiniProgramAdded).toHaveBeenCalledOnce();
    expect(render().some(node => node.type === 'Navbar')).toBe(false); expect(Taro.useShareAppMessage).not.toHaveBeenCalled();
    const standalone = Settings(); expect(standalone.type).toBe(SettingsContent); expect(Taro.useShareAppMessage).toHaveBeenCalledOnce();
    props.embedded = false; expect(render().some(node => node.type === 'Navbar')).toBe(true);
  });
  it('rejects delayed stats and added checks after a leave-return revision', async () => {
    const stats = deferred<any[]>(), added = deferred<boolean>();
    vi.mocked(cacheService.getAllCategoryStatsAsync).mockReturnValueOnce(stats.promise); vi.mocked(checkMiniProgramAdded).mockReturnValueOnce(added.promise);
    activate(false); activate(true); activate(false); activate(true); await flush(); stats.resolve([{ category: 'topic', label: 'old synthetic', size: 2048, count: 1 }]); added.resolve(true); await flush();
    expect(render().some(node => node.props?.children === 'old synthetic')).toBe(false); expect(row('添加到我的小程序').props.children).toBeTruthy();
    expect(render().some(node => node.props?.className === 'settingsItemStatusTag settingsItemStatusTag--added')).toBe(false);
  });
  it.each(['tab', 'A-B-A'] as const)('cannot save a late appearance choice after %s', async reason => {
    const result = deferred<any>(); vi.mocked(Taro.showActionSheet).mockReturnValueOnce(result.promise); const pending = row('外观').props.onClick();
    if (reason === 'tab') { activate(false); activate(true); } else { h.account = 'B'; h.listeners.forEach(fn => fn()); h.account = 'synthetic'; h.listeners.forEach(fn => fn()); }
    result.resolve({ tapIndex: 2 }); await pending; expect(setThemePreference).not.toHaveBeenCalled();
  });
  it('does not show a guide from a late failed desktop shortcut after returning', async () => {
    const result = deferred<any>(); (Taro as any).addDesktopShortcut.mockReturnValueOnce(result.promise); const pending = row('添加到桌面').props.onClick(); activate(false); activate(true); result.reject(); await pending;
    expect(render().some(node => node.type === 'Guide')).toBe(false);
  });
  it.each(['清除缓存', '清除所有数据', '退出登录'] as const)('does not execute a stale confirmed %s modal after leaving and returning', async label => {
    const result = deferred<any>(); vi.mocked(Taro.showModal).mockReturnValueOnce(result.promise); const pending = row(label).props.onClick(); activate(false); activate(true); result.resolve({ confirm: true }); await pending;
    expect(cacheService.clearAllAsync).not.toHaveBeenCalled(); expect(logout).not.toHaveBeenCalled(); expect(Taro.reLaunch).not.toHaveBeenCalled();
  });
  it('does not grant a stale native ad reward even after a new visit starts another ad', async () => {
    vi.mocked(Taro.showModal).mockResolvedValue({ confirm: true } as any);
    const change = () => render().find(node => node.type === 'Switch')!.props.onClick({});
    await change(); const old = h.ads[0]; activate(false); activate(true); await change(); const current = h.ads.at(-1);
    old.close({ isEnded: true }); old.error({}); expect(disableAd).not.toHaveBeenCalled(); expect(old.destroy).toHaveBeenCalledOnce();
    current.close({ isEnded: true }); expect(disableAd).toHaveBeenCalledOnce();
  });
  it('rejects a stale ad confirmation before showing native video', async () => {
    const result = deferred<any>(); vi.mocked(Taro.showModal).mockReturnValueOnce(result.promise); const pending = render().find(node => node.type === 'Switch')!.props.onClick({}); activate(false); activate(true); result.resolve({ confirm: true }); await pending;
    expect(h.ads.every(ad => ad.show.mock.calls.length === 0)).toBe(true); expect(disableAd).not.toHaveBeenCalled();
  });
});
