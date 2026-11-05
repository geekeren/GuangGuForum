import type { HTMLElement } from 'node-html-parser';

/** Presentation only: never use this label as an account, route, UID or cache key. */
export function getDisplayName(root: HTMLElement | null | undefined, fallback: string, userLink?: string): string {
  if (!root) return fallback;
  const candidates = root.querySelectorAll('.gzk-display-name').filter(display => {
    let ancestor: HTMLElement | null = display;
    while (ancestor && ancestor !== root) {
      if ((ancestor.getAttribute('class') || '').split(/\s+/).includes('last-reply-username')) return false;
      ancestor = ancestor.parentNode as HTMLElement | null;
    }
    const link = display.getAttribute('href');
    return !userLink || !link || link === userLink;
  });
  // Multiple author labels are ambiguous; do not borrow another user's nickname.
  if (candidates.length !== 1) return fallback;
  const display = candidates[0];
  return display.querySelector('bdi')?.textContent.trim()
    || display.textContent.trim()
    || display.getAttribute('data-display-name')?.trim()
    || fallback;
}
