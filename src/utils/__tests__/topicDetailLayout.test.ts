import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro, { useReady, useDidShow } from "@tarojs/taro";
import { CommentSubmissionError, LoginRequiredError, createNewComment, getTopicDetail } from "guanggu-forum-api";
import { openLoginModal } from "../auth";
import TopicDetail from "../../pages/topicDetail";
import CommentComposer from "../../pages/topicDetail/CommentComposer";
import { STICKERS } from "../stickers";
import { recordCommentEmojiUsage } from "../emojiUsage";
import { cacheService } from '../CacheService';
import { photoAttachment, stickerAttachment } from "../commentAttachments";

const harness = vi.hoisted(() => ({
  theme: 'light' as 'light' | 'dark', themeListeners: [] as (() => void)[], state: [] as any[], refs: [] as any[], refCursor: 0, cursor: 0, effects: [] as any[], accountListeners: [] as any[], hide: null as any,
  request: vi.fn(), requestFresh: vi.fn(), params: { tid: '1' } as Record<string, string>, loadedDisplay: undefined as any, status: undefined as string | undefined, detailTid: '1', detailWrites: vi.fn(), authorUserId: undefined as string | undefined, replyUserId: undefined as string | undefined, replyAuthor: 'recipient', replyId: 'r1', replyVoteUrl: '/replyVote?reply_id=1', skyline: true, xsrf: "fixture", username: "tester", account: 'tester', checkingLogin: false, loginError: false, retryLogin: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => { harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next; }];
  },
  useRef: (value: any) => harness.refs[harness.refCursor++] ??= { current: value },
  useEffect: (effect: any) => { harness.effects.push(effect); },
}));
vi.mock("@tarojs/components", () => Object.fromEntries(["Button", "Image", "ScrollView", "ShareElement", "Text", "View"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({
  default: { showActionSheet: vi.fn(), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), navigateTo: vi.fn(), getCurrentInstance: vi.fn(() => ({})), nextTick: vi.fn((callback: () => void) => callback()), worklet: { shared: vi.fn((value: number) => ({ value })) } },
  useRouter: () => ({ path: "/pages/topicDetail/index", params: harness.params }),
  useDidHide: (callback: any) => { harness.hide = callback; },
  useReady: vi.fn(), useDidShow: vi.fn(), useShareAppMessage: vi.fn(), useShareTimeline: vi.fn(),
}));
vi.mock("guanggu-forum-api", () => ({ CommentSubmissionError: class extends Error {}, LoginRequiredError: class extends Error {}, getTopicDetail: vi.fn(), commentUpvote: vi.fn(), createNewComment: vi.fn(), URLS: {}, urlPathVaiable: vi.fn() }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: harness.theme, preference: 'system' }) }));
vi.mock('../themePreferences', async original => ({ ...await original<any>(), getThemeSnapshot: () => ({ theme: harness.theme, preference: 'system' }), subscribeTheme: (listener: () => void) => { harness.themeListeners.push(listener); return () => {}; } }));
vi.mock("../renderer", () => ({ isSkyline: () => harness.skyline, getScrollViewType: () => 'custom' }));
vi.mock("../../hooks/useDataWithCache", () => ({
  useDataWithCache: () => ({
    request: harness.request, requestFresh: harness.requestFresh, setData: harness.detailWrites,
    data: harness.loadedDisplay ?? syntheticDetail(),
  }),
}));
vi.mock("../../hooks/useCurrentUsername", () => ({
  useCurrentUsername: () => ({ username: harness.username, loading: harness.checkingLogin, error: harness.loginError, retry: harness.retryLogin }),
}));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn() }, CacheCategory: {} }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => harness.account, subscribeCurrentAccount: (listener: any) => { harness.accountListeners.push(listener); return () => {}; } }));
vi.mock("../../hooks/useCommentPhotoUploads", () => ({ useCommentPhotoUploads: vi.fn() }));
vi.mock("../emojiUsage", () => ({ recordCommentEmojiUsage: vi.fn() }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../../assets/wechat.svg", () => ({ default: '/synthetic-wechat.svg' }));
vi.mock("../../pages/topicDetail/CommentComposer", () => ({ default: 'CommentComposer' }));
vi.mock("../../components/UserAvatar", () => ({ default: 'UserAvatar' }));
vi.mock("../../components/ThemedIcon", () => ({ default: 'ThemedIcon' }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/Tag", () => ({ default: "Tag" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide" }));
vi.mock("../../components/AdBanner", () => ({ default: "AdBanner" }));
vi.mock("../../pages/topicDetail/relatingTopics", () => ({ default: "RelatingTopics" }));
vi.mock("../dimension", () => ({ rpxToPx: (rpx: number) => rpx / 2 }));

function syntheticDetail() {
  return { tid: harness.detailTid, title: '帖子', author: 'tester', authorUserId: harness.authorUserId, content: '内容', commentTotalCount: '1 回复', createCommentXSRF: harness.xsrf, createCommentStatus: harness.status, relatingTopics: [], comments: [
    { id: harness.replyId, floor: '#1', author: harness.replyAuthor, authorUserId: harness.replyUserId, content: '回复内容', replyMetas: [], upVoteCount: '0赞', upVoteUrl: harness.replyVoteUrl },
  ] };
}
async function enter() {
  render();
  const effect = harness.effects.find(callback => callback.toString().includes('fetchTopicDetail(params)'))!;
  const cleanup = effect();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  render();
  return cleanup;
}
function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...all(tree.props?.children)];
}
function render() { harness.cursor = harness.refCursor = 0; return TopicDetail(); }
function find(tree: any, className: string) { return all(tree).find(e => e.props?.className === className)!.props; }
beforeEach(() => {
  harness.theme = 'light'; harness.themeListeners = []; harness.state = []; harness.refs = []; harness.effects = []; harness.accountListeners = []; harness.hide = null;
  harness.params = { tid: '1' }; harness.loadedDisplay = undefined; harness.status = undefined; harness.detailTid = '1'; harness.detailWrites.mockClear();
  harness.authorUserId = undefined; harness.replyUserId = undefined; harness.replyAuthor = 'recipient'; harness.replyId = 'r1'; harness.replyVoteUrl = '/replyVote?reply_id=1';
  harness.skyline = true; harness.xsrf = "fixture"; harness.username = "tester"; harness.account = 'tester'; harness.checkingLogin = false; harness.loginError = false;
  vi.clearAllMocks(); vi.mocked(Taro.showActionSheet).mockReset(); vi.mocked(Taro.getCurrentInstance).mockReturnValue({} as ReturnType<typeof Taro.getCurrentInstance>);
  vi.mocked(createNewComment).mockResolvedValue({ moderated: false });
  vi.mocked(getTopicDetail).mockReset(); vi.mocked(getTopicDetail).mockImplementation(async () => syntheticDetail() as any);
  harness.request.mockReset(); harness.request.mockImplementation((params: any) => getTopicDetail(params).then(detail => { harness.loadedDisplay = detail; return detail; }));
  harness.requestFresh.mockReset();
  vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
});
afterEach(() => vi.unstubAllGlobals());

describe('explicit comment mentions on the guarded submission boundary', () => {
  function composer() { return all(render()).find(node => node.type === CommentComposer)!; }
  function open() { all(render()).find(node => node.props.className === 'left' && node.props.onClick)!.props.onClick(); return composer(); }
  function subscribe() { return harness.effects.find(callback => callback.toString().includes('subscribeCurrentAccount'))!(); }
  function reply() {
    vi.mocked(Taro.showActionSheet).mockImplementationOnce(async (options: any) => { options.success({ tapIndex: 0 }); return {} as any; });
    find(render(), 'comment-content').onClick();
    return composer();
  }
  it('binds a reply action to its exact server UID and reply id, keeps it on failure and clears on success', async () => {
    harness.replyUserId = '42'; await enter(); let input = reply();
    input.props.onChange(`${input.props.value}synthetic reply`); input = composer();
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error('synthetic offline'));
    await input.props.onSend();
    expect(createNewComment).toHaveBeenLastCalledWith({ tid: '1', _xsrf: 'fixture', content: '@recipient synthetic reply', mentions: [{ uid: 42, reply_id: 1, start: 0, end: 10, label: '@recipient' }] });
    expect(composer().props.value).toBe('@recipient synthetic reply');
    await composer().props.onSend(); open().props.onChange('@recipient synthetic reply');
    await composer().props.onSend();
    expect(createNewComment).toHaveBeenLastCalledWith({ tid: '1', _xsrf: 'fixture', content: '@recipient synthetic reply' });
  });
  it('uses explicit reply identity despite duplicate display names and supports spaces and emoji', async () => {
    harness.authorUserId = '7'; harness.replyUserId = '42'; harness.replyAuthor = 'tester'; await enter();
    let input = reply(); expect(input.props.mentionTargets).toEqual([]);
    input.props.onChange(`${input.props.value}synthetic reply`); await composer().props.onSend();
    expect(vi.mocked(createNewComment).mock.calls[0][0].mentions?.[0]).toEqual({ uid: 42, reply_id: 1, start: 0, end: 7, label: '@tester' });
    harness.refs = []; harness.state = []; harness.effects = []; harness.loadedDisplay = undefined; harness.replyAuthor = '复杂 名👍'; await enter();
    input = reply(); input.props.onChange(`${input.props.value}synthetic reply`); await composer().props.onSend();
    expect(vi.mocked(createNewComment).mock.calls[1][0].mentions?.[0].label).toBe('@复杂 名👍');
  });
  it('binds candidate selections at UTF-16 offsets and does not scan manual text or attachments', async () => {
    harness.replyUserId = '42'; await enter(); let input = open(); input.props.onChange('👍 @recipient synthetic reply'); input = composer();
    input.props.onMentionInsert({ uid: 42, reply_id: 0, start: 3, end: 13, label: '@recipient' });
    input.props.onAttachmentsChange([stickerAttachment(STICKERS[0])]); await composer().props.onSend();
    const sent = vi.mocked(createNewComment).mock.calls[0][0];
    expect(sent.content).toContain('\n\n!['); expect(sent.mentions).toEqual([{ uid: 42, reply_id: 0, start: 3, end: 13, label: '@recipient' }]);
  });
  it('drops bindings touched by text edits and leaves missing IDs as ordinary text', async () => {
    harness.replyUserId = '42'; await enter(); let input = reply(); input.props.onChange('@recXpient synthetic reply'); await composer().props.onSend();
    expect(vi.mocked(createNewComment).mock.calls[0][0].mentions).toBeUndefined();
    harness.refs = []; harness.state = []; harness.effects = []; harness.loadedDisplay = undefined; harness.replyUserId = undefined; await enter();
    input = reply(); input.props.onChange(`${input.props.value}synthetic reply`); await composer().props.onSend();
    expect(vi.mocked(createNewComment).mock.calls[1][0].mentions).toBeUndefined();
  });
  it('rejects stale candidate callbacks and never revives old bindings or metadata after account ABA', async () => {
    harness.replyUserId = '42'; await enter(); const input = open(); input.props.onChange('@recipient synthetic reply'); const stale = composer().props.onMentionInsert; subscribe();
    harness.account = harness.username = 'other'; harness.accountListeners.forEach(callback => callback('changed'));
    harness.account = harness.username = 'tester'; harness.accountListeners.forEach(callback => callback('changed'));
    input.props.onChange('stale native input');
    stale({ uid: 42, reply_id: 0, start: 0, end: 10, label: '@recipient' });
    const reopened = open(); expect(reopened.props.value).toBe('@recipient synthetic reply'); expect(reopened.props.mentionTargets).toEqual([]);
    vi.mocked(getTopicDetail).mockClear();
    await composer().props.onSend(); expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
  });
  it('allows newly rendered same-account callbacks after show while rejecting old ones and preserving bindings', async () => {
    harness.replyUserId = '42'; await enter(); let input = reply(); input.props.onChange(`${input.props.value}synthetic reply`); input = composer();
    const stale = input.props.onChange; harness.hide();
    const page = harness.refs.find(ref => ref.current && typeof ref.current === 'object' && 'generation' in ref.current && 'visible' in ref.current)!.current;
    page.visible = true;
    stale('stale hidden callback'); input = composer(); expect(input.props.value).toBe('@recipient synthetic reply');
    input.props.onChange(`${input.props.value} changed`); input = composer(); expect(input.props.value).toBe('@recipient synthetic reply changed');
    await input.props.onSend(); expect(vi.mocked(createNewComment).mock.calls[0][0].mentions).toEqual([{ uid: 42, reply_id: 1, start: 0, end: 10, label: '@recipient' }]);
  });
  it('uses fallback reply_id zero only when the parsed comment has no reliable reply id', async () => {
    harness.replyUserId = '42'; harness.replyId = 'unverified'; harness.replyVoteUrl = '/unknown'; await enter();
    const input = reply(); input.props.onChange(`${input.props.value}synthetic reply`);
    await composer().props.onSend(); expect(vi.mocked(createNewComment).mock.calls[0][0].mentions?.[0].reply_id).toBe(0);
  });
  it('ignores a hidden late candidate callback and retains the text', async () => {
    harness.replyUserId = '42'; await enter(); const input = open(); input.props.onChange('@recipient synthetic reply'); const stale = composer().props.onMentionInsert;
    harness.hide(); stale({ uid: 42, reply_id: 0, start: 0, end: 10, label: '@recipient' });
    expect(composer().props.value).toBe('@recipient synthetic reply'); expect(composer().props.mentionTargets).toEqual([]);
  });
});

describe("topic detail restored account and reply capability", () => {
  function entry() { return all(render()).find(e => e.props?.className === "left" && e.props?.onClick)!; }
  async function draft() {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    entry().props.onClick();
    all(render()).find(e => e.type === CommentComposer)!.props.onChange("synthetic reply");
    return all(render()).find(e => e.type === CommentComposer)!;
  }

  it('preserves mixed attachment ordering and stable IDs after closing and reopening', async () => {
    let composer = await draft();
    const ordered = [photoAttachment('/tmp/new.jpg'), stickerAttachment(STICKERS[0]), photoAttachment('/tmp/old.jpg')];
    composer.props.onAttachmentsChange(ordered);
    composer.props.onClose();
    entry().props.onClick();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.previewAttachments).toEqual(ordered);
    expect(composer.props.photos).toEqual(['/tmp/new.jpg', '/tmp/old.jpg']);
    expect(composer.props.stickers).toEqual([STICKERS[0]]);
    expect(composer.props.topicAuthor).toBe('tester');
  });
  it('retains selected photos when closing and does not silently send local paths', async () => {
    let composer = await draft();
    composer.props.onPhotosChange(['/tmp/photo.jpg']);
    composer.props.onClose();
    entry().props.onClick();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.photos).toEqual(['/tmp/photo.jpg']);
    await composer.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '请等待图片上传完成，失败图片可点击重试', icon: 'none' });
    expect(all(render()).find(e => e.type === CommentComposer)!.props.photos).toEqual(['/tmp/photo.jpg']);
  });
  it('defensively caps the combined number of photos and stickers at five', async () => {
    let composer = await draft();
    composer.props.onPhotosChange(['/tmp/1.jpg', '/tmp/2.jpg']);
    composer = all(render()).find(e => e.type === CommentComposer)!;
    composer.props.onStickersChange(STICKERS.slice(0, 7));
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.stickers).toHaveLength(3);
    composer.props.onPhotosChange(Array.from({ length: 7 }, (_, i) => `/tmp/${i}.jpg`));
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.photos).toHaveLength(2);
  });
  it("preserves selected stickers when closing or failing to send, and clears them on success", async () => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    entry().props.onClick();
    let composer = all(render()).find(e => e.type === CommentComposer)!;
    composer.props.onStickersChange([STICKERS[0], STICKERS[1]]);
    composer.props.onClose();
    entry().props.onClick();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.stickers).toEqual([STICKERS[0], STICKERS[1]]);
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error('offline'));
    await composer.props.onSend();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.stickers).toEqual([STICKERS[0], STICKERS[1]]);
    expect(recordCommentEmojiUsage).not.toHaveBeenCalled();
    await composer.props.onSend();
    expect(createNewComment).toHaveBeenLastCalledWith({ tid: '1', _xsrf: 'fixture', content: [STICKERS[0], STICKERS[1]].map(sticker => `![${sticker.name}](${sticker.url})`).join('\n\n') });
    expect(recordCommentEmojiUsage).not.toHaveBeenCalled();
    entry().props.onClick();
    expect(all(render()).find(e => e.type === CommentComposer)!.props.stickers).toEqual([]);
  });
  it("shows a server rejection and keeps both text and stickers for retry", async () => {
    let composer = await draft();
    composer.props.onStickersChange([STICKERS[0]]);
    composer = all(render()).find(e => e.type === CommentComposer)!;
    vi.mocked(createNewComment).mockRejectedValueOnce(new CommentSubmissionError('图片链接不允许'));
    await composer.props.onSend();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.value).toBe('synthetic reply');
    expect(composer.props.stickers).toEqual([STICKERS[0]]);
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '图片链接不允许', icon: 'none' });
  });
  it("does not call a restored account logged out when cached detail lacks the reply form", () => {
    harness.xsrf = ""; harness.username = harness.account = "restored-user";
    expect(entry().props.children.props.children).toBe("说点什么...");
    entry().props.onClick();
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(true);
    expect(openLoginModal).not.toHaveBeenCalled();
  });

  it("waits for old-session identity recovery and exposes retry without navigating to login", () => {
    harness.xsrf = ""; harness.username = harness.account = ''; harness.checkingLogin = true;
    expect(entry().props.children.props.children).toBe("正在确认登录状态...");
    entry().props.onClick();
    expect(openLoginModal).not.toHaveBeenCalled();
    harness.checkingLogin = false; harness.loginError = true;
    expect(entry().props.children.props.children).toBe("登录状态确认失败，点击重试");
    entry().props.onClick();
    expect(harness.retryLogin).toHaveBeenCalledTimes(1);
    expect(openLoginModal).not.toHaveBeenCalled();
    harness.loginError = false; harness.username = harness.account = "restored-user";
    expect(entry().props.children.props.children).toBe("说点什么...");
  });

  it("only prompts login for a resolved anonymous account without a reply form", () => {
    harness.xsrf = ""; harness.username = harness.account = '';
    expect(entry().props.children.props.children).toBe("请登录后再评论");
    entry().props.onClick();
    expect(openLoginModal).toHaveBeenCalledTimes(1);
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
  });

  it('uses the completed entry token for a restored account without a send-time GET', async () => {
    harness.xsrf = 'synthetic-entry-xsrf'; harness.username = harness.account = 'restored-user';
    const input = await draft();
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error('synthetic offline'));
    await input.props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled();
    expect(createNewComment).toHaveBeenCalledWith({ tid: '1', _xsrf: 'synthetic-entry-xsrf', content: 'synthetic reply' });
    expect(Taro.hideLoading).toHaveBeenCalled();
  });

  it("keeps an unavailable reply form separate from login and preserves the draft for retry", async () => {
    harness.xsrf = ""; harness.username = harness.account = "restored-user";
    await (await draft()).props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: "暂时无法评论，请刷新后重试", icon: "none" });
    const composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props).toMatchObject({ value: "synthetic reply", sending: false });
    await composer.props.onSend(); expect(getTopicDetail).not.toHaveBeenCalled(); expect(createNewComment).not.toHaveBeenCalled();
    // Only a normal explicit page refresh can supply the missing form, not tapping send.
    harness.xsrf = 'synthetic-retry-xsrf'; await enter(); vi.mocked(getTopicDetail).mockClear();
    await all(render()).find(e => e.type === CommentComposer)!.props.onSend();
    expect(createNewComment).toHaveBeenCalledWith(expect.objectContaining({ _xsrf: 'synthetic-retry-xsrf' }));
  });

  it('keeps a failed entry without an owner and never fetches to repair it on send', async () => {
    harness.xsrf = ""; harness.username = harness.account = "restored-user";
    vi.mocked(getTopicDetail).mockRejectedValueOnce(new Error("synthetic offline"));
    await (await draft()).props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(all(render()).find(e => e.type === CommentComposer)!.props).toMatchObject({ value: "synthetic reply", sending: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '帖子加载失败，请重试', icon: 'none' });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '暂时无法评论，请刷新后重试', icon: 'none' });
    expect(getTopicDetail).not.toHaveBeenCalled();
  });

  it("preserves the draft when an authenticated comment POST fails", async () => {
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error("synthetic offline"));
    await (await draft()).props.onSend();
    expect(all(render()).find(e => e.type === CommentComposer)!.props).toMatchObject({ value: "synthetic reply", sending: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: "评论发送失败，请重试", icon: "none" });
  });

  it.each([false, true])('locates the newest reply after sending with reverse sort=%s', async reverse => {
    vi.mocked(cacheService.get).mockReturnValueOnce(reverse);
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ ...syntheticDetail(), createCommentXSRF: 'synthetic-entry-xsrf', createCommentStatus: 'ready' } as any);
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ commentTotalCount: '10 回复', comments: [
      { id: 'r10', floor: '#10', content: 'latest', upVoteUrl: '' },
      { id: 'r9', floor: '#9', content: 'older', upVoteUrl: '' },
    ] } as any);
    await (await draft()).props.onSend();
    expect(harness.state).toContainEqual({ id: 'reply-10' });
    expect(harness.state).toContain('#10');
    expect(getTopicDetail).toHaveBeenCalledWith({ tid: '1', latest: true }, { cache: false });
    expect(getTopicDetail).toHaveBeenCalledTimes(1);
  });
  it('does not locate an unrelated reply when the submitted reply is awaiting moderation', async () => {
    vi.mocked(createNewComment).mockResolvedValueOnce({ moderated: true });
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ ...syntheticDetail(), createCommentXSRF: 'synthetic-entry-xsrf', createCommentStatus: 'ready' } as any);
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ commentTotalCount: '10 回复', comments: [
      { id: 'r10', floor: '#10', content: 'someone else', upVoteUrl: '' },
    ] } as any);
    await (await draft()).props.onSend();
    expect(harness.state).not.toContainEqual({ id: 'reply-10' });
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
  });
  it('keeps successful submission distinct from a failed latest-reply refresh', async () => {
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ ...syntheticDetail(), createCommentXSRF: 'synthetic-entry-xsrf', createCommentStatus: 'ready' } as any);
    vi.mocked(getTopicDetail).mockRejectedValueOnce(new Error('offline'));
    await (await draft()).props.onSend();
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '回复已发送，最新回复加载失败，请下拉刷新', icon: 'none' });
    expect(Taro.showToast).not.toHaveBeenCalledWith({ title: '评论发送失败，请重试', icon: 'none' });
    expect(createNewComment).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('uses exactly one ordinary entry request when initial useDidShow runs first, Skyline=%s', async skyline => {
    harness.skyline = skyline; render();
    vi.mocked(useDidShow).mock.calls.forEach(([callback]) => callback());
    await enter();
    expect(harness.request).toHaveBeenCalledTimes(1); expect(harness.requestFresh).not.toHaveBeenCalled();
    expect(getTopicDetail).toHaveBeenCalledExactlyOnceWith({ tid: '1', page: undefined, replyId: undefined });
  });
  it('uses updated displayed form metadata after a cached entry background refresh without send-time GET', async () => {
    harness.request.mockImplementationOnce(async () => {
      const cached = syntheticDetail(); harness.loadedDisplay = cached; return cached;
    });
    const input = await draft();
    harness.loadedDisplay = { ...syntheticDetail(), createCommentXSRF: 'synthetic-background-xsrf' };
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error('synthetic offline'));
    await all(render()).find(e => e.type === CommentComposer)!.props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled();
    expect(createNewComment).toHaveBeenCalledWith({ tid: '1', _xsrf: 'synthetic-background-xsrf', content: input.props.value });
  });
  it('retains cached display and its owned form when the entry background refresh fails', async () => {
    harness.request.mockImplementationOnce(async () => {
      const cached = syntheticDetail(); harness.loadedDisplay = cached;
      // The existing API/hook swallow a background failure instead of rejecting the cached result.
      void Promise.reject(new Error('synthetic background offline')).catch(() => {});
      return cached;
    });
    const input = await draft();
    expect(all(render()).filter(e => e.type === 'HtmlRender')[0].props.html).toBe('内容');
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error('synthetic offline'));
    await input.props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled();
    expect(createNewComment).toHaveBeenCalledWith({ tid: '1', _xsrf: 'fixture', content: 'synthetic reply' });
    expect(Taro.showToast).not.toHaveBeenCalledWith({ title: '帖子加载失败，请重试', icon: 'none' });
  });
  it('refuses a newly displayed nonready form after background refresh without fetching or losing the draft', async () => {
    await draft(); harness.loadedDisplay = { ...syntheticDetail(), createCommentStatus: 'invalid-form' };
    await all(render()).find(e => e.type === CommentComposer)!.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '评论表单校验失败，请刷新后重试', icon: 'none' });
    expect(all(render()).find(e => e.type === CommentComposer)!.props.value).toBe('synthetic reply');
  });
  it('uses the original cached entry request once and sends directly before its success-only latest refresh', async () => {
    const input = await draft();
    expect(harness.requestFresh).not.toHaveBeenCalled();
    expect(harness.request).toHaveBeenCalledExactlyOnceWith({ tid: '1', page: undefined, replyId: undefined });
    vi.mocked(createNewComment).mockImplementationOnce(async () => {
      expect(getTopicDetail).not.toHaveBeenCalled();
      return { moderated: false };
    });
    await input.props.onSend();
    expect(createNewComment).toHaveBeenCalledWith({ tid: '1', _xsrf: 'fixture', content: 'synthetic reply' });
    expect(getTopicDetail).toHaveBeenCalledExactlyOnceWith({ tid: '1', latest: true }, { cache: false });
  });
});

describe('entered-page comment capability and async submission guards', () => {
  function composer() { return all(render()).find(node => node.type === CommentComposer)!; }
  function draft() {
    all(render()).find(node => node.props.className === 'left' && node.props.onClick)!.props.onClick();
    composer().props.onChange('synthetic guarded draft');
    return composer();
  }
  function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
  function subscribe() {
    const effect = harness.effects.find(callback => callback.toString().includes('subscribeCurrentAccount'))!;
    return effect();
  }
  const ready = { tid: '1', createCommentXSRF: 'synthetic-canonical-xsrf', createCommentStatus: 'ready' };
  it.each([
    ['form-unavailable', '未读取到评论表单，请刷新帖子后重试'],
    ['invalid-form', '评论表单校验失败，请刷新后重试'],
    ['login-required', '登录状态已失效，请重新登录后重试'],
  ])('fails closed for %s even when a malformed response carries a token, preserving all draft attachments', async (status, title) => {
    harness.status = status; await enter(); vi.mocked(getTopicDetail).mockClear();
    let input = draft(); input.props.onAttachmentsChange([stickerAttachment(STICKERS[0])]); input = composer();
    await input.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled(); expect(Taro.showToast).toHaveBeenCalledWith({ title, icon: 'none' });
    expect(composer().props.value).toBe('synthetic guarded draft'); expect(composer().props.stickers).toEqual([STICKERS[0]]);
    expect(harness.detailWrites).not.toHaveBeenCalled(); expect(openLoginModal).not.toHaveBeenCalled();
  });
  it('preserves historical page and reply entry parameters and submits its matching loaded form directly', async () => {
    harness.params = { tid: '1', p: '4', replyId: '999' };
    await enter();
    expect(getTopicDetail).toHaveBeenCalledExactlyOnceWith({ tid: '1', page: '4', replyId: '999' });
    vi.mocked(getTopicDetail).mockClear();
    const gate = deferred(); vi.mocked(createNewComment).mockReturnValueOnce(gate.promise);
    const input = draft(); const pending = input.props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled(); expect(harness.detailWrites).not.toHaveBeenCalled();
    expect(createNewComment).toHaveBeenCalledWith({ tid: '1', _xsrf: 'fixture', content: 'synthetic guarded draft' });
    gate.resolve({ moderated: false }); await pending;
  });
  it('holds a synchronous direct POST lock before React rerenders without any preflight GET', async () => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    const post = deferred(); vi.mocked(createNewComment).mockReturnValueOnce(post.promise);
    const input = draft(); const first = input.props.onSend(); await input.props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled(); expect(createNewComment).toHaveBeenCalledTimes(1);
    post.resolve({ moderated: false }); await first;
  });
  it.each(['hide', 'unmount', 'route', 'account', 'aba'])('never registers a late entry form after %s or posts it', async kind => {
    const form = deferred(); vi.mocked(getTopicDetail).mockReturnValueOnce(form.promise);
    const input = draft(); const cleanup = subscribe();
    const pending = enter();
    if (kind === 'hide') harness.hide();
    if (kind === 'unmount') cleanup();
    if (kind === 'route') { harness.params = { tid: '1', p: '9' }; render(); }
    if (kind === 'account' || kind === 'aba') {
      harness.account = harness.username = 'other'; harness.accountListeners.forEach(listener => listener('changed'));
      if (kind === 'aba') { harness.account = harness.username = 'tester'; harness.accountListeners.forEach(listener => listener('changed')); }
    }
    form.resolve({ ...syntheticDetail(), ...ready }); await pending;
    vi.mocked(getTopicDetail).mockClear();
    if (kind === 'hide') {
      const page = harness.refs.find(ref => ref.current && typeof ref.current === 'object' && 'generation' in ref.current && 'visible' in ref.current)!.current;
      page.visible = true;
    }
    await input.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(composer().props.value).toBe('synthetic guarded draft'); expect(harness.detailWrites).not.toHaveBeenCalled();
  });
  it('requires explicit reopen after an account switch and retains existing text on confirmation', async () => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    const input = draft(); subscribe(); harness.account = harness.username = 'other'; harness.accountListeners.forEach(listener => listener('changed'));
    await input.props.onSend(); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '账号已切换，请重新打开评论框确认', icon: 'none' });
    composer().props.onClose(); all(render()).find(node => node.props.className === 'left' && node.props.onClick)!.props.onClick();
    expect(composer().props.value).toBe('synthetic guarded draft');
    await composer().props.onSend(); expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
    await enter(); vi.mocked(getTopicDetail).mockClear();
    await composer().props.onSend(); expect(createNewComment).toHaveBeenCalledTimes(1);
  });
  it.each(['hide', 'account', 'aba', 'route', 'unmount'])('late POST success after %s cannot clear existing draft or refresh another scope', async kind => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    const post = deferred(); vi.mocked(createNewComment).mockReturnValueOnce(post.promise);
    const input = draft(); const cleanup = subscribe(); const pending = input.props.onSend();
    expect(createNewComment).toHaveBeenCalledTimes(1);
    if (kind === 'hide') harness.hide();
    if (kind === 'unmount') cleanup();
    if (kind === 'route') { harness.params = { tid: '1', p: '9' }; render(); }
    if (kind === 'account' || kind === 'aba') {
      harness.account = 'other'; harness.accountListeners.forEach(listener => listener('changed'));
      if (kind === 'aba') { harness.account = 'tester'; harness.accountListeners.forEach(listener => listener('changed')); }
    }
    post.resolve({ moderated: false }); await pending;
    expect(composer().props.value).toBe('synthetic guarded draft'); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(harness.detailWrites).not.toHaveBeenCalled();
  });
  it('typed login failure remains explicit even if the client synchronously signs out the current account', async () => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    const input = draft(); subscribe(); vi.mocked(createNewComment).mockImplementationOnce(async () => {
      harness.account = ''; harness.accountListeners.forEach(listener => listener('signed-out')); throw new LoginRequiredError();
    });
    await input.props.onSend(); expect(createNewComment).toHaveBeenCalledTimes(1); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '登录状态已失效，请重新登录后重试', icon: 'none' });
    expect(composer().props.value).toBe('synthetic guarded draft'); expect(openLoginModal).not.toHaveBeenCalled();
  });
  it('does not certify an already rendered cached token before entry promise completion', async () => {
    const input = draft(); await input.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '暂时无法评论，请刷新后重试', icon: 'none' });
  });
  it('rejects a background response for a different topic despite an existing page owner', async () => {
    await enter(); vi.mocked(getTopicDetail).mockClear();
    const input = draft(); harness.loadedDisplay = { ...syntheticDetail(), tid: '2' };
    await composer().props.onSend();
    expect(createNewComment).not.toHaveBeenCalled(); expect(getTopicDetail).not.toHaveBeenCalled();
    expect(composer().props.value).toBe(input.props.value);
  });
  it('does not treat an old cached token as current anonymous login identity', () => {
    harness.username = harness.account = ''; expect(harness.xsrf).toBeTruthy();
    all(render()).find(node => node.props.className === 'left' && node.props.onClick)!.props.onClick();
    expect(openLoginModal).toHaveBeenCalledTimes(1); expect(composer()).toBeUndefined();
  });
});

describe("topic detail native text and explicit composer actions", () => {
  it.each(['light', 'dark'] as const)('uses the current %s canvas for both worklet scroll states and JS navbar fallback', theme => {
    harness.theme = theme;
    const page: any = { renderer: 'skyline', applyAnimatedStyle: vi.fn() };
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page } as any);
    const nodes = all(render());
    const navbar = nodes.find(node => node.type === 'Navbar')!;
    const rgb = theme === 'dark' ? '0, 0, 0' : '244, 245, 250';
    expect(navbar.props.backgroundRGB).toBe(rgb);
    vi.mocked(useReady).mock.calls[0][0]();
    const animated = page.applyAnimatedStyle.mock.calls[0][1];
    for (const progress of [0, 0.2, 1]) {
      page._scrollProgress.value = progress;
      expect(animated().backgroundColor).toBe(`rgba(${rgb}, ${progress * 0.85})`);
      expect(animated().backdropFilter).toBe(`blur(${progress * 20}px)`);
    }
    const themeEffect = harness.effects.find(effect => effect.toString().includes('updateNavbarTheme'))!;
    themeEffect(); harness.theme = theme === 'dark' ? 'light' : 'dark'; harness.themeListeners[0]();
    expect(animated().backgroundColor).toBe(`rgba(${theme === 'dark' ? '244, 245, 250' : '0, 0, 0'}, 0.85)`);
  });
  it("does not register Skyline animated styles on a WebView page even if worklet APIs exist", () => {
    harness.skyline = false;
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    const page = { renderer: "webview", applyAnimatedStyle: vi.fn() };
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page } as any);
    render();
    vi.mocked(useReady).mock.calls[0][0]();
    expect(page.applyAnimatedStyle).not.toHaveBeenCalled();
    expect((Taro as any).worklet.shared).not.toHaveBeenCalled();
  });
  it("keeps the JS style fallback when a native page lacks applyAnimatedStyle", () => {
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({ page: { renderer: "skyline" } } as any);
    render();
    expect(() => vi.mocked(useReady).mock.calls[0][0]()).not.toThrow();
    expect((Taro as any).worklet.shared).not.toHaveBeenCalled();
  });
  it("passes main post and comment bodies separately to the shared renderer", () => {
    const bodies = all(render()).filter(e => e.type === "HtmlRender");
    expect(bodies.map(e => e.props.html)).toEqual(["内容", "回复内容"]);
  });
  it("does not mount or focus the composer while browsing", () => {
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
  });
  it("opens the composer only after the explicit bottom comment entry", () => {
    const tree = render();
    all(tree).find(e => e.props?.className === "left" && e.props?.onClick)!.props.onClick({ content: "touch-event" });
    const composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.value).toBe("");
    composer.props.onClose();
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
  });
  it("does not focus when tapping existing reply content; the explicit reply action supplies a mention", () => {
    find(render(), "comment-content").onClick();
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
    vi.mocked(Taro.showActionSheet).mock.calls[0][0].success!({ tapIndex: 0 } as any);
    expect(all(render()).find(e => e.type === CommentComposer)!.props.value).toBe("@recipient ");
  });
  it("keeps all detail labels and metadata on native Text nodes", () => {
    for (const element of all(render()).filter(e => e.type === "View")) {
      expect([element.props?.children].flat(Infinity).some(c => typeof c === "number" || typeof c === "string" && c.trim()), element.props.className).toBe(false);
    }
    expect(find(render(), "titleText").maxLines).toBe(3);
    harness.skyline = false;
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(find(render(), "titleText").maxLines).toBeUndefined();
  });
});
