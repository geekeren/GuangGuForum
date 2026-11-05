import type { MessageSource } from 'guanggu-forum-api';
import { APP_ROUTES } from '../../utils/appRoutes';

export interface PrivateSnapshot<T> {
  account: string;
  visible: boolean;
  generation: number;
  uid: number;
  verified: boolean;
  data: T;
}

/** Private content lives only in this page instance, never in the reading cache/storage. */
export class PrivatePageState<T> {
  private value: PrivateSnapshot<T>;
  private listeners = new Set<() => void>();
  private requests = new Map<string, number>();
  private postLocked = false;
  private retryKey?: { target: string; text: string; key: string };

  constructor(private empty: () => T, private currentAccount: () => string) {
    this.value = { account: '', visible: false, generation: 0, uid: 0, verified: false, data: empty() };
  }

  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(value: PrivateSnapshot<T>) {
    this.value = value;
    this.listeners.forEach(listener => listener());
  }
  activate(account: string, fresh = false) {
    if (!fresh && this.value.visible && this.value.account === account) return;
    this.clear(account, Boolean(account));
  }
  hide = () => { this.clear('', false); };
  private clear(account: string, visible: boolean) {
    this.requests.clear();
    this.postLocked = false;
    this.retryKey = undefined;
    this.publish({ account, visible, generation: this.value.generation + 1, uid: 0, verified: false, data: this.empty() });
  }
  isVisible() {
    if (this.value.account !== this.currentAccount()) {
      this.hide();
      return false;
    }
    return this.value.visible && Boolean(this.value.account);
  }
  bindUid(uid: number, verified = true) {
    if (this.isVisible() && Number.isSafeInteger(uid) && uid > 0) this.publish({ ...this.value, uid, verified });
  }
  update(change: (data: T) => T) {
    if (this.isVisible()) this.publish({ ...this.value, data: change(this.value.data) });
  }
  private token(lane: string) {
    const { account, generation } = this.value;
    const id = (this.requests.get(lane) || 0) + 1;
    this.requests.set(lane, id);
    return () => this.isVisible() && this.value.account === account &&
      this.value.generation === generation && this.requests.get(lane) === id;
  }
  async read<R>(lane: string, request: () => Promise<R>, success: (result: R) => void, failure: (error: unknown) => void) {
    if (!this.isVisible()) return;
    const current = this.token(lane);
    try {
      const result = await request();
      if (current()) success(result);
    } catch (error) {
      if (current()) failure(error);
    }
  }
  /** One synchronous lock covers both send and acceptance, including async key creation. */
  async post<R>(request: (current: () => boolean) => Promise<R>, success: (result: R) => void, failure: (error: unknown) => void) {
    if (this.postLocked || !this.isVisible() || !this.value.verified) return false;
    this.postLocked = true;
    const current = this.token('post');
    try {
      const result = await request(current);
      if (current()) success(result);
    } catch (error) {
      if (current()) failure(error);
    } finally {
      if (current()) this.postLocked = false;
    }
    return true;
  }
  async sendKey(target: string, text: string, generate: () => Promise<string>, current: () => boolean) {
    if (this.retryKey?.target === target && this.retryKey.text === text) return this.retryKey.key;
    const key = await generate();
    if (!current()) throw new Error('Private page is no longer visible');
    if (!/^[0-9a-f]{32}$/.test(key)) throw new Error('Invalid private submission key');
    this.retryKey = { target, text, key };
    return key;
  }
  draftChanged(text: string) {
    if (this.retryKey && this.retryKey.text !== text.trim()) this.retryKey = undefined;
  }
  clearSendKey() { this.retryKey = undefined; }
}

export function positiveRouteId(value?: string): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}

export function profileMessageRoute(profile: { username: string; messageRecipientId?: number }, account: string): string | undefined {
  let current = account;
  try { current = decodeURIComponent(account); } catch { /* Keep invalid legacy encoding unchanged. */ }
  const id = profile.messageRecipientId;
  if (!current || current === profile.username || !Number.isSafeInteger(id) || !id || id <= 0) return undefined;
  return `${APP_ROUTES.messageThread}?to=${id}`;
}

export function messageSourceRoute(source: MessageSource | null): string | undefined {
  if (!source || !Number.isSafeInteger(source.id) || source.id <= 0) return undefined;
  // The upstream URL is untrusted. Only an exact, matching topic path enables an internal route.
  const match = /^(?:https:\/\/www\.guozaoke\.com)?\/t\/([1-9]\d*)$/.exec(source.url);
  return match && Number(match[1]) === source.id
    ? `/pages/topicDetail/index?tid=${source.id}` : undefined;
}

export function messageStateLabel(state: string): string {
  switch (state) {
    case 'active': return '会话进行中';
    case 'pending': return '等待接受请求';
    case 'review': case 'reviewing': case 'pending_review': return '审核中';
    case 'approved': return '审核通过';
    case 'rejected': return '审核未通过';
    case 'blocked': return '会话不可用';
    case 'closed': return '会话已关闭';
    default: return '状态待确认';
  }
}

export function messageErrorText(error: unknown): string {
  // Do not echo arbitrary Error.message: native errors can contain private text or credentials.
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'AUTH_REQUIRED': return '登录已失效，请重新登录后重试';
    case 'ACCOUNT_CHANGED': return '账号已切换，请重新打开私信';
    case 'HTTP': return '私信请求未完成，请刷新登录状态后重试';
    case 'INVALID_RESPONSE': return '无法读取私信数据，请重试';
    case 'SERVER': return '操作未完成，请检查会话状态后重试';
    case 'CONTENT_REJECTED': return '消息未通过检查，请修改内容后发送';
    default: return '私信请求失败，请检查网络后重试';
  }
}

export function messageTextError(text: string, existing: boolean): string {
  const content = text.trim();
  const limit = existing ? 500 : 120;
  if (!content) return '请输入私信内容';
  return content.length > limit ? `请将${existing ? '私信' : '首条消息请求'}控制在${limit}字以内` : '';
}

export function mergeById<T extends { id: number }>(previous: T[], next: T[]): T[] {
  const items = new Map(previous.map(item => [item.id, item]));
  next.forEach(item => items.set(item.id, item));
  return [...items.values()];
}
