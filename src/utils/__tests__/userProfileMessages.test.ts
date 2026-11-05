import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { getUserProfile } from '../../../packages/guanggu-forum-api/src/user/getUserProfile';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));

function profileHtml(cta = '', outside = '') {
  return `<div class="profile"><div class="ui-header">
    <span class="username">fixture-user</span><span class="level">Lv.3</span>
    <img class="avatar" src="https://example.invalid/avatar.png">
    <div class="user-number"><span class="number">第999号会员</span><span class="since">2020-01-01</span></div>
    <div class="gzk-profile-actions">${cta}</div>
  </div><div class="ui-content"><dl><dt>ID</dt><dd>display-id-not-uid</dd></dl><dl><dt>昵称</dt><dd>fixture nickname</dd></dl></div></div>${outside}`;
}
function link(href: string) { return `<a class="label gzk-profile-action gzk-dm-profile-link" href="${href}">发私信</a>`; }
function respond(html: string) { vi.mocked(request).mockResolvedValueOnce({ rawRes: { statusCode: 200 }, body: parse(html) }); }
beforeEach(() => vi.mocked(request).mockReset());

describe('profile private-message recipient ID from trusted upstream CTA', () => {
  it.each(['/messages/new?to=58715', 'https://www.guozaoke.com/messages/new?to=58715'])('parses exact trusted CTA %s without another request', async href => {
    respond(profileHtml(link(href)));
    const profile = await getUserProfile({ username: 'fixture-user' }, { cache: false });
    expect(profile.messageRecipientId).toBe(58715);
    expect(request).toHaveBeenCalledTimes(1);
    expect(profile.memberNumber).toBe('第999号会员');
    expect(profile.id).toBe('display-id-not-uid');
    expect(profile.nickname).toBe('fixture nickname');
    expect(profile.level).toBe('Lv.3');
  });
  it('leaves every legacy profile field unchanged when the CTA is added', async () => {
    respond(profileHtml());
    const legacy = await getUserProfile({ username: 'fixture-user' });
    respond(profileHtml(link('/messages/new?to=58715')));
    const fresh = await getUserProfile({ username: 'fixture-user' });
    const { messageRecipientId, ...unchanged } = fresh;
    expect(messageRecipientId).toBe(58715);
    expect(unchanged).toEqual(legacy);
    expect(legacy).not.toHaveProperty('messageRecipientId');
  });
  it.each([
    '/messages/new?to=0', '/messages/new?to=-1', '/messages/new?to=1.5',
    '/messages/new?to=9007199254740992', '/messages/new?to=1e3',
    '/messages/new?to=058715', '/messages/new?to=+58715', '/messages/new?to=',
    '/messages/new?to=58715&to=58715', '/messages/new?to=58715&source=19',
    '/messages/new?target=58715', '/messages/new?to=58715#fragment',
    '/messages/new/?to=58715', '/messages/%6eew?to=58715',
    'https://evil.example/messages/new?to=58715',
    'http://www.guozaoke.com/messages/new?to=58715',
    '//www.guozaoke.com/messages/new?to=58715',
    'https://www.guozaoke.com.evil.example/messages/new?to=58715',
    'https://www.guozaoke.com:443/messages/new?to=58715',
    'https://user@www.guozaoke.com/messages/new?to=58715',
    'javascript:alert(58715)', ' https://www.guozaoke.com/messages/new?to=58715',
    '/messages/new?to=58715\\evil',
  ])('omits the recipient field for unsafe or ambiguous href %s', async href => {
    respond(profileHtml(link(href)));
    expect(await getUserProfile({ username: 'fixture-user' })).not.toHaveProperty('messageRecipientId');
  });
  it('accepts the safe integer upper boundary', async () => {
    respond(profileHtml(link('/messages/new?to=9007199254740991')));
    expect((await getUserProfile({ username: 'fixture-user' })).messageRecipientId).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('does not infer a UID from display number, unscoped links or missing CTA', async () => {
    respond(profileHtml('', link('/messages/new?to=58715')));
    expect(await getUserProfile({ username: 'fixture-user' })).not.toHaveProperty('messageRecipientId');
    respond(profileHtml('<a href="/messages/new?to=58715">other link</a>'));
    expect(await getUserProfile({ username: 'fixture-user' })).not.toHaveProperty('messageRecipientId');
  });
  it('rejects multiple authoritative links even if their targets agree', async () => {
    respond(profileHtml(link('/messages/new?to=58715') + link('/messages/new?to=58715')));
    expect(await getUserProfile({ username: 'fixture-user' })).not.toHaveProperty('messageRecipientId');
    respond(profileHtml(link('/messages/new?to=58715') + link('/messages/new?to=42')));
    expect(await getUserProfile({ username: 'fixture-user' })).not.toHaveProperty('messageRecipientId');
  });
  it('uses the same recipient parsing on a refresh callback', async () => {
    respond(profileHtml());
    const refreshed = vi.fn();
    await getUserProfile({ username: 'fixture-user' }, { onRefresh: refreshed });
    const onRefresh = vi.mocked(request).mock.calls[0][1]?.onRefresh;
    onRefresh?.(parse(profileHtml(link('/messages/new?to=58715'))));
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ messageRecipientId: 58715 }));
    onRefresh?.(parse(profileHtml(link('https://evil.example/messages/new?to=58715'))));
    expect(refreshed.mock.calls[1][0]).not.toHaveProperty('messageRecipientId');
  });
});
