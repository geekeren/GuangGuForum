import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { LoginRequiredError, setCacheService } from '../../../packages/guanggu-forum-api/src/client';
import { getTopicDetail } from '../../../packages/guanggu-forum-api/src/getTopicDetail';

vi.mock('@tarojs/taro', () => ({ default: {
  request: vi.fn(), showToast: vi.fn(), getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: 'develop' } })),
} }));
function html(form = true) {
  return `<body><div id="navbar5"><div class="navbar-right"><a class="avatar" href="/u/fixture-user">fixture</a></div></div>
    <div class="container"><div class="row"><div class="topic-detail"><div class="main"><h3 class="title">Synthetic topic</h3></div><div class="ui-content">fixture only</div></div>
    ${form ? '<div class="topic-reply-create"><div class="ui-content"><form action="" method="post"><input name="tid" type="hidden" value="123"><textarea name="content"></textarea><input name="_xsrf" type="hidden" value="synthetic-form-token"></form></div></div>' : ''}</div></div></body>`;
}
function response(data = html(), statusCode = 200, cookies?: string[]) { return { statusCode, data, cookies } as Awaited<ReturnType<typeof Taro.request>>; }
let store: Map<string, unknown>;
let write: ReturnType<typeof vi.fn<(key: string, value: unknown) => boolean>>;
let readAsync: ReturnType<typeof vi.fn<() => Promise<null>>>;
beforeEach(() => {
  vi.mocked(Taro.request).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'synthetic-session', _xsrf: 'synthetic-cookie-token' }]]);
  write = vi.fn((key, value) => { store.set(key, value); return true; });
  readAsync = vi.fn(async () => null);
  setCacheService({ get: key => (store.get(key) ?? null) as any, getAsync: readAsync, set: write, setAsync: async (key, value) => write(key, value), remove: () => {}, isExpired: () => false });
});

describe('fresh canonical reply form with the actual shared request client', () => {
  it('bypasses cached reads and returns the current canonical form without sending any mutation', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response());
    const detail = await getTopicDetail({ tid: '123' }, { cache: false });
    expect(detail).toMatchObject({ tid: '123', createCommentStatus: 'ready', createCommentXSRF: 'synthetic-form-token' });
    const config = vi.mocked(Taro.request).mock.calls[0][0];
    const url = new URL(config.url);
    expect(url.pathname).toBe('/t/123');
    expect(url.search).toBe('');
    expect(config.method).toBe('GET');
    expect(config.data).toBeUndefined();
    expect(readAsync).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 500])('does not return a ready form from HTTP %s', async status => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html(), status));
    await expect(getTopicDetail({ tid: '123' }, { cache: false })).rejects.toThrow('帖子加载失败');
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Taro.request).mock.calls[0][0].method).toBe('GET');
  });
  it.each(['username', 'same-user-session'])('rejects old topic form after a %s change without publishing old cookies', async kind => {
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const pending = getTopicDetail({ tid: '123' }, { cache: false });
    for (let i = 0; i < 8; i++) await Promise.resolve();
    if (kind === 'username') store.set('current_username', 'other-user');
    store.set('cookies', { sid: 'replacement-session' });
    resolve(response(html(), 200, ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toThrow('账号已切换');
    expect(store.get('cookies')).toEqual({ sid: 'replacement-session' });
    expect(write).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it('allows legitimate response-cookie rotation without substituting a cookie token for form token', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html(), 200, ['_xsrf=rotated-cookie-token; Path=/']));
    expect((await getTopicDetail({ tid: '123' }, { cache: false })).createCommentXSRF).toBe('synthetic-form-token');
    expect(store.get('cookies')).toEqual(expect.objectContaining({ _xsrf: expect.objectContaining({ value: 'rotated-cookie-token' }) }));
  });
  it('returns unavailable for an authenticated topic with no reply form instead of taking the cookie token', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html(false)));
    expect(await getTopicDetail({ tid: '123' }, { cache: false })).toMatchObject({ createCommentStatus: 'form-unavailable', createCommentXSRF: '' });
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
  it('preserves the actual shared-client LoginRequiredError for a recognized login response', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response('<body><div class="alert alert-danger">请先登录社区再完成操作</div></body>'));
    await expect(getTopicDetail({ tid: '123' }, { cache: false })).rejects.toBeInstanceOf(LoginRequiredError);
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
});
