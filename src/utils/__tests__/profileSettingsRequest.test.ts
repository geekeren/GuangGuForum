import { beforeEach, describe, expect, it, vi } from 'vitest';
import Taro from '@tarojs/taro';
import { setCacheService } from '../../../packages/guanggu-forum-api/src/client';
import { getOwnProfileSettings, saveOwnProfileSettings } from '../../../packages/guanggu-forum-api/src/user/profileSettings';

vi.mock('@tarojs/taro', () => ({ default: {
  request: vi.fn(), showToast: vi.fn(), getAccountInfoSync: vi.fn(() => ({ miniProgram: { envVersion: 'develop' } })),
} }));
const fields = { nickname: 'fixture name', gender: '1', generation: '1990', signature: 'fixture signature', location: 'fixture city', website: '', college: '', company: '', self_intro: 'fixture introduction' };
function html(nickname = fields.nickname, xsrf = 'synthetic-form-token', username = 'fixture-user') {
  return `<body><div id="navbar5"><div class="navbar-right"><a class="avatar" href="/u/${username}">fixture</a></div></div>
    <form class="setting" action="" method="POST"><input type="text" name="username" readonly value="${username}"><input type="text" name="email" readonly value="fixture@example.invalid">
    ${(['nickname', 'signature', 'location', 'website', 'college', 'company'] as const).map(name => `<input type="text" name="${name}" value="${name === 'nickname' ? nickname : fields[name]}">`).join('')}
    <select name="gender"><option value="0">不显示</option><option value="1" selected>男</option><option value="2">女</option></select>
    <select name="generation"><option value="0">不显示</option><option value="1990" selected>90后</option></select>
    <textarea name="self_intro">${fields.self_intro}</textarea><input type="hidden" name="_xsrf" value="${xsrf}"><button type="submit">保存改动</button></form></body>`;
}
function response(data: string, cookies?: string[]) {
  return { statusCode: 200, data, cookies } as Awaited<ReturnType<typeof Taro.request>>;
}
let store: Map<string, unknown>;
let write: ReturnType<typeof vi.fn<(key: string, value: unknown) => boolean>>;
beforeEach(() => {
  vi.mocked(Taro.request).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'synthetic-session', _xsrf: 'synthetic-cookie-token' }]]);
  write = vi.fn((key, value) => { store.set(key, value); return true; });
  setCacheService({ get: key => (store.get(key) ?? null) as any, set: write, setAsync: async (key, value) => write(key, value), remove: () => {}, isExpired: () => false });
});

describe('profile settings integration with production request client', () => {
  it('reads the current mini-program form token, permits legitimate cookie rotation and verifies the exact update', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html(), ['_xsrf=rotated-cookie-token; Path=/']));
    const draft = await getOwnProfileSettings();
    vi.mocked(Taro.request).mockResolvedValueOnce(response('<body>synthetic post response</body>', ['_xsrf=post-cookie-token; Path=/']));
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html('changed', 'fresh-form-token')));
    const saved = await saveOwnProfileSettings(draft, { ...fields, nickname: 'changed' });
    expect(saved.fields.nickname).toBe('changed');
    const configs = vi.mocked(Taro.request).mock.calls.map(([config]) => config);
    expect(configs.map(config => [new URL(config.url).pathname, config.method])).toEqual([['/setting', 'GET'], ['/setting', 'POST'], ['/setting', 'GET']]);
    expect(configs[1].data).toEqual({ username: 'fixture-user', email: 'fixture@example.invalid', ...fields, nickname: 'changed', _xsrf: 'synthetic-form-token' });
    expect(configs[1].header).toEqual(expect.objectContaining({ cookie: 'sid=synthetic-session; _xsrf=rotated-cookie-token', 'Content-Type': 'application/x-www-form-urlencoded' }));
    expect(configs[2].header?.cookie).toBe('sid=synthetic-session; _xsrf=post-cookie-token');
    expect(configs.every(config => config.header?.['Cache-Control'] === 'no-store')).toBe(true);
    expect(write.mock.calls.every(([key]) => key === 'cookies' || key === 'current_username')).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('form-token');
  });
  it.each(['GET', 'POST', 'VERIFY'])('rejects a same-username replacement session during %s without restoring old response cookies', async stage => {
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    if (stage !== 'GET') vi.mocked(Taro.request).mockResolvedValueOnce(response(html()));
    const draft = stage === 'GET' ? undefined : await getOwnProfileSettings();
    if (stage === 'VERIFY') vi.mocked(Taro.request).mockResolvedValueOnce(response('<body>synthetic post response</body>'));
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const pending = draft ? saveOwnProfileSettings(draft, { ...fields }) : getOwnProfileSettings();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    store.set('cookies', { sid: 'replacement-session', _xsrf: 'replacement-token' });
    resolve(response(html(), ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(store.get('cookies')).toEqual({ sid: 'replacement-session', _xsrf: 'replacement-token' });
    expect(write.mock.calls.every(([key]) => key !== 'cookies')).toBe(true);
    expect(Taro.request).toHaveBeenCalledTimes(stage === 'GET' ? 1 : stage === 'POST' ? 2 : 3);
  });
  it('does not return profile data after account replacement while verifying a save', async () => {
    vi.mocked(Taro.request).mockResolvedValueOnce(response(html()));
    const draft = await getOwnProfileSettings();
    vi.mocked(Taro.request).mockResolvedValueOnce(response('<body>synthetic post response</body>'));
    let resolve!: (value: Awaited<ReturnType<typeof Taro.request>>) => void;
    vi.mocked(Taro.request).mockImplementationOnce(() => new Promise(r => { resolve = r; }) as ReturnType<typeof Taro.request>);
    const pending = saveOwnProfileSettings(draft, { ...fields });
    for (let i = 0; i < 12; i++) await Promise.resolve();
    store.set('current_username', 'different-user');
    store.set('cookies', { sid: 'different-session' });
    resolve(response(html(), ['sid=old-response-session; Path=/']));
    await expect(pending).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(store.get('current_username')).toBe('different-user');
    expect(store.get('cookies')).toEqual({ sid: 'different-session' });
  });
});
