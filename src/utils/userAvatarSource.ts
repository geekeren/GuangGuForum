import url from 'url';

const FORUM_ORIGIN = 'https://www.guozaoke.com/';
export const DEFAULT_USER_AVATAR_SOURCE = '/static/m_default.png';

/** Resolve API avatar paths without relying on the mini-program having a browser URL global. */
export function userAvatarSource(source?: string): string {
  const input = source?.trim();
  if (!input || /[\u0000- \u007f\\]/.test(input)) return DEFAULT_USER_AVATAR_SOURCE;
  try {
    const candidate = input.startsWith('//') ? `https:${input}` : input;
    const parsed = url.parse(candidate);
    if (parsed.protocol && !/^https?:$/i.test(parsed.protocol)) return DEFAULT_USER_AVATAR_SOURCE;
    if (parsed.auth || (parsed.protocol && !/^https?:\/\//i.test(candidate))) return DEFAULT_USER_AVATAR_SOURCE;
    // Reject traversal before resolve() could silently normalize it, including encoded path separators.
    const path = parsed.pathname || '';
    const decodedPath = decodeURIComponent(path);
    if (decodedPath.includes('\\') || /%2e|%2f|%5c/i.test(decodedPath)
      || decodedPath.split('/').some(segment => segment === '.' || segment === '..')) return DEFAULT_USER_AVATAR_SOURCE;
    const resolved = url.parse(url.resolve(FORUM_ORIGIN, candidate));
    if (!resolved.hostname || resolved.auth || !/^https?:$/.test(resolved.protocol || '')) return DEFAULT_USER_AVATAR_SOURCE;
    resolved.protocol = 'https:';
    resolved.hash = null;
    if (['www.guozaoke.com', 'guozaoke.com'].includes(resolved.hostname)
      && resolved.pathname?.endsWith('/m_default.png')) return DEFAULT_USER_AVATAR_SOURCE;
    return url.format(resolved);
  } catch {
    return DEFAULT_USER_AVATAR_SOURCE;
  }
}
