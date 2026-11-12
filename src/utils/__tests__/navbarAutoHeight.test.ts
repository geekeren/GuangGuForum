import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Navbar from '../../components/Navbar';
import Taro from '@tarojs/taro';

vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', ShareElement: 'ShareElement' }));
vi.mock('@tarojs/taro', () => ({ default: { useRouter: () => ({ params: {} }), getDeviceInfo: vi.fn(() => ({ platform: 'ios' })) } }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'dark' }) }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => 'skyline' }));
vi.mock('../../utils/dimension', () => ({ getNavInfo: () => ({ capsulePaddingTop: 6, capsuleHeight: 32, capsuleWidth: 88, capsuleLeft: 290, screenWidth: 390, statusBarHeight: 44, marginSides: 12 }) }));
vi.mock('../../components/ThemedIcon', () => ({ default: 'ThemedIcon' }));
function all(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(all) : tree && typeof tree === 'object' ? [tree, ...all(tree.props?.children)] : []; }

describe('real Navbar opt-in content height', () => {
  it.each(['windows', 'mac'])('avoids full-window capsule coordinates on %s while preserving local back and shared parent', platform => {
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform } as any);
    const tree = Navbar({ back: true, title: '合成标题', shared: true });
    expect(tree.type).toBe('ShareElement');
    const nodes = all(tree);
    expect(nodes.find(node => node.props.className === 'customNavbar')!.props.style.paddingTop).toBe('0px');
    const bar = nodes.find(node => node.props.className === 'navBar')!.props.style;
    expect(bar.paddingRight).toBe('12px'); expect(bar.paddingTop).toBe('8px');
    expect(nodes.find(node => node.props.className === 'navCapsuleBtn')!.props.style.width).toBe('32px');
    expect(nodes.find(node => node.props.className?.split(' ').includes('navContent'))!.props.style.height).toBe('32px');
    vi.mocked(Taro.getDeviceInfo).mockReturnValue({ platform: 'ios' } as any);
  });
  it('preserves fixed capsule content height and native capsule/status-bar geometry by default', () => {
    for (const autoHeight of [undefined, false]) {
      const nodes = all(Navbar({ back: true, title: '标题', shared: false, autoHeight }));
      const content = nodes.find(node => node.props.className?.split(' ').includes('navContent'))!;
      expect(content.props.style).toEqual({ height: '32px' });
      expect(content.props.className).not.toContain('navContent--autoHeight');
      expect(nodes.find(node => node.props.className === 'navCapsule')!.props.style).toEqual({ height: '32px', borderRadius: '16px' });
      expect(nodes.find(node => node.props.className === 'customNavbar')!.props.style.paddingTop).toBe('44px');
    }
  });
  it('overrides background only when requested and preserves the default theme surface', () => {
    const background = (props: any) => all(Navbar({ shared: false, scrollProgress: 1, ...props })).find(node => node.props.className === 'customNavbar')!.props.style.backgroundColor;
    expect(background({})).toBe('rgba(28, 28, 30, 0.85)');
    expect(background({ backgroundRGB: '0, 0, 0' })).toBe('rgba(0, 0, 0, 0.85)');
  });
  it('balances opt-in content around the screen midpoint while preserving the back control position', () => {
    const nodes = all(Navbar({ back: true, centeredContent: true, autoHeight: true, shared: false }));
    const bar = nodes.find(node => node.props.className === 'navBar')!;
    const left = nodes.find(node => node.props.className === 'navLeft')!;
    const leftWidth = parseFloat(left.props.style.width) + parseFloat(left.props.style.paddingLeft);
    const start = parseFloat(bar.props.style.paddingLeft) + leftWidth + parseFloat(left.props.style.marginLeft) + parseFloat(left.props.style.marginRight);
    const end = 390 - parseFloat(bar.props.style.paddingRight);
    expect((start + end) / 2).toBe(195);
    expect(parseFloat(bar.props.style.paddingLeft) + parseFloat(left.props.style.marginLeft) + parseFloat(left.props.style.paddingLeft)).toBe(12);
    expect(nodes.find(node => node.props.className === 'navCapsule')!.props.style).toEqual({ height: '32px', borderRadius: '16px' });
  });
  it('lets real children wrap above capsule min-height without clipping or altering back capsule', () => {
    const children = createElement('div', { className: 'peer' }, '完整昵称和状态');
    const nodes = all(Navbar({ back: true, autoHeight: true, shared: false, children }));
    const content = nodes.find(node => node.props.className?.split(' ').includes('navContent'))!;
    expect(content.props.style).toEqual({ height: 'auto', minHeight: '32px' });
    expect(content.props.className).toContain('navContent--autoHeight');
    expect(all(content).some(node => node === children)).toBe(true);
    expect(nodes.some(node => node.props.className === 'navTitle')).toBe(false);
    expect(nodes.find(node => node.props.className === 'navCapsule')!.props.style.height).toBe('32px');
    const css = readFileSync(resolve(process.cwd(), 'src/components/Navbar/index.scss'), 'utf8');
    expect(css).toMatch(/&--autoHeight\s*\{\s*overflow: visible;\s*flex-shrink: 0;/);
    expect(css).toMatch(/\.navContent\s*\{[^}]*overflow: hidden;/);
  });
});
