import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { document, TaroEvent } from '@tarojs/runtime';
import Taro from '@tarojs/taro';
import HtmlRender from '../../components/HtmlRender';
import { STICKERS } from '../stickers';
import { linkHandler } from '../linkHandler';

const harness = vi.hoisted(() => {
  const flags = ['ENABLE_INNER_HTML', 'ENABLE_ADJACENT_HTML', 'ENABLE_CLONE_NODE', 'ENABLE_CONTAINS', 'ENABLE_SIZE_APIS', 'ENABLE_TEMPLATE_CONTENT', 'ENABLE_MUTATION_OBSERVER'];
  for (const flag of flags) (globalThis as any)[flag] = flag === 'ENABLE_INNER_HTML';
  return { effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[],
    queries: [] as { selector: string; callback: (rect: any) => void }[],
    window: { windowWidth: 390, windowHeight: 800 }, renderer: 'skyline' };
});
vi.mock('react', async original => ({ ...await original<any>(),
  useRef: () => ({ current: null }), useMemo: (fn: any) => fn(),
  useEffect: (fn: any) => harness.effects.push(fn),
}));
vi.mock('@tarojs/components', () => ({ View: 'View', Span: 'Span', Text: 'Text' }));
vi.mock('@tarojs/taro', async () => {
  const runtime = await import('@tarojs/runtime');
  return { default: { options: runtime.options, previewImage: vi.fn(() => Promise.resolve()),
    nextTick: (fn: () => void) => fn(), getWindowInfo: () => harness.window,
    createSelectorQuery: () => { let selector = ''; const query = {
      select: (value: string) => { selector = value; return query; },
      fields: (_: any, callback: any) => { harness.queries.push({ selector, callback }); return query; },
      exec: vi.fn(),
    }; return query; },
  } };
});
vi.mock('guanggu-forum-api', () => ({ URLS: { ROOT_URL: 'https://www.guozaoke.com' } }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => harness.renderer }));
vi.mock('../renderer', () => ({ isSkyline: () => harness.renderer === 'skyline' }));
vi.mock('../linkHandler', () => ({ isUserMentionLink: () => false, linkChipLabel: () => 'link', linkHandler: vi.fn() }));

function nodes(node: any): any[] { return [node, ...node.childNodes.flatMap(nodes)]; }
function mount(html: string, props: any = { variant: 'body' }, beforeMount?: (images: any[]) => void) {
  const tree = HtmlRender({ html, ...props });
  const view = tree.props.children.find((item: any) => item?.props?.dangerouslySetInnerHTML);
  const root = document.createElement('view');
  root.innerHTML = view.props.dangerouslySetInnerHTML.__html;
  (view.ref || view.props.ref).current = root;
  const images = nodes(root).filter(node => node.className?.split(' ').includes('h5-img'));
  beforeMount?.(images);
  for (const effect of harness.effects.splice(0)) { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup); }
  return { root, images };
}
function nativeEvent(type: string, detail?: Record<string, unknown>) {
  const event = new TaroEvent(type, { bubbles: true, cancelable: true }) as TaroEvent & { detail?: Record<string, unknown> };
  if (detail) event.detail = detail;
  return event;
}
function load(image: any, width: any, height: any) {
  image.dispatchEvent(nativeEvent('load', { width, height }));
}
function measure(width = 350, left = 20, extra = {}) {
  const query = harness.queries.shift()!;
  expect(query).toBeDefined(); query.callback({ width, left, ...extra });
}
function size(image: any, width: number, height: number, left: number) {
  expect(parseFloat(image.style.width)).toBeCloseTo(width);
  expect(parseFloat(image.style.height)).toBeCloseTo(height);
  expect(parseFloat(image.style.marginLeft)).toBeCloseTo(left);
  expect(image.props.mode).toBe('aspectFit');
}
beforeEach(() => { vi.clearAllMocks(); harness.effects = []; harness.queries = []; harness.window = { windowWidth: 390, windowHeight: 800 }; harness.renderer = 'skyline'; });
afterEach(() => { for (const cleanup of harness.cleanups.splice(0)) cleanup(); });

describe('mounted body image geometry and isolation', () => {
  it.each(['skyline', 'webview'])('centers landscape photos in preview without upscale in %s', renderer => {
    harness.renderer = renderer;
    const { images } = mount('<p><img src="/photo.png"></p>');
    expect(images[0].style.height).toBe('180px');
    expect(images[0].props.lazyLoad).toBe(renderer !== 'skyline');
    load(images[0], 1200, 600); measure(); size(images[0], 350, 175, 0);
    load(images[0], 80, 40); measure(); size(images[0], 80, 40, 135);
    expect(images[0].props.src).toBe('https://www.guozaoke.com/photo.png');
  });
  it('uses viewport width edge-to-edge only for large unconstrained landscape detail photos', () => {
    const { images } = mount('<p><img src="https://img.test/wide.png"></p>', { variant: 'body', fullBleedImages: true });
    load(images[0], 1200, 600); measure(); size(images[0], 390, 195, -20);
    expect(images[0].style.maxWidth).toBe('none');
    expect(images[0].style.borderRadius).toBe('0');
  });
  it('scales portrait and extreme screenshots by both parent width and 60% window height', () => {
    const { images } = mount('<img src="portrait.png"><img src="tall.png">', { variant: 'body', fullBleedImages: true });
    load(images[0], 600, 1200); measure(); size(images[0], 240, 480, 55);
    load(images[1], 1000, 10000); measure(); size(images[1], 48, 480, 151);
    load(images[0], 600, 1200); measure(150, 80); size(images[0], 150, 300, 0);
  });
  it('contains photos in nested lists, blockquotes and styled narrow parents', () => {
    const { images } = mount('<ul><li><img src="a.png"></li></ul><blockquote><img src="b.png"></blockquote><div style="width: 100px"><img src="c.png"></div>', { variant: 'body', fullBleedImages: true });
    for (const image of images) {
      load(image, 1200, 600); measure(140, 80, { 'padding-left': '20px', 'padding-right': '20px' });
      size(image, 100, 50, 0); expect(image.style.maxWidth).toBe('100%');
    }
  });
  it('retains usable loading or loaded sizes after failed loads, invalid dimensions and unavailable measurement', () => {
    const { images } = mount('<img src="a.png">');
    load(images[0], 0, 0); expect(harness.queries).toHaveLength(0); expect(images[0].style.height).toBe('180px');
    images[0].dispatchEvent(nativeEvent('error')); expect(images[0].style.height).toBe('180px');
    load(images[0], 800, 400); measure(NaN); expect(images[0].style.height).toBe('180px');
    load(images[0], 800, 400); measure(); size(images[0], 350, 175, 0);
    for (const dims of [[0, 20], [20, Infinity], ['bad', 20], [-1, 10]]) load(images[0], ...dims as [any, any]);
    size(images[0], 350, 175, 0); expect(harness.queries).toHaveLength(0);
  });
  it('handles load-before-effect and ignores older measurements, removed images and unmounted roots', () => {
    const { root, images } = mount('<img src="a.png">', { variant: 'body' }, images => load(images[0], 800, 400));
    expect(harness.queries).toHaveLength(1);
    const stale = harness.queries.shift()!;
    load(images[0], 80, 40); measure(); size(images[0], 80, 40, 135);
    stale.callback({ width: 200, left: 0 }); size(images[0], 80, 40, 135);
    load(images[0], 800, 400); const detached = harness.queries.shift()!;
    root.innerHTML = '<p>replacement</p>'; detached.callback({ width: 350, left: 20 }); size(images[0], 80, 40, 135);
    const next = mount('<img src="b.png">'); load(next.images[0], 800, 400);
    const pending = harness.queries.shift()!; harness.cleanups.pop()!(); pending.callback({ width: 350, left: 20 });
    expect(next.images[0].style.height).toBe('180px');
  });
  it('ignores a changed source and stale native source details without touching authored ids', () => {
    const { images } = mount('<p id="author:paragraph"><img src="https://img.test/a.png"></p>');
    load(images[0], 800, 400);
    expect(harness.queries[0].selector).toMatch(/^\.htmlImageMeasure-/);
    const pending = harness.queries.shift()!;
    images[0].setAttribute('src', 'https://img.test/b.png');
    pending.callback({ width: 350, left: 20 }); expect(images[0].style.height).toBe('180px');
    load(images[0], 800, 400); expect(harness.queries).toHaveLength(0);
    const next = mount('<img src="https://img.test/c.png">');
    const event = nativeEvent('load', { width: 800, height: 400, src: 'https://img.test/old.png' });
    next.images[0].dispatchEvent(event); expect(harness.queries).toHaveLength(0);
  });
  it('isolates body roots from comments and spoofed HTML classes; leaves stickers unchanged', () => {
    const body = mount(`<img src="${STICKERS[0].url}"><img src="a.png">`);
    const comment = mount('<div class="htmlWrap--body"><img src="b.png"></div>', {});
    load(body.images[0], 200, 200); expect(body.images[0].style.width).toBe('100px'); expect(body.images[0].style.height).toBe('100px'); expect(body.images[0].props.mode).toBe('widthFix');
    load(comment.images[0], 600, 400); expect(comment.images[0].style.width).toBe('300px'); expect(comment.images[0].style.height).toBe('200px'); expect(comment.images[0].props.mode).toBe('widthFix');
    expect(harness.queries).toHaveLength(0);
    load(body.images[1], 1200, 600); measure(); size(body.images[1], 350, 175, 0);
  });
  it('keeps authored image/text order and previews a linked original exactly once across reloads', () => {
    const { root, images } = mount('<p>before</p><p><a href="https://other.test"><img src="//img.test/original.png"></a></p><p>after</p>', { variant: 'body', fullBleedImages: true });
    expect(root.textContent).toBe('beforeafter');
    expect(nodes(root).filter(node => node.h5tagName === 'p').map(node => node.textContent)).toEqual(['before', '', 'after']);
    load(images[0], 1200, 600); measure(); load(images[0], 1200, 600); measure();
    images[0].dispatchEvent(nativeEvent('tap'));
    expect(Taro.previewImage).toHaveBeenCalledTimes(1);
    expect(Taro.previewImage).toHaveBeenCalledWith({ urls: ['https://img.test/original.png'] });
    expect(linkHandler).not.toHaveBeenCalled();
  });
});
