import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import UserProfileDetail from '../../components/UserProfileDetail';

const runtime = vi.hoisted(() => ({ renderer: 'skyline', tab: 'topics' }));
vi.mock('react', () => ({ useState: (value: any) => [typeof value === 'string' ? runtime.tab : value, () => {}], useEffect: () => {} }));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text' }));
vi.mock('@tarojs/taro', () => ({ default: { navigateTo: vi.fn() } }));
vi.mock('guanggu-forum-api', () => ({ URLS: {}, urlPathVaiable: vi.fn(), getUserFavorites: vi.fn() }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => runtime.renderer }));
vi.mock('../../components/UserAvatar', () => ({ default: 'UserAvatar' }));
vi.mock('../../components/TopicTag', () => ({ default: 'TopicTag' }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
vi.mock('../../components/Loading', () => ({ default: 'Loading' }));
vi.mock('../../components/RecentlyViewedTopics', () => ({ default: 'RecentlyViewedTopics' }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...all(tree.props?.children)];
}
const profile = { username: 'fixture', city: 'fixture-city', topics: [], replies: [] } as any;
beforeEach(() => { runtime.renderer = 'skyline'; runtime.tab = 'topics'; });

describe('explicit page-owned profile hero paint', () => {
  it.each([
    ['  昵称 🧑‍💻  ', '备用名', '昵称 🧑‍💻'],
    ['  ', '  新显示名 😀  ', '新显示名 😀'],
    [undefined, undefined, 'fixture'],
    ['fixture', '另一个名字', 'fixture'],
    ['长昵称'.repeat(40), undefined, '长昵称'.repeat(40)],
  ])('prioritizes visible nickname without changing avatar or recent account identity (%s)', (nickname, displayName, expected) => {
    runtime.tab = 'recent';
    const nodes = all(UserProfileDetail({ profile: { ...profile, nickname, displayName, level: 'Lv.4' }, showRecentlyViewed: true }));
    const primary = nodes.find(node => node.props.className === 'username');
    expect(primary.props.children).toBe(expected);
    expect(primary.props).toMatchObject({ overflow: 'ellipsis', maxLines: 1 });
    const secondary = nodes.filter(node => node.props.className === 'nickname');
    expect(secondary.map(node => node.props.children)).toEqual(expected === 'fixture' ? [] : ['fixture']);
    expect(nodes.find(node => node.props.className === 'levelBadge').props.children).toBe('Lv.4');
    expect(nodes.find(node => node.type === 'UserAvatar').props.username).toBe('fixture');
    expect(nodes.find(node => node.type === 'RecentlyViewedTopics').props.username).toBe('fixture');
  });
  it.each(['skyline', 'webview'])('%s default profile keeps its original direct card/body structure', renderer => {
    runtime.renderer = renderer;
    const nodes = all(UserProfileDetail({ profile }));
    const root = nodes[0];
    expect(root.props.className).not.toContain('pageBackground');
    expect(nodes.some(node => node.props.className === 'profileBody')).toBe(false);
    expect(all(root.props.children[0]).find(node => node.props.className === 'profileCard')).toBeDefined();
    const bodyNodes = all(root.props.children[1]);
    expect(bodyNodes.some(node => node.props.className === 'detailCard')).toBe(true);
    expect(bodyNodes.some(node => node.props.className === 'tabCard')).toBe(true);
  });

  it.each(['skyline', 'webview'])('%s page opt-in contains only the existing body after the transparent hero', renderer => {
    runtime.renderer = renderer;
    for (const city of ['fixture-city', '']) for (const tab of ['topics', 'replies', 'favorites', 'recent']) {
      runtime.tab = tab;
      const nodes = all(UserProfileDetail({ profile: { ...profile, city }, className: 'userProfileDetail--me', backgroundOwner: 'page', navPaddingTop: 0, showRecentlyViewed: true }));
      const root = nodes[0], body = nodes.find(node => node.props.className === 'profileBody');
      expect(root.props.className).toContain('userProfileDetail--pageBackground');
      expect(root.props.children[1]).toBe(body);
      const card = nodes.find(node => node.props.className === 'profileCard');
      expect(card.props.style).toEqual({ paddingTop: 0 });
      expect(all(body).some(node => node.props.className === 'profileCard' || node.props.className === 'topRow' || node.type === 'UserAvatar')).toBe(false);
      expect(all(body).some(node => node.props.className === 'detailCard')).toBe(!!city);
      expect(all(body).filter(node => node.props.className === 'tabCard')).toHaveLength(1);
      expect(all(body).some(node => node.type === 'RecentlyViewedTopics')).toBe(tab === 'recent');
      expect(body.props.style).toBeUndefined();
      expect(nodes.some(node => node.type === 'Navbar')).toBe(false);
    }
  });

  it('contains existing first-card margins without adding spacing or sizing and preserves shared gradients', () => {
    const css = compileString(readFileSync(resolve(process.cwd(), 'src/components/UserProfileDetail/index.scss'), 'utf8'), { loadPaths: [resolve(process.cwd(), 'src/components/UserProfileDetail')] }).css;
    const scoped = '.meProfile.meProfile--ready .userProfileDetail.userProfileDetail--pageBackground';
    const body = css.split(`${scoped} .profileBody {`)[1].split('}')[0];
    expect(body).toContain('display: flex'); expect(body).toContain('flex-direction: column');
    expect(body).toContain('background: var(--theme-bg, #f4f5fa)');
    expect(body).not.toMatch(/position|height|padding|margin|!important/);
    expect(css).toMatch(/\.userProfileDetail \.detailCard\s*\{[^}]*margin: 20rpx 24rpx 0;/);
    expect(css).toMatch(/\.userProfileDetail \.tabCard\s*\{[^}]*margin: 20rpx 24rpx 0;/);
    expect(css).toMatch(/\.userProfileDetail \.profileCard\s*\{[^}]*background: linear-gradient\(180deg, var\(--theme-brand-soft/);
    expect(css).toContain(`${scoped} .profileCard {\n  background: transparent;`);
  });
});
