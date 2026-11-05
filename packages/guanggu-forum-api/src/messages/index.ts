import { getCacheService, request } from '../client';
import type { RequestConfig } from '../client';
import type { Cookie } from '../utils/cookie';
import {
  MessageApiError,
  type MessagePeer, type MessageSource, type MessageSummary,
  type MessageConversation, type MessageConversationPage, type PrivateMessage,
  type MessageThread, type MessageCompose, type GetMessageConversationsParams,
  type GetMessageThreadParams, type GetMessageComposeParams,
  type SendPrivateMessagePayload, type SendPrivateMessageResult,
} from './types';

export * from './types';

// Protocol observed in the site's dm-names-20261104.js. Private JSON never enters
// the HTML reading cache, and opening a thread never implicitly POSTs /read.
const ROOT = '/api/dm/';
const invalidResponse = () => new MessageApiError('INVALID_RESPONSE', '无法读取私信数据，请刷新后重试');
const invalidArgument = (description: string) => new MessageApiError('INVALID_ARGUMENT', description);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidResponse();
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw invalidResponse();
  return value;
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw invalidResponse();
  return value as number;
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw invalidResponse();
  return value;
}
function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map(parse);
}
function peer(value: unknown): MessagePeer {
  const p = record(value);
  return { uid: integer(p.uid, 1), display_name: text(p.display_name), username: text(p.username), avatar: text(p.avatar) };
}
function source(value: unknown): MessageSource | null {
  if (value === null) return null;
  const s = record(value);
  return { id: integer(s.id, 1), title: text(s.title), url: text(s.url) };
}
function conversation(value: unknown): MessageConversation {
  const c = record(value);
  return { id: integer(c.id, 1), peer: peer(c.peer), unread: integer(c.unread), state: text(c.state), updated: text(c.updated), preview: text(c.preview) };
}
function message(value: unknown): PrivateMessage {
  const m = record(value);
  return { id: integer(m.id, 1), seq: integer(m.seq, 1), mine: flag(m.mine), text: text(m.text), state: text(m.state), created: text(m.created) };
}
function positiveId(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw invalidArgument(`${label}无效`);
  return value as number;
}

async function privateRequest(path: string, data?: Record<string, unknown>, query?: Record<string, string>): Promise<unknown> {
  const cs = getCacheService();
  const username = cs.get<string>('current_username');
  if (!username) throw new MessageApiError('AUTH_REQUIRED', '请先登录');
  const current = () => getCacheService() === cs && cs.get<string>('current_username') === username;
  const config: RequestConfig = {
    method: data === undefined ? 'GET' : 'POST', cache: false, query,
    header: { Accept: 'application/json', 'Cache-Control': 'no-store' },
  };
  if (data !== undefined) {
    const cookie = cs.get<Record<string, Cookie | string>>('cookies')?._xsrf;
    const cookieValue = typeof cookie === 'string' ? cookie : cookie?.value;
    let xsrf = '';
    try {
      // Match the site's xsrf(): decode the header once, never change the stored cookie.
      if (typeof cookieValue === 'string') xsrf = decodeURIComponent(cookieValue);
    } catch { /* Malformed encoding must not reach a request header. */ }
    if (!xsrf || /[\r\n]/.test(xsrf)) throw new MessageApiError('AUTH_REQUIRED', '缺少安全校验信息，请刷新登录状态后重试');
    config.data = data;
    config.header = { ...config.header, 'Content-Type': 'application/json', 'X-Xsrftoken': xsrf };
  }
  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request(ROOT + path, config);
  } catch (error) {
    if (!current() || (error instanceof Error && error.message === '账号已切换，请重试')) {
      throw new MessageApiError('ACCOUNT_CHANGED', '账号已切换，请重新打开私信');
    }
    if (error instanceof Error && error.name === 'LoginRequiredError') {
      throw new MessageApiError('AUTH_REQUIRED', '请先登录');
    }
    // Never propagate request payloads or native network diagnostics containing credentials.
    throw new MessageApiError('NETWORK', '私信请求失败，请检查网络后重试');
  }
  if (!current()) throw new MessageApiError('ACCOUNT_CHANGED', '账号已切换，请重新打开私信');
  const status = response.rawRes?.statusCode;
  if (status === 401 || response.body?.querySelector('input[name="password"]')) {
    throw new MessageApiError('AUTH_REQUIRED', '登录已失效，请重新登录', status);
  }
  if (status === 403) throw new MessageApiError('HTTP', '安全校验失败，请刷新登录状态后重试', status);
  if (path === 'messages' && data !== undefined && Number.isInteger(status)
    && (status === 400 || (status >= 200 && status < 300))) {
    let rejection: unknown = response.data ?? response.rawRes?.data;
    if (typeof rejection === 'string') {
      try { rejection = JSON.parse(rejection); } catch { /* Preserve the existing HTTP/response error below. */ }
    }
    if (rejection && typeof rejection === 'object' && !Array.isArray(rejection)) {
      const envelope = rejection as Record<string, unknown>;
      if (envelope.ok === false && envelope.error === 'content_rejected') {
        // A known rejection gets a fixed safe message, never arbitrary server text.
        throw new MessageApiError('CONTENT_REJECTED', '消息未通过检查，请修改内容后发送', status);
      }
    }
  }
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    throw new MessageApiError('HTTP', '私信请求未完成，请稍后重试', status);
  }
  let payload: unknown = response.data ?? response.rawRes?.data;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { throw invalidResponse(); }
  }
  const result = record(payload);
  if (result.ok === false) {
    // Upstream message fields are intentionally not echoed: errors may contain submitted text.
    throw new MessageApiError('SERVER', '私信操作未完成，请检查会话状态或稍后重试', status);
  }
  if (result.ok !== true) throw invalidResponse();
  return result.data;
}

export async function getMessageSummary(): Promise<MessageSummary> {
  const s = record(await privateRequest('summary'));
  const result = {
    uid: integer(s.uid, 1), username: text(s.username), role: integer(s.role),
    unread: integer(s.unread), requests: integer(s.requests), policy: integer(s.policy),
    restriction_reason: text(s.restriction_reason), revision: integer(s.revision),
  };
  const username = getCacheService().get<string>('current_username');
  let decodedUsername = username;
  try { decodedUsername = decodeURIComponent(username || ''); } catch { /* Keep the stored identity. */ }
  if (result.username !== username && result.username !== decodedUsername) {
    throw new MessageApiError('ACCOUNT_CHANGED', '登录状态已变化，请重新打开私信');
  }
  return result;
}

export async function getMessageConversations(params: GetMessageConversationsParams = {}): Promise<MessageConversationPage> {
  const bucket = params.bucket ?? 0;
  if (bucket !== 0 && bucket !== 1) throw invalidArgument('私信列表类型无效');
  if (params.cursor !== undefined && (typeof params.cursor !== 'string' || !params.cursor || params.cursor.length > 4096)) {
    throw invalidArgument('私信分页信息无效');
  }
  const query: Record<string, string> = { bucket: String(bucket) };
  if (params.cursor !== undefined) query.cursor = params.cursor;
  const page = record(await privateRequest('conversations', undefined, query));
  return { items: array(page.items, conversation), next_cursor: page.next_cursor === null ? null : text(page.next_cursor) };
}

export async function getMessageThread(params: GetMessageThreadParams): Promise<MessageThread> {
  const id = positiveId(params.conversationId, '会话');
  const before = params.before === undefined ? undefined : positiveId(params.before, '消息位置');
  const t = record(await privateRequest(`conversations/${id}/messages`, undefined, before === undefined ? undefined : { before: String(before) }));
  const result = {
    id: integer(t.id, 1), peer: peer(t.peer), state: text(t.state),
    incoming_request: flag(t.incoming_request), can_reopen: flag(t.can_reopen), blocked: flag(t.blocked),
    source: source(t.source), messages: array(t.messages, message), has_more: flag(t.has_more),
  };
  if (result.id !== id) throw invalidResponse();
  return result;
}

export async function getMessageCompose(params: GetMessageComposeParams): Promise<MessageCompose> {
  const recipient = positiveId(params.recipientId, '收件人');
  const topic = params.sourceId === undefined ? undefined : positiveId(params.sourceId, '来源帖子');
  const query: Record<string, string> = { to: String(recipient) };
  if (topic !== undefined) query.source = String(topic);
  const c = record(await privateRequest('compose', undefined, query));
  const result = {
    // Upstream uses null for a recipient without an existing conversation.
    // Keep the public zero sentinel; malformed or missing IDs still reject.
    peer: peer(c.peer), conversation_id: c.conversation_id === null ? 0 : integer(c.conversation_id), source: source(c.source),
    can_initiate: flag(c.can_initiate), qualification_message: text(c.qualification_message),
  };
  if (result.peer.uid !== recipient) throw invalidResponse();
  return result;
}

export async function sendPrivateMessage(payload: SendPrivateMessagePayload): Promise<SendPrivateMessageResult> {
  const existing = payload.conversationId !== undefined;
  const id = positiveId(existing ? payload.conversationId : payload.recipientId, existing ? '会话' : '收件人');
  if ((existing && (payload.recipientId !== undefined || payload.sourceId !== undefined)) || (!existing && payload.recipientId === undefined)) {
    throw invalidArgument('私信收件信息无效');
  }
  const topic = payload.sourceId === undefined ? undefined : positiveId(payload.sourceId, '来源帖子');
  const content = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!content || content.length > (existing ? 500 : 120)) {
    throw invalidArgument(existing ? '每条私信请输入1至500字' : '首条消息请求请输入1至120字');
  }
  if (typeof payload.clientKey !== 'string' || !/^[0-9a-f]{32}$/.test(payload.clientKey)) {
    throw invalidArgument('私信提交标识无效');
  }
  const data: Record<string, unknown> = { text: content, client_key: payload.clientKey };
  if (existing) data.conversation_id = id;
  else {
    data.recipient_id = id;
    if (topic !== undefined) data.source_id = topic;
  }
  const result = record(await privateRequest('messages', data));
  const conversationId = integer(result.conversation_id, 1);
  if (existing && conversationId !== id) throw invalidResponse();
  return { conversation_id: conversationId };
}

/** Explicit user action only. No implicit acceptance, read receipt, retry, or polling. */
export async function acceptPrivateMessageRequest(params: { conversationId: number }): Promise<void> {
  const id = positiveId(params.conversationId, '会话');
  await privateRequest(`conversations/${id}/accept`, {});
}
