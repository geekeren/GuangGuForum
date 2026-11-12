import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import UserAvatar from '../../components/UserAvatar';
import { DEFAULT_USER_AVATAR_SOURCE, userAvatarSource } from '../userAvatarSource';

const runtime = vi.hoisted(() => ({ state: [] as any[], cursor: 0, effects: [] as any[], effectCursor: 0, pending: [] as any[] }));
vi.mock('react', () => ({
  useState: (initial: any) => {
    const i = runtime.cursor++;
    if (!(i in runtime.state)) runtime.state[i] = initial;
    return [runtime.state[i], (next: any) => { runtime.state[i] = next; }];
  },
  useEffect: (effect: any, deps: any[]) => {
    const i = runtime.effectCursor++;
    if (!runtime.effects[i] || deps.some((value, index) => value !== runtime.effects[i][index])) {
      runtime.effects[i] = deps; runtime.pending.push(effect);
    }
  },
}));
vi.mock('@tarojs/components', () => ({ Image: 'Image', View: 'View' }));
vi.mock('@tarojs/taro', () => ({ default: { getDeviceInfo: vi.fn(() => ({ platform: 'ios' })), getWindowInfo: vi.fn(() => ({ windowWidth: 375 })) } }));
vi.mock('../../components/AiUserTag', () => ({ default: 'AiUserTag' }));
vi.mock('../localAssets', () => ({ getFromLocalCache: (source: string) => source === '/static/m_default.png' ? 'fixture-local-default.svg' : source }));
function render(props: any) {
  runtime.cursor = runtime.effectCursor = 0;
  const tree = UserAvatar(props);
  runtime.pending.splice(0).forEach(effect => effect());
  return { tree, image: (tree.props.children as any[]).find(child => child?.type === 'Image') };
}
beforeEach(() => { runtime.state = []; runtime.effects = []; runtime.pending = []; vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'ios' } as any); });

describe('avatar source normalization', () => {
  it.each([
    ['/static/avatar/36/fixture.png', 'https://www.guozaoke.com/static/avatar/36/fixture.png'],
    ['static/avatar/36/fixture.png', 'https://www.guozaoke.com/static/avatar/36/fixture.png'],
    ['//cdn.example.com/avatar.png?v=2', 'https://cdn.example.com/avatar.png?v=2'],
    ['http://www.guozaoke.com/static/avatar/fixture.png', 'https://www.guozaoke.com/static/avatar/fixture.png'],
    ['https://images.example.com/uploaded/avatar.webp?signature=abc%2Fdef', 'https://images.example.com/uploaded/avatar.webp?signature=abc%2Fdef'],
    ['https://images.example.com/avatar.svg#fragment', 'https://images.example.com/avatar.svg'],
  ])('normalizes %s without replacing legitimate uploaded avatars', (input, expected) => {
    expect(userAvatarSource(input)).toBe(expected);
  });
  it.each(['', '  ', '/static/m_default.png', '/static/m_default.png?v=2', 'https://www.guozaoke.com/static/m_default.png?width=80'])('uses local default for empty/default source %s', input => {
    expect(userAvatarSource(input)).toBe(DEFAULT_USER_AVATAR_SOURCE);
  });
  it.each([
    'javascript:alert(1)', 'data:image/svg+xml,x', 'file:///avatar.png', 'wxfile://avatar.png',
    'https://user:secret@images.example.com/a.png', '//user@images.example.com/a.png',
    '/static/../avatar.png', '/static/%2e%2e/avatar.png', '/static/%2e%2e%2favatar.png',
    '/static/%252e%252e/avatar.png', 'https://images.example.com/a/../avatar.png',
    '/static/\\avatar.png', '/static/%5cavatar.png', '/static/%xx.png',
    'https:images.example.com/avatar.png', 'https:///avatar.png', '/static/avatar\n.png',
  ])('rejects unsafe or malformed source %s', input => {
    expect(userAvatarSource(input)).toBe(DEFAULT_USER_AVATAR_SOURCE);
  });
  it('does not rely on a browser URL global', () => {
    vi.stubGlobal('URL', undefined);
    expect(userAvatarSource('/static/avatar/fixture.png')).toBe('https://www.guozaoke.com/static/avatar/fixture.png');
    vi.unstubAllGlobals();
  });
});

describe('shared UserAvatar', () => {
  it.each(['windows', 'mac'])('uses fixed design geometry on %s at any pane width while keeping caller override precedence', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    for (const width of [450, 750, 1400]) {
      vi.mocked(Taro.getWindowInfo).mockReturnValue({ windowWidth: width } as any);
      for (const size of [36, 52, 54, 96, 140]) {
        const { tree, image } = render({ size, src: '' });
        expect(tree.props.style).toEqual({ width: `${size / 2}px`, height: `${size / 2}px` });
        expect(image.props.style).toEqual({ width: '100%', height: '100%' });
      }
    }
    expect(render({ size: 96, style: { width: '17px', height: '19px' } }).tree.props.style).toEqual({ width: '17px', height: '19px' });
    expect(render({ size: 96, style: 'width:17px;transform:scale(1)' }).tree.props.style).toBe('width:48px;height:48px;width:17px;transform:scale(1)');
  });
  it.each(['ios', 'android', 'devtools'])('keeps native rpx for %s without width-based platform guessing', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    expect(render({ size: 140 }).tree.props.style).toEqual({ width: '140rpx', height: '140rpx' });
  });
  it('preserves native image props, click, sizing, classes, children and AI identity', () => {
    const onClick = vi.fn(); const onLoad = vi.fn();
    const { tree, image } = render({ src: '/static/avatar/fixture.png', username: 'fixture-user', size: 36, className: 'fixture-avatar', imageClassName: 'fixture-image', style: { borderRadius: '50%' }, mode: 'aspectFit', lazyLoad: true, onClick, onLoad, compactAiTag: false, children: 'fixture-child' });
    expect(image.props.src).toBe('https://www.guozaoke.com/static/avatar/fixture.png');
    expect(image.props.svg).toBe(false); expect(image.props.mode).toBe('aspectFit'); expect(image.props.lazyLoad).toBe(true); expect(image.props.onLoad).toBe(onLoad);
    expect(image.props.className).toContain('fixture-image'); expect(tree.props.className).toContain('userAvatar--small');
    expect(tree.props.style).toEqual({ width: '36rpx', height: '36rpx', borderRadius: '50%' }); expect(tree.props.onClick).toBe(onClick);
    expect((tree.props.children as any[])[1].props).toMatchObject({ username: 'fixture-user', compact: false }); expect(tree.props.children).toContain('fixture-child');
  });
  it('preserves string styles without spreading their characters into an object', () => {
    const { tree } = render({ src: '', size: 70, style: 'border-radius:50%;margin-right:8rpx' });
    expect(tree.props.style).toBe('width:70rpx;height:70rpx;border-radius:50%;margin-right:8rpx');
  });
  it('falls back locally on native image error and invokes the external callback once per event', () => {
    const onError = vi.fn(); const props = { src: '//images.example.com/fixture.png', svg: false, onError };
    const event = { detail: { errMsg: 'fixture error' } };
    render(props).image.props.onError(event);
    const fallback = render(props).image;
    expect(fallback.props.src).toBe('fixture-local-default.svg'); expect(fallback.props.svg).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1); expect(onError).toHaveBeenCalledWith(event);
  });
  it('resets failed source immediately on a new avatar and on returning to the old source', () => {
    const first = { src: '/static/avatar/first.png' };
    render(first).image.props.onError({ detail: {} }); expect(render(first).image.props.src).toBe('fixture-local-default.svg');
    expect(render({ src: '/static/avatar/second.png' }).image.props.src).toBe('https://www.guozaoke.com/static/avatar/second.png');
    expect(render(first).image.props.src).toBe('https://www.guozaoke.com/static/avatar/first.png');
  });
  it('does not let a late old-avatar error replace a new avatar', () => {
    const old = render({ src: '/static/avatar/old.png' }).image;
    const current = { src: '/static/avatar/current.png' }; render(current);
    old.props.onError({ detail: {} });
    expect(render(current).image.props.src).toBe('https://www.guozaoke.com/static/avatar/current.png');
  });
  it('keeps explicit uploaded SVG behavior and default-with-query local SVG rendering', () => {
    expect(render({ src: 'https://images.example.com/uploaded.svg', svg: true }).image.props.svg).toBe(true);
    const defaultImage = render({ src: '/static/m_default.png?v=2' }).image;
    expect(defaultImage.props.src).toBe('fixture-local-default.svg'); expect(defaultImage.props.svg).toBe(true);
  });
});
