import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindImageHostToken } from '../../../packages/guanggu-forum-api/src/media/settings';
import { request } from '../../../packages/guanggu-forum-api/src/client';

const runtime = vi.hoisted(() => ({ username: 'account-a', xsrf: 'sample-xsrf', cookieObject: true }));
vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({
  request: vi.fn(),
  getCacheService: () => ({ get: (key: string) => key === 'current_username' ? runtime.username : key === 'cookies'
    ? { _xsrf: runtime.cookieObject ? { value: runtime.xsrf } : runtime.xsrf } : null }),
}));
beforeEach(() => {
  vi.resetAllMocks(); runtime.username = 'account-a'; runtime.xsrf = 'sample-xsrf'; runtime.cookieObject = true;
  vi.mocked(request).mockResolvedValue({ rawRes: { statusCode: 200 }, data: { success: true } });
});

describe('forum image host binding API', () => {
  it('matches the reference JSON payload and obtains XSRF from the current login cookies', async () => {
    await bindImageHostToken(' sample-token ');
    expect(request).toHaveBeenCalledWith('/api/media/settings', {
      method: 'POST', cache: false,
      data: { action: 'bind', token: 'sample-token', version: '', album_id: 0, revoke_on_password_change: true },
      header: { 'Content-Type': 'application/json', 'X-XSRFToken': 'sample-xsrf', Accept: 'application/json' },
    });
  });
  it('supports explicit album and version options and string cookie values', async () => {
    runtime.cookieObject = false;
    await bindImageHostToken('sample-token', { version: 'v2', albumId: 12, revokeOnPasswordChange: false });
    expect(vi.mocked(request).mock.calls[0][1]?.data).toEqual({ action: 'bind', token: 'sample-token', version: 'v2', album_id: 12, revoke_on_password_change: false });
  });
  it.each([{ success: true }, { ok: true }, { code: 0 }, { code: 200 }, { status: 'ok' }])('accepts confirmed JSON success', async data => {
    vi.mocked(request).mockResolvedValue({ rawRes: { statusCode: 200 }, data });
    await expect(bindImageHostToken('sample-token')).resolves.toBeUndefined();
  });
  it.each([{}, { success: false, message: 'sample-token' }, { code: 400 }, { success: true, error: 'sample-token' }, { status: 'error', code: 200 }])('rejects failures and ambiguous responses without leaking tokens', async data => {
    vi.mocked(request).mockResolvedValue({ rawRes: { statusCode: 200 }, data });
    await expect(bindImageHostToken('sample-token')).rejects.not.toThrow('sample-token');
  });
  it('rejects an HTML login response even at HTTP 200', async () => {
    vi.mocked(request).mockResolvedValue({ rawRes: { statusCode: 200, data: '<html>login</html>' } });
    await expect(bindImageHostToken('sample-token')).rejects.toThrow('无法确认绑定结果');
  });
  it.each([401, 403, 500])('rejects HTTP %s', async statusCode => {
    vi.mocked(request).mockResolvedValue({ rawRes: { statusCode }, data: { success: true } });
    await expect(bindImageHostToken('sample-token')).rejects.toThrow();
  });
  it('rejects missing login and missing XSRF before sending the token', async () => {
    runtime.username = '';
    await expect(bindImageHostToken('sample-token')).rejects.toThrow('请先登录');
    runtime.username = 'account-a'; runtime.xsrf = '';
    await expect(bindImageHostToken('sample-token')).rejects.toThrow('缺少安全校验信息');
    expect(request).not.toHaveBeenCalled();
  });
  it('sanitizes network errors and never copies their payload into a toast', async () => {
    vi.mocked(request).mockRejectedValue(new Error('request failed sample-token'));
    await expect(bindImageHostToken('sample-token')).rejects.toThrow('图片托管绑定失败，请检查登录状态和网络');
  });
});
