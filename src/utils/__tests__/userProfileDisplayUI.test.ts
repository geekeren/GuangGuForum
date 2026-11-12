import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { getUserFavorites } from 'guanggu-forum-api';
import UserProfileDetail from '../../components/UserProfileDetail';

const harness = vi.hoisted(() => ({ values: [] as any[], cursor: 0 }));
vi.mock('react', async original => ({ ...await original<any>(), useEffect: vi.fn(),
  useState(initial: any) { const index = harness.cursor++; if (!(index in harness.values)) harness.values[index] = initial; return [harness.values[index], (next: any) => { harness.values[index] = next; }]; },
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn() } }));
vi.mock('guanggu-forum-api', () => ({ getUserFavorites: vi.fn(), URLS: { TOPIC_DETAIL: '/t/:tid', NODE_HOME_PAGE: '/node/:node' }, urlPathVaiable: () => (link: string) => ({ params: { tid: link.match(/\/t\/(\d+)/)?.[1] } }) }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../components/TopicTag', () => ({ default: 'TopicTag' }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../components/RecentlyViewedTopics', () => ({ default: 'RecentlyViewedTopics' }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline' }));
function elements(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(elements) : tree && typeof tree === 'object' ? [tree, ...elements(tree.props?.children)] : []; }
function profile(overrides = {}): any { return { username: 'fixture-account', nickname: '', avatarUrl: '/fixture.png', topics: [], replies: [], ...overrides }; }
function render(data: any) { harness.cursor = 0; return elements(UserProfileDetail({ profile: data })); }
beforeEach(() => { vi.clearAllMocks(); harness.values = []; harness.cursor = 0; });

describe('profile nickname display and list identity', () => {
  it.each([
    ['  昵称🙂  ', 'parsed label', '昵称🙂'], ['', '  解析昵称🙂  ', '解析昵称🙂'],
    ['', '  ', 'fixture-account'], ['', undefined, 'fixture-account'],
  ])('prefers nickname and safely falls back without changing the handle (%s)', (nickname, displayName, expected) => {
    const data = profile({ nickname, displayName }); const nodes = render(data);
    expect(nodes.find(node => node.props.className === 'username')!.props.children).toBe(expected);
    expect(nodes.find(node => node.type === 'UserAvatar')!.props.username).toBe('fixture-account');
    expect(data.username).toBe('fixture-account');
    if (expected !== 'fixture-account') expect(nodes.find(node => node.props.className === 'nickname')!.props.children).toBe('fixture-account');
    expect(getUserFavorites).not.toHaveBeenCalled();
  });
  it('uses the structured reply topic title rather than parsing a nickname-bearing sentence', () => {
    const data = profile({ replies: [{ topicTitle: 'Exact topic title', topicLink: '/t/123', replyTitle: '回复了 空格 昵称🙂 创建的主题 Exact topic title', content: 'Synthetic excerpt' }] });
    harness.values[0] = 'replies'; const nodes = render(data);
    expect(nodes.find(node => node.props.className === 'replyTitle')!.props.children.props.children).toBe('Exact topic title');
    nodes.find(node => node.props.className === 'replyItem')!.props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=123' });
    expect(data.replies[0].replyTitle).toContain('空格 昵称🙂');
  });
  it('preserves the legacy title fallback and unchanged topic/favorite navigation', () => {
    const data = profile({ topics: [{ title: 'Created fixture', link: '/t/124', username: 'fixture-account', displayName: '昵称', category: 'Fixture', lastUpdated: '', commentCount: '' }],
      replies: [{ topicTitle: '', topicLink: '/t/125', replyTitle: '回复了 fixture-account 创建的主题 Legacy title', content: '' }] });
    render(data).find(node => node.props.className === 'topicItem')!.props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=124' });
    harness.values[0] = 'replies'; let nodes = render(data);
    expect(nodes.find(node => node.props.className === 'replyTitle')!.props.children.props.children).toBe('Legacy title');
    harness.values[0] = 'favorites'; harness.values[1] = [{ title: 'Favorite fixture', link: '/t/126', username: 'other-account', displayName: '同名昵称', category: 'Fixture', lastUpdated: '', commentCount: '' }];
    nodes = render(data); nodes.find(node => node.props.className === 'topicItem')!.props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: '/pages/topicDetail/index?tid=126' });
    expect(harness.values[1][0].username).toBe('other-account'); expect(getUserFavorites).not.toHaveBeenCalled();
  });
});
