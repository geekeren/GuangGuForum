import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import Taro from '@tarojs/taro';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { createNewComment, MAX_GZK_MENTIONS, type GzkMentionBinding } from '../../../packages/guanggu-forum-api/src/topic/createNewComment';
import { buildStickerComment, STICKERS } from '../stickers';

vi.mock('@tarojs/taro', () => ({ default: { showToast: vi.fn() } }));
vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));

const payload = { tid: '123', _xsrf: 'test-xsrf', content: '' };
function respond(html: string, statusCode = 200) {
  vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { statusCode } });
}
beforeEach(() => vi.clearAllMocks());

describe('image comment submission', () => {
  it.each(['', '文字评论'])('posts selected image Markdown with %s text', async text => {
    respond('<div class="topic-detail"></div>');
    const content = buildStickerComment(text, [STICKERS[0], STICKERS[1]]);
    await createNewComment({ ...payload, content });
    expect(request).toHaveBeenCalledWith('/t/123', expect.objectContaining({
      method: 'POST',
      data: { ...payload, content, gzk_mentions: '[]' },
      header: expect.objectContaining({ 'Content-Type': 'application/x-www-form-urlencoded' }),
    }));
    expect(content).toContain(`![${STICKERS[0].name}](${STICKERS[0].url})`);
    expect(content).toContain(`![${STICKERS[1].name}](${STICKERS[1].url})`);
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '回复成功' }));
  });

  it.each(['alert-danger', 'alert-warning', 'alert-info'])('rejects a %s form error even with HTTP 200', async css => {
    respond(`<div class="topic-detail"></div><div class="topic-reply-create"><div class="alert ${css}">回复太快，请稍后重试</div></div>`);
    await expect(createNewComment(payload)).rejects.toThrow('回复太快，请稍后重试');
    expect(Taro.showToast).not.toHaveBeenCalled();
  });

  it('rejects a global error instead of silently clearing the draft', async () => {
    respond('<div class="alert alert-danger">图片链接不允许</div>');
    await expect(createNewComment(payload)).rejects.toThrow('图片链接不允许');
  });

  it('reports moderation as pending review rather than a failure', async () => {
    respond('<div class="topic-reply-create"><div class="alert alert-info">本站已开启回复审核模式</div></div>');
    expect(await createNewComment(payload)).toEqual({ moderated: true });
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '回复审核中' }));
  });

  it('accepts an explicit successful reply response', async () => {
    respond('<div class="topic-detail"></div><div class="topic-reply-create"><div class="alert alert-success">回复成功</div></div>');
    expect(await createNewComment(payload)).toEqual({ moderated: false });
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '回复成功' }));
  });

  it('treats a duplicate submission as success and allows latest-reply positioning', async () => {
    respond('<div class="topic-reply-create"><div class="alert alert-warning">回复重复提交</div></div>');
    expect(await createNewComment(payload)).toEqual({ moderated: false });
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '回复成功' }));
  });

  it('rejects an HTTP error and an unrelated HTML response', async () => {
    respond('<div class="topic-detail"></div>', 500);
    await expect(createNewComment(payload)).rejects.toThrow('评论发送失败');
    respond('<div>security challenge</div>');
    await expect(createNewComment(payload)).rejects.toThrow('无法确认评论发送结果');
    expect(Taro.showToast).not.toHaveBeenCalled();
  });
});

describe('gzk_mentions form field', () => {
  const binding = (overrides: Partial<GzkMentionBinding> = {}): GzkMentionBinding => ({
    uid: 62936,
    reply_id: 0,
    start: 0,
    end: 5,
    label: '@乐天鱼',
    ...overrides,
  });

  function submittedData(): Record<string, unknown> {
    return vi.mocked(request).mock.calls.at(-1)![1]!.data as Record<string, unknown>;
  }

  it.each(['123', '134274'])('includes the same topic id %s in both the URL and native form body', async tid => {
    respond('<div class="topic-detail"></div>');
    await createNewComment({ ...payload, tid, content: 'Synthetic plain comment' });
    expect(request).toHaveBeenCalledWith(`/t/${tid}`, expect.objectContaining({
      method: 'POST',
      data: { tid, _xsrf: 'test-xsrf', content: 'Synthetic plain comment', gzk_mentions: '[]' },
    }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('always submits the field as "[]" when mentions are omitted or empty', async () => {
    respond('<div class="topic-detail"></div>');
    await createNewComment(payload);
    expect(submittedData().gzk_mentions).toBe('[]');
    expect(submittedData()).not.toHaveProperty('mentions');

    respond('<div class="topic-detail"></div>');
    await createNewComment({ ...payload, mentions: [] });
    expect(submittedData().gzk_mentions).toBe('[]');
  });

  it('serializes a single binding with the exact upstream schema', async () => {
    respond('<div class="topic-detail"></div>');
    const mention = binding();
    await createNewComment({ ...payload, content: '@乐天鱼 hi', mentions: [mention] });
    expect(submittedData().gzk_mentions).toBe(
      '[{"uid":62936,"reply_id":0,"start":0,"end":5,"label":"@乐天鱼"}]',
    );
    expect(submittedData()).not.toHaveProperty('mentions');
  });

  it('preserves multiple binding order and reply floor ids', async () => {
    respond('<div class="topic-detail"></div>');
    const mentions = [
      binding({ uid: 62936, start: 0, end: 5, label: '@乐天鱼' }),
      binding({ uid: 42, reply_id: 789, start: 8, end: 18, label: '@someone #4' }),
    ];
    await createNewComment({ ...payload, content: '@乐天鱼  @someone #4 hi', mentions });
    expect(JSON.parse(String(submittedData().gzk_mentions))).toEqual(mentions);
  });

  it('drops malformed bindings without reordering valid ones', async () => {
    respond('<div class="topic-detail"></div>');
    const valid = binding({ uid: 42, start: 10, end: 15 });
    const mentions = [
      binding({ uid: 0 }),
      binding({ uid: -1 }),
      binding({ uid: 1.5 }),
      binding({ uid: Number.NaN }),
      binding({ start: Number.POSITIVE_INFINITY }),
      binding({ end: Number.NaN }),
      binding({ start: 5, end: 5 }),
      binding({ start: 8, end: 3 }),
      binding({ label: '乐天鱼' }),
      binding({ label: '' }),
      valid,
      null,
      'nope',
    ] as unknown as GzkMentionBinding[];
    await createNewComment({ ...payload, mentions });
    expect(JSON.parse(String(submittedData().gzk_mentions))).toEqual([valid]);
  });

  it(`keeps at most ${MAX_GZK_MENTIONS} bindings`, async () => {
    respond('<div class="topic-detail"></div>');
    const mentions = Array.from({ length: MAX_GZK_MENTIONS + 4 }, (_, index) =>
      binding({ uid: index + 1, start: index * 10, end: index * 10 + 5 }),
    );
    await createNewComment({ ...payload, mentions });
    const sent = JSON.parse(String(submittedData().gzk_mentions)) as GzkMentionBinding[];
    expect(sent).toHaveLength(MAX_GZK_MENTIONS);
    expect(sent.map(({ uid }) => uid)).toEqual(mentions.slice(0, MAX_GZK_MENTIONS).map(({ uid }) => uid));
  });

  it('sends the JSON as a urlencoded form field, not a JSON request body', async () => {
    respond('<div class="topic-detail"></div>');
    const mention = binding();
    await createNewComment({ ...payload, content: '@乐天鱼 hi', mentions: [mention] });
    const config = vi.mocked(request).mock.calls.at(-1)![1]!;
    expect(config.header).toEqual(expect.objectContaining({
      'Content-Type': 'application/x-www-form-urlencoded',
    }));
    const data = config.data as Record<string, string>;
    expect(typeof data.gzk_mentions).toBe('string');
    // Taro form-encodes this object; the field survives round-tripping unchanged.
    expect(new URLSearchParams(data).get('gzk_mentions')).toBe(data.gzk_mentions);
    expect(new URLSearchParams(data).get('content')).toBe('@乐天鱼 hi');
  });
});
