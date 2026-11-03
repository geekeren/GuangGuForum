import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { parse } from 'node-html-parser';
import { createTopic } from '../../../packages/guanggu-forum-api/src/topic/createTopic';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { getLoginXsrfCode } from '../../../packages/guanggu-forum-api/src/login/getLoginXsrfCode';

vi.mock('@tarojs/taro', () => ({ default: { showToast: vi.fn() } }));
vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));
vi.mock('../../../packages/guanggu-forum-api/src/login/getLoginXsrfCode', () => ({ getLoginXsrfCode: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLoginXsrfCode).mockResolvedValue({ xsrf_form: 'test-xsrf' } as any);
  vi.mocked(request).mockResolvedValue({ body: parse('<body><main>成功</main></body>'), rawRes: {} });
});

describe('forum topic HTML request contract', () => {
  it('forwards HTML unchanged through the existing form content field without a format flag', async () => {
    const content = '<p>正文 <strong>粗体</strong><img src="https://example.com/a.png" alt="图片"></p>';
    await createTopic({ node: 'water', title: '标题', content });
    expect(getLoginXsrfCode).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledExactlyOnceWith('/t/create/water', {
      method: 'POST',
      data: { title: '标题', content, _xsrf: 'test-xsrf' },
      header: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '发布成功', icon: 'success', duration: 2000 });
  });
});
