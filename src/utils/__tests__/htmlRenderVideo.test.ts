import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileString } from 'sass';
import { document, TaroEvent, URL as TaroURLProvider } from '@tarojs/runtime';
import Taro from '@tarojs/taro';
import HtmlRender from '../../components/HtmlRender';
import { resolveHtmlMediaUrl } from '../../components/HtmlRender/media';
import { linkHandler } from '../linkHandler';

const harness = vi.hoisted(() => {
  for (const flag of ['ENABLE_INNER_HTML', 'ENABLE_ADJACENT_HTML', 'ENABLE_CLONE_NODE', 'ENABLE_CONTAINS', 'ENABLE_SIZE_APIS', 'ENABLE_TEMPLATE_CONTENT', 'ENABLE_MUTATION_OBSERVER']) {
    (globalThis as any)[flag] = flag === 'ENABLE_INNER_HTML';
  }
  return { renderer: 'skyline' };
});
vi.mock('react', async original => ({ ...await original<any>(), useRef: () => ({ current: null }), useMemo: (fn: any) => fn(), useEffect: vi.fn() }));
vi.mock('@tarojs/components', () => ({ View: 'View', Text: 'Text', Span: 'Span', Video: 'Video' }));
vi.mock('@tarojs/taro', async () => ({ default: { options: (await import('@tarojs/runtime')).options,
  setClipboardData: vi.fn(() => Promise.resolve()), showToast: vi.fn(), previewImage: vi.fn(() => Promise.resolve()),
} }));
vi.mock('guanggu-forum-api', () => ({ URLS: { ROOT_URL: 'https://www.guozaoke.com' } }));
vi.mock('../../hooks/usePageRenderer', () => ({ usePageRenderer: () => harness.renderer }));
vi.mock('../renderer', () => ({ isSkyline: () => harness.renderer === 'skyline' }));
vi.mock('../linkHandler', () => ({ isUserMentionLink: () => false, linkChipLabel: () => 'link', linkHandler: vi.fn() }));

function nodes(node: any): any[] { return [node, ...node.childNodes.flatMap(nodes)]; }
function parse(html: string, variant?: 'body') {
  const tree = HtmlRender({ html, variant });
  const view = tree.props.children.find((node: any) => node?.props?.dangerouslySetInnerHTML);
  const root = document.createElement('view');
  root.innerHTML = view.props.dangerouslySetInnerHTML.__html;
  return { root, all: nodes(root), tree };
}
function event(type: string, detail: Record<string, unknown> = {}) {
  const result = new TaroEvent(type, { bubbles: true, cancelable: true }) as TaroEvent & { detail: Record<string, unknown> };
  result.detail = detail;
  return result;
}
function videos(root: any) { return nodes(root).filter(node => node.nodeName === 'video'); }
function media(root: any) { return nodes(root).filter(node => node.className?.split(' ').includes('htmlMediaHost')); }
beforeEach(() => { vi.clearAllMocks(); harness.renderer = 'skyline'; });

describe('HTML native video through the installed Taro parser', () => {
  it.each(['skyline', 'webview'])('promotes nested source and keeps media out of inline text in %s', renderer => {
    harness.renderer = renderer;
    const { root } = parse('<p>前文<strong><span>中间<video><source src="/media/a.mp4" type="video/mp4">浏览器提示</video>结尾</span></strong>后文</p>');
    const player = videos(root)[0];
    expect(player.props.src).toBe('https://www.guozaoke.com/media/a.mp4');
    expect(videos(root)).toHaveLength(1);
    expect(nodes(root).some(node => node.h5tagName === 'source')).toBe(false);
    expect(root.textContent).toContain('前文'); expect(root.textContent).toContain('中间');
    expect(root.textContent).toContain('结尾'); expect(root.textContent).toContain('后文');
    for (let parent = player.parentElement; parent; parent = parent.parentElement) expect(['text', 'span']).not.toContain(parent.nodeName);
    expect(player.props.controls).toBe(true); expect(player.props.autoplay).toBe(false);
  });

  it('prioritizes direct src, resolves protocol/relative URLs and decodes attribute entities once', () => {
    const { root } = parse('<VIDEO SRC="//media.test/primary.mp4?a=1&amp;b=2" poster="/poster.jpg" controls autoplay loop style="display:none" native-video="true"><source src="fallback.mp4"></VIDEO>');
    // HTML attribute names, like HTML tag names, are case-insensitive.
    expect(videos(root)[0].props.src).toBe('https://media.test/primary.mp4?a=1&b=2');
    expect(videos(root)[0].props.poster).toBe('https://www.guozaoke.com/poster.jpg');
    expect(videos(root)[0].props).not.toHaveProperty('native-video');
    expect(videos(root)[0].props.loop).toBe(false); expect(videos(root)[0].style.display).toBe('block');
  });

  it('skips unsafe or unsupported source candidates and tries each later safe address once on errors', () => {
    const { root } = parse('<video src="javascript:alert(1)"><source src="/skip.bin" type="application/octet-stream"><source src="data:video/mp4;base64,abc" type="video/mp4"><div><source src="/a.mp4" type="video/mp4"></div><source src="/a.mp4"><source src="//media.test/b.mp4" type="video/mp4; codecs=avc1"></video>');
    const player = videos(root)[0], host = player.parentElement;
    expect(player.props.src).toBe('https://www.guozaoke.com/a.mp4');
    expect(Taro.setClipboardData).not.toHaveBeenCalled();
    player.dispatchEvent(event('error'));
    const backup = videos(root)[0];
    expect(backup).not.toBe(player); expect(backup.sid).not.toBe(player.sid);
    expect(player.parentElement).toBeNull();
    expect(backup.props.src).toBe('https://media.test/b.mp4');
    expect(host.textContent).toContain('备用地址');
    backup.dispatchEvent(event('loadedmetadata', { width: 640, height: 360 }));
    expect(host.className).toContain('htmlMediaHost--ready');
    backup.dispatchEvent(event('error'));
    expect(videos(root)).toHaveLength(0); expect(host.textContent).toContain('视频加载失败');
    nodes(host).find(node => node.className === 'htmlMediaLink').dispatchEvent(event('tap'));
    expect(Taro.setClipboardData).toHaveBeenCalledExactlyOnceWith({ data: 'https://media.test/b.mp4' });
    expect(linkHandler).not.toHaveBeenCalled();
    player.dispatchEvent(event('loadedmetadata')); backup.dispatchEvent(event('loadedmetadata'));
    expect(host.className).toContain('htmlMediaHost--error');
  });

  it('isolates duplicate and late native events without src across independent player generations', async () => {
    const { root } = parse('<video src="/one.mp4"><source src="/two.mp4"><source src="/three.mp4"></video>');
    const first = videos(root)[0], host = first.parentElement;
    first.dispatchEvent(event('error'));
    const second = videos(root)[0];
    first.dispatchEvent(event('error')); first.dispatchEvent(event('loadedmetadata'));
    expect(videos(root)).toEqual([second]); expect(host.className).not.toContain('--ready');
    second.dispatchEvent(event('loadedmetadata'));
    expect(host.className).toContain('--ready');
    second.dispatchEvent(event('error'));
    const third = videos(root)[0];
    second.dispatchEvent(event('error')); second.dispatchEvent(event('loadedmetadata')); first.dispatchEvent(event('error'));
    expect(videos(root)).toEqual([third]); expect(third.props.src).toBe('https://www.guozaoke.com/three.mp4');
    expect(host.className).not.toContain('--ready');
    vi.mocked(Taro.setClipboardData).mockRejectedValueOnce(new Error('clipboard unavailable'));
    nodes(host).find(node => node.className === 'htmlMediaLink').dispatchEvent(event('tap'));
    await Promise.resolve();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '复制失败，请重试', icon: 'none' });
    third.dispatchEvent(event('error')); third.dispatchEvent(event('error')); third.dispatchEvent(event('loadedmetadata'));
    expect(videos(root)).toHaveLength(0); expect(host.className).toContain('--error');
  });

  it('preserves linked video, multiple players, normal links, surrounding text and image preview', () => {
    const { root } = parse('<p>start<a href="https://media.test"><span><video src="/one.mp4"></video></span></a>middle<img src="/photo.jpg"><a href="https://example.test">site</a><video><source src="/two.mp4"></video>end</p>', 'body');
    const players = videos(root); expect(players.map(player => player.props.src)).toEqual(['https://www.guozaoke.com/one.mp4', 'https://www.guozaoke.com/two.mp4']);
    expect(root.textContent).toContain('start'); expect(root.textContent).toContain('middle'); expect(root.textContent).toContain('end');
    expect(media(root)).toHaveLength(2);
    players[0].dispatchEvent(event('error')); expect(videos(root)).toEqual([players[1]]);
    const image = nodes(root).find(node => node.className?.split(' ').includes('h5-img'));
    expect(image.props.src).toBe('https://www.guozaoke.com/photo.jpg');
    image.dispatchEvent(event('tap')); expect(Taro.previewImage).toHaveBeenCalledWith({ urls: ['https://www.guozaoke.com/photo.jpg'] });
    // TaroElement.dispatchEvent does not synthesize native bubbling. Dispatch
    // at the actual parsed link host where HtmlRender installs its listener.
    nodes(root).find(node => node.h5tagName === 'a' && node.props.href === 'https://example.test').dispatchEvent(event('tap'));
    expect(linkHandler).toHaveBeenCalledWith('https://example.test');
  });

  it('shows a visible safe fallback in both comments and body for missing/unsafe sources', () => {
    for (const variant of [undefined, 'body'] as const) {
      const { root } = parse('<video src="blob:example"><source src="https://user:pass@media.test/a.mp4"></video>', variant);
      expect(videos(root)).toHaveLength(0); expect(root.textContent).toContain('没有可用的安全视频地址');
      expect(nodes(root).some(node => node.className === 'htmlMediaLink')).toBe(false);
    }
  });

  it('never mounts an iframe/web-view or executes script; only explicit safe external-link copying remains', () => {
    const { root } = parse('<iframe src="https://player.example.test/embed?id=1&amp;part=2"><video src="/ignored.mp4"></video></iframe><iframe src="javascript:alert(1)"></iframe><script>throw new Error("do not execute")</script>');
    for (const name of ['web-view', 'iframe', 'script', 'video']) {
      expect(nodes(root).filter(node => node.nodeName === name), `${name} must never mount`).toHaveLength(0);
    }
    expect(root.textContent).toContain('嵌入内容'); expect(root.textContent).not.toContain('do not execute');
    const links = nodes(root).filter(node => node.className === 'htmlMediaLink'); expect(links).toHaveLength(1);
    expect(Taro.setClipboardData).not.toHaveBeenCalled(); links[0].dispatchEvent(event('tap'));
    expect(Taro.setClipboardData).toHaveBeenCalledWith({ data: 'https://player.example.test/embed?id=1&part=2' });
  });

  it('does not mount an empty native Video for body or comment HTML and retains bounded theme-aware block styles', () => {
    for (const html of ['<p>text only</p>', '<video src="/a.mp4"></video>']) {
      for (const variant of [undefined, 'body'] as const) {
        const { tree } = parse(html, variant);
        expect(tree.props.children.some((node: any) => node?.type === 'Video')).toBe(false);
      }
    }
    const file = resolve('src/components/HtmlRender/index.scss');
    const css = compileString(readFileSync(file, 'utf8'), { loadPaths: [resolve(file, '..')] }).css;
    expect(css).toMatch(/\.htmlMediaHost,[^}]*display: block;[^}]*max-width: 100%/);
    expect(css).toMatch(/\.htmlMediaHost\s*\{[^}]*background: var\(--theme-surface,/);
  });
});

const unsafeUrls = ['javascript:alert(1)', 'data:video/mp4;base64,a', 'blob:test', 'wxfile://tmp/a', 'file:///a', 'https://user:pass@host.test/a.mp4', '//user@host.test/a.mp4', 'https:\\host.test/a.mp4', 'https://host.test/a\n.mp4', '#fragment', 'https://', 'jav&#x61;script:alert(1)', '/a&#10;b.mp4',
  'https:///a.mp4', '//?a.mp4', 'https://-bad.test/a.mp4', 'https://bad..test/a.mp4', 'https://bad.test:65536/a.mp4', 'https://bad.test:/a.mp4', 'https://bad.test:0/a.mp4', 'https://bad.test:abc/a.mp4', 'https://%75ser@bad.test/a.mp4', 'https://999.1.1.1/a.mp4'];
const safeUrls = [
  ['/media/a.mp4', 'https://www.guozaoke.com/media/a.mp4'],
  ['a.mp4', 'https://www.guozaoke.com/a.mp4'],
  ['./folder/../a.mp4', 'https://www.guozaoke.com/a.mp4'],
  ['../a.mp4', 'https://www.guozaoke.com/a.mp4'],
  ['//media.test/a.mp4', 'https://media.test/a.mp4'],
  ['https://media.test/a.mp4?token=1&amp;part=2', 'https://media.test/a.mp4?token=1&part=2'],
  ['https://media.test/a.mp4?encoded=%2F', 'https://media.test/a.mp4?encoded=%2F'],
  ['https://media.test:8443/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3', 'https://media.test:8443/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3'],
  ['//media.test/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3', 'https://media.test/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3'],
  ['/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3', 'https://www.guozaoke.com/a.mp4?flag&b=1&a=%20&b=2&sig=%2F%2B%3D&zero=%00#t=3'],
];

describe('safe authored HTML media URLs', () => {
  it.each(unsafeUrls)('rejects unsafe %s', src => { expect(resolveHtmlMediaUrl(src)).toBeUndefined(); });
  it.each(safeUrls)('resolves %s without losing URL data', (src, expected) => { expect(resolveHtmlMediaUrl(src)).toBe(expected); });
  it('uses the same fixtures with the installed Mini Program URL provider without rewriting signatures', () => {
    const originalUrl = globalThis.URL;
    vi.stubGlobal('URL', TaroURLProvider);
    try {
      expect(globalThis.URL).toBe(TaroURLProvider);
      expect(new TaroURLProvider(safeUrls[7][0]).href).not.toBe(safeUrls[7][0]);
      for (const src of unsafeUrls) expect(resolveHtmlMediaUrl(src)).toBeUndefined();
      for (const [src, expected] of safeUrls) expect(resolveHtmlMediaUrl(src)).toBe(expected);
      const signed = safeUrls[7][0];
      const { root } = parse(`<video src="${signed}"></video>`);
      expect(videos(root)[0].props.src).toBe(signed);
    } finally {
      vi.unstubAllGlobals();
      expect(globalThis.URL).toBe(originalUrl);
    }
  });
});
