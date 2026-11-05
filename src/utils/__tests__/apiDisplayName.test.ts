import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { request } from '../../../packages/guanggu-forum-api/src/client';
import { getDisplayName, parseListAuthor } from '../../../packages/guanggu-forum-api/src/utils/displayName';
import { getHotTopics, getInterestTopics } from '../../../packages/guanggu-forum-api/src/discovery';
import { parseRecentlyViewedTopics } from '../../../packages/guanggu-forum-api/src/user/getRecentlyViewedTopics';
import { getRecentTopics, parseTopicSummaries } from '../../../packages/guanggu-forum-api/src/getRecentTopics';
import { getNodeTopics } from '../../../packages/guanggu-forum-api/src/node/getTopics';
import { getUserProfile } from '../../../packages/guanggu-forum-api/src/user/getUserProfile';
import { getUserFavorites } from '../../../packages/guanggu-forum-api/src/user/getUserFavorites';
import { getNotifications } from '../../../packages/guanggu-forum-api/src/notification/getNotifications';
import { buildSearchQuery, parseSearchResults } from '../../../packages/guanggu-forum-api/src/searchParser';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn(), LoginRequiredError: class extends Error {} }));
const legacy = '<span class="username"><a href="/u/fixture-account">fixture-account</a></span>';
const display = (name = '合成 昵称🙂', href = '/u/fixture-account') => `<a class="gzk-display-name" href="${href}" data-username="fixture-account" data-gzk-mention-user="42" data-display-name="attribute nickname"><bdi>${name}</bdi></a>`;
const topicItem = (names = legacy + display()) => `<div class="topic-item"><a href="/u/fixture-account"><img class="avatar" src="/fixture.png"></a><div class="main"><div class="title"><a href="/t/123">Synthetic topic</a></div></div><div class="meta">${names}<span class="node"><a href="/node/fixture">Fixture node</a></span><span class="last-touched">fixture time</span><span class="last-reply-username"><a href="/u/other"><strong>other-account</strong></a></span></div><span class="count"><a>3</a></span></div>`;
const topics = (names = legacy + display()) => `<div class="topics">${topicItem(names)}</div>`;
const profile = (header = display(), nickname = '资料昵称') => `<div class="profile"><div class="ui-header"><span class="username">fixture-account</span>${header}<img class="avatar" src="/fixture.png"></div><div class="ui-content"><dl><dt>昵称</dt><dd>${nickname}</dd></dl><dl><dt>ID</dt><dd>display-id-not-uid</dd></dl></div></div><div class="sidebar-left"><div class="topic-lists">${topicItem()}</div></div>`;
const notification = (names = `<a href="/u/fixture-account">fixture-account</a>${display()}`) => `<div class="notification-item"><div class="title">${names} replied to <a href="/t/123#r456">Synthetic topic</a></div><div class="content">Synthetic excerpt</div></div>`;
const search = (names = legacy + display()) => `<section class="gzk-search"><div class="search-results"><div class="result"><h2><a href="/t/123">Synthetic topic</a></h2><div class="meta">${names} · 2026-11-05 12:00:00 · 主题正文</div><div class="excerpt">Synthetic excerpt</div></div></div></section>`;
// Synthetic account/UID mirrors the legacy + display protocol already covered by
// topicDetailReply.test.ts, without fetching any server HTML or user profiles.
const invertedLegacy = '<a class="gzk-legacy-id" href="/u/fixture-account"><span class="username">fixture-account</span></a>';
const uidDisplay = (name = '合成 昵称🙂') => `<a class="gzk-display-name" href="/u/4242" data-username="fixture-account" data-gzk-mention-user="4242"><bdi>${name}</bdi></a>`;
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

describe('repository server-author protocol in list parsing', () => {
  it.each([
    ['legacy then UID display', invertedLegacy + uidDisplay()],
    ['UID display then legacy', uidDisplay() + invertedLegacy],
    ['legacy nested below nickname', `<span class="username">${uidDisplay()}${invertedLegacy}</span>`],
    ['display only', uidDisplay()],
    ['display marker on bdi', '<a href="/u/4242" data-username="fixture-account" data-gzk-mention-user="4242"><bdi class="gzk-display-name">合成 昵称🙂</bdi></a>'],
  ])('reads %s without using rendered nickname as account identity', (_label, names) => {
    expect(parseTopicSummaries(parse(topics(names)))[0]).toMatchObject({
      username: 'fixture-account', userLink: '/u/fixture-account', displayName: '合成 昵称🙂',
    });
  });
  it('preserves plain legacy account text without display data-username', () => {
    const root = parse(`<span class="username">fixture-account</span>${uidDisplay().replace(' data-username="fixture-account"', '')}`);
    expect(parseListAuthor(root, 'fixture-account')).toEqual({ username: 'fixture-account', userLink: '/u/4242', displayName: '合成 昵称🙂' });
  });
  it('does not turn ambiguous display-only labels into an account', () => {
    const root = parse(uidDisplay('One') + uidDisplay('Two'));
    expect(parseListAuthor(root, 'One', '/u/4242')).toEqual({ username: '', userLink: '/u/4242', displayName: '' });
  });
  it('includes a marker passed as root and does not double-count a nested marker', () => {
    const root = parse(uidDisplay()).querySelector('.gzk-display-name');
    expect(getDisplayName(root, 'fixture-account', '/u/fixture-account')).toBe('合成 昵称🙂');
    const nested = uidDisplay().replace('<bdi>', '<bdi class="gzk-display-name">');
    expect(getDisplayName(parse(nested), 'fixture-account', '/u/fixture-account')).toBe('合成 昵称🙂');
  });
  it.each([
    ['mismatched explicit account', uidDisplay().replace('data-username="fixture-account"', 'data-username="other-account"')],
    ['UID does not match href', uidDisplay().replace('data-gzk-mention-user="4242"', 'data-gzk-mention-user="4343"')],
    ['no explicit UID pairing', uidDisplay().replace(' data-gzk-mention-user="4242"', '')],
    ['plain bdi without marker', '<a href="/u/fixture-account"><bdi>Untrusted nickname</bdi></a>'],
    ['last reply with same identity', `<span class="last-reply-username">${uidDisplay()}</span>`],
    ['two labels for one author', uidDisplay('One') + uidDisplay('Two')],
  ])('falls back for %s without changing account identity', (_label, names) => {
    expect(parseTopicSummaries(parse(topics(invertedLegacy + names)))[0]).toMatchObject({
      username: 'fixture-account', userLink: '/u/fixture-account', displayName: 'fixture-account',
    });
  });
  it('checks owning href for a nested marker and does not borrow another account label', () => {
    const names = '<a href="/u/other"><bdi class="gzk-display-name">Other</bdi></a>';
    expect(getDisplayName(parse(names), 'fixture-account', '/u/fixture-account')).toBe('fixture-account');
  });
  it('does not read any marker inside a last-reply root', () => {
    const root = parse(`<span class="last-reply-username">${uidDisplay()}</span>`).querySelector('.last-reply-username');
    expect(parseListAuthor(root, 'fixture-account', '/u/fixture-account')).toEqual({
      username: 'fixture-account', userLink: '/u/fixture-account', displayName: 'fixture-account',
    });
  });
  it('keeps only the trusted UID profile link when display-only markup has no account attribute', () => {
    const root = parse('<a class="gzk-display-name" href="/u/4242"><bdi>合成 昵称🙂</bdi></a>');
    expect(parseListAuthor(root, '合成 昵称🙂', '/u/4242')).toEqual({
      username: '', userLink: '/u/4242', displayName: '合成 昵称🙂',
    });
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
  it('preserves the stable search account when a nickname link precedes the legacy link', () => {
    const item = parseSearchResults(parse(search(display() + legacy))).results[0];
    expect(item).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
  });
  it.each(['recent', 'node', 'favorite', 'notification'])('applies UID nickname protocol in %s initial and refresh responses using one request', async kind => {
    const html = kind === 'notification' ? notification(uidDisplay() + invertedLegacy) : topics(uidDisplay() + invertedLegacy);
    respond(html);
    const refreshed = vi.fn();
    const result = kind === 'recent' ? await getRecentTopics({ type: 'default', page: 1 }, { onRefresh: refreshed })
      : kind === 'node' ? await getNodeTopics({ node: 'fixture', page: 1 }, { onRefresh: refreshed })
      : kind === 'favorite' ? await getUserFavorites({ username: 'fixture-account' }, { onRefresh: refreshed })
      : await getNotifications({}, { onRefresh: refreshed });
    expect(result[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
    const link = result[0].userLink;
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(html.split('合成 昵称🙂').join('更新 昵称')));
    expect(refreshed).toHaveBeenCalledWith([expect.objectContaining({ username: 'fixture-account', userLink: link, displayName: '更新 昵称' })]);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reads inverted profile author/topic wrappers and scopes reply links to the topic', async () => {
    const html = profile(uidDisplay()).replace('<span class="username">fixture-account</span>', invertedLegacy)
      .replace(legacy + display(), uidDisplay() + invertedLegacy)
      + `<div class="sidebar-left"><div class="replies-lists"><div class="reply-item"><div class="main"><div class="title">回复了 ${uidDisplay()} 创建的主题 <a href="/t/123#r456">Synthetic topic</a></div><div class="content">Reply</div></div></div></div></div>`;
    respond(html);
    const refreshed = vi.fn();
    const result = await getUserProfile({ username: 'fixture-account' }, { onRefresh: refreshed });
    expect(result).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
    expect(result.topics[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂', userLink: '/u/fixture-account' });
    expect(result.replies[0]).toMatchObject({ topicTitle: 'Synthetic topic', topicLink: '/t/123#r456' });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(html.split('合成 昵称🙂').join('更新 昵称')));
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ username: 'fixture-account', displayName: '更新 昵称' }));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('reads search account from legacy or explicit data-username, never rendered nickname or a UID', () => {
    for (const names of [uidDisplay() + invertedLegacy, uidDisplay()]) {
      expect(parseSearchResults(parse(search(names))).results[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
    }
    expect(buildSearchQuery({ q: 'fixture', author: 'fixture-account' }).author).toBe('fixture-account');
  });
  it('preserves discovery interest labels and hot-topic rank without profile lookups', async () => {
    const html = topics(invertedLegacy + uidDisplay());
    respond(html);
    const interest = await getInterestTopics({ page: 1 });
    expect(interest.topics[0]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂', userLink: '/u/fixture-account', topicLink: '/t/123' });
    respond(`<div class="hot-topics"><div class="cell"><a href="/u/fixture-account"><img class="avatar" src="/fixture.png"></a><span class="hot_topic_title"><a href="/t/456">First fixture</a></span></div><div class="cell"><a href="/u/fixture-account"><img class="avatar" src="/fixture.png"></a><span class="hot_topic_title"><a href="/t/123">Synthetic topic</a></span></div></div>${html}`);
    const hot = await getHotTopics();
    expect(hot.map(topic => topic.topicLink)).toEqual(['/t/456', '/t/123']);
    expect(hot[1]).toMatchObject({ username: 'fixture-account', displayName: '合成 昵称🙂' });
    expect(hot[0].displayName).toBe('fixture-account');
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('keeps a direct hot-cell nickname ahead of a legacy summary fallback and rejects a different author summary', async () => {
    const cell = (href: string) => `<div class="hot-topics"><div class="cell"><a href="${href}"><img class="avatar" src="/fixture.png"></a>${display('热帖 昵称')}<span class="hot_topic_title"><a href="/t/123">Synthetic topic</a></span></div></div>`;
    respond(cell('/u/fixture-account') + topics(legacy));
    expect((await getHotTopics())[0]).toMatchObject({ username: 'fixture-account', displayName: '热帖 昵称' });
    respond(cell('/u/fixture-account').replace(display('热帖 昵称'), '') + topics(invertedLegacy + uidDisplay()).split('fixture-account').join('other-account'));
    expect((await getHotTopics())[0]).toMatchObject({ username: 'fixture-account', displayName: 'fixture-account' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('does not fabricate author/nickname in the server recent title/avatar-only protocol', () => {
    const root = parse('<div class="cell"><img class="avatar" src="/fixture.png"><a class="gzk-recent-item" href="/t/123">Synthetic topic</a></div>');
    const result = parseRecentlyViewedTopics(root);
    expect(result[0]).toMatchObject({ tid: '123', title: 'Synthetic topic', link: '/t/123' });
    expect(result[0]).not.toHaveProperty('author');
    expect(result[0]).not.toHaveProperty('displayName');
    expect(request).not.toHaveBeenCalled();
  });
  it('retains all original legacy labels when no nickname is present', async () => {
    expect(parseSearchResults(parse(search(legacy))).results[0].displayName).toBe('fixture-account');
    expect(parseTopicSummaries(parse(topics(legacy)))[0].displayName).toBe('fixture-account');
    respond(notification('<a href="/u/fixture-account">fixture-account</a>'));
    expect((await getNotifications({}))[0].displayName).toBe('fixture-account');
  });
});
