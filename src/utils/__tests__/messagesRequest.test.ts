import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { setCacheService, type RequestConfig } from '../../../packages/guanggu-forum-api/src/client';
import { getMessageCompose, getMessageConversations, getMessageSummary, sendPrivateMessage } from '../../../packages/guanggu-forum-api/src/messages';

vi.mock('@tarojs/taro', () => ({ default: {
  request: vi.fn(), showToast: vi.fn(),
  getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: 'develop' } })),
} }));

let store: Map<string, unknown>;
let write: ReturnType<typeof vi.fn<(key: string, value: unknown) => boolean>>;
const summary = { uid: 7, username: 'fixture-user', role: 0, unread: 0, requests: 0, policy: 0, restriction_reason: '', revision: 1 };
function response(data: unknown, cookies?: string[]) {
  return { statusCode: 200, data: { ok: true, data }, cookies } as Awaited<ReturnType<typeof Taro.request>>;
}
beforeEach(() => {
  vi.mocked(Taro.request).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'fixture-session', _xsrf: 'fixture-xsrf' }]]);
  write = vi.fn((key: string, value: unknown) => { store.set(key, value); return true; });
  setCacheService({ get: key => (store.get(key) ?? null) as any, set: write, setAsync: async (key, value) => write(key, value), remove: () => {}, isExpired: () => false });
});

describe('private messaging integration with the real session request client', () => {
  it('allows legitimate response cookie rotation without rejecting private JSON', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(summary, ['_xsrf=rotated-fixture; Path=/']));
    expect(await getMessageSummary()).toEqual(summary);
    expect(write).toHaveBeenCalledWith('cookies', expect.objectContaining({ _xsrf: expect.objectContaining({ value: 'rotated-fixture' }) }), { category: 'system' });
    expect(write.mock.calls.every(call => call[0] === 'cookies')).toBe(true);
    vi.mocked(Taro.request).mockResolvedValueOnce(response({ conversation_id: 11 }));
    await sendPrivateMessage({ conversationId: 11, text: 'fixture only', clientKey: '0'.repeat(32) });
    expect(vi.mocked(Taro.request).mock.calls[1][0]).toEqual(expect.objectContaining({ header: expect.objectContaining({ 'X-Xsrftoken': 'rotated-fixture' }) }));
  });
  it('rejects an old response after same-username logout/login changes the session', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const pending = getMessageSummary();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    store.set('cookies', { sid: 'new-fixture-session', _xsrf: 'new-fixture-xsrf' });
    resolve(response(summary, ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(store.get('cookies')).toEqual({ sid: 'new-fixture-session', _xsrf: 'new-fixture-xsrf' });
    expect(write).not.toHaveBeenCalled();
  });
  it.each(['fixture-token', 'fixture%3Atoken', 'fixture%253Atoken', 'fixture+token', '%20fixture-token%20'])('keeps the stored cookie unchanged but decodes XSRF %s once for a new-recipient POST', async encodedXsrf => {
    const peer = { uid: 42, username: 'fixture-peer', display_name: '示例用户', avatar: '' };
    store.set('cookies', { sid: 'fixture-session', _xsrf: encodedXsrf });
    vi.mocked(Taro.request).mockResolvedValueOnce(response(summary));
    expect(await getMessageSummary()).toEqual(summary);
    vi.mocked(Taro.request).mockResolvedValueOnce(response({ peer, conversation_id: null, source: null, can_initiate: true, qualification_message: '' }));
    const compose = await getMessageCompose({ recipientId: 42 });
    expect(compose.conversation_id).toBe(0);
    expect(compose.can_initiate).toBe(true);
    const composeConfig = vi.mocked(Taro.request).mock.calls[1][0];
    expect(new URL(composeConfig.url).searchParams.get('to')).toBe('42');
    expect(composeConfig.method).toBe('GET');
    vi.mocked(Taro.request).mockResolvedValueOnce(response({ conversation_id: 11, state: 'pending' }));
    expect(await sendPrivateMessage({ recipientId: compose.peer.uid, text: '  fixture only  ', clientKey: '0'.repeat(32) })).toEqual({ conversation_id: 11 });
    const postConfig = vi.mocked(Taro.request).mock.calls[2][0];
    expect(postConfig.header).toEqual(expect.objectContaining({
      'X-Xsrftoken': decodeURIComponent(encodedXsrf),
      cookie: `sid=fixture-session; _xsrf=${encodedXsrf}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    }));
    expect(postConfig.data).toEqual({ recipient_id: 42, text: 'fixture only', client_key: '0'.repeat(32) });
    expect(vi.mocked(Taro.request).mock.calls.every(([config]) => config.header?.['Cache-Control'] === 'no-store')).toBe(true);
    expect(store.get('cookies')).toEqual({ sid: 'fixture-session', _xsrf: encodedXsrf });
    expect(write).not.toHaveBeenCalled();
    expect(vi.mocked(Taro.request)).toHaveBeenCalledTimes(3);
  });
  it.each(['%', 'fixture%0Dtoken', 'fixture%0Atoken', 'fixture\r\ntoken'])('blocks unsafe XSRF %s before the real client can send a mutation', async xsrf => {
    store.set('cookies', { sid: 'fixture-session', _xsrf: { value: xsrf } });
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED', message: '缺少安全校验信息，请刷新登录状态后重试',
    });
    expect(Taro.request).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it('rejects a new-recipient result arriving after a same-username session change', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const payload = { recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) };
    const pending = sendPrivateMessage(payload);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    store.set('cookies', { sid: 'new-fixture-session', _xsrf: 'new-fixture-xsrf' });
    resolve(response({ conversation_id: 11 }, ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(store.get('cookies')).toEqual({ sid: 'new-fixture-session', _xsrf: 'new-fixture-xsrf' });
    expect(write).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({ recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) });
  });
  it.each([[403, 'HTTP'], [200, 'SERVER']])('distinguishes new-recipient server rejection HTTP %s without exposing upstream text or retrying', async (status, code) => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: status, data: { ok: false, message: 'fixture private diagnostics must not escape' } } as Awaited<ReturnType<typeof Taro.request>>);
    const payload = { recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) };
    await expect(sendPrivateMessage(payload)).rejects.toMatchObject({ code, statusCode: status });
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(payload.text).toBe('fixture only');
    expect(write).not.toHaveBeenCalled();
  });
  it.each([400, 200, 201])('returns the safe content rejection for HTTP %s without echoing diagnostics or retrying', async statusCode => {
    const draft = { recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) };
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode, data: { ok: false, error: 'content_rejected', message: 'fixture private diagnostics must not escape' } } as Awaited<ReturnType<typeof Taro.request>>);
    await expect(sendPrivateMessage(draft)).rejects.toMatchObject({ code: 'CONTENT_REJECTED', statusCode, message: '消息未通过检查，请修改内容后发送' });
    expect(draft).toEqual({ recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) });
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
  it('recognizes content rejection in a string JSON response for an existing conversation', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 400, data: JSON.stringify({ ok: false, error: 'content_rejected', message: '消息未通过检查，请修改内容后发送' }) } as Awaited<ReturnType<typeof Taro.request>>);
    await expect(sendPrivateMessage({ conversationId: 11, text: 'fixture only', clientKey: '0'.repeat(32) })).rejects.toMatchObject({ code: 'CONTENT_REJECTED', statusCode: 400, message: '消息未通过检查，请修改内容后发送' });
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
  it.each([401, 403, 500])('does not replace HTTP %s semantics with an untrusted content rejection envelope', async statusCode => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode, data: { ok: false, error: 'content_rejected', message: 'private diagnostic' } } as Awaited<ReturnType<typeof Taro.request>>);
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) })).rejects.toMatchObject({ code: statusCode === 401 ? 'AUTH_REQUIRED' : 'HTTP', statusCode });
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ok: false, error: 'unknown', message: 'private diagnostic' },
    { ok: true, error: 'content_rejected', message: 'private diagnostic' },
    { ok: false, error: 'CONTENT_REJECTED', message: 'private diagnostic' },
    'malformed fixture JSON',
  ])('keeps an unrecognized 400 envelope generic without exposing server text', async data => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 400, data } as Awaited<ReturnType<typeof Taro.request>>);
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture only', clientKey: '0'.repeat(32) })).rejects.toMatchObject({ code: 'HTTP', statusCode: 400, message: '私信请求未完成，请稍后重试' });
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it('does not interpret a read endpoint error as a send content rejection', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce({ statusCode: 400, data: { ok: false, error: 'content_rejected' } } as Awaited<ReturnType<typeof Taro.request>>);
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'HTTP', statusCode: 400 });
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps opaque pagination in the actual request URL and never writes private cache entries', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response({ items: [], next_cursor: null }));
    await getMessageConversations({ bucket: 1, cursor: 'opaque/+=值' });
    const config = vi.mocked(Taro.request).mock.calls[0][0] as RequestConfig & { url: string };
    const url = new URL(config.url);
    expect(url.pathname).toBe('/api/dm/conversations');
    expect(url.searchParams.get('bucket')).toBe('1');
    expect(url.searchParams.get('cursor')).toBe('opaque/+=值');
    expect(config.method).toBe('GET');
    expect(write).not.toHaveBeenCalled();
  });
});
