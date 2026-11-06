import Taro from '@tarojs/taro';
import { TaroElement } from '@tarojs/runtime';
import { URLS } from 'guanggu-forum-api';

type HtmlElement = TaroElement & { h5tagName?: string };
const sourceTypes = new Set(['video/mp4', 'video/x-m4v', 'video/webm', 'video/ogg', 'application/x-mpegurl', 'application/vnd.apple.mpegurl']);

// Taro's innerHTML parser leaves attribute entities encoded, unlike a browser.
export function resolveHtmlMediaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/', tab: '\t', newline: '\n' };
  const decoded = value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|colon|sol|Tab|NewLine);/gi, (entity, name: string) => {
    if (!name.startsWith('#')) return named[name] ?? named[name.toLowerCase()] ?? entity;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '�';
  }).trim();
  if (!decoded || /[\u0000- \u007f-\u009f\\]/.test(decoded) || decoded.startsWith('#')) return;
  if (/^[^/?#]*:/.test(decoded) && !/^https?:\/\//i.test(decoded)) return;
  // Mini Program URL polyfills can accept an empty host and rewrite signed
  // queries. Validate the authority ourselves and preserve query/hash verbatim.
  const validAuthority = (authority: string) => {
    const match = /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/.exec(authority);
    if (!match || match[1].length > 253 || (match[2] !== undefined && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return false;
    const host = match[1].replace(/\.$/, '');
    const labels = host.split('.');
    if (!labels.every(label => label.length <= 63 && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label))) return false;
    if (/^[\d.]+$/.test(host)) return labels.length === 4 && labels.every(label => Number(label) <= 255);
    return true;
  };
  const absolute = /^(https?):\/\/([^/?#]*)([^]*)$/i.exec(decoded);
  if (absolute) return validAuthority(absolute[2]) ? decoded : undefined;
  const base = /^(https?):\/\/([^/?#]+)([^?#]*)/i.exec(URLS.ROOT_URL);
  if (!base || !validAuthority(base[2])) return;
  if (decoded.startsWith('//')) {
    const relativeAuthority = /^\/\/([^/?#]*)([^]*)$/.exec(decoded)!;
    return validAuthority(relativeAuthority[1]) ? `${base[1]}:${decoded}` : undefined;
  }
  const suffixAt = decoded.search(/[?#]/);
  const path = suffixAt === -1 ? decoded : decoded.slice(0, suffixAt);
  const suffix = suffixAt === -1 ? '' : decoded.slice(suffixAt);
  const basePath = base[3] || '/';
  const joined = path.startsWith('/') ? path : path ? `${basePath.slice(0, basePath.lastIndexOf('/') + 1)}${path}` : basePath;
  const segments: string[] = [];
  for (const segment of joined.split('/')) {
    if (segment === '.') continue;
    if (segment === '..') { if (segments.length > 1) segments.pop(); }
    else segments.push(segment);
  }
  if (/\/(?:\.|\.\.)$/.test(joined)) segments.push('');
  return `${base[1]}://${base[2]}${segments.join('/') || '/'}${suffix}`;
}

function attribute(element: TaroElement, name: string): unknown {
  const key = Object.keys(element.props).find(value => value.toLowerCase() === name);
  return key ? element.props[key] : undefined;
}

function videoSources(element: TaroElement) {
  const sources: string[] = [];
  const add = (node: TaroElement, checkType: boolean) => {
    const type = String(attribute(node, 'type') || '').split(';')[0].trim().toLowerCase();
    if (checkType && type && !sourceTypes.has(type)) return;
    const src = resolveHtmlMediaUrl(attribute(node, 'src'));
    if (src && !sources.includes(src)) sources.push(src);
  };
  add(element, false);
  const visit = (node: TaroElement) => {
    for (const child of node.children) {
      const tag = (child as HtmlElement).h5tagName?.toLowerCase();
      if (tag === 'source') add(child, true);
      else if (tag !== 'video') visit(child);
    }
  };
  visit(element);
  return sources;
}

function resetHost(element: TaroElement) {
  // Server attributes (autoplay, HTML handlers, style and unknown native props)
  // cannot leak into the native player. Rebuild only allowlisted presentation.
  for (const key of Object.keys(element.props)) element.removeAttribute(key);
  element.tagName = 'VIEW'; element.nodeName = 'view';
  while (element.firstChild) element.removeChild(element.firstChild);
  element.className = 'htmlMediaHost';
}

function textNode(host: TaroElement, label: string, className: string) {
  const text = host.ownerDocument.createElement('text');
  text.className = className;
  text.appendChild(host.ownerDocument.createTextNode(label));
  return text;
}

function copyLink(element: TaroElement, src: string) {
  element.addEventListener('tap', event => {
    event.stopPropagation();
    void Taro.setClipboardData({ data: src }).catch(() => {
      Taro.showToast({ title: '复制失败，请重试', icon: 'none' });
    });
  }, {});
}

/** Video and iframe are block media, never executable HTML or native WebViews. */
export function transformHtmlMedia(element: TaroElement, tagName: string): boolean {
  const tag = tagName.toLowerCase();
  // Taro skips script text but still produces an empty native script element.
  // Never let authored script nodes reach the Mini Program component tree.
  if (tag === 'script') {
    resetHost(element);
    element.className = '';
    element.setAttribute('style', 'display: none');
    return true;
  }
  if (tag !== 'video' && tag !== 'iframe') return false;
  const sources = tag === 'video' ? videoSources(element) : [];
  const poster = resolveHtmlMediaUrl(attribute(element, 'poster'));
  const iframeSrc = tag === 'iframe' ? resolveHtmlMediaUrl(attribute(element, 'src')) : undefined;
  resetHost(element);
  if (tag === 'iframe') {
    element.className += ' htmlMediaHost--external';
    element.appendChild(textNode(element, iframeSrc ? '嵌入内容不支持直接播放，可复制链接在浏览器打开' : '嵌入内容无法展示：没有安全的链接', 'htmlMediaStatus'));
    if (iframeSrc) {
      const link = textNode(element, '复制外部链接', 'htmlMediaLink');
      copyLink(link, iframeSrc); element.appendChild(link);
    }
    return true;
  }

  const status = textNode(element, sources.length ? '视频加载中' : '视频无法展示：没有可用的安全视频地址', 'htmlMediaStatus');
  element.appendChild(status);
  if (!sources.length) { element.className += ' htmlMediaHost--error'; return true; }

  let sourceIndex = 0;
  let generation = 0;
  let currentPlayer: TaroElement | undefined;
  const link = textNode(element, '无法播放？复制视频地址', 'htmlMediaLink');
  link.addEventListener('tap', event => {
    event.stopPropagation();
    void Taro.setClipboardData({ data: sources[sourceIndex] }).catch(() => {
      Taro.showToast({ title: '复制失败，请重试', icon: 'none' });
    });
  }, {});
  element.appendChild(link);

  const mountPlayer = () => {
    // Native error/metadata events do not identify their src. Each candidate
    // gets a fresh native node and listener generation, never a reused player.
    const player = element.ownerDocument.createElement('video');
    const playerGeneration = ++generation;
    currentPlayer = player;
    const current = () => currentPlayer === player && generation === playerGeneration && player.parentElement === element;
    player.className = 'htmlVideo';
    player.setAttribute('controls', true);
    player.setAttribute('autoplay', false);
    player.setAttribute('loop', false);
    player.setAttribute('objectFit', 'contain');
    player.setAttribute('style', 'display: block; width: 100%; height: 225px; max-width: 100%');
    if (poster) player.setAttribute('poster', poster);
    player.setAttribute('src', sources[sourceIndex]);
    player.addEventListener('loadedmetadata', () => {
      if (!current()) return;
      element.className = 'htmlMediaHost htmlMediaHost--ready';
      status.textContent = '视频';
    }, {});
    player.addEventListener('error', () => {
      if (!current()) return;
      currentPlayer = undefined;
      element.removeChild(player);
      if (sourceIndex + 1 < sources.length) {
        sourceIndex++;
        status.textContent = '当前视频源无法播放，正在尝试备用地址';
        element.className = 'htmlMediaHost';
        mountPlayer();
      } else {
        element.className = 'htmlMediaHost htmlMediaHost--error';
        status.textContent = '视频加载失败，可复制链接在浏览器打开';
        link.textContent = '复制视频链接';
      }
    }, {});
    element.insertBefore(player, status);
  };
  mountPlayer();
  return true;
}

export function containsHtmlMedia(element: TaroElement): boolean {
  return element.className.split(' ').includes('htmlMediaHost') || element.children.some(containsHtmlMedia);
}
