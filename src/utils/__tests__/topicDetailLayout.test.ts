import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro, { useReady } from "@tarojs/taro";
import { CommentSubmissionError, createNewComment, getTopicDetail } from "guanggu-forum-api";
import { openLoginModal } from "../auth";
import TopicDetail from "../../pages/topicDetail";
import CommentComposer from "../../pages/topicDetail/CommentComposer";
import { STICKERS } from "../stickers";
import { recordCommentEmojiUsage } from "../emojiUsage";

const harness = vi.hoisted(() => ({
  state: [] as any[], cursor: 0, xsrf: "fixture", username: "", checkingLogin: false, loginError: false, retryLogin: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<any>(),
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => { harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next; }];
  },
  useRef: (value: any) => ({ current: value }),
  useEffect: vi.fn(),
}));
vi.mock("@tarojs/components", () => Object.fromEntries(["Button", "Image", "ScrollView", "ShareElement", "Text", "View"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({
  default: { showActionSheet: vi.fn(), showToast: vi.fn(), showLoading: vi.fn(), hideLoading: vi.fn(), navigateTo: vi.fn(), getCurrentInstance: vi.fn(() => ({})), nextTick: vi.fn((callback: () => void) => callback()), worklet: { shared: vi.fn((value: number) => ({ value })) } },
  useRouter: () => ({ path: "/pages/topicDetail/index", params: { tid: "1" } }),
  useReady: vi.fn(), useDidShow: vi.fn(), useShareAppMessage: vi.fn(), useShareTimeline: vi.fn(),
}));
vi.mock("guanggu-forum-api", () => ({ CommentSubmissionError: class extends Error {}, getTopicDetail: vi.fn(), commentUpvote: vi.fn(), createNewComment: vi.fn(), URLS: {}, urlPathVaiable: vi.fn() }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../../hooks/useDataWithCache", () => ({
  useDataWithCache: () => ({
    request: vi.fn(), setData: vi.fn(),
    data: { title: "帖子", author: "tester", content: "内容", commentTotalCount: "1 回复", createCommentXSRF: harness.xsrf, relatingTopics: [], comments: [
      { id: "r1", floor: "#1", author: "recipient", content: "回复内容", replyMetas: [], upVoteCount: "0赞", upVoteUrl: "/replyVote?reply_id=1" },
    ] },
  }),
}));
vi.mock("../../hooks/useCurrentUsername", () => ({
  useCurrentUsername: () => ({ username: harness.username, loading: harness.checkingLogin, error: harness.loginError, retry: harness.retryLogin }),
}));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn() }, CacheCategory: {} }));
vi.mock("../emojiUsage", () => ({ recordCommentEmojiUsage: vi.fn() }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/Tag", () => ({ default: "Tag" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide" }));
vi.mock("../../components/AdBanner", () => ({ default: "AdBanner" }));
vi.mock("../../pages/topicDetail/relatingTopics", () => ({ default: "RelatingTopics" }));
vi.mock("../dimension", () => ({ rpxToPx: (rpx: number) => rpx / 2 }));

function all(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(all);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...all(tree.props?.children)];
}
function render() { harness.cursor = 0; return TopicDetail(); }
function find(tree: any, className: string) { return all(tree).find(e => e.props?.className === className)!.props; }
beforeEach(() => {
  harness.state = []; harness.xsrf = "fixture"; harness.username = ""; harness.checkingLogin = false; harness.loginError = false;
  vi.clearAllMocks(); vi.mocked(Taro.getCurrentInstance).mockReturnValue({});
  vi.mocked(createNewComment).mockResolvedValue(undefined);
  vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
});
afterEach(() => vi.unstubAllGlobals());

describe("topic detail restored account and reply capability", () => {
  function entry() { return all(render()).find(e => e.props?.className === "left" && e.props?.onClick)!; }
  function draft() {
    entry().props.onClick();
    all(render()).find(e => e.type === CommentComposer)!.props.onChange("synthetic reply");
    return all(render()).find(e => e.type === CommentComposer)!;
  }

  it('retains selected photos when closing and does not silently send local paths', async () => {
    let composer = draft();
    composer.props.onPhotosChange(['/tmp/photo.jpg']);
    composer.props.onClose();
    entry().props.onClick();
    composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props.photos).toEqual(['/tmp/photo.jpg']);
    await composer.props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: '图片上传开发中，请先移除照片后发送', icon: 'none' });
    expect(all(render()).find(e => e.type === CommentComposer)!.props.photos).toEqual(['/tmp/photo.jpg']);
  });
  it('defensively caps the combined number of photos and stickers at five', () => {
    let composer = draft();
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
    expect(recordCommentEmojiUsage).toHaveBeenCalledOnce();
    expect(recordCommentEmojiUsage).toHaveBeenCalledWith('', [STICKERS[0], STICKERS[1]]);
    entry().props.onClick();
    expect(all(render()).find(e => e.type === CommentComposer)!.props.stickers).toEqual([]);
  });
  it("shows a server rejection and keeps both text and stickers for retry", async () => {
    let composer = draft();
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
    harness.xsrf = ""; harness.username = "restored-user";
    expect(entry().props.children.props.children).toBe("说点什么...");
    entry().props.onClick();
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(true);
    expect(openLoginModal).not.toHaveBeenCalled();
  });

  it("waits for old-session identity recovery and exposes retry without navigating to login", () => {
    harness.xsrf = ""; harness.checkingLogin = true;
    expect(entry().props.children.props.children).toBe("正在确认登录状态...");
    entry().props.onClick();
    expect(openLoginModal).not.toHaveBeenCalled();
    harness.checkingLogin = false; harness.loginError = true;
    expect(entry().props.children.props.children).toBe("登录状态确认失败，点击重试");
    entry().props.onClick();
    expect(harness.retryLogin).toHaveBeenCalledTimes(1);
    expect(openLoginModal).not.toHaveBeenCalled();
    harness.loginError = false; harness.username = "restored-user";
    expect(entry().props.children.props.children).toBe("说点什么...");
  });

  it("only prompts login for a resolved anonymous account without a reply form", () => {
    harness.xsrf = "";
    expect(entry().props.children.props.children).toBe("请登录后再评论");
    entry().props.onClick();
    expect(openLoginModal).toHaveBeenCalledTimes(1);
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
  });

  it("obtains an uncached form token before posting for a restored account", async () => {
    harness.xsrf = ""; harness.username = "restored-user";
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ createCommentXSRF: "synthetic-fresh-xsrf" } as any);
    await draft().props.onSend();
    expect(getTopicDetail).toHaveBeenCalledWith({ tid: "1", page: undefined, replyId: undefined }, { cache: false });
    expect(createNewComment).toHaveBeenCalledWith({ tid: "1", _xsrf: "synthetic-fresh-xsrf", content: "synthetic reply" });
    expect(all(render()).some(e => e.type === CommentComposer)).toBe(false);
    expect(Taro.hideLoading).toHaveBeenCalled();
  });

  it("keeps an unavailable reply form separate from login and preserves the draft for retry", async () => {
    harness.xsrf = ""; harness.username = "restored-user";
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ createCommentXSRF: "" } as any);
    await draft().props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(Taro.showToast).toHaveBeenCalledWith({ title: "暂时无法评论，请刷新后重试", icon: "none" });
    const composer = all(render()).find(e => e.type === CommentComposer)!;
    expect(composer.props).toMatchObject({ value: "synthetic reply", sending: false });
    vi.mocked(getTopicDetail).mockResolvedValueOnce({ createCommentXSRF: "synthetic-retry-xsrf" } as any);
    await composer.props.onSend();
    expect(createNewComment).toHaveBeenCalledWith(expect.objectContaining({ _xsrf: "synthetic-retry-xsrf" }));
  });

  it("preserves the draft and avoids a blank-token POST when checking the form fails", async () => {
    harness.xsrf = ""; harness.username = "restored-user";
    vi.mocked(getTopicDetail).mockRejectedValueOnce(new Error("synthetic offline"));
    await draft().props.onSend();
    expect(createNewComment).not.toHaveBeenCalled();
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(all(render()).find(e => e.type === CommentComposer)!.props).toMatchObject({ value: "synthetic reply", sending: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: "评论发送失败，请重试", icon: "none" });
  });

  it("preserves the draft when an authenticated comment POST fails", async () => {
    vi.mocked(createNewComment).mockRejectedValueOnce(new Error("synthetic offline"));
    await draft().props.onSend();
    expect(all(render()).find(e => e.type === CommentComposer)!.props).toMatchObject({ value: "synthetic reply", sending: false });
    expect(Taro.showToast).toHaveBeenCalledWith({ title: "评论发送失败，请重试", icon: "none" });
  });

  it("uses a supplied form token without an extra detail request", async () => {
    await draft().props.onSend();
    expect(getTopicDetail).not.toHaveBeenCalled();
    expect(createNewComment).toHaveBeenCalledWith({ tid: "1", _xsrf: "fixture", content: "synthetic reply" });
  });
});

describe("topic detail native text and explicit composer actions", () => {
  it("does not register Skyline animated styles on a WebView page even if worklet APIs exist", () => {
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
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    expect(find(render(), "titleText").maxLines).toBeUndefined();
  });
});
