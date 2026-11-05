import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { getTopicDetail } from '../../../packages/guanggu-forum-api/src/getTopicDetail';
import { request } from '../../../packages/guanggu-forum-api/src/client';

vi.mock('../../../packages/guanggu-forum-api/src/client', () => ({ request: vi.fn() }));
const replyForm = '<form action="" method="post"><input name="tid" type="hidden" value="123"><textarea name="content"></textarea><input type="hidden" name="gzk_mentions" value="[]"><input name="_xsrf" type="hidden" value="synthetic-form-token"></form>';
const replyRegion = (content: string) => `<div class="topic-reply-create container-box">${content}</div>`;
// Actual mini-program response layout: the server form is a direct child of this ui-content.
const form = replyRegion(`<div class="ui-content">${replyForm}</div>`);
const topic = '<div class="topic-detail"><div class="main"><h3 class="title">Synthetic topic</h3></div><div class="ui-content">fixture only</div></div>';
const page = (reply = form) => `<div class="container"><div class="row">${topic}${reply}</div></div>`;
function respond(html = page(), statusCode = 200) { vi.mocked(request).mockResolvedValueOnce({ body: parse(html), rawRes: { statusCode } }); }
beforeEach(() => vi.mocked(request).mockReset());

describe('trusted topic comment form', () => {
  it('extracts only the enabled current-topic reply token from a fresh canonical response', async () => {
    respond();
    const detail = await getTopicDetail({ tid: '123' }, { cache: false });
    expect(detail).toMatchObject({ tid: '123', createCommentStatus: 'ready', createCommentXSRF: 'synthetic-form-token' });
    expect(request).toHaveBeenCalledWith('/t/123', { cache: false, cacheApi: 'getTopicDetail', query: {} });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('preserves the plain legacy form without the server ui-content wrapper', async () => {
    respond(page(replyRegion(replyForm)));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'ready', createCommentXSRF: 'synthetic-form-token' });
  });
  it.each([
    ['topic-detail wrapper', replyRegion(`<div class="topic-detail">${replyForm}</div>`)],
    ['topic-reply wrapper', replyRegion(`<div class="topic-reply">${replyForm}</div>`)],
    ['reply-item wrapper', replyRegion(`<div class="reply-item">${replyForm}</div>`)],
    ['content wrapper', replyRegion(`<div class="content">${replyForm}</div>`)],
    ['mixed ui-content and content wrapper', replyRegion(`<div class="ui-content content">${replyForm}</div>`)],
    ['mixed ui-content and topic-detail wrapper', replyRegion(`<div class="ui-content topic-detail">${replyForm}</div>`)],
    ['mixed ui-content and topic-reply wrapper', replyRegion(`<div class="ui-content topic-reply">${replyForm}</div>`)],
    ['mixed ui-content and reply-item wrapper', replyRegion(`<div class="ui-content reply-item">${replyForm}</div>`)],
    ['mixed ui-content and fake reply region wrapper', replyRegion(`<div class="ui-content topic-reply-create">${replyForm}</div>`)],
    ['form itself is ui-content', replyRegion(replyForm.replace('<form ', '<form class="ui-content" '))],
    ['form itself is ui-content in server layout', form.replace('<form ', '<form class="ui-content" ')],
    ['form itself is fake reply region in server layout', form.replace('<form ', '<form class="topic-reply-create" ')],
    ['form itself is content in server layout', form.replace('<form ', '<form class="content" ')],
    ['non-DIV ui-content wrapper', replyRegion(`<section class="ui-content">${replyForm}</section>`)],
    ['extra wrapper beneath ui-content', replyRegion(`<div class="ui-content"><div>${replyForm}</div></div>`)],
    ['extra wrapper above ui-content', replyRegion(`<div><div class="ui-content">${replyForm}</div></div>`)],
    ['nested ui-content wrappers', replyRegion(`<div class="ui-content"><div class="ui-content">${replyForm}</div></div>`)],
    ['content inside server layout', replyRegion(`<div class="ui-content"><div class="content">${replyForm}</div></div>`)],
    ['nested fake reply region', replyRegion(replyRegion(replyForm))],
    ['nested fake reply region in server layout', replyRegion(`<div class="ui-content">${replyRegion(replyForm)}</div>`)],
  ])('does not authorize a form through %s inside the trusted reply region', async (_name, reply) => {
    respond(page(reply));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'form-unavailable', createCommentXSRF: '' });
  });
  it('ignores a content-injected form inside the server layout beside the real form', async () => {
    respond(page(replyRegion(`<div class="ui-content">${replyForm}<div class="content">${replyForm.replace('synthetic-form-token', 'forged-token')}</div></div>`)));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'ready', createCommentXSRF: 'synthetic-form-token' });
  });
  it('rejects multiple eligible forms even when each has a server-layout wrapper', async () => {
    respond(page(replyRegion(`<div class="ui-content">${replyForm}</div><div class="ui-content">${replyForm}</div>`)));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'invalid-form', createCommentXSRF: '' });
  });
  it('rejects an additional plain form beside the server-layout form', async () => {
    respond(page(replyRegion(`<div class="ui-content">${replyForm}</div><form></form>`)));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'invalid-form', createCommentXSRF: '' });
  });
  it('preserves old forms without hidden tid only inside the trusted reply region', async () => {
    respond(page(form.replace('<input name="tid" type="hidden" value="123">', '')));
    expect((await getTopicDetail({ tid: '123' })).createCommentStatus).toBe('ready');
  });
  it('allows only the exact canonical action as an alternative to the native empty action', async () => {
    respond(page(form.replace('action=""', 'action="/t/123"')));
    expect((await getTopicDetail({ tid: '123' })).createCommentStatus).toBe('ready');
  });
  it.each([
    ['missing token', value => value.replace('<input name="_xsrf" type="hidden" value="synthetic-form-token">', '')],
    ['empty token', value => value.replace('synthetic-form-token', ' ')],
    ['duplicate token', value => value.replace('</form>', '<input name="_xsrf" type="hidden" value="duplicate"></form>')],
    ['non-hidden token', value => value.replace('name="_xsrf" type="hidden"', 'name="_xsrf" type="text"')],
    ['disabled token', value => value.replace('name="_xsrf"', 'disabled name="_xsrf"')],
    ['foreign topic', value => value.replace('value="123"', 'value="999"')],
    ['duplicate topic', value => value.replace('</form>', '<input name="tid" type="hidden" value="123"></form>')],
    ['disabled topic', value => value.replace('name="tid"', 'disabled name="tid"')],
    ['non-hidden topic', value => value.replace('name="tid" type="hidden"', 'name="tid" type="text"')],
    ['wrong method', value => value.replace('method="post"', 'method="get"')],
    ['missing method', value => value.replace(' method="post"', '')],
    ['foreign action', value => value.replace('action=""', 'action="https://evil.invalid/t/123"')],
    ['other topic action', value => value.replace('action=""', 'action="/t/999"')],
    ['missing action', value => value.replace(' action=""', '')],
    ['disabled form', value => value.replace('<form ', '<form disabled ')],
    ['disabled fieldset', value => value.replace('<textarea', '<fieldset disabled><textarea').replace('</form>', '</fieldset></form>')],
    ['disabled content', value => value.replace('name="content"', 'disabled name="content"')],
    ['readonly content', value => value.replace('name="content"', 'readonly name="content"')],
    ['duplicate content', value => value.replace('</form>', '<textarea name="content"></textarea></form>')],
    ['ambiguous forms', value => value.replace('</form>', '</form><form action="" method="post"><textarea name="content"></textarea></form>')],
    ['ambiguous regions', value => value + value],
  ] as [string, (value: string) => string][])('returns invalid-form for %s without exposing a token', async (_name, change) => {
    respond(page(change(form)));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'invalid-form', createCommentXSRF: '' });
  });
  it('distinguishes explicit trusted login form from absent form or ordinary login links', async () => {
    respond(page('<div class="topic-reply-create"><form action="/login" method="post"><input type="password" name="password"></form></div>'));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'login-required', createCommentXSRF: '' });
    respond(page('<div class="topic-reply-create"><a href="/login">Login</a></div>'));
    expect((await getTopicDetail({ tid: '123' })).createCommentStatus).toBe('form-unavailable');
    respond(page(''));
    expect((await getTopicDetail({ tid: '123' })).createCommentStatus).toBe('form-unavailable');
  });
  it.each(['ui-content', 'content', 'reply-item', 'topic-reply'])('ignores a forged reply form inside rendered %s', async className => {
    respond(page(`<div class="${className}">${form}</div>`));
    expect(await getTopicDetail({ tid: '123' })).toMatchObject({ createCommentStatus: 'form-unavailable', createCommentXSRF: '' });
  });
  it('ignores content-injected forms even if a real sibling form is present', async () => {
    respond(page(form).replace('fixture only', form.replace('synthetic-form-token', 'forged-token')));
    expect((await getTopicDetail({ tid: '123' })).createCommentXSRF).toBe('synthetic-form-token');
  });
  it('does not widen the layout boundary to a reply-looking form in a later unrelated row', async () => {
    respond(page('') + `<div class="container"><div class="row">${form}</div></div>`);
    expect((await getTopicDetail({ tid: '123' })).createCommentStatus).toBe('form-unavailable');
  });
  it.each([401, 403, 500])('rejects HTTP %s even if an apparent ready form is in the response', async status => {
    respond(page(), status);
    await expect(getTopicDetail({ tid: '123' }, { cache: false })).rejects.toThrow('帖子加载失败');
  });
  it('rejects unrelated HTTP200 content and preserves cached response compatibility', async () => {
    respond('<body><h3 class="title">Not a topic</h3></body>');
    await expect(getTopicDetail({ tid: '123' })).rejects.toThrow('帖子加载失败');
    vi.mocked(request).mockResolvedValueOnce({ body: parse(page()), rawRes: null, fromCache: true });
    expect((await getTopicDetail({ tid: '123' })).title).toBe('Synthetic topic');
  });
  it('applies reply form status to unchanged refresh callback shape', async () => {
    respond(page(''));
    const refreshed = vi.fn();
    await getTopicDetail({ tid: '123' }, { onRefresh: refreshed });
    vi.mocked(request).mock.calls[0][1]?.onRefresh?.(parse(page()));
    expect(refreshed).toHaveBeenCalledWith(expect.objectContaining({ createCommentStatus: 'ready', createCommentXSRF: 'synthetic-form-token' }));
  });
  it('validates resolver responses against requested tid and does not reuse an earlier latest-page form', async () => {
    respond(page(form.replace('value="123"', 'value="999"')));
    expect((await getTopicDetail({ tid: '123', replyId: '456', page: '2' }, { cache: false })).createCommentStatus).toBe('invalid-form');
    expect(request).toHaveBeenLastCalledWith('/search/reply/456', { cache: false, cacheApi: 'getTopicDetail', query: {} });
    respond(page() + '<ul class="pagination"><li><a href="?p=2">2</a></li></ul>');
    respond(page(''));
    expect(await getTopicDetail({ tid: '123', latest: true })).toMatchObject({ createCommentStatus: 'form-unavailable', createCommentXSRF: '' });
  });
});
