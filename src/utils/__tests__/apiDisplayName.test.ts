import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { getDisplayName } from '../../../packages/guanggu-forum-api/src/utils/displayName';
import { getRecentTopics, parseTopicSummaries } from '../../../packages/guanggu-forum-api/src/getRecentTopics';
import { getNodeTopics } from '../../../packages/guanggu-forum-api/src/node/getTopics';
import { getUserProfile } from '../../../packages/guanggu-forum-api/src/user/getUserProfile';
import { getUserFavorites } from '../../../packages/guanggu-forum-api/src/user/getUserFavorites';
import { getNotifications } from '../../../packages/guanggu-forum-api/src/notification/getNotifications';
import { buildSearchQuery, parseSearchResults } from '../../../packages/guanggu-forum-api/src/searchParser';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));
const legacy = '<span class="username"><a href="/u/fixture-account">fixture-account</a></span>';
const display = (name = '合成 昵称🙂', href = '/u/fixture-account') => `<a class="gzk-display-name" href="${href}" data-username="fixture-account" data-gzk-mention-user="42" data-display-name="attribute nickname"><bdi>${name}</bdi></a>`;
const topicItem = (names = legacy + display()) => `<div class="topic-item"><a href="/u/fixture-account"><img class="avatar" src="/fixture.png"></a><div class="main"><div class="title"><a href="/t/123">Synthetic topic</a></div></div><div class="meta">${names}<span class="node"><a href="/node/fixture">Fixture node</a></span><span class="last-touched">fixture time</span><span class="last-reply-username"><a href="/u/other"><strong>other-account</strong></a></span></div><span class="count"><a>3</a></span></div>`;
const topics = (names = legacy + display()) => `<div class="topics">${topicItem(names)}</div>`;
const profile = (header = display(), nickname = '资料昵称') => `<div class="profile"><div class="ui-header"><span class="username">fixture-account</span>${header}<img class="avatar" src="/fixture.png"></div><div class="ui-content"><dl><dt>昵称</dt><dd>${nickname}</dd></dl><dl><dt>ID</dt><dd>display-id-not-uid</dd></dl></div></div><div class="sidebar-left"><div class="topic-lists">${topicItem()}</div></div>`;
const notification = (names = `<a href="/u/fixture-account">fixture-account</a>${display()}`) => `<div class="notification-item"><div class="title">${names} replied to <a href="/t/123#r456">Synthetic topic</a></div><div class="content">Synthetic excerpt</div></div>`;
const search = (names = legacy + display()) => `<section class="gzk-search"><div class="search-results"><div class="result"><h2><a href="/t/123">Synthetic topic</a></h2><div class="meta">${names} · 2026-11-05 12:00:00 · 主题正文</div><div class="excerpt">Synthetic excerpt</div></div></div></section>`;
function respond(html: string) { vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { statusCode: 200 } }); }
beforeEach(() => vi.mocked(request).mockReset());

describe('presentation-only display-name parsing', () => {
  it.each([
    ['rendered bdi', display('  完整 昵称🙂  '), '完整 昵称🙂'],
    ['anchor text', '<a class="gzk-display-name" href="/u/fixture-account">完整 昵称🙂</a>', '完整 昵称🙂'],
    ['attribute fallback', '<a class="gzk-display-name" href="/u/fixture-account" data-display-name=" 属性昵称 "></a>', '属性昵称'],
    ['blank nickname', display(' '), 'attribute nickname'],
    ['empty display', '<a class="gzk-display-name" href="/u/fixture-account"></a>', 'fixture-account'],
    ['legacy only', legacy, 'fixture-account'],
    ['other account', display('Other', '/u/other'), 'fixture-account'],
    ['ambiguous duplicate', display('One') + display('Two'), 'fixture-account'],
    ['last reply is not author', `<span class="last-reply-username">${display('Other')}</span>`, 'fixture-account'],
  ])('handles %s without changing the fallback identity', (_label, html, expected) => {
    expect(getDisplayName(parse(`<div>${html}</div>`), 'fixture-account', '/u/fixture-account')).toBe(expected);
  });
  it.each([legacy + display(), display() + legacy])('keeps legacy account and profile link when nickname appears before or after it', names => {
    const item = parseTopicSummaries(parse(topics(names)))[0];
    expect(item).toMatchObject({ username: 'fixture-account', userLink: '/u/fixture-account', displayName: '合成 昵称🙂', link: '/t/123' });
  });
  it('does not merge two accounts with the same nickname', () => {
    const html = topics();
    const other = topicItem(legacy + display()).split('fixture-account').join('other-account').replace('/t/123', '/t/456');
    const items = parseTopicSummaries(parse(html + `<div class="topics">${other}</div>`));
    expect(items.map(item => item.displayName)).toEqual(['合成 昵称🙂', '合成 昵称🙂']);
    expect(items.map(item => item.userLink)).toEqual(['/u/fixture-account', '/u/other-account']);
  });
  it('does not infer a name from an avatar, numeric UID or unrelated user text', () => {
    expect(parseTopicSummaries(parse(topics(legacy + '<span data-gzk-mention-user="42">Unrelated text</span>')))[0].displayName).toBe('fixture-account');
  });
});

describe('display-name API results and refresh callbacks', () => {
  it.each(['recent', 'node'])('publishes the same displayName in %s responses and refresh callbacks', async kind => {
    respond(topics());
    const refreshed = vi.fn();
    const result = kind === 'recent'
      ? await getRecentTopics({ type: 'default', page: 1 }, { onRefresh: refreshed })
      : await getNodeTopics({ node: 'fixture', page: 1 }, { onRefresh: refreshed });
    expect(result[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(topics(legacy + display('更新昵称'))));
    expect(refreshed).toHaveBeenCalledWith([expect.objectContaining({ username: 'fixture-account', displayName: '更新昵称' })]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('adds profile header and profile-topic labels without changing editable nickname or account', async () => {
    respond(profile());
    const result = await getUserProfile({ username: 'fixture-account' }, { cache: false });
    expect(result).toMatchObject({ username: 'fixture-account', nickname: '资料昵称', displayName: '合成 昵称🙂', id: 'display-id-not-uid' });
    expect(result.topics[0]).toMatchObject({ username: 'fixture-account', userLink: '/u/fixture-account', displayName: '合成 昵称🙂' });
    expect(request).toHaveBeenCalledWith('/u/fixture-account', expect.objectContaining({ cache: false }));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([['资料昵称', '资料昵称'], ['', 'fixture-account'], ['  ', 'fixture-account']])('falls back from absent profile header nickname using the existing profile field %s', async (nickname, expected) => {
    respond(profile('', nickname));
    expect((await getUserProfile({ username: 'fixture-account' })).displayName).toBe(expected);
  });
  it('refreshes a profile label without changing account or trusted message recipient semantics', async () => {
    respond(profile());
    const refreshed = vi.fn();
    await getUserProfile({ username: 'fixture-account' }, { onRefresh: refreshed });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(profile(display('新昵称'))));
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ username: 'fixture-account', displayName: '新昵称', nickname: '资料昵称' }));
    expect(refreshed.mock.calls[0][0]).not.toHaveProperty('messageRecipientId');
  });
  it('adds favorite author label while leaving the last reply identity unchanged', async () => {
    respond(topics());
    const refreshed = vi.fn();
    const result = await getUserFavorites({ username: 'fixture-account' }, { onRefresh: refreshed });
    expect(result[0]).toMatchObject({ username: 'fixture-account', userLink: '/u/fixture-account', displayName: '合成 昵称🙂', lastReplyUsername: 'other-account' });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(topics(legacy + display('更新昵称'))));
    expect(refreshed).toHaveBeenCalledWith([expect.objectContaining({ username: 'fixture-account', displayName: '更新昵称' })]);
  });
  it('never uses the last reply nickname for the favorite author', async () => {
    respond(topics(legacy).replace('<strong>other-account</strong>', display('另一人', '/u/other')));
    expect((await getUserFavorites({ username: 'fixture-account' }))[0].displayName).toBe('fixture-account');
  });
  it('adds the notification sender label without changing actor or topic links', async () => {
    respond(notification());
    const refreshed = vi.fn();
    expect((await getNotifications({}, { onRefresh: refreshed }))[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂', userLink: '/u/fixture-account', topicLink: '/t/123#r456', topicTitle: 'Synthetic topic' });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(notification(`<a href="/u/fixture-account">fixture-account</a>${display('更新昵称')}`)));
    expect(refreshed).toHaveBeenCalledWith([expect.objectContaining({ username: 'fixture-account', displayName: '更新昵称' })]);
  });
  it('does not use another actor or a topic title as the notification sender nickname', async () => {
    respond(notification('<a href="/u/fixture-account">fixture-account</a>' + display('Other', '/u/other')));
    expect((await getNotifications({}))[0].displayName).toBe('fixture-account');
  });
  it('preserves the historical search username field and filter while adding nickname display', () => {
    const item = parseSearchResults(parse(search())).results[0];
    expect(item).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂', link: '/t/123' });
    expect(buildSearchQuery({ q: 'fixture', author: 'fixture-account' }).author).toBe('fixture-account');
  });
  it('does not rewrite a display-first search legacy field into a fabricated account', () => {
    const item = parseSearchResults(parse(search(display() + legacy))).results[0];
    expect(item).toMatchObject({ username: '合成 昵称🙂', displayName: '合成 昵称🙂' });
  });
  it('retains all original legacy labels when no nickname is present', async () => {
    expect(parseSearchResults(parse(search(legacy))).results[0].displayName).toBe('fixture-account');
    expect(parseTopicSummaries(parse(topics(legacy)))[0].displayName).toBe('fixture-account');
    respond(notification('<a href="/u/fixture-account">fixture-account</a>'));
    expect((await getNotifications({}))[0].displayName).toBe('fixture-account');
  });
});
