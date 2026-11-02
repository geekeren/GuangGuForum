import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import Taro from '@tarojs/taro';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { createNewComment } from '../../../packages/guanggu-forum-api/src/topic/createNewComment';
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
      data: { ...payload, content },
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
    await createNewComment(payload);
    expect(Taro.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '回复审核中' }));
  });

  it('accepts an explicit successful reply response', async () => {
    respond('<div class="topic-detail"></div><div class="topic-reply-create"><div class="alert alert-success">回复成功</div></div>');
    await createNewComment(payload);
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
