import { parse, type HTMLElement } from 'node-html-parser';
import { getCacheService, request } from '../client';
import { URLS } from '../urls';

export interface RecentlyViewedTopic {
  tid: string;
  title: string;
  link: string;
  avatarUrl: string;
  author?: string;
  /** Presentation label, separate from the stable author account. */
  displayName?: string;
  viewedAt?: number;
}

export interface RecentClearForm {
  action: '/recent/clear';
  xsrf: string;
  ownerId: string;
}

export interface RecentlyViewedTopics {
  topics: RecentlyViewedTopic[];
  clearForm: RecentClearForm;
}

export class RecentlyViewedTopicsError extends Error {
  constructor(message: string) { super(message); this.name = 'RecentlyViewedTopicsError'; }
}

export function parseRecentlyViewedTopics(root: HTMLElement): RecentlyViewedTopic[] {
  const seen = new Set<string>();
  return root.querySelectorAll('.gzk-recent-list > .cell, .cell').flatMap(cell => {
    const anchor = cell.querySelector('a.gzk-recent-item');
    const href = anchor?.getAttribute('href') ?? '';
    const match = /^\/t\/(\d+)(?:[?#].*)?$/.exec(href);
    const title = anchor?.textContent.trim() ?? '';
    if (!match || !title || seen.has(match[1])) return [];
    seen.add(match[1]);
    const avatar = cell.querySelector('img.avatar')?.getAttribute('src') ?? '';
    let avatarUrl = '';
    try {
      const resolved = new URL(avatar, URLS.ROOT_URL);
      if (avatar && /^https?:$/.test(resolved.protocol)) avatarUrl = resolved.href;
    } catch { /* A missing avatar must not drop the topic. */ }
    return [{ tid: match[1], title, link: `/t/${match[1]}`, avatarUrl }];
  });
}

function currentAccount(username: string) {
  if (!username || getCacheService().get<string>('current_username') !== username) {
    throw new RecentlyViewedTopicsError('登录状态已变化，请重新进入“我的”');
  }
}

function parseRecentResponse(response: Awaited<ReturnType<typeof request>>, form: RecentClearForm): RecentlyViewedTopics {
  let payload: unknown = response.data ?? response.rawRes?.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  const data = payload as { owner_id?: unknown; html?: unknown; count?: unknown } | null;
  if (response.rawRes?.statusCode !== 200 || !data || String(data.owner_id) !== form.ownerId
    || typeof data.html !== 'string' || !Number.isSafeInteger(data.count) || Number(data.count) < 0) {
    throw new RecentlyViewedTopicsError('最近浏览读取失败，请刷新后重试');
  }
  const topics = parseRecentlyViewedTopics(parse(data.html));
  if (Number(data.count) > 0 && topics.length === 0) throw new RecentlyViewedTopicsError('最近浏览内容暂时无法读取');
  return { topics, clearForm: form };
}

export async function getRecentlyViewedTopics(username: string): Promise<RecentlyViewedTopics> {
  currentAccount(username);
  const { body, rawRes } = await request('/', { cache: false });
  currentAccount(username);
  const form = body?.querySelector('.gzk-recent-heading form.gzk-recent-clear[action="/recent/clear"]');
  const xsrf = form?.querySelector('input[name="_xsrf"]')?.getAttribute('value') ?? '';
  const ownerId = form?.querySelector('input[name="owner_id"]')?.getAttribute('value') ?? '';
  const viewer = body?.querySelector('body')?.getAttribute('data-gzk-viewer');
  if (rawRes?.statusCode !== 200 || !xsrf || !/^\d+$/.test(ownerId) || (viewer && viewer !== ownerId)) {
    throw new RecentlyViewedTopicsError('服务器浏览记录暂不可用，已保留本地记录');
  }
  const clearForm: RecentClearForm = { action: '/recent/clear', xsrf, ownerId };
  const response = await request('/api/topics/recent', {
    cache: false, query: { owner_id: ownerId }, header: { Accept: 'application/json' },
  });
  currentAccount(username);
  return parseRecentResponse(response, clearForm);
}

export async function clearRecentlyViewedTopics(username: string, form: RecentClearForm): Promise<RecentlyViewedTopics> {
  currentAccount(username);
  if (form.action !== '/recent/clear' || !form.xsrf || !/^\d+$/.test(form.ownerId)) {
    throw new RecentlyViewedTopicsError('请先刷新最近浏览记录');
  }
  const response = await request('/recent/clear', {
    method: 'POST', cache: false, data: { _xsrf: form.xsrf, owner_id: form.ownerId },
    header: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  currentAccount(username);
  const result = parseRecentResponse(response, form);
  if (result.topics.length) throw new RecentlyViewedTopicsError('浏览记录未清除，请刷新后重试');
  return result;
}
