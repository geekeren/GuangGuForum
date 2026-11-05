import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { getCacheService, request } from '../../../packages/guanggu-forum-api/src/client';
import { getOwnProfileSettings, saveOwnProfileSettings, type OwnProfileFields } from '../../../packages/guanggu-forum-api/src/user/profileSettings';
import type { ICacheService } from '../../../packages/guanggu-forum-api/src/types';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn(), getCacheService: vi.fn() }));
const fields: OwnProfileFields = { nickname: 'fixture name', gender: '1', generation: '1990', signature: 'fixture signature', location: 'fixture city', website: 'https://example.invalid/', college: 'fixture school', company: 'fixture company', self_intro: 'fixture introduction' };
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function html(values = fields, username = 'fixture-user', xsrf = 'synthetic-form-xsrf') {
  return `<body><form action="/search" method="get"><input name="q"></form><form class="form-horizontal setting" action="" method="POST"><fieldset>
    <input type="text" name="username" readonly value="${escape(username)}"><input type="text" name="email" readonly value="fixture@example.invalid">
    ${(['nickname', 'signature', 'location', 'website', 'college', 'company'] as const).map(name => `<input type="text" name="${name}" value="${escape(values[name])}">`).join('')}
    <select name="gender">${['0', '1', '2'].map(value => `<option value="${value}"${value === values.gender ? ' selected' : ''}>fixture ${value}</option>`).join('')}</select>
    <select name="generation">${['0', '1970', '1980', '1990', '2000', '2010'].map(value => `<option value="${value}"${value === values.generation ? ' selected' : ''}>fixture ${value}</option>`).join('')}</select>
    <textarea name="self_intro">${escape(values.self_intro)}</textarea><button type="submit">保存改动</button><input type="hidden" name="_xsrf" value="${escape(xsrf)}">
    </fieldset></form></body>`;
}
function respond(body: string | undefined, statusCode = 200) {
  vi.mocked(request).mockResolvedValueOnce({ body: body === undefined ? undefined : parse(body), rawRes: { statusCode } });
}
let store: Map<string, unknown>;
let service: ICacheService;
let writes: ReturnType<typeof vi.fn<() => boolean>>;
beforeEach(() => {
  vi.mocked(request).mockReset();
  vi.mocked(getCacheService).mockReset();
  store = new Map<string, unknown>([['current_username', 'fixture-user'], ['cookies', { sid: 'synthetic-session', _xsrf: 'synthetic-cookie-xsrf' }]]);
  writes = vi.fn(() => true);
  service = { get: key => (store.get(key) ?? null) as any, set: writes, setAsync: async () => writes(), remove: () => { writes(); }, isExpired: () => false };
  vi.mocked(getCacheService).mockReturnValue(service);
});

describe('own profile settings schema and private draft', () => {
  it('returns only nine editable fields, readonly identity and dynamic options without CSRF', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    expect(draft).toEqual({ username: 'fixture-user', email: 'fixture@example.invalid', fields, options: {
      gender: ['0', '1', '2'].map(value => ({ value, label: `fixture ${value}` })),
      generation: ['0', '1970', '1980', '1990', '2000', '2010'].map(value => ({ value, label: `fixture ${value}` })),
    } });
    expect(JSON.stringify(draft)).not.toContain('xsrf');
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.fields)).toBe(true);
    expect(Object.isFrozen(draft.options.gender)).toBe(true);
    expect(request).toHaveBeenCalledWith('/setting', { method: 'GET', cache: false, header: { 'Cache-Control': 'no-store' } });
    expect(writes).not.toHaveBeenCalled();
  });
  it('decodes HTML entities in current fields but never treats displayed markup as form controls', async () => {
    const values = { ...fields, nickname: 'A & " B', self_intro: '<input name="_xsrf"> & text\nnext' };
    respond(html(values));
    expect((await getOwnProfileSettings()).fields).toEqual(values);
  });
  it('uses newly returned options instead of hardcoded generation choices', async () => {
    respond(html().replace('</select>\n    <textarea', '<option value="2020">20后</option></select>\n    <textarea'));
    const draft = await getOwnProfileSettings();
    const updated = { ...fields, generation: '2020' };
    respond(undefined);
    respond(html(updated).replace('<option value="2010">fixture 2010</option>', '<option value="2020" selected>20后</option>'));
    expect((await saveOwnProfileSettings(draft, updated)).fields.generation).toBe('2020');
  });
  it('accepts encoded stored usernames only when they resolve to the same form identity', async () => {
    store.set('current_username', encodeURIComponent('合成用户'));
    respond(html(fields, '合成用户'));
    expect((await getOwnProfileSettings()).username).toBe('合成用户');
  });
  it.each([
    source => source.replace('class="form-horizontal setting"', 'class="other"'),
    source => source.replace('action=""', 'action="https://evil.invalid/setting"'),
    source => source.replace('action=""', 'action="/setting/password"'),
    source => source.replace('method="POST"', 'method="GET"'),
    source => source.replace('method="POST"', 'method="POST" enctype="multipart/form-data"'),
    source => source.replace('method="POST"', 'method="POST" onsubmit="save()"'),
    source => source.replace('name="username" readonly', 'name="username"'),
    source => source.replace('name="email" readonly', 'name="email" disabled readonly'),
    source => source.replace('type="hidden" name="_xsrf"', 'type="text" name="_xsrf"'),
    source => source.replace('value="synthetic-form-xsrf"', 'value=" "'),
    source => source.replace('name="nickname"', 'name="unexpected"'),
    source => source.replace('name="nickname"', 'name="nickname" readonly'),
    source => source.replace('<textarea name="self_intro">', '<textarea name="self_intro" disabled>'),
    source => source.replace('<select name="gender">', '<select name="gender" multiple>'),
    source => source.replace('<option value="1" selected>', '<option value="1" selected disabled>'),
    source => source.replace('<option value="2">', '<option value="2" selected>'),
    source => source.replace('<option value="2">', '<option value="1">'),
    source => source.replace('</fieldset>', '<input type="hidden" name="new_required_token" value="fixture"></fieldset>'),
    source => source.replace('</fieldset>', '<input type="hidden" name="_xsrf" value="duplicate"></fieldset>'),
    source => source + source,
  ] as ((source: string) => string)[])('rejects uncertain or changed form schema fixture %s', async change => {
    respond(change(html()));
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(writes).not.toHaveBeenCalled();
  });
  it('does not derive save authorization from a public profile or clone', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    await expect(saveOwnProfileSettings({ ...draft }, { ...fields })).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('explicit own profile save and verification', () => {
  it('posts exact nine fields plus original readonly identity and form token, then verifies with uncached GET', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    const updated = { ...fields, nickname: ' new nickname ', self_intro: 'line one\nline two' };
    respond(undefined);
    respond(html(updated, 'fixture-user', 'next-synthetic-form-xsrf'));
    const fresh = await saveOwnProfileSettings(draft, updated);
    expect(fresh.fields).toEqual(updated);
    expect(fresh).not.toBe(draft);
    expect(request).toHaveBeenNthCalledWith(2, '/setting', { method: 'POST', cache: false,
      header: { 'Cache-Control': 'no-store', 'Content-Type': 'application/x-www-form-urlencoded' },
      data: { username: 'fixture-user', email: 'fixture@example.invalid', ...updated, _xsrf: 'synthetic-form-xsrf' } });
    expect(vi.mocked(request).mock.calls.every(([, config]) => config?.cache === false && config.header?.['Cache-Control'] === 'no-store')).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    await expect(saveOwnProfileSettings(draft, updated)).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    respond(undefined);
    respond(html(updated));
    await saveOwnProfileSettings(fresh, updated);
    expect(vi.mocked(request).mock.calls[3][1]?.data?._xsrf).toBe('next-synthetic-form-xsrf');
  });
  it('allows clearing optional text fields without inventing required or length constraints', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    const updated = { nickname: '', gender: '0', generation: '0', signature: '', location: '', website: '', college: '', company: '', self_intro: '' };
    respond(undefined);
    respond(html(updated));
    expect((await saveOwnProfileSettings(draft, updated)).fields).toEqual(updated);
  });
  it.each([
    { ...fields, username: 'other-user' }, { ...fields, email: 'other@example.invalid' },
    { ...fields, nickname: 42 }, { ...fields, gender: '99' }, { ...fields, generation: '9999' },
    { nickname: 'missing fields' }, null,
  ])('rejects invalid or extra editable fixture %s without consuming a valid draft', async updated => {
    respond(html());
    const draft = await getOwnProfileSettings();
    await expect(saveOwnProfileSettings(draft, updated as OwnProfileFields)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(request).toHaveBeenCalledTimes(1);
    respond(undefined);
    respond(html());
    await saveOwnProfileSettings(draft, { ...fields });
  });
  it.each(['nickname', 'gender', 'generation', 'signature', 'location', 'website', 'college', 'company', 'self_intro'])('requires an exact confirmed value for %s rather than assuming server normalization', async name => {
    respond(html());
    const draft = await getOwnProfileSettings();
    respond(undefined);
    const changed = { ...fields, [name]: name === 'gender' ? '2' : name === 'generation' ? '2000' : 'different server value' };
    respond(html(changed));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'VERIFICATION', message: '提交结果未确认，请刷新检查后再操作' });
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it.each([
    body => body.replace('value="fixture@example.invalid"', 'value="different@example.invalid"'),
    body => body.replace('class="form-horizontal setting"', 'class="other"'),
  ] as ((body: string) => string)[])('does not confirm a save when the verification identity or form is changed %s', async change => {
    respond(html());
    const draft = await getOwnProfileSettings();
    respond(undefined);
    respond(change(html()));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'VERIFICATION', message: '提交结果未确认，请刷新检查后再操作' });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('preserves account isolation if the verification form belongs to a different user', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    respond(undefined);
    respond(html(fields, 'other-user'));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it.each([401, 403, 500])('consumes a draft after HTTP %s POST rejection without fetching or retrying', async status => {
    respond(html());
    const draft = await getOwnProfileSettings();
    respond(undefined, status);
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: status === 401 ? 'AUTH_REQUIRED' : 'HTTP', statusCode: status });
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not treat a successful POST followed by failed verification GET as failed submission', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    respond(undefined);
    vi.mocked(request).mockRejectedValueOnce(new Error('private network diagnostics'));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'VERIFICATION', message: '提交结果未确认，请刷新检查后再操作' });
    expect(request).toHaveBeenCalledTimes(3);
  });
  it('reports an uncertain POST transport outcome without automatic POST retry or leaking raw diagnostics', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    vi.mocked(request).mockRejectedValueOnce(new Error('private credentials and submitted data'));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'VERIFICATION', message: '提交结果未确认，请刷新检查后再操作' });
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('locks saves and refresh synchronously, captures submitted fields before caller mutation', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    let resolve!: (value: Awaited<ReturnType<typeof request>>) => void;
    vi.mocked(request).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const input = { ...fields };
    const pending = saveOwnProfileSettings(draft, input);
    await expect(saveOwnProfileSettings(draft, input)).rejects.toMatchObject({ code: 'BUSY' });
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'BUSY' });
    input.nickname = 'changed after submission';
    respond(html());
    resolve({ rawRes: { statusCode: 200 } });
    expect((await pending).fields.nickname).toBe(fields.nickname);
    expect(request).toHaveBeenCalledTimes(3);
  });
});

describe('profile draft account isolation, stale reads and safe errors', () => {
  it('requires current app authentication before GET', async () => {
    store.delete('current_username');
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['username', 'cookies', 'service'])('rejects a saved draft after %s scope replacement before POST', async kind => {
    respond(html());
    const draft = await getOwnProfileSettings();
    if (kind === 'username') store.set('current_username', 'other-user');
    if (kind === 'cookies') store.set('cookies', { sid: 'new-same-user-session' });
    if (kind === 'service') vi.mocked(getCacheService).mockReturnValue({ ...service });
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('replaces old drafts when a newer read starts, even if that read fails', async () => {
    respond(html());
    const old = await getOwnProfileSettings();
    vi.mocked(request).mockRejectedValueOnce(new Error('offline'));
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'NETWORK' });
    await expect(saveOwnProfileSettings(old, { ...fields })).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('refuses an older GET completion after a later read publishes', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof request>>) => void;
    vi.mocked(request).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const pending = getOwnProfileSettings();
    respond(html());
    const fresh = await getOwnProfileSettings();
    resolve({ body: parse(html()), rawRes: { statusCode: 200 } });
    await expect(pending).rejects.toMatchObject({ code: 'STALE_DRAFT' });
    respond(undefined);
    respond(html());
    await saveOwnProfileSettings(fresh, { ...fields });
  });
  it('rejects account changes during GET without returning former account values', async () => {
    vi.mocked(request).mockImplementationOnce(async () => {
      store.set('current_username', 'other-user');
      return { body: parse(html()), rawRes: { statusCode: 200 } };
    });
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it('rejects a different form username instead of trusting readonly input', async () => {
    respond(html(fields, 'other-user'));
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  });
  it('preserves shared-client same-user session rejection after POST and never fetches verification', async () => {
    respond(html());
    const draft = await getOwnProfileSettings();
    vi.mocked(request).mockRejectedValueOnce(new Error('账号已切换，请重试'));
    await expect(saveOwnProfileSettings(draft, { ...fields })).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 500])('preserves safe HTTP %s without saving or exposing response content', async status => {
    respond(undefined, status);
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: status === 401 ? 'AUTH_REQUIRED' : 'HTTP', statusCode: status });
  });
  it('recognizes login HTML but does not turn arbitrary HTML into an empty form', async () => {
    respond('<body><input name="password"></body>');
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    respond('<body>challenge</body>');
    await expect(getOwnProfileSettings()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
