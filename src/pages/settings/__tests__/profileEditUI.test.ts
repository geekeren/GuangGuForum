import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import Taro from '@tarojs/taro';
import { getOwnProfileSettings, saveOwnProfileSettings, type OwnProfileSettings } from 'guanggu-forum-api';
import type { ProfileEditState } from '../profileEditState';
import EditProfilePage from '../edit-profile';
import Me from '../../me';
import UserProfilePage from '../../user';
import { THEME_PALETTES } from '../../../utils/themePreferences';
const runtime = vi.hoisted(() => ({ account: 'fixture', routeUsername: 'other', theme: 'light' as 'light' | 'dark', refs: [] as any[], cursor: 0, effects: [] as any[], hide: undefined as (() => void) | undefined, profile: null as any, fresh: vi.fn() }));
vi.mock('react', () => ({ useMemo: (compute: () => unknown) => compute(), useRef: (value: any) => { const i = runtime.cursor++; if (!(i in runtime.refs)) runtime.refs[i] = { current: value }; return runtime.refs[i]; }, useEffect: (fn: any) => runtime.effects.push(fn), useSyncExternalStore: (_: any, snapshot: any) => snapshot() }));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView', Picker: 'Picker', Image: 'Image' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn(), enableAlertBeforeUnload: vi.fn(), disableAlertBeforeUnload: vi.fn(), showModal: vi.fn(), showToast: vi.fn(), eventCenter: { trigger: vi.fn(), on: vi.fn(), off: vi.fn() } }, useRouter: () => ({ params: { username: runtime.routeUsername } }), useDidShow: () => {}, useDidHide: (callback: () => void) => { runtime.hide = callback; } }));
vi.mock('guanggu-forum-api', () => ({ getOwnProfileSettings: vi.fn(), saveOwnProfileSettings: vi.fn(), getUserProfile: vi.fn() }));
vi.mock('../../../utils/currentUser', () => ({ getCachedUsername: () => runtime.account, subscribeCurrentAccount: () => () => {} }));
vi.mock('../../../hooks/useCurrentUsername', () => ({ useCurrentUsername: () => ({ username: runtime.account, loading: false, error: false, retry: vi.fn() }) }));
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../../utils/renderer', () => ({ getScrollViewType: () => 'custom' }));
vi.mock('../../../hooks/useTheme', () => ({ useTheme: () => ({ theme: runtime.theme, preference: runtime.theme }) }));
vi.mock('../../../utils/CacheService', () => ({ cacheService: { get: vi.fn(), set: vi.fn() }, CacheCategory: {} }));
vi.mock('../../../hooks/useDataWithCache', () => ({ useDataWithCache: () => ({ data: runtime.profile, request: vi.fn(), requestFresh: runtime.fresh }) }));
vi.mock('../../../components/ThemePage', () => ({ default: ({ children }: any) => children }));
vi.mock('../../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../../components/ClearableInput', () => ({ ClearableInput: 'ClearableInput', ClearableTextarea: 'ClearableTextarea' }));
vi.mock('../../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../../components/UserProfileDetail', () => ({ default: 'UserProfileDetail' }));
function all(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(all); if (!tree || typeof tree !== 'object') return []; if (typeof tree.type === 'function') return all(tree.type(tree.props)); return [tree, ...all(tree.props?.children)]; }
function render(component: any) { runtime.cursor = 0; return all(component()); }
const fields = { nickname: '', gender: 'x', generation: 'z', signature: '', location: '', website: '', college: '', company: '', self_intro: '' };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function loadedEditor() {
  const draft: OwnProfileSettings = { username: 'fixture', email: 'fixture@example.invalid', fields: { ...fields }, options: { gender: [], generation: [] } };
  vi.mocked(getOwnProfileSettings).mockResolvedValue(draft);
  render(EditProfilePage);
  const store = runtime.refs[0].current as ProfileEditState;
  store.activate('fixture'); await store.load(); store.change('nickname', 'synthetic changed nickname');
  const save = () => render(EditProfilePage).find(node => node.props.ariaLabel === '保存个人资料')!.props.onClick();
  return { store, draft, save };
}
beforeEach(() => {
  runtime.refs = []; runtime.effects = []; runtime.hide = undefined; runtime.account = 'fixture'; runtime.theme = 'light'; runtime.profile = { username: 'fixture' };
  vi.mocked(Taro.navigateTo).mockClear(); vi.mocked(Taro.eventCenter.on).mockClear(); vi.mocked(Taro.eventCenter.trigger).mockClear(); vi.mocked(Taro.showModal).mockReset(); vi.mocked(Taro.showToast).mockReset();
  vi.mocked(getOwnProfileSettings).mockReset(); vi.mocked(saveOwnProfileSettings).mockReset(); runtime.fresh.mockReset().mockResolvedValue({});
});
describe('profile settings navigation and native form', () => {
  it('Me moves settings to the left navbar and replaces only its own profile action with an edit arrow', () => {
    const nodes = render(() => Me({ active: true })); const navbar = nodes.find(node => node.type === 'Navbar');
    expect(navbar.props.leftAction.props.className).toBe('navSettingsIcon'); navbar.props.leftAction.props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/settings/index' });
    const profile = nodes.find(node => node.type === 'UserProfileDetail'); expect(profile.props.actions.props.className).toBe('meProfileEditIcon');
    profile.props.actions.props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/settings/edit-profile' });
    runtime.account = 'other'; vi.mocked(Taro.navigateTo).mockClear(); profile.props.actions.props.onClick(); expect(Taro.navigateTo).not.toHaveBeenCalled();
  });
  it('own profile edit supports API-confirmed decoded legacy account but not another account', () => {
    runtime.account = '%E6%B5%8B%E8%AF%95'; runtime.profile = { username: '测试' }; const nodes = render(() => Me({ active: true }));
    nodes.find(node => node.type === 'UserProfileDetail').props.actions.props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/settings/edit-profile' });
  });
  it('guest retains settings but has no edit action', () => {
    runtime.account = ''; const nodes = render(() => Me({ active: true })); expect(nodes.some(node => node.type === 'UserProfileDetail')).toBe(false);
    nodes.find(node => node.type === 'Navbar').props.leftAction.props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/settings/index' });
  });
  it('same-account profile update waits while hidden and refreshes only the current own profile on activation', () => {
    render(() => Me({ active: false })); const firstEffects = runtime.effects.splice(0); firstEffects[0](); firstEffects[1]();
    const listener = vi.mocked(Taro.eventCenter.on).mock.calls[0][1] as any;
    listener('other'); listener('fixture'); expect(runtime.fresh).not.toHaveBeenCalled();
    render(() => Me({ active: true })); const activeEffects = runtime.effects.splice(0); activeEffects[1]();
    expect(runtime.fresh).toHaveBeenCalledWith({ username: 'fixture' }); expect(runtime.fresh).toHaveBeenCalledTimes(1);
    runtime.account = 'other'; listener('fixture'); expect(runtime.fresh).toHaveBeenCalledTimes(1);
  });
  it.each(['light', 'dark'] as const)('Me %s keeps its navbar fixed while only the loaded profile opts into page-owned hero paint', (theme) => {
    runtime.theme = theme;
    for (const account of ['fixture', '']) {
      runtime.account = account;
      const nodes = render(() => Me({ active: true }));
      const root = nodes.find(node => node.props.className?.startsWith('meProfile ' ) || node.props.className === 'meProfile');
      const wrapper = nodes.find(node => node.props.className === 'meProfileNavbar');
      expect(wrapper.props.children.type).toBe('Navbar');
      expect(all(wrapper).filter(node => node.type === 'Navbar')).toHaveLength(1);
      expect(all(wrapper).some(node => node.type === 'ScrollView')).toBe(false);
      expect(root.props.children[0]).toBe(wrapper);
      expect(wrapper.props.style).toBeUndefined();
      if (account) {
        expect(root.props.className).toBe('meProfile meProfile--ready');
        expect(root.props.children[1].props.className).toBe('meProfileScroll');
        const profile = nodes.find(node => node.type === 'UserProfileDetail');
        expect(profile.props.navPaddingTop).toBe(0);
        expect(profile.props.backgroundOwner).toBe('page');
        expect(all(root.props.children[1]).some(node => node.type === 'Navbar')).toBe(false);
        expect(root.props.children[1].props.onScroll).toBeUndefined();
      } else expect(root.props.className).toBe('meProfile meProfile--notLoggedIn');
    }
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/me/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/me')] }).css;
    const rule = css.match(/\.meProfileNavbar\s*\{([^}]*)\}/)![1];
    expect(rule).toContain('background: var(--theme-bg, #f4f5fa)');
    expect(rule).toContain('flex-shrink: 0'); expect(rule).toContain('width: 100%');
    expect(rule).not.toMatch(/position|height|padding|margin|!important/);
    const ready = css.match(/\.meProfile--ready\s*\{([^}]*)\}/)![1];
    expect(ready).toContain('background-image: linear-gradient(180deg, var(--theme-brand-soft, #e0eaff) 0, var(--theme-surface-soft, #edf3ff) 216rpx, var(--theme-bg, #f4f5fa) 360rpx)');
    expect(ready).not.toMatch(/height:|padding:|position:|background-size|background-repeat|%\)/);
    expect(css).toMatch(/\.meProfile--ready \.meProfileNavbar\s*\{\s*background: transparent;/);
    expect(css).toMatch(/\.themePageHost--dark \.meProfile\.meProfile--ready\s*\{\s*background-image: none;/);
    expect(THEME_PALETTES[theme].bg).toMatch(/^#[\da-f]{6}$/);
    expect(THEME_PALETTES[theme].bg).toBe(THEME_PALETTES[theme]['profile-bg']);
    expect(THEME_PALETTES[theme].bg).not.toBe(THEME_PALETTES[theme].surface);
  });
  it.each(['light', 'dark'] as const)('user route %s covers the whole navbar with the page canvas in loading, self, other and guest views', (theme) => {
    runtime.theme = theme;
    for (const account of ['fixture', '']) {
      runtime.account = account;
      for (const username of ['fixture', 'other']) {
        runtime.routeUsername = username;
        for (const loaded of [false, true]) {
          runtime.profile = loaded ? { username, uid: username === 'fixture' ? 7 : 8 } : null;
          const nodes = render(UserProfilePage);
          const root = nodes.find(node => node.props.className === 'userPage');
          const wrapper = nodes.find(node => node.props.className === 'userProfileNavbar');
          expect(root.props.children[0]).toBe(wrapper);
          const navbar = wrapper.props.children;
          expect(navbar.type).toBe('Navbar'); expect(navbar.props.shared).toBe(false);
          expect(navbar.props.back).toBe(true); expect(navbar.props.home).toBe(true);
          expect(navbar.props.title).toBe('个人主页');
          expect(all(wrapper).filter(node => node.type === 'Navbar')).toHaveLength(1);
          expect(wrapper.props.style).toBeUndefined();
          expect(all(wrapper).some(node => node.type === 'ScrollView' || node.type === 'UserProfileDetail')).toBe(false);
          if (loaded) {
            expect(root.props.children[1].props.className).toBe('userScroll');
            expect(root.props.children[1].props.scrollY).toBe(true);
            expect(nodes.find(node => node.type === 'UserProfileDetail').props.navPaddingTop).toBeUndefined();
            expect(nodes.find(node => node.type === 'UserProfileDetail').props.backgroundOwner).toBeUndefined();
          } else expect(root.props.children[1].type).toBe('Loading');
        }
      }
    }
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/user/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/user')] }).css;
    const rule = css.match(/\.userPage \.userProfileNavbar\s*\{([^}]*)\}/)![1];
    expect(rule).toContain('background: var(--theme-bg, #f4f5fa)');
    expect(rule).toContain('flex-shrink: 0'); expect(rule).toContain('width: 100%');
    expect(rule).not.toMatch(/position|height|padding|margin|!important|opacity|rgba/);
    expect(THEME_PALETTES[theme].bg).toMatch(/^#[\da-f]{6}$/);
  });
  it('local profile navbar backgrounds match their page roots without altering native status-bar sizing or card gradients', () => {
    for (const file of ['me', 'user']) {
      const css = compileString(readFileSync(resolve(process.cwd(), `src/pages/${file}/index.scss`), 'utf8'), { loadPaths: [resolve(process.cwd(), `src/pages/${file}`)] }).css;
      const root = css.match(file === 'me' ? /\.meProfile\s*\{([^}]*)\}/ : /\.userPage\s*\{([^}]*)\}/)![1];
      expect(root).toContain('background: var(--theme-bg, #f4f5fa)');
    }
    const navbar = readFileSync(resolve(process.cwd(), 'src/components/Navbar/index.tsx'), 'utf8');
    expect(navbar).toContain('paddingTop: inModal ? 0 : statusBarHeight + "px"');
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/components/UserProfileDetail/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/components/UserProfileDetail')] }).css;
    expect(css).toContain('linear-gradient(180deg, var(--theme-brand-soft');
    expect(css).toMatch(/\.themePageHost--dark .*\.profileCard\s*\{\s*background: var\(--theme-profile-bg, #000000\)/);
    const optIn = '.meProfile.meProfile--ready .userProfileDetail.userProfileDetail--pageBackground';
    expect(css).toContain(`${optIn} {\n  background: transparent;`);
    expect(css).toContain(`${optIn} .profileCard {\n  background: transparent;`);
    const body = css.split(`${optIn} .profileBody {`)[1].split('}')[0];
    expect(body).toContain('background: var(--theme-bg, #f4f5fa)');
    expect(body).toContain('display: flex'); expect(body).toContain('flex-direction: column');
    expect(body).not.toMatch(/height|padding|margin|position|!important/);
    const me = readFileSync(resolve(process.cwd(), 'src/pages/me/index.tsx'), 'utf8');
    expect(me).not.toMatch(/createSelectorQuery|onScroll|setTimeout|position:|profileHeader=/);
  });
  it.each(['light', 'dark'] as const)('editor %s passes supported native input caret color and resolved textarea CSS without stealing focus', (theme) => {
    runtime.theme = theme;
    render(EditProfilePage); const store = runtime.refs[0].current; store.activate('fixture');
    const draft = { username: 'fixture', email: '', fields, options: { gender: [], generation: [] } };
    store.value = { ...store.snapshot(), draft, fields: { ...fields } };
    for (const status of [{ loading: false, saving: false }, { loading: true, saving: false }, { loading: false, saving: true }]) {
      store.value = { ...store.snapshot(), ...status };
      const nodes = render(EditProfilePage); const inputs = nodes.filter(node => node.type === 'ClearableInput');
      expect(inputs).toHaveLength(6);
      const textarea = nodes.find(node => node.type === 'ClearableTextarea');
      for (const input of inputs) expect(input.props.cursorColor).toBe(THEME_PALETTES[theme]['input-caret']);
      expect(textarea.props.cursorColor).toBeUndefined();
      for (const control of [...inputs, textarea]) {
        expect(control.props.style).toEqual({ caretColor: THEME_PALETTES[theme]['input-caret'] });
        expect(control.props.disabled).toBe(status.loading || status.saving);
        expect(control.props.focus).toBeUndefined(); expect(control.props.autoFocus).toBeUndefined();
      }
    }
    const source = readFileSync(resolve(process.cwd(), 'src/pages/settings/edit-profile.tsx'), 'utf8');
    expect(source).not.toMatch(/setTimeout|setInterval|nextTick|\.focus\(/);
  });
  it('standard fields keep all labels beside controls, multiline aligned, and picker arrows reflect API values only', () => {
    render(EditProfilePage); const store = runtime.refs[0].current; store.activate('fixture');
    const options = { gender: [{ value: 'a', label: '第一项' }, { value: 'x', label: '当前性别完整名称' }], generation: [{ value: 'z', label: '年代完整名称' }] };
    store.value = { ...store.snapshot(), draft: { username: 'fixture', email: '', fields, options }, fields: { ...fields } };
    const nodes = render(EditProfilePage);
    const rows = nodes.filter(node => node.props.className?.split(' ').includes('gzkFormField'));
    expect(rows).toHaveLength(11);
    for (const row of rows) expect(row.props.children.map((child: any) => child.props.className)).toEqual(['gzkFormFieldLabel', 'gzkFormFieldControl']);
    expect(rows.find(row => row.props.children[0].props.children === '个人简介')!.props.className).toContain('gzkFormField--multiline');
    const pickers = nodes.filter(node => node.type === 'Picker'); expect(pickers.map(node => node.props.value)).toEqual([1, 0]);
    expect(nodes.filter(node => node.props.className === 'gzkSelectArrow')).toHaveLength(2);
    expect(nodes.filter(node => node.props.className === 'gzkSelectValue').map(node => node.props.children)).toEqual(['当前性别完整名称', '年代完整名称']);
    expect(nodes.some(node => node.props.children === '选择')).toBe(false);
    for (const value of [-1, 2, 'garbage', '', 0.5]) pickers[0].props.onChange({ detail: { value } });
    expect(store.snapshot().fields!.gender).toBe('x');
    pickers[0].props.onChange({ detail: { value: '0' } }); expect(store.snapshot().fields!.gender).toBe('a');
  });
  it('profile footer adds safe-bottom spacing to its preview-style pill buttons without changing save gating', () => {
    render(EditProfilePage); const store = runtime.refs[0].current; store.activate('fixture');
    store.value = { ...store.snapshot(), draft: { username: 'fixture', email: '', fields, options: { gender: [], generation: [] } }, fields: { ...fields }, dirty: true };
    let nodes = render(EditProfilePage);
    expect(nodes.find(node => node.props.className === 'profileEditorRefresh')!.props.children).toBe('刷新资料');
    expect(nodes.find(node => node.props.ariaLabel === '保存个人资料')!.props.className).not.toContain('profileEditorSave--disabled');
    store.value = { ...store.snapshot(), saving: true };
    nodes = render(EditProfilePage);
    const save = nodes.find(node => node.props.ariaLabel === '保存个人资料')!;
    expect(save.props.className).toContain('profileEditorSave--disabled'); expect(save.props.children.props.children).toBe('保存中…');
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/settings/edit-profile.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/settings')] }).css;
    const dock = css.match(/\.profileEditorDock\s*\{([^}]*)\}/)![1];
    expect(dock).toContain('padding-bottom: calc(26rpx + env(safe-area-inset-bottom))'); expect(dock).not.toContain('max(');
    const buttons = css.match(/\.profileEditorRefresh, \.profileEditorSave\s*\{([^}]*)\}/)![1];
    expect(buttons).toContain('height: 80rpx'); expect(buttons).toContain('border-radius: 44rpx');
    const primary = css.match(/(?:^|\n)\.profileEditorSave\s*\{([^}]*)\}/)![1];
    expect(primary).toContain('linear-gradient(110deg'); expect(primary).toContain('box-shadow: 0 6rpx 18rpx');
  });
  it('shows the established native success toast once after a verified save, without a specialized saved card or render replay', async () => {
    const { store, draft, save } = await loadedEditor();
    const pending = deferred<OwnProfileSettings>(); vi.mocked(saveOwnProfileSettings).mockReturnValue(pending.promise);
    const completed = new Promise<void>(resolve => vi.mocked(Taro.showToast).mockImplementationOnce(() => { resolve(); return Promise.resolve({ errMsg: 'showToast:ok' }); }));
    save(); save();
    expect(saveOwnProfileSettings).toHaveBeenCalledTimes(1); expect(vi.mocked(saveOwnProfileSettings).mock.calls[0][0]).toBe(draft);
    expect(Taro.showToast).not.toHaveBeenCalled(); expect(Taro.eventCenter.trigger).not.toHaveBeenCalled();
    const verified = { ...draft, fields: { ...draft.fields, nickname: 'synthetic changed nickname' } };
    pending.resolve(verified); await completed;
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '已保存', icon: 'success' }); expect(Taro.showToast).toHaveBeenCalledTimes(1);
    expect(Taro.eventCenter.trigger).toHaveBeenCalledWith('ownProfileSettingsUpdated', 'fixture'); expect(Taro.eventCenter.trigger).toHaveBeenCalledTimes(1);
    expect(store.snapshot().draft).toBe(verified); expect(store.snapshot().dirty).toBe(false);
    for (let round = 0; round < 3; round++) {
      expect(render(EditProfilePage).some(node => node.props.className === 'profileEditorNotice')).toBe(false); save();
    }
    expect(Taro.showToast).toHaveBeenCalledTimes(1); expect(saveOwnProfileSettings).toHaveBeenCalledTimes(1); expect(Taro.showModal).not.toHaveBeenCalled();
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/settings/edit-profile.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/settings')] }).css;
    expect(css).not.toContain('profileEditorNotice'); expect(css).toContain('profileEditorError');
  });
  it.each(['VERIFICATION', 'NETWORK', 'HTTP'])('unconfirmed save (%s) keeps the error/retry feedback and draft without a success toast', async code => {
    const { store, save } = await loadedEditor(); vi.mocked(saveOwnProfileSettings).mockRejectedValue({ code });
    const completed = new Promise<void>(resolve => { const stop = store.subscribe(() => { if (!store.snapshot().saving && store.snapshot().error) { stop(); resolve(); } }); });
    save(); await completed;
    expect(Taro.showToast).not.toHaveBeenCalled(); expect(Taro.eventCenter.trigger).not.toHaveBeenCalled();
    expect(store.snapshot().fields!.nickname).toBe('synthetic changed nickname'); expect(store.snapshot().requiresRefresh).toBe(true); expect(store.snapshot().dirty).toBe(true);
    const error = render(EditProfilePage).find(node => node.props.className === 'profileEditorError');
    expect(error).toBeDefined(); expect(error!.props.children).toContain('，点击刷新检查'); save(); expect(saveOwnProfileSettings).toHaveBeenCalledTimes(1);
  });
  it.each(['hide', 'account', 'reactivate'])('late confirmed save after %s cannot toast or notify success', async boundary => {
    const { store, draft, save } = await loadedEditor(); const pending = deferred<OwnProfileSettings>(); vi.mocked(saveOwnProfileSettings).mockReturnValue(pending.promise);
    const originalSave = store.save.bind(store); let completion: Promise<void> | undefined;
    vi.spyOn(store, 'save').mockImplementation(success => { const saving = originalSave(success); completion = saving; return saving; });
    save(); expect(store.snapshot().saving).toBe(true);
    if (boundary === 'hide') runtime.hide!();
    else if (boundary === 'account') runtime.account = 'other';
    else store.activate('fixture');
    pending.resolve(draft); await completion;
    expect(Taro.showToast).not.toHaveBeenCalled(); expect(Taro.eventCenter.trigger).not.toHaveBeenCalled(); expect(store.snapshot().draft).toBeNull();
  });
  it('editor fields use only API fields and options, readonly identity and no guessed avatar/password or limits', () => {
    render(EditProfilePage); const store = runtime.refs[0].current; store.activate('fixture');
    const original = { username: 'fixture', email: 'fixture@example.invalid', fields, options: { gender: [{ value: 'x', label: 'API gender' }], generation: [{ value: 'z', label: 'API generation' }] } };
    store.value = { ...store.snapshot(), draft: original, fields: { ...fields }, dirty: true };
    const nodes = render(EditProfilePage); const inputs = nodes.filter(node => node.type === 'ClearableInput'); expect(inputs).toHaveLength(6);
    expect(inputs.every(node => node.props.maxlength === -1)).toBe(true); expect(nodes.filter(node => node.type === 'ClearableTextarea')).toHaveLength(1);
    expect(nodes.filter(node => node.type === 'Picker').map(node => node.props.range)).toEqual([['API gender'], ['API generation']]);
    expect(nodes.filter(node => node.props.className === 'profileEditorReadonly').map(node => node.props.children)).toEqual(['fixture', 'fixture@example.invalid']);
    const source = readFileSync(resolve(process.cwd(), 'src/pages/settings/edit-profile.tsx'), 'utf8'); expect(source).not.toContain('useDataWithCache'); expect(source).not.toContain('setStorage');
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/settings/edit-profile.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/settings')] }).css;
    expect(css).toContain('font-size: 16.05PX'); expect(css).toContain('var(--theme-input-caret'); expect(css).toContain('safe-area-inset-bottom');
  });
});
