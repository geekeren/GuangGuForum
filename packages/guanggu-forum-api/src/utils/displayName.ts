import type { HTMLElement } from 'node-html-parser';

const hasClass = (node: HTMLElement | null | undefined, name: string) =>
  (node?.getAttribute('class') || '').split(/\s+/).includes(name);

function isLastReply(node: HTMLElement): boolean {
  for (let current: HTMLElement | null = node; current; current = current.parentNode as HTMLElement | null) {
    if (hasClass(current, 'last-reply-username')) return true;
  }
  return false;
}

function includingRoot(root: HTMLElement, selector: string, matchesRoot: boolean): HTMLElement[] {
  return [...(matchesRoot ? [root] : []), ...root.querySelectorAll(selector)];
}

function displayOwner(display: HTMLElement): HTMLElement {
  for (let node: HTMLElement | null = display; node; node = node.parentNode as HTMLElement | null) {
    if (node.tagName === 'A' && node.getAttribute('href')) return node;
  }
  return display;
}

function displayCandidates(root: HTMLElement): HTMLElement[] {
  return includingRoot(root, '.gzk-display-name', hasClass(root, 'gzk-display-name'))
    .filter(display => {
      if (isLastReply(display)) return false;
      // A nested marker belongs to its outer display label, not a second actor.
      for (let node = display === root ? null : display.parentNode as HTMLElement | null; node; node = node.parentNode as HTMLElement | null) {
        if (hasClass(node, 'gzk-display-name')) return false;
        if (node === root) break;
      }
      return true;
    });
}

function matchesAccount(display: HTMLElement, account: string, userLink?: string): boolean {
  const owner = displayOwner(display);
  const username = display.getAttribute('data-username')?.trim() || owner.getAttribute('data-username')?.trim();
  if (account && username && username !== account) return false;
  const link = owner.getAttribute('href');
  if (!userLink || !link || link === userLink) return true;
  // The existing server author protocol pairs a legacy handle URL with a UID
  // display URL. Only explicit same-account metadata can bridge those URLs.
  const uid = display.getAttribute('data-gzk-mention-user')?.trim() || owner.getAttribute('data-gzk-mention-user')?.trim();
  return !!account && username === account && !!uid && /^\d+$/.test(uid) && link === `/u/${uid}`;
}

/** Presentation only: never use this label as an account, route, UID or cache key. */
export function getDisplayName(root: HTMLElement | null | undefined, fallback: string, userLink?: string, account = fallback): string {
  if (!root) return fallback;
  const candidates = displayCandidates(root).filter(display => matchesAccount(display, account, userLink));
  // Multiple author labels are ambiguous; do not borrow another user's nickname.
  if (candidates.length !== 1) return fallback;
  const display = candidates[0];
  return display.querySelector('bdi')?.textContent.trim()
    || display.textContent.trim()
    || display.getAttribute('data-display-name')?.trim()
    || displayOwner(display).getAttribute('data-display-name')?.trim()
    || fallback;
}

/** Read the server author region without ever turning its display label into identity. */
export function parseListAuthor(root: HTMLElement | null | undefined, fallbackUsername: string, fallbackLink = ''): {
  username: string; userLink: string; displayName: string;
} {
  if (!root) return { username: fallbackUsername, userLink: fallbackLink, displayName: fallbackUsername };
  const anchors = includingRoot(root, 'a[href^="/u/"]', root.tagName === 'A' && !!root.getAttribute('href')?.startsWith('/u/'))
    .filter(anchor => {
      if (isLastReply(anchor)) return false;
      for (let node: HTMLElement | null = anchor; node; node = node.parentNode as HTMLElement | null) {
        if (hasClass(node, 'gzk-display-name')) return false;
        if (node === root) break;
      }
      return !anchor.querySelector('.gzk-display-name');
    });
  const legacy = anchors.find(anchor => hasClass(anchor, 'gzk-legacy-id') || hasClass(anchor, 'username')
    || hasClass(anchor.parentNode as HTMLElement, 'username') || !!anchor.querySelector('.username')) || anchors[0];
  const legacyUsername = includingRoot(root, '.username', hasClass(root, 'username')).find(node => {
    if (isLastReply(node) || node.querySelector('.gzk-display-name')) return false;
    for (let current: HTMLElement | null = node; current; current = current.parentNode as HTMLElement | null) {
      if (hasClass(current, 'gzk-display-name')) return false;
      if (current === root) break;
    }
    return true;
  });
  const displays = displayCandidates(root);
  const display = displays.length === 1 ? displays[0] : undefined;
  const owner = display && displayOwner(display);
  const dataUsername = display?.getAttribute('data-username')?.trim() || owner?.getAttribute('data-username')?.trim();
  const username = legacy?.textContent.trim() || legacyUsername?.textContent.trim() || dataUsername || (displays.length ? '' : fallbackUsername);
  const userLink = fallbackLink || legacy?.getAttribute('href') || owner?.getAttribute('href') || '';
  return { username, userLink, displayName: getDisplayName(root, username, userLink, username) };
}
