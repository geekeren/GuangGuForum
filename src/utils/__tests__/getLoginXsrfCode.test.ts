import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { getLoginXsrfCode } from '../../../packages/guanggu-forum-api/src/login/getLoginXsrfCode';
import { URLS } from '../../../packages/guanggu-forum-api/src/urls';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));
const form = '<body><form><input type="hidden" name="_xsrf" value="synthetic-form-xsrf"></form></body>';
beforeEach(() => vi.clearAllMocks());

describe('login form XSRF without new Set-Cookie', () => {
  it.each([[], undefined, ['other=synthetic-other-cookie; Path=/']])('accepts a nonempty form token when a new XSRF cookie is absent %#', async cookies => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(form), rawRes: { statusCode: 200, cookies } });
    expect(await getLoginXsrfCode()).toEqual({ xsrf_form: 'synthetic-form-xsrf', xsrf_cookie: '' });
    expect(request).toHaveBeenCalledExactlyOnceWith(URLS.Login, { useCookie: false });
  });
  it('keeps the existing response-cookie field when the server does provide one', async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(form), rawRes: { cookies: ['_xsrf=synthetic-cookie-xsrf; Path=/; HttpOnly'] } });
    expect(await getLoginXsrfCode()).toEqual({ xsrf_form: 'synthetic-form-xsrf', xsrf_cookie: 'synthetic-cookie-xsrf' });
  });
  it.each([
    '<body><form></form></body>',
    '<body><form><input name="_xsrf" value=""></form></body>',
    '<body><form><input name="_xsrf" value="   "></form></body>',
    '<body><input name="_xsrf" value="outside-form"></body>',
  ])('rejects absent/empty form XSRF without fabricating a token %#', async html => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { cookies: ['_xsrf=synthetic-cookie-xsrf'] } });
    await expect(getLoginXsrfCode()).rejects.toThrow('无法获取安全校验信息，请重试');
    expect(request).toHaveBeenCalledOnce();
  });
  it('rejects a missing parsed form body', async () => {
    vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200, cookies: [] } });
    await expect(getLoginXsrfCode()).rejects.toThrow('无法获取安全校验信息，请重试');
  });
  it('preserves the form value rather than replacing it with a response cookie value', async () => {
    vi.mocked(request).mockResolvedValueOnce({ body: parse(form.replace('synthetic-form-xsrf', ' synthetic-form-xsrf ')), rawRes: { cookies: [] } });
    expect((await getLoginXsrfCode()).xsrf_form).toBe(' synthetic-form-xsrf ');
  });
  it('propagates the existing request failure unchanged', async () => {
    const failure = new Error('synthetic-offline');
    vi.mocked(request).mockRejectedValueOnce(failure);
    await expect(getLoginXsrfCode()).rejects.toBe(failure);
  });
});
