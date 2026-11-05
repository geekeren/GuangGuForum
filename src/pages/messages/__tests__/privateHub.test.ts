import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import Taro from '@tarojs/taro';
import { getNotifications, getUserProfile, getMessageSummary, getMessageConversations } from 'guanggu-forum-api';
import Notifications from '../../home/notifications';
import UserProfilePage from '../../user';

const runtime = vi.hoisted(() => ({
  state: [] as any[], cursor: 0, refs: [] as any[], refCursor: 0,
  effects: [] as any[], effectCursor: 0, pendingEffects: [] as any[],
  account: 'fixture-user', profile: null as any, notifications: [] as any[] | null,
  checkingLogin: false, loginError: false, loading: false,
}));
vi.mock('react', () => ({
  useState: (initial: any) => { const i = runtime.cursor++; if (!(i in runtime.state)) runtime.state[i] = typeof initial === 'function' ? initial() : initial; return [runtime.state[i], (next: any) => { runtime.state[i] = typeof next === 'function' ? next(runtime.state[i]) : next; }]; },
  useRef: (value: any) => { const i = runtime.refCursor++; if (!(i in runtime.refs)) runtime.refs[i] = { current: value }; return runtime.refs[i]; },
  useEffect: (effect: any, deps: any[]) => {
    const i = runtime.effectCursor++; const previous = runtime.effects[i];
    if (!previous || deps.some((value, index) => value !== previous.deps[index])) runtime.pendingEffects.push(() => {
      previous?.cleanup?.(); runtime.effects[i] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Image: 'Image', ScrollView: 'ScrollView' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn(), navigateBack: vi.fn(), showToast: vi.fn() }, useRouter: () => ({ params: { username: 'fixture-peer' } }) }));
vi.mock('guanggu-forum-api', () => ({ getNotifications: vi.fn(), resolveSearchResult: vi.fn(), getUserProfile: vi.fn(), getMessageSummary: vi.fn(), getMessageConversations: vi.fn() }));
vi.mock('../../../hooks/useCurrentUsername', () => ({ useCurrentUsername: () => ({ username: runtime.account, loading: runtime.checkingLogin, error: runtime.loginError, retry: vi.fn() }) }));
vi.mock('../../../hooks/useDataWithCache', () => ({ useDataWithCache: (api: any) => ({ data: api === getUserProfile ? runtime.profile : runtime.notifications, loading: runtime.loading, request: api }) }));
vi.mock('../../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => 'custom' }));
vi.mock('../../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('../../../utils/currentUser', () => ({ getCachedUsername: () => runtime.account }));
vi.mock('../../../utils/renderer', () => ({ getScrollViewType: () => 'custom' }));
vi.mock('../../../utils/themePreferences', () => ({ THEME_PALETTES: { dark: { 'accent-text': '#8bb5ff' } } }));
vi.mock('../../../utils/svgIcon', () => ({ svgIconSource: () => 'fixture' }));
vi.mock('../../../utils/unreadNotifications', () => ({ getUnreadNotificationCount: () => 2, subscribeUnreadNotifications: () => () => {} }));
vi.mock('../../../utils/nodeNavigation', () => ({ getCachedNodeNavigation: () => [{ nodes: [{ name: '公告', slug: 'notice' }] }], fetchAndCacheNodeNavigation: vi.fn() }));
vi.mock('../../../utils/topicReplyRoute', () => ({ buildTopicReplyRoute: () => '/pages/topicDetail/index?tid=13', parseTopicReplyLink: () => ({ tid: '13' }), replyPlainText: vi.fn() }));
vi.mock('../../../components/HtmlRender', () => ({ default: 'HtmlRender' }));
vi.mock('../../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../../components/LoginPrompt', () => ({ default: 'LoginPrompt' }));
vi.mock('../../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../../components/UserProfileDetail', () => ({ default: 'UserProfileDetail' }));
vi.mock('../../../components/Navbar', () => ({ default: 'Navbar' }));
vi.mock('../../../assets/notification-replies.svg?raw', () => ({ default: 'fixture-replies.svg' }));
vi.mock('../../../assets/notification-announcements.svg?raw', () => ({ default: 'fixture-announcements.svg' }));
function all(tree: any): any[] { if (Array.isArray(tree)) return tree.flatMap(all); if (!tree || typeof tree !== 'object') return []; return [tree, ...all(tree.props?.children)]; }
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(''); if (typeof tree === 'string' || typeof tree === 'number') return String(tree); return tree?.props ? text(tree.props.children) : ''; }
function render(component: any) {
  runtime.cursor = runtime.refCursor = runtime.effectCursor = 0;
  const nodes = all(component()); runtime.pendingEffects.splice(0).forEach(effect => effect()); return nodes;
}
function categories(nodes: any[]) { return nodes.filter(node => node.props.className?.split(' ').includes('messageHubCategory')); }
function category(nodes: any[], label: string) { return categories(nodes).find(entry => text(entry) === label); }
function expectPrivateEntry(nodes: any[]) {
  const entries = categories(nodes); expect(entries.map(text)).toEqual(['评论回复', '私信', '社区公告']);
  category(nodes, '私信').props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/messages/index' });
  expect(nodes.some(node => node.type === 'MessageConversationList')).toBe(false);
  expect(nodes.some(node => node.props.className === 'notificationBackToMessages')).toBe(false);
  expect(getMessageSummary).not.toHaveBeenCalled(); expect(getMessageConversations).not.toHaveBeenCalled();
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
beforeEach(() => {
  runtime.effects.forEach(effect => effect.cleanup?.()); runtime.effects = []; runtime.pendingEffects = [];
  runtime.state = []; runtime.refs = []; runtime.account = 'fixture-user'; runtime.profile = null;
  runtime.notifications = []; runtime.checkingLogin = false; runtime.loginError = false; runtime.loading = false;
  vi.mocked(Taro.navigateTo).mockClear(); vi.mocked(Taro.showToast).mockClear();
  vi.mocked(getNotifications).mockReset().mockResolvedValue([]); vi.mocked(getUserProfile).mockReset().mockResolvedValue({} as any);
  vi.mocked(getMessageSummary).mockClear(); vi.mocked(getMessageConversations).mockClear();
});

describe('comment homepage and independent private-message navigation', () => {
  it('active message homepage immediately requests comment notifications and private opens the standalone conversation list', () => {
    const nodes = render(() => Notifications({ active: true }));
    expect(getNotifications).toHaveBeenCalledWith({ page: 1 }); expect(getNotifications).toHaveBeenCalledTimes(1);
    expectPrivateEntry(nodes); expect(nodes.map(text).join('')).toContain('暂无消息');
  });
  it('navigation and content share one scroll container in every status and preserve scroll reset', () => {
    for (const status of ['rows', 'empty', 'loading', 'guest', 'checking']) {
      runtime.account = status === 'guest' || status === 'checking' ? '' : 'fixture-user';
      runtime.checkingLogin = status === 'checking'; runtime.loading = status === 'loading';
      runtime.notifications = status === 'rows' ? [{ username: 'fixture-peer', titleHtml: '<a>peer</a>提到了你', topicTitle: '', topicLink: '', content: '' }] : status === 'loading' ? null : [];
      let nodes = render(() => Notifications({ active: false })); const scrolls = nodes.filter(node => node.type === 'ScrollView');
      expect(scrolls).toHaveLength(1); expect(categories(all(scrolls[0]))).toHaveLength(3);
      expect(scrolls[0].props.type).toBe('custom'); expect(scrolls[0].props.scrollY).toBe(true);
      category(nodes, '评论回复').props.onClick(); nodes = render(() => Notifications({ active: false }));
      expect(nodes.find(node => node.type === 'ScrollView').props.scrollTop).toBe(0);
      nodes.find(node => node.type === 'ScrollView').props.onScroll(); nodes = render(() => Notifications({ active: false }));
      expect(nodes.find(node => node.type === 'ScrollView').props.scrollTop).toBeUndefined();
    }
  });
  it('notification summaries and both topic section headings grow one standard size only', () => {
    const notificationCss = compileString(readFileSync(resolve(process.cwd(), 'src/pages/home/notifications/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/home/notifications')] }).css;
    expect(notificationCss).toMatch(/\.notificationTitle\s*\{[^}]*font-size: 14\.91PX/);
    expect(notificationCss).toMatch(/\.notificationBadge\s*\{[^}]*font-size: 12\.61PX/);
    expect(notificationCss).toMatch(/\.notificationContent\s*\{[^}]*font-size: 14\.91PX/);
    const topicCss = compileString(readFileSync(resolve(process.cwd(), 'src/pages/topicDetail/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/topicDetail')] }).css;
    expect(topicCss).toMatch(/\.section \.header\s*\{[^}]*font-size: 18\.35PX/);
    expect(topicCss).toMatch(/\.relatingTopics\s*\{[^}]*font-size: 16\.05PX/);
  });
  it('discovery hot and followed titles grow one standard step without altering metadata or shared topic lists', () => {
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/home/discovery/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/home/discovery')] }).css;
    expect(css).toMatch(/\.hotTopicTitle\s*\{[^}]*font-size: 16\.05PX/);
    expect(css).toMatch(/\.interestTitle\s*\{[^}]*font-size: 16\.05PX/);
    expect(css).toMatch(/\.hotTopicMeta\s*\{[^}]*font-size: 13\.76PX/);
    expect(css).toMatch(/\.interestTime\s*\{[^}]*font-size: 12\.61PX/);
    const shared = readFileSync(resolve(process.cwd(), 'src/pages/home/topics/topicList/index.scss'), 'utf8');
    expect(shared).toMatch(/\.title\s*\{[^}]*font-size: 17\.2PX/);
  });
  it('all three category icons share themed outline styling and smaller token-backed capsules', () => {
    const nodes = render(() => Notifications({ active: true }));
    const icons = categories(nodes).map(entry => all(entry).find(node => node.props.className === 'messageHubIcon'));
    expect(icons.every(icon => icon.type === 'ThemedIcon' && icon.props.tone === 'accent-text')).toBe(true);
    const css = readFileSync(resolve(process.cwd(), 'src/pages/home/notifications/index.scss'), 'utf8');
    expect(css).toContain('width: 80rpx; height: 80rpx; border-radius: 24rpx; background: var(--theme-accent-muted');
    expect(css).toContain('.messageHubIcon { width: 40rpx; height: 40rpx; }'); expect(css).toContain('gap: 14rpx');
    expect(css).toContain('.messageHubCategory--active .messageHubCategoryLabel { font-weight: 400;');
    expect(css).not.toContain('background: #eff9f1'); expect(css).not.toContain('background: #edf4ff');
    for (const asset of ['notification-replies.svg', 'notification-announcements.svg']) {
      const svg = readFileSync(resolve(process.cwd(), 'src/assets', asset), 'utf8');
      expect(svg).toContain('stroke="currentColor"'); expect(svg).toContain('stroke-width="2"'); expect(svg).toContain('fill="none"'); expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
    }
    expectPrivateEntry(nodes);
  });
  it('inactive homepage does not request comments or any private summary/conversations', () => {
    const nodes = render(() => Notifications({ active: false }));
    expect(getNotifications).not.toHaveBeenCalled(); expectPrivateEntry(nodes);
  });
  it('comment failure keeps private navigation visible and retry only reloads comments', async () => {
    vi.mocked(getNotifications).mockRejectedValueOnce(new Error('fixture network failure')).mockResolvedValueOnce([]);
    render(() => Notifications({ active: true })); await flush(); let nodes = render(() => Notifications({ active: true }));
    expect(nodes.map(text).join('')).toContain('评论回复加载失败'); expectPrivateEntry(nodes);
    nodes.find(node => node.props.className === 'emptyState').props.onClick();
    nodes = render(() => Notifications({ active: true })); await flush(); expect(getNotifications).toHaveBeenCalledTimes(2); expectPrivateEntry(nodes);
  });
  it('comment loading keeps private navigation visible without requesting private data', () => {
    runtime.notifications = null; runtime.loading = true;
    const nodes = render(() => Notifications({ active: true })); expect(nodes.some(node => node.type === 'Loading')).toBe(true); expectPrivateEntry(nodes);
  });
  it.each([false, true])('signed-out and account-loading screens preserve private entry (checkingLogin=%s)', checkingLogin => {
    runtime.account = ''; runtime.checkingLogin = checkingLogin; runtime.loginError = !checkingLogin;
    const nodes = render(() => Notifications({ active: true }));
    expect(nodes.some(node => node.type === (checkingLogin ? 'Loading' : 'LoginPrompt'))).toBe(true);
    expect(getNotifications).not.toHaveBeenCalled(); expectPrivateEntry(nodes);
  });
  it('comment rows retain HTML body, real author/profile navigation and topic callback on the default homepage', async () => {
    runtime.notifications = [{ username: 'fixture-peer', userAvatarUrl: '', titleHtml: '<a>fixture-peer</a>回复了<a>Fixture topic</a>', topicTitle: 'Fixture topic', topicLink: '/t/13', content: '<p>fixture comment</p>' }];
    let nodes = render(() => Notifications({ active: true }));
    expect(nodes.find(node => node.type === 'HtmlRender').props.html).toBe('<p>fixture comment</p>');
    const user = nodes.find(node => node.props.className === 'notificationUser'); expect(user.props.children).toBe('fixture-peer');
    user.props.onClick({ stopPropagation: vi.fn() }); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/user/index?username=fixture-peer' });
    nodes.find(node => node.props.className === 'notificationItem').props.onClick(); await flush();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=13' });
    category(nodes, '评论回复').props.onClick(); nodes = render(() => Notifications({ active: true }));
    expect(nodes.find(node => node.type === 'ScrollView').props.scrollTop).toBe(0); expect(getNotifications).toHaveBeenCalledTimes(1);
  });
  it.each(['  通知昵称 😀  ', '   ', undefined])('uses optional notification display name but preserves profile navigation (%s)', displayName => {
    runtime.notifications = [{ username: 'fixture-peer', displayName, userAvatarUrl: '', titleHtml: '<a>fixture-peer</a>回复了<a>Fixture topic</a>', topicTitle: 'Fixture topic', topicLink: '/t/13', content: '' }];
    const nodes = render(() => Notifications({ active: true }));
    const user = nodes.find(node => node.props.className === 'notificationUser');
    expect(user.props.children).toBe(displayName?.trim() || 'fixture-peer');
    user.props.onClick({ stopPropagation: vi.fn() });
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/user/index?username=fixture-peer' });
    expect(nodes.find(node => node.type === 'UserAvatar').props.username).toBe('fixture-peer');
  });
  it('announcement entry navigates to the actual node without changing the comment homepage', async () => {
    let nodes = render(() => Notifications({ active: true })); await category(nodes, '社区公告').props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/node/topicList/index?node=notice&nodeName=%E5%85%AC%E5%91%8A' });
    nodes = render(() => Notifications({ active: true })); expect(nodes.map(text).join('')).toContain('暂无消息'); expectPrivateEntry(nodes);
    expect(getNotifications).toHaveBeenCalledTimes(1);
  });
  it('detail link chips gain vertical space without fixed height, larger fonts or long-label overflow', () => {
    const file = 'src/components/HtmlRender/index.scss';
    const css = compileString(readFileSync(resolve(process.cwd(), file), 'utf8'), { loadPaths: [resolve(process.cwd(), file, '..')] }).css;
    const chip = css.match(/\.html-linkChip\s*\{([^}]*)\}/)?.[1];
    const label = css.match(/\.html-linkLabel\s*\{([^}]*)\}/)?.[1];
    expect(chip).toContain('padding: 4rpx 10rpx'); expect(chip).toContain('line-height: 1.4'); expect(chip).toContain('align-items: center');
    expect(chip).toContain('max-width: 100%'); expect(chip).toContain('box-sizing: border-box'); expect(chip).not.toMatch(/(?:^|;)\s*height:/);
    expect(label).toContain('font-size: 14.91PX'); expect(label).toContain('line-height: 1.4'); expect(label).toContain('min-width: 0');
    expect(label).toContain('white-space: nowrap'); expect(label).toContain('overflow: hidden');
    expect(css).toMatch(/\.html-linkIcon\s*\{[^}]*width: 22rpx;[^}]*height: 22rpx/);
  });
  it('related topic rows use token separators, no individual card background, and no final border', () => {
    const file = 'src/pages/topicDetail/relatingTopics/index.module.scss';
    const css = compileString(readFileSync(resolve(process.cwd(), file), 'utf8'), { loadPaths: [resolve(process.cwd(), file, '..')] }).css;
    const row = css.match(/\.content \.relatingTopicItem\s*\{([^}]*)\}/)?.[1];
    expect(row).toContain('border-bottom: 1rpx solid var(--theme-border'); expect(row).not.toContain('background'); expect(row).not.toContain('border-radius');
    expect(row).toContain('padding: 16rpx 12rpx'); expect(css).toMatch(/\.relatingTopicItem:last-child\s*\{[^}]*border-bottom: none/);
    expect(css).toContain('font-size: 16.05PX'); expect(css).toContain('width: 54rpx'); expect(css).toContain('height: 54rpx');
    const relatedSource = readFileSync(resolve(process.cwd(), 'src/pages/topicDetail/relatingTopics/index.tsx'), 'utf8');
    const commentSource = readFileSync(resolve(process.cwd(), 'src/pages/topicDetail/index.tsx'), 'utf8');
    expect(relatedSource).toContain('size={54}'); expect(commentSource).toMatch(/UserAvatar[^>]*username=\{comment.author\}[^>]*size=\{54\}/);
  });
  it('profile statistics move inward and down toward the introduction without changing tab or font styles', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/user/index.scss'), 'utf8');
    const group = css.slice(css.indexOf('.userProfileDetail .profileCard'), css.indexOf('.userScroll'));
    expect(group).toContain('padding-bottom: 20rpx'); expect(group).toContain('margin-top: 48rpx');
    expect(group).toContain('width: auto'); expect(group).toContain('margin-left: 24rpx'); expect(group).toContain('margin-right: 24rpx');
    expect(group).not.toContain('font-size'); expect(group).not.toContain('.tabBar');
  });
  it('comment author uses the next existing font size without growing avatar, floor or body, and Me keeps no outer bottom gap', () => {
    const topicFile = 'src/pages/topicDetail/index.scss';
    const topicCss = compileString(readFileSync(resolve(process.cwd(), topicFile), 'utf8'), { loadPaths: [resolve(process.cwd(), topicFile, '..')] }).css;
    expect(topicCss).toMatch(/\.topicDetail \.comments \.comment-item \.comment-right \.comment-author\s*\{[^}]*font-size: 16\.05PX/);
    expect(topicCss).toMatch(/\.comment-floor\s*\{[^}]*font-size: 12\.61PX/);
    expect(topicCss).toContain('width: 54rpx');
    const meCss = readFileSync(resolve(process.cwd(), 'src/pages/me/index.scss'), 'utf8');
    expect(meCss).not.toContain('padding-bottom: 32rpx');
    const homeCss = readFileSync(resolve(process.cwd(), 'src/pages/home/index.scss'), 'utf8');
    expect(homeCss).toContain('padding-bottom: max(16rpx, env(safe-area-inset-bottom))'); expect(homeCss).toContain('height: 112rpx');
    expect(homeCss).toContain('box-shadow: var(--theme-navigation-shadow, 0 -4rpx 16rpx rgba(15, 22, 38, 0.08))');
    expect(homeCss).not.toContain('::before');
  });
  it('profile injects CTA only with confirmed recipient ID and signed-in non-self account', () => {
    runtime.profile = { username: 'fixture-peer', messageRecipientId: 8 }; let nodes = render(UserProfilePage); const actions = nodes.find(node => node.type === 'UserProfileDetail').props.actions;
    expect(text(actions)).toContain('发私信');
    const icon = all(actions).find(node => node.props.className === 'userPrivateMessageIcon');
    expect(icon.type).toBe('ThemedIcon'); expect(icon.props.tone).toBe('accent-text'); expect(icon.props.src).toContain('<rect x="3" y="5" width="18" height="14"');
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/pages/user/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/pages/user')] }).css;
    expect(css).toMatch(/\.userPrivateMessageAction\s*\{[^}]*flex-direction: row;[^}]*gap: 12rpx/);
    actions.props.onClick(); expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/secondary/messages/thread?to=8' });
    runtime.account = 'fixture-peer'; nodes = render(UserProfilePage); expect(nodes.find(node => node.type === 'UserProfileDetail').props.actions).toBeUndefined();
    runtime.account = ''; nodes = render(UserProfilePage); expect(nodes.find(node => node.type === 'UserProfileDetail').props.actions).toBeUndefined();
    runtime.account = 'fixture-user'; runtime.profile = { username: 'fixture-peer', memberNumber: '8', id: '8' }; nodes = render(UserProfilePage); expect(nodes.find(node => node.type === 'UserProfileDetail').props.actions).toBeUndefined();
  });
});
