import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { setCacheService } from '../../../packages/guanggu-forum-api/src/client';
import { getTopicDetail } from '../../../packages/guanggu-forum-api/src/getTopicDetail';
import { CommentSubmissionError, createNewComment } from '../../../packages/guanggu-forum-api/src/topic/createNewComment';

vi.mock('@tarojs/taro', () => ({ default: {
  request: vi.fn(), showToast: vi.fn(), getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: 'develop' } })),
} }));

const html = `<body><div id="navbar5"><div class="navbar-right"><a class="avatar" href="/u/fixture-user">fixture</a></div></div>
  <div class="container"><div class="row"><div class="topic-detail"><div class="main"><h3 class="title">Synthetic topic</h3></div><div class="ui-content">fixture only</div></div>
  <div class="topic-reply-create"><div class="ui-content"><form action="" method="post"><input name="tid" type="hidden" value="123"><textarea name="content"></textarea><input name="gzk_mentions" type="hidden" value="[]"><input name="_xsrf" type="hidden" value="synthetic-form-token"></form></div></div></div></div></body>`;
const payload = { tid: '123', content: 'Synthetic plain comment', _xsrf: 'synthetic-form-token' };
function response(data = html, statusCode = 200, cookies?: string[]) {
  return { statusCode, data, cookies } as Awaited<ReturnType<typeof Taro.request>>;
}
let store: Map<string, unknown>;
let write: ReturnType<typeof vi.fn<(key: string, value: unknown) => boolean>>;
let readAsync: ReturnType<typeof vi.fn<() => Promise<null>>>;
beforeEach(() => {
  vi.mocked(Taro.request).mockReset();
  vi.mocked(Taro.showToast).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'synthetic-session', _xsrf: 'synthetic-cookie-token' }]]);
  write = vi.fn((key, value) => { store.set(key, value); return true; });
  readAsync = vi.fn(async () => null);
  setCacheService({ get: key => (store.get(key) ?? null) as any, getAsync: readAsync, set: write, setAsync: async (key, value) => write(key, value), remove: () => {}, isExpired: () => false });
});

function submittedConfig() { return vi.mocked(Taro.request).mock.calls.at(-1)![0]; }

describe('comment POST protocol with the actual shared request client', () => {
  it('reads a ready canonical form then posts all four native fields to the same topic', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response()).mockResolvedValueOnce(response());
    const detail = await getTopicDetail({ tid: '123' }, { cache: false });
    expect(detail.createCommentStatus).toBe('ready');
    write.mockClear();
    expect(await createNewComment({ tid: detail.tid!, _xsrf: detail.createCommentXSRF, content: payload.content })).toEqual({ moderated: false });
    const [read, post] = vi.mocked(Taro.request).mock.calls.map(([config]) => config);
    expect(read.method).toBe('GET');
    expect(post.method).toBe('POST');
    expect(post.url).toBe(read.url);
    expect(new URL(post.url).pathname).toBe('/t/123');
    expect(new URL(post.url).search).toBe('');
    expect(post.data).toEqual({ ...payload, gzk_mentions: '[]' });
    expect(post.header).toEqual(expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded', cookie: 'sid=synthetic-session; _xsrf=synthetic-cookie-token' }));
    expect((post.data as Record<string, unknown>)._xsrf).not.toBe('synthetic-cookie-token');
    expect(readAsync).not.toHaveBeenCalled();
    expect(write.mock.calls.every(([key]) => !key.startsWith('html_v2_'))).toBe(true);
    expect(Taro.request).toHaveBeenCalledTimes(2);
  });

  it('preserves special characters and explicit mention JSON as native form strings', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response());
    const content = '@fixture A&B=+ 中文🙂';
    const mentions = [{ uid: 42, reply_id: 456, start: 0, end: 8, label: '@fixture' }];
    await createNewComment({ ...payload, content, mentions });
    const config = submittedConfig();
    expect(config.data).toEqual({ ...payload, content, gzk_mentions: JSON.stringify(mentions) });
    expect(config.data).not.toHaveProperty('mentions');
    const encoded = new URLSearchParams(config.data as Record<string, string>);
    expect(encoded.get('tid')).toBe('123');
    expect(encoded.get('content')).toBe(content);
    expect(encoded.get('_xsrf')).toBe('synthetic-form-token');
    expect(encoded.get('gzk_mentions')).toBe(JSON.stringify(mentions));
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });

  it('rejects a 404 response without reporting success, caching, or retrying', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html, 404));
    await expect(createNewComment(payload)).rejects.toBeInstanceOf(CommentSubmissionError);
    expect(submittedConfig().data).toEqual({ ...payload, gzk_mentions: '[]' });
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(readAsync).not.toHaveBeenCalled();
    expect(write.mock.calls.every(([key]) => !key.startsWith('html_v2_'))).toBe(true);
  });

  it('propagates an uncertain transport rejection without a second POST or payload mutation', async () => {
    const uncertain = new Error('Synthetic response unavailable after submission');
    const draft = { ...payload };
    vi.mocked(Taro.request).mockRejectedValueOnce(uncertain);
    await expect(createNewComment(draft)).rejects.toBe(uncertain);
    expect(draft).toEqual(payload);
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not infer success from an unrelated HTTP 200 response or retry it', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response('<body><div>Synthetic unrelated response</div></body>'));
    await expect(createNewComment(payload)).rejects.toThrow('无法确认评论发送结果');
    expect(Taro.request).toHaveBeenCalledTimes(1);
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['username', 'same-user-session'])('rejects a late POST response after a %s replacement without publishing old cookies', async kind => {
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const pending = createNewComment(payload);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    if (kind === 'username') store.set('current_username', 'other-user');
    store.set('cookies', { sid: 'replacement-session' });
    resolve(response(html, 200, ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toThrow('账号已切换');
    expect(store.get('cookies')).toEqual({ sid: 'replacement-session' });
    expect(write).not.toHaveBeenCalled();
    expect(Taro.showToast).not.toHaveBeenCalled();
    expect(Taro.request).toHaveBeenCalledTimes(1);
  });
});
