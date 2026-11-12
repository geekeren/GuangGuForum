import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
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
    window: { windowWidth: 390, windowHeight: 800 }, renderer: 'skyline',
    viewportSelectors: new Set<string>(), viewportRect: { width: 390, left: 0 } as Record<string, unknown> | null, contentWidth: 350, resize: null as any };
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
    onWindowResize: (callback: any) => { harness.resize = callback; }, offWindowResize: () => { harness.resize = null; },
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
  if (props.fullBleedImages && props.testViewport !== false) {
    const viewport = document.createElement(props.testViewportCard ? 'view' : 'scroll-view');
    viewport.className = props.testViewportCard ? 'main topicBodyImageViewport' : 'topicBodyImageViewport'; viewport.appendChild(root);
    if (props.testViewportCard) {
      const outerScroll = document.createElement('scroll-view');
      outerScroll.className = 'scrollContent'; outerScroll.appendChild(viewport);
    }
    harness.viewportSelectors.add(`#${viewport.uid || viewport.sid}`);
  }
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
  let query = harness.queries.shift()!;
  expect(query).toBeDefined();
  if (harness.viewportSelectors.has(query.selector)) { query.callback(harness.viewportRect); query = harness.queries.shift()!; }
  harness.contentWidth = width - ['padding-left', 'padding-right', 'border-left-width', 'border-right-width'].reduce((total, key) => total + (parseFloat((extra as Record<string, string>)[key]) || 0), 0);
  expect(query).toBeDefined(); query.callback({ width, left, ...extra });
  const baseline = harness.queries[0];
  if (baseline && !harness.viewportSelectors.has(baseline.selector)) {
    harness.queries.shift(); baseline.callback({ width: harness.contentWidth, left, height: 180 });
  }
}
function size(image: any, width: number, height: number, left: number) {
  expect(parseFloat(image.style.width)).toBeCloseTo(width);
  expect(parseFloat(image.style.height)).toBeCloseTo(height);
  const host = image.parentElement;
  const transform = parseFloat(host.style.transform.match(/translateX\(([^)]+)px\)/)?.[1] || '0');
  const hostWidth = host.style.width.endsWith('px') ? parseFloat(host.style.width) : harness.contentWidth;
  const hostLeft = host.style.left ? parseFloat(host.style.left) : 0;
  expect(hostLeft + (hostWidth - width) / 2 + transform).toBeCloseTo(left);
  expect(image.props.mode).toBe('aspectFit');
}
function photoBounds(image: any, parentLeft: number) {
  const host = image.parentElement;
  const transform = parseFloat(host.style.transform.match(/translateX\(([^)]+)px\)/)?.[1] || '0');
  const width = parseFloat(host.style.width);
  const left = parentLeft + parseFloat(host.style.left || '0') + transform;
  expect(width).toBeCloseTo(parseFloat(image.style.width));
  return { left, right: left + width, width };
}
beforeEach(() => { vi.clearAllMocks(); harness.effects = []; harness.queries = []; harness.window = { windowWidth: 390, windowHeight: 800 }; harness.renderer = 'skyline'; harness.viewportSelectors.clear(); harness.viewportRect = { width: 390, left: 0 }; harness.contentWidth = 350; });
afterEach(() => { for (const cleanup of harness.cleanups.splice(0)) cleanup(); });

function prepared(html: string, props: any = { variant: 'body', fullBleedImages: true }) {
  const tree = HtmlRender({ html, ...props });
  const view = tree.props.children.find((item: any) => item?.props?.dangerouslySetInnerHTML);
  return { view, html: view.props.dangerouslySetInnerHTML.__html as string };
}
function parsePrepared(markup: string) {
  const root = document.createElement('view'); root.innerHTML = markup;
  return { root, images: nodes(root).filter(node => node.className?.split(' ').includes('h5-img')) };
}
function skeleton(image: any) { return image.parentElement.children.find((child: any) => child.className?.split(' ').includes('htmlBodyImageSkeleton')); }

describe('topic photo skeleton presentation lifecycle', () => {
  it('pre-hides a loaded photo before effects, then commits a measured 180px-to-target host baseline without stretching the image', () => {
    const request = prepared('<p><img src="wide.png"></p>'); const { root, images } = parsePrepared(request.html); const image = images[0];
    expect(image.props.mode).toBe('aspectFit'); expect(image.style.opacity).toBe('0'); expect(image.parentElement.style.height).toBe('180px'); expect(skeleton(image)).toBeDefined();
    load(image, 1200, 600); expect(image.style.height).toBe('180px'); expect(image.style.opacity).toBe('0'); expect(harness.queries).toHaveLength(0);
    const viewport = document.createElement('scroll-view'); viewport.className = 'topicBodyImageViewport'; viewport.appendChild(root); harness.viewportSelectors.add(`#${viewport.uid || viewport.sid}`);
    (request.view.ref || request.view.props.ref).current = root;
    for (const effect of harness.effects.splice(0)) { const cleanup = effect(); if (cleanup) harness.cleanups.push(cleanup); }
    harness.queries.shift()!.callback(harness.viewportRect); harness.queries.shift()!.callback({ width: 350, left: 20 });
    expect(image.style.opacity).toBe('0'); expect(image.parentElement.style.height).toBe('180px');
    harness.queries.shift()!.callback({ width: 350, height: 180 });
    size(image, 390, 195, -20); expect(image.parentElement.style.height).toBe('195px'); expect(image.style.opacity).toBe('1'); expect(skeleton(image).style.opacity).toBe('0');
  });
  it('keeps failed loads staged, reveals safe contained content on failed measurement, and retries to exact viewport geometry', () => {
    const { images } = mount('<div style="width:100px"><img src="a.png"></div>', { variant: 'body', fullBleedImages: true }); const image = images[0];
    image.dispatchEvent(nativeEvent('error')); expect(image.style.opacity).toBe('0'); expect(skeleton(image)).toBeDefined();
    load(image, 800, 400); measure(NaN); expect(image.style.opacity).toBe('1'); expect(image.props.mode).toBe('aspectFit');
    expect(image.style.width).toBe('100%'); expect(image.parentElement.style.width).toBe('100%'); expect(image.parentElement.style.left).toBe(''); expect(image.parentElement.style.marginLeft).toBe('');
    harness.resize(); measure(100, 80); size(image, 100, 50, 0); expect(image.parentElement.style.height).toBe('50px');
  });
  it.each(['query', 'nextTick'] as const)('reveals a safe contained frame if initial measurement %s throws', failure => {
    const { images } = mount('<img src="a.png">', { variant: 'body', fullBleedImages: true }); const image = images[0];
    if (failure === 'query') vi.spyOn(Taro, 'createSelectorQuery').mockImplementationOnce(() => { throw new Error('query unavailable'); });
    else vi.spyOn(Taro, 'nextTick').mockImplementationOnce(() => { throw new Error('tick unavailable'); });
    load(image, 800, 400); expect(image.style.opacity).toBe('1'); expect(image.style.width).toBe('100%'); expect(image.parentElement.style.width).toBe('100%'); expect(image.props.mode).toBe('aspectFit');
  });
  it.each(['null', 'throw'] as const)('reveals the reliable target when the initial host baseline is %s', failure => {
    const { images } = mount('<img src="a.png">', { variant: 'body', fullBleedImages: true }); const image = images[0];
    load(image, 1200, 600); harness.queries.shift()!.callback(harness.viewportRect);
    if (failure === 'throw') vi.spyOn(Taro, 'createSelectorQuery').mockImplementationOnce(() => { throw new Error('host query unavailable'); });
    harness.queries.shift()!.callback({ width: 350, left: 20 });
    if (failure === 'null') harness.queries.shift()!.callback(null);
    size(image, 390, 195, -20); expect(image.style.opacity).toBe('1');
  });
  it('retains a loaded image through resize failures and refuses superseded or unmounted baseline callbacks', () => {
    const { images } = mount('<img src="a.png">', { variant: 'body', fullBleedImages: true }); const image = images[0];
    load(image, 1200, 600); harness.queries.shift()!.callback(harness.viewportRect); harness.queries.shift()!.callback({ width: 350, left: 20 });
    const staleBaseline = harness.queries.shift()!; load(image, 80, 40); measure(); size(image, 80, 40, 135);
    staleBaseline.callback({ height: 180 }); size(image, 80, 40, 135);
    harness.resize(); measure(NaN); size(image, 80, 40, 135);
    const next = mount('<img src="b.png">', { variant: 'body', fullBleedImages: true }); load(next.images[0], 800, 400);
    harness.queries.shift()!.callback(harness.viewportRect); harness.queries.shift()!.callback({ width: 350, left: 20 }); const unmounted = harness.queries.shift()!;
    harness.cleanups.pop()!(); unmounted.callback({ height: 180 }); expect(next.images[0].style.opacity).toBe('0');
  });
  it('uses neutral skeleton paint and clips only the height-animated frame while the image transitions opacity only', () => {
    const source = readFileSync(resolve('src/components/HtmlRender/index.scss'), 'utf8');
    const css = compileString(source, { loadPaths: [resolve('src/components/HtmlRender')] }).css;
    expect(css).toMatch(/\.htmlBodyImageHost--staged\s*\{[^}]*overflow: hidden;[^}]*transition: height 220ms ease/);
    expect(css).toMatch(/\.htmlBodyImageHost--staged \.htmlBodyImage\s*\{[^}]*transition: opacity 140ms ease/);
    expect(css).toMatch(/\.htmlBodyImageSkeleton\s*\{[^}]*background: var\(--theme-surface-alt,[^}]*border: 1rpx solid var\(--theme-border,/);
  });
  it('consumes each token once and strips a live pending token from authored comments without giving geometry authority', () => {
    const request = prepared('<img src="a.png">');
    const token = request.html.match(/data-html-image-presentation="([^"]+)"/)![1];
    const spoofed = prepared(`<div data-html-image-presentation="${token}" class="htmlWrap--body"><img src="comment.png"></div>`, {});
    const comment = parsePrepared(spoofed.html).images[0]; expect(skeleton(comment)).toBeUndefined(); load(comment, 600, 400); expect(comment.style.width).toBe('300px');
    const first = parsePrepared(request.html).images[0]; expect(skeleton(first)).toBeDefined();
    const replay = parsePrepared(request.html).images[0]; expect(skeleton(replay)).toBeUndefined(); expect(harness.queries).toHaveLength(0);
  });
  it('strips only reserved opening-tag attributes while retaining text, code, quoted values and lookalike prefixes', () => {
    const authored = '纯正文 data-html-image-presentation=foo<pre><code>示例 data-html-image-presentation="example" &lt;div data-html-image-presentation=foo&gt;</code></pre><div title="keep data-html-image-presentation=quoted > example" data-html-image-presentation-extra="keep" DATA-HTML-IMAGE-PRESENTATION="remove"><img src="a.png"></div>';
    const request = prepared(authored, {}); expect(request.html).toContain('纯正文 data-html-image-presentation=foo');
    expect(request.html).toContain('示例 data-html-image-presentation="example" &lt;div data-html-image-presentation=foo&gt;');
    expect(request.html).toContain('title="keep data-html-image-presentation=quoted > example"'); expect(request.html).toContain('data-html-image-presentation-extra="keep"');
    expect(request.html).not.toContain('DATA-HTML-IMAGE-PRESENTATION="remove"');
  });
  it('bounds abandoned render flags at 32 and lets evicted tokens fall back visibly while independent current tokens still stage', () => {
    const requests = Array.from({ length: 33 }, (_, index) => prepared(`<img src="${index}.png">`));
    const evicted = parsePrepared(requests[0].html).images[0]; expect(skeleton(evicted)).toBeUndefined(); load(evicted, 80, 40); expect(evicted.style.width).toBe('80px');
    expect(skeleton(parsePrepared(requests[1].html).images[0])).toBeDefined(); expect(skeleton(parsePrepared(requests[32].html).images[0])).toBeDefined();
  });
  it('removes an unparsed token on effect cleanup without retaining image or root data', () => {
    const request = prepared('<img src="unused.png">'); const cleanup = harness.effects.pop()!(); cleanup!();
    const image = parsePrepared(request.html).images[0]; expect(skeleton(image)).toBeUndefined();
  });
});

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
  it.each([320, 390, 430])('aligns both landscape edges to the actual padded viewport, not window width (%s)', windowWidth => {
    harness.window = { windowWidth, windowHeight: 800 };
    harness.viewportRect = { width: windowWidth - 20, left: 10, 'padding-left': '8px', 'padding-right': '12px' };
    const contentLeft = 42; const contentWidth = windowWidth - 95;
    const { images } = mount('<p><a href="https://other.test"><img src="wide.png"></a></p>', { variant: 'body', fullBleedImages: true });
    load(images[0], 1200, 600); measure(contentWidth, contentLeft);
    const image = images[0]; const width = parseFloat(image.style.width);
    const transform = parseFloat(image.parentElement.style.transform.match(/translateX\(([^)]+)px\)/)[1]);
    const left = contentLeft + (contentWidth - width) / 2 + transform;
    expect(left).toBeCloseTo(18); expect(left + width).toBeCloseTo(windowWidth - 22);
    expect(parseFloat(image.style.height)).toBeCloseTo(width / 2);
    expect(image.style.marginLeft).not.toMatch(/-/);
  });
  it('deducts asymmetric viewport and parent borders and padding before aligning both edges', () => {
    harness.viewportRect = { width: 360, left: 10, 'padding-left': '8px', 'padding-right': '12px', 'border-left-width': '3px', 'border-right-width': '5px' };
    const { images } = mount('<img src="wide.png">', { variant: 'body', fullBleedImages: true });
    load(images[0], 1200, 600);
    measure(300, 40, { 'padding-left': '10px', 'padding-right': '20px', 'border-left-width': '2px', 'border-right-width': '4px' });
    const image = images[0]; const width = parseFloat(image.style.width);
    const transform = parseFloat(image.parentElement.style.transform.match(/translateX\(([^)]+)px\)/)[1]);
    const left = 52 + (264 - width) / 2 + transform;
    expect(harness.contentWidth).toBe(264); expect(width).toBe(332);
    expect(left).toBeCloseTo(21); expect(left + width).toBeCloseTo(353);
    expect(parseFloat(image.style.height)).toBeCloseTo(166);
  });
  it.each(['skyline', 'webview'])('keeps both measured photo edges within the inner post-card content box, not its outer scroll area in %s', renderer => {
    harness.renderer = renderer;
    harness.window = { windowWidth: 430, windowHeight: 800 };
    harness.viewportRect = { width: 354, left: 38, 'padding-left': '13px', 'padding-right': '19px', 'border-left-width': '2px', 'border-right-width': '4px' };
    const { root, images } = mount('<p><a href="https://other.test"><img src="synthetic-wide.png"></a></p>', { variant: 'body', fullBleedImages: true, testViewportCard: true });
    const card = root.parentElement!;
    expect(card.className).toBe('main topicBodyImageViewport');
    expect(card.parentElement!.nodeName).toBe('scroll-view');
    expect(card.parentElement!.className).toBe('scrollContent');
    load(images[0], 1200, 600);
    expect(harness.queries[0].selector).toBe(`#${card.uid || card.sid}`);
    measure(284, 67, { 'padding-left': '7px', 'padding-right': '9px', 'border-left-width': '1px', 'border-right-width': '3px' });
    const bounds = photoBounds(images[0], 75);
    expect(bounds.left).toBeCloseTo(53); expect(bounds.right).toBeCloseTo(369); expect(bounds.width).toBeCloseTo(316);
    expect(bounds.left).toBeGreaterThan(38); expect(bounds.right).toBeLessThan(392);
    expect(parseFloat(images[0].style.height)).toBeCloseTo(158);
    expect(images[0].style.maxWidth).toBe('none');
    expect(images[0].parentElement.style.marginLeft).not.toMatch(/-/);
    expect(harness.queries).toHaveLength(0);
  });
  it('retains small-image no-upscale centering and portrait caps inside the measured card content box', () => {
    harness.viewportRect = { width: 354, left: 38, 'padding-left': '13px', 'padding-right': '19px', 'border-left-width': '2px', 'border-right-width': '4px' };
    const { images } = mount('<img src="synthetic-small.png"><img src="synthetic-portrait.png">', { variant: 'body', fullBleedImages: true, testViewportCard: true });
    load(images[0], 80, 40); measure(316, 53);
    const small = photoBounds(images[0], 53);
    expect(small.width).toBeCloseTo(80); expect(small.left).toBeCloseTo(171); expect(small.right).toBeCloseTo(251);
    expect(parseFloat(images[0].style.height)).toBeCloseTo(40);
    load(images[1], 600, 1200); measure(316, 53);
    const portrait = photoBounds(images[1], 53);
    expect(portrait.width).toBeCloseTo(240); expect(portrait.left).toBeCloseTo(91); expect(portrait.right).toBeCloseTo(331);
    expect(parseFloat(images[1].style.height)).toBeCloseTo(480);
    expect(images[1].style.maxWidth).toBe('100%');
  });
  it.each(['list', 'blockquote', 'width', 'overflow'] as const)('keeps a %s-constrained inner ancestor contained even when a valid wider card viewport exists', constraint => {
    harness.viewportRect = { width: 354, left: 38, 'padding-left': '13px', 'padding-right': '19px', 'border-left-width': '2px', 'border-right-width': '4px' };
    const html = { list: '<ul><li><img src="synthetic.png"></li></ul>', blockquote: '<blockquote><img src="synthetic.png"></blockquote>', width: '<div style="width: 100px"><img src="synthetic.png"></div>', overflow: '<div style="overflow: hidden"><img src="synthetic.png"></div>' }[constraint];
    const { root, images } = mount(html, { variant: 'body', fullBleedImages: true, testViewportCard: true });
    load(images[0], 1200, 600);
    expect(harness.queries.every(query => !harness.viewportSelectors.has(query.selector))).toBe(true);
    measure(140, 100, { 'padding-left': '17px', 'padding-right': '19px', 'border-left-width': '1px', 'border-right-width': '3px' });
    const bounds = photoBounds(images[0], 118);
    expect(bounds.width).toBeCloseTo(100); expect(bounds.left).toBeCloseTo(118); expect(bounds.right).toBeCloseTo(218);
    expect(parseFloat(images[0].style.height)).toBeCloseTo(50);
    expect(images[0].style.maxWidth).toBe('100%');
    expect(root.parentElement!.className).toBe('main topicBodyImageViewport');
  });
  it.each(['absent', 'null', 'invalid', 'zero'])('falls back to contained sizing when the explicit viewport is %s', status => {
    const { images } = mount('<img src="wide.png">', { variant: 'body', fullBleedImages: true, testViewport: status !== 'absent' });
    if (status === 'null') harness.viewportRect = null;
    if (status === 'invalid') harness.viewportRect = { left: NaN, width: NaN };
    if (status === 'zero') harness.viewportRect = { left: 0, width: 0 };
    load(images[0], 1200, 600);
    measure(300, 40, { 'padding-left': '10px', 'padding-right': '20px', 'border-left-width': '2px', 'border-right-width': '4px' });
    size(images[0], 264, 132, 0);
    expect(images[0].style.maxWidth).toBe('100%'); expect(images[0].style.borderRadius).toBe('8rpx');
    expect(images[0].parentElement.style.transform).toBe('translateX(0px)');
    expect(harness.queries).toHaveLength(0);
  });
  it('recalculates measured content alignment and viewport dimensions after resize', () => {
    const { images } = mount('<img src="wide.png">', { variant: 'body', fullBleedImages: true });
    load(images[0], 1200, 600); measure(); size(images[0], 390, 195, -20);
    harness.window = { windowWidth: 320, windowHeight: 650 }; harness.viewportRect = { width: 300, left: 10 };
    harness.resize(); measure(260, 30); size(images[0], 300, 150, -20);
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
