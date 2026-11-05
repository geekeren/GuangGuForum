import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { getCacheService, request } from '../../../packages/guanggu-forum-api/src/client';
import {
  getMessageSummary, getMessageConversations, getMessageThread, getMessageCompose,
  sendPrivateMessage, acceptPrivateMessageRequest, MessageApiError,
  type SendPrivateMessagePayload,
} from '../../../packages/guanggu-forum-api/src/messages';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn(), getCacheService: vi.fn() }));

const fakePeer = { uid: 42, username: 'fake-peer', display_name: '示例用户', avatar: 'https://example.invalid/avatar.png' };
const fakeSource = { id: 19, title: '示例来源', url: '/t/19' };
const fakeMessage = { id: 21, seq: 1, mine: false, text: 'fixture only', state: 'delivered', created: '2026-11-04' };
const fakeConversation = { id: 11, peer: fakePeer, unread: 1, state: 'active', updated: '2026-11-04', preview: 'fixture only' };
const fakeThread = { id: 11, peer: fakePeer, state: 'active', incoming_request: false, can_reopen: false, blocked: false, source: null, messages: [fakeMessage], has_more: false };
const fakeSummary = { uid: 7, username: 'fixture-user', role: 0, unread: 1, requests: 0, policy: 0, restriction_reason: '', revision: 1 };
const fakeCompose = { peer: fakePeer, conversation_id: 0, source: fakeSource, can_initiate: true, qualification_message: '' };
const key = '0123456789abcdef0123456789abcdef';
let store: Map<string, unknown>;
let writes: ReturnType<typeof vi.fn>;

function respond(data: unknown, statusCode = 200) {
  vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode, data: { ok: true, data } }, data: { ok: true, data } });
}
function failResponse(payload: unknown, statusCode = 200) {
  vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode, data: payload }, data: payload as Record<string, unknown> });
}
beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(getCacheService).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'fixture-session', _xsrf: { value: 'fixture-xsrf' } }]]);
  writes = vi.fn();
  const cs = { get: (k: string) => store.get(k) ?? null, set: writes, setAsync: writes, remove: writes, isExpired: () => false };
  vi.mocked(getCacheService).mockReturnValue(cs as ReturnType<typeof getCacheService>);
});

describe('private messages read-only API', () => {
  it('returns only known summary fields and checks account identity', async () => {
    respond({ ...fakeSummary, secret: 'must not escape' });
    expect(await getMessageSummary()).toEqual(fakeSummary);
    expect(request).toHaveBeenCalledWith('/api/dm/summary', expect.objectContaining({ method: 'GET', cache: false }));
    expect(writes).not.toHaveBeenCalled();
    respond({ ...fakeSummary, username: 'other-account' });
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it('accepts an encoded stored username without changing identity', async () => {
    store.set('current_username', encodeURIComponent('示例账号'));
    respond({ ...fakeSummary, username: '示例账号' });
    expect((await getMessageSummary()).username).toBe('示例账号');
    expect(writes).not.toHaveBeenCalled();
  });
  it('uses query config for bucket and opaque cursor without caching or refreshing', async () => {
    respond({ items: [fakeConversation], next_cursor: 'next/+=值' });
    expect(await getMessageConversations({ bucket: 1, cursor: 'cursor/+=值' })).toEqual({ items: [fakeConversation], next_cursor: 'next/+=值' });
    expect(request).toHaveBeenCalledWith('/api/dm/conversations', expect.objectContaining({ method: 'GET', cache: false, query: { bucket: '1', cursor: 'cursor/+=值' } }));
    expect(vi.mocked(request).mock.calls[0][1]).not.toHaveProperty('cacheApi');
    expect(vi.mocked(request).mock.calls[0][1]).not.toHaveProperty('onRefresh');
  });
  it.each(['/static/avatar/42/fixture.png', '//static.guozaoke.com/avatar/fixture.png', 'https://static.guozaoke.com/avatar/fixture.png', ''])('preserves raw avatar %s across list, thread and compose without substituting the display name', async avatar => {
    const fixturePeer = { ...fakePeer, avatar };
    respond({ items: [{ ...fakeConversation, peer: fixturePeer }], next_cursor: null });
    expect((await getMessageConversations()).items[0].peer).toEqual(fixturePeer);
    respond({ ...fakeThread, peer: fixturePeer });
    expect((await getMessageThread({ conversationId: 11 })).peer).toEqual(fixturePeer);
    respond({ ...fakeCompose, peer: fixturePeer });
    expect((await getMessageCompose({ recipientId: 42 })).peer).toEqual(fixturePeer);
    expect(request).toHaveBeenCalledTimes(3);
    expect(writes).not.toHaveBeenCalled();
  });
  it('returns an empty inbox only from an explicit valid empty response', async () => {
    respond({ items: [], next_cursor: null });
    expect(await getMessageConversations()).toEqual({ items: [], next_cursor: null });
    failResponse({ ok: true, data: {} });
    await expect(getMessageConversations()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('loads earlier messages with before without posting any read receipt', async () => {
    respond({ ...fakeThread, source: fakeSource, has_more: true });
    expect(await getMessageThread({ conversationId: 11, before: 3 })).toEqual({ ...fakeThread, source: fakeSource, has_more: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/dm/conversations/11/messages', expect.objectContaining({ method: 'GET', cache: false, query: { before: '3' } }));
    expect(writes).not.toHaveBeenCalled();
  });
  it('preserves blocked, pending, reopen and moderation states instead of allowing implicit actions', async () => {
    const data = { ...fakeThread, state: 'pending', incoming_request: true, can_reopen: true, blocked: true, messages: [{ ...fakeMessage, state: 'review' }] };
    respond(data);
    expect(await getMessageThread({ conversationId: 11 })).toEqual(data);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('keeps source and qualification constraints when composing', async () => {
    respond({ ...fakeCompose, can_initiate: false, qualification_message: 'fixture qualification' });
    expect(await getMessageCompose({ recipientId: 42, sourceId: 19 })).toEqual({ ...fakeCompose, can_initiate: false, qualification_message: 'fixture qualification' });
    expect(request).toHaveBeenCalledWith('/api/dm/compose', expect.objectContaining({ query: { to: '42', source: '19' } }));
  });
  it.each([null, 0])('normalizes upstream new-request conversation_id %s to the stable zero sentinel', async conversationId => {
    respond({ ...fakeCompose, conversation_id: conversationId, source: null });
    expect(await getMessageCompose({ recipientId: 42 })).toEqual({ ...fakeCompose, conversation_id: 0, source: null });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, '0', '', -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsupported compose conversation_id %s instead of treating it as a new request', async conversationId => {
    respond({ ...fakeCompose, conversation_id: conversationId });
    await expect(getMessageCompose({ recipientId: 42 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('returns an existing conversation from compose without fetching or reading it automatically', async () => {
    respond({ ...fakeCompose, conversation_id: 11, source: null });
    expect((await getMessageCompose({ recipientId: 42 })).conversation_id).toBe(11);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a mismatched thread or compose recipient', async () => {
    respond({ ...fakeThread, id: 12 });
    await expect(getMessageThread({ conversationId: 11 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    respond({ ...fakeCompose, peer: { ...fakePeer, uid: 43 } });
    await expect(getMessageCompose({ recipientId: 42 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each([null, [], { items: null, next_cursor: null }, { items: [{ ...fakeConversation, unread: -1 }], next_cursor: null }, { items: [fakeConversation], next_cursor: 4 }])('rejects malformed list fixture %s', async data => {
    respond(data);
    await expect(getMessageConversations()).rejects.toBeInstanceOf(MessageApiError);
  });
  it.each([
    { ...fakeThread, messages: [{ ...fakeMessage, mine: 'false' }] },
    { ...fakeThread, source: undefined },
    { ...fakeThread, messages: [{ ...fakeMessage, seq: -1 }] },
  ])('rejects malformed thread fixture %s', async data => {
    respond(data);
    await expect(getMessageThread({ conversationId: 11 })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('private messages explicit mutations using fixtures only', () => {
  it('submits new requests with exact JSON fields and the existing xsrf session', async () => {
    respond({ conversation_id: 11, state: 'pending', credential: 'do-not-return' });
    expect(await sendPrivateMessage({ recipientId: 42, sourceId: 19, text: '  fixture only  ', clientKey: key })).toEqual({ conversation_id: 11 });
    expect(request).toHaveBeenCalledWith('/api/dm/messages', expect.objectContaining({ method: 'POST', cache: false, data: { recipient_id: 42, source_id: 19, text: 'fixture only', client_key: key }, header: expect.objectContaining({ 'Content-Type': 'application/json', 'X-Xsrftoken': 'fixture-xsrf' }) }));
    expect(writes).not.toHaveBeenCalled();
  });
  it('omits optional source and recipient for existing conversations', async () => {
    store.set('cookies', { _xsrf: 'fixture-xsrf' });
    respond({ conversation_id: 11 });
    await sendPrivateMessage({ conversationId: 11, text: 'fixture', clientKey: key });
    expect(vi.mocked(request).mock.calls[0][1]?.data).toEqual({ conversation_id: 11, text: 'fixture', client_key: key });
  });
  it('accepts exact first-request and active-message capacity boundaries', async () => {
    respond({ conversation_id: 11 });
    await sendPrivateMessage({ recipientId: 42, text: 'x'.repeat(120), clientKey: key });
    respond({ conversation_id: 11 });
    await sendPrivateMessage({ conversationId: 11, text: 'x'.repeat(500), clientKey: key });
    await expect(sendPrivateMessage({ recipientId: 42, text: 'x'.repeat(121), clientKey: key })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(sendPrivateMessage({ conversationId: 11, text: 'x'.repeat(501), clientKey: key })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not automatically retry or mutate the caller draft and reuses a supplied retry key', async () => {
    const draft = { conversationId: 11, text: 'keep draft', clientKey: key };
    vi.mocked(request).mockRejectedValueOnce(new Error('offline secret diagnostics'));
    await expect(sendPrivateMessage(draft)).rejects.toMatchObject({ code: 'NETWORK' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(draft).toEqual({ conversationId: 11, text: 'keep draft', clientKey: key });
    respond({ conversation_id: 11 });
    await sendPrivateMessage(draft);
    expect(vi.mocked(request).mock.calls[0][1]?.data).toEqual(vi.mocked(request).mock.calls[1][1]?.data);
  });
  it('accepts a request only via its explicit function and makes no read or follow-up call', async () => {
    respond(undefined);
    expect(await acceptPrivateMessageRequest({ conversationId: 11 })).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/api/dm/conversations/11/accept', expect.objectContaining({ method: 'POST', cache: false, data: {} }));
  });
  it('rejects uncertain or unrelated send success without clearing caller input', async () => {
    respond({ conversation_id: 12 });
    await expect(sendPrivateMessage({ conversationId: 11, text: 'fixture', clientKey: key })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    respond({ state: 'pending' });
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture', clientKey: key })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it.each([
    { recipientId: 0, text: 'fixture', clientKey: key },
    { conversationId: 11, recipientId: 42, text: 'fixture', clientKey: key },
    { conversationId: 11, sourceId: 19, text: 'fixture', clientKey: key },
    { recipientId: 42, sourceId: -1, text: 'fixture', clientKey: key },
    { recipientId: 42, text: '   ', clientKey: key },
    { recipientId: 42, text: 'fixture', clientKey: 'BAD' },
  ])('rejects invalid send fixture %s without network requests', async payload => {
    await expect(sendPrivateMessage(payload as SendPrivateMessagePayload)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).not.toHaveBeenCalled();
  });
});

describe('private messages authentication and safe errors', () => {
  it('requires the app login even when Chrome has a separate session', async () => {
    store.delete('current_username');
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not send without xsrf and never returns credentials in an error', async () => {
    store.set('cookies', { sid: 'fixture-session' });
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture', clientKey: key })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['fixture%3Atoken', { value: 'fixture%3Atoken' }])('decodes encoded XSRF from the supported cookie representation %s once', async cookie => {
    store.set('cookies', { sid: 'fixture-session', _xsrf: cookie });
    respond({ conversation_id: 11 });
    await sendPrivateMessage({ recipientId: 42, text: 'fixture', clientKey: key });
    expect(vi.mocked(request).mock.calls[0][1]?.header?.['X-Xsrftoken']).toBe('fixture:token');
    expect(store.get('cookies')).toEqual({ sid: 'fixture-session', _xsrf: cookie });
    expect(writes).not.toHaveBeenCalled();
  });
  it.each(['%', 'fixture%2', 'fixture%GG', 'fixture%0Dtoken', 'fixture%0Atoken', 'fixture\r\ntoken', '', { value: '%' }, { value: 42 }, null])('refuses unsafe XSRF fixture %s before network without exposing its value', async cookie => {
    store.set('cookies', { sid: 'fixture-session', _xsrf: cookie });
    await expect(sendPrivateMessage({ recipientId: 42, text: 'fixture', clientKey: key })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED', message: '缺少安全校验信息，请刷新登录状态后重试',
    });
    expect(request).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });
  it('keeps all six private endpoints outside the reading cache with no-store requests', async () => {
    respond(fakeSummary);
    await getMessageSummary();
    respond({ items: [], next_cursor: null });
    await getMessageConversations();
    respond(fakeThread);
    await getMessageThread({ conversationId: 11 });
    respond({ ...fakeCompose, conversation_id: null, source: null });
    await getMessageCompose({ recipientId: 42 });
    respond({ conversation_id: 11 });
    await sendPrivateMessage({ recipientId: 42, text: 'fixture', clientKey: key });
    respond(undefined);
    await acceptPrivateMessageRequest({ conversationId: 11 });
    for (const [, config] of vi.mocked(request).mock.calls) {
      expect(config).toEqual(expect.objectContaining({ cache: false, header: expect.objectContaining({ 'Cache-Control': 'no-store' }) }));
      expect(config).not.toHaveProperty('cacheApi');
      expect(config).not.toHaveProperty('onRefresh');
    }
    expect(request).toHaveBeenCalledTimes(6);
    expect(writes).not.toHaveBeenCalled();
  });
  it('rejects old-account responses and cache service replacements', async () => {
    vi.mocked(request).mockImplementationOnce(async () => {
      store.set('current_username', 'other-user');
      return { rawRes: { statusCode: 200 }, data: { ok: true, data: fakeSummary } };
    });
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    store.set('current_username', 'fixture-user');
    const old = getCacheService();
    vi.mocked(request).mockImplementationOnce(async () => {
      vi.mocked(getCacheService).mockReturnValue({ ...old });
      return { rawRes: { statusCode: 200 }, data: { ok: true, data: fakeThread } };
    });
    await expect(getMessageThread({ conversationId: 11 })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it('preserves shared client login and session-change errors as typed codes', async () => {
    const error = new Error('请先登录'); error.name = 'LoginRequiredError';
    vi.mocked(request).mockRejectedValueOnce(error);
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    vi.mocked(request).mockRejectedValueOnce(new Error('账号已切换，请重试'));
    await expect(getMessageSummary()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it.each([[401, 'AUTH_REQUIRED'], [403, 'HTTP'], [429, 'HTTP'], [500, 'HTTP']])('maps HTTP %s without exposing upstream messages', async (status, code) => {
    failResponse({ ok: false, message: 'fixture secret must not escape' }, status as number);
    await expect(getMessageSummary()).rejects.toMatchObject({ code, statusCode: status });
    failResponse({ ok: false, message: 'fixture secret must not escape' }, status as number);
    await expect(getMessageSummary()).rejects.not.toThrow('fixture secret');
  });
  it('recognizes login HTML and refuses challenge/HTML as an empty inbox', async () => {
    vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200 }, body: parse('<form><input name="password"></form>') });
    await expect(getMessageConversations()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    failResponse('<html>challenge</html>');
    await expect(getMessageConversations()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('rejects HTTP200 server errors safely and parses a JSON string response', async () => {
    failResponse({ ok: false, message: 'fixture private text or credential' });
    await expect(getMessageConversations()).rejects.toMatchObject({ code: 'SERVER' });
    failResponse(JSON.stringify({ ok: true, data: fakeSummary }));
    expect(await getMessageSummary()).toEqual(fakeSummary);
  });
  it.each([{ bucket: 2 }, { cursor: '' }, { cursor: 'x'.repeat(4097) }])('rejects malformed pagination %s before the network', async params => {
    await expect(getMessageConversations(params as Parameters<typeof getMessageConversations>[0])).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).not.toHaveBeenCalled();
  });
});
