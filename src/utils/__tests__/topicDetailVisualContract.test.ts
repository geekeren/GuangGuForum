import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from 'node:module';
import Taro from "@tarojs/taro";
import TopicDetail from "../../pages/topicDetail";
import CommentComposer from "../../pages/topicDetail/CommentComposer";

const requireProject = createRequire(`${process.cwd()}/package.json`);
function declarations(file: string, selector: string) {
  const result: Record<string, string> = {};
  const css = requireProject('sass').compile(file).css;
  requireProject('postcss').parse(css).walkRules((rule: any) => {
    if (rule.selectors.includes(selector)) rule.walkDecls((decl: any) => { result[decl.prop] = decl.value; });
  });
  return result;
}

const harness = vi.hoisted(() => ({ state: [] as any[], cleanups: [] as any[], cursor: 0, skyline: true, platform: 'windows', sortAsc: false, level: undefined as string | undefined, wide: false, ready: true, pullDown: {} as any, relatedTopics: [] as any[] }));
vi.mock('../../pages/topicDetail/useRelatedTopicsRail', () => ({ useRelatedTopicsRail: () => ({ rootId: 'owned-root', viewportId: 'owned-scroll', ready: harness.ready, wide: harness.wide, flowStyle: harness.wide ? { width: 'calc(100% - 356px)' } : undefined, railStyle: harness.wide ? { left: '906px', top: '88px', width: '336px', height: '624px' } : undefined }) }));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => { harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next; }];
  },
  useRef: (value: any) => ({ current: value === null ? harness.pullDown : value }),
  useEffect: (effect: any) => { if (effect.toString().includes('subscribeCommentSort')) harness.cleanups.push(effect()); },
}));
vi.mock("@tarojs/components", () => Object.fromEntries(["Button", "Image", "ScrollView", "ShareElement", "Text", "View"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({
  default: { showActionSheet: vi.fn(), showToast: vi.fn(), navigateTo: vi.fn(), getDeviceInfo: () => ({ platform: harness.platform }), getCurrentInstance: vi.fn(() => ({})), nextTick: vi.fn() },
  useRouter: () => ({ path: "/pages/topicDetail/index", params: { tid: "1" } }),
  useReady: vi.fn(), useDidShow: vi.fn(), useDidHide: vi.fn(), useResize: vi.fn(), useShareAppMessage: vi.fn(), useShareTimeline: vi.fn(),
}));
vi.mock("guanggu-forum-api", () => ({
  getTopicDetail: vi.fn(), commentUpvote: vi.fn(), createNewComment: vi.fn(), URLS: {},
  urlPathVaiable: () => () => ({ params: { node: "tech" } }),
}));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../renderer", () => ({ isSkyline: () => harness.skyline, getScrollViewType: () => 'custom' }));
vi.mock("../../hooks/useDataWithCache", () => ({
  useDataWithCache: () => ({
    request: vi.fn(), setData: vi.fn(),
    data: {
      title: "真实标题", author: "MixedCaseAuthor", authorLevel: harness.level, content: "<p>正文</p><pre>one\n  two</pre>", category: "IT 技术", categoryLink: "/node/tech",
      createTime: "5 天前", viewCount: "9 次浏览", upVoteCount: "19 赞", favoriteCount: "2 收藏",
      commentTotalCount: "12 回复 | 昨天最后回复", createCommentXSRF: "fixture", relatingTopics: harness.relatedTopics,
      comments: Array.from({ length: 12 }, (_, index) => ({
        id: `r${index + 1}`, floor: `#${index + 1}`, author: `Author${index + 1}`, authorLevel: harness.level, content: `<p>回复 ${index + 1}</p>`,
        replyMetas: ["5 天前"], upVoteCount: "0 赞", upVoteUrl: `/replyVote?reply_id=${index + 1}`,
      })),
    },
  }),
}));
vi.mock("../CacheService", () => ({ cacheService: { get: () => harness.sortAsc, set: (_key: string, value: boolean) => { harness.sortAsc = value; return true; } }, CacheCategory: { Other: "other" } }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../../assets/wechat.svg", () => ({ default: '/synthetic-wechat.svg' }));
vi.mock("../../pages/topicDetail/CommentComposer", () => ({ default: 'CommentComposer' }));
vi.mock("../../components/UserAvatar", () => ({ default: 'UserAvatar' }));
vi.mock("../../components/ThemedIcon", () => ({ default: 'ThemedIcon' }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/TopicTag", () => ({ default: "TopicTag" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide" }));
vi.mock("../../components/AdBanner", () => ({ default: "AdBanner" }));
// Render the real related list with inert native/avatar components, not a mount sentinel.
vi.mock('../../hooks/usePageRenderer', () => ({ usePageScrollViewType: () => harness.skyline ? 'custom' : undefined }));
vi.mock("../dimension", () => ({ rpxToPx: (rpx: number) => rpx / 2 }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function render() { harness.cursor = 0; return TopicDetail(); }
function find(tree: any, className: string) { return elements(tree).find(e => e.props?.className?.split(" ").includes(className))!; }
const styles = () => readFileSync("src/pages/topicDetail/index.scss", "utf8");
beforeEach(() => { harness.state = []; harness.skyline = true; harness.platform = 'windows'; harness.relatedTopics = []; harness.sortAsc = false; harness.level = undefined; harness.wide = false; harness.ready = true; harness.pullDown = { onTouchStart: vi.fn(), onTouchMove: vi.fn(), onTouchEnd: vi.fn(), onScroll: vi.fn() }; vi.clearAllMocks(); vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]); });
afterEach(() => { harness.cleanups.forEach(cleanup => cleanup?.()); harness.cleanups = []; vi.unstubAllGlobals(); });

describe('desktop page-local dimensions without changing mobile rules', () => {
  it('uses bounded desktop card, author and comment geometry at every desktop width', () => {
    const file = 'src/pages/topicDetail/index.scss';
    const pc = (suffix: string) => declarations(file, `.themePageHost--desktop .topicDetail ${suffix}`);
    expect(pc('.scrollViewContainer')).toMatchObject({ height: '0', 'flex-basis': '0', 'flex-grow': '1', 'flex-shrink': '1' });
    expect(pc('.main')).toMatchObject({ margin: '6PX 8PX 0', padding: '10PX 12PX 8PX', 'border-radius': '13PX' });
    expect(pc('.main .header .metaRow .authorInfo .avatar .userAvatar')).toMatchObject({ width: '28PX', height: '28PX' });
    expect(pc('.section .header .sortBtn')).toMatchObject({ width: '24PX', height: '24PX', 'border-radius': '12PX' });
    expect(pc('.section .header .sortBtn .sortIcon')).toMatchObject({ width: '14PX', height: '14PX' });
    expect(pc('.comments .comment-item .comment-author-avatar .userAvatar')).toMatchObject({ width: '27PX', height: '27PX' });
    expect(pc('.actions')).toMatchObject({ 'min-height': '56PX', height: 'calc(44PX + env(safe-area-inset-bottom))', padding: '6PX 11PX max(6PX, env(safe-area-inset-bottom))', 'flex-shrink': '0' });
    expect(pc('.actions .right .share')).toMatchObject({ padding: '5PX 11PX 5PX 8PX', 'border-radius': '16PX' });
    expect(pc('.actions .right .share .icon')).toMatchObject({ width: '16PX', height: '16PX' });
    expect(declarations(file, '.topicDetail .main')).toMatchObject({ margin: '12rpx 16rpx 0', padding: '20rpx 24rpx 16rpx', 'border-radius': '26rpx' });
  });
  it('bounds the standalone comment sheet and shared children only inside the desktop sheet', () => {
    const file = 'src/pages/topicDetail/index.scss';
    const pc = (suffix: string) => declarations(file, `.themePageHost--desktop .commentPopup ${suffix}`);
    expect(pc('.commentPopupBody')).toMatchObject({ padding: '12PX', 'border-radius': '12PX 12PX 0 0' });
    expect(pc('.commentPopupTool')).toMatchObject({ width: '38PX', height: '38PX', 'border-radius': '10PX' });
    expect(pc('.commentPopupToolIcon')).toMatchObject({ width: '23PX', height: '23PX' });
    expect(pc('.commentStickerPreview')).toMatchObject({ width: '72PX', height: '72PX', padding: '6PX' });
    expect(pc('.commentStickerPreviewImage')).toMatchObject({ width: '60PX', height: '60PX' });
    expect(pc('.composerEmojiStickerImage')).toMatchObject({ width: '56PX', height: '56PX' });
    expect(pc('.mentionCandidate')).toMatchObject({ width: '60PX', padding: '2PX 4PX' });
    expect(declarations(file, '.commentPopup .commentPopupTool')).toMatchObject({ width: '76rpx', height: '76rpx' });
  });
});

describe('related topics remain available on mobile and desktop', () => {
  it.each(['ios', 'android', 'devtools'])('renders supplied related topics at the end of the normal inline flow on %s', platform => {
    harness.platform = platform;
    harness.relatedTopics = Array.from({ length: 3 }, (_, index) => ({ title: `synthetic related ${index}`, link: `/t/${index + 1}`, authorLink: '/member/synthetic', authorAvatarUrl: '' }));
    harness.state[1] = true;
    harness.state[3] = 'synthetic unsent draft';
    for (const skyline of [true, false]) {
      // The real rail hook is synchronously ready/inline on all non-PC clients.
      harness.skyline = skyline; harness.wide = false; harness.ready = true;
      const tree = render(), flow = find(tree, 'topicDetailFlow'), section = find(tree, 'relatingTopics');
      const related = elements(tree).filter(node => node.type?.name === 'RelatingTopics');
      expect(related).toHaveLength(1);
      expect(related[0].props).toMatchObject({ floating: false, topicDetail: { relatingTopics: harness.relatedTopics } });
      expect(flow.props.className).toBe('topicDetailFlow'); expect(flow.props.style).toBeUndefined();
      expect(flow.props.children[flow.props.children.length - 1]).toBe(section);
      expect(section.props.className).toBe('relatingTopics section'); expect(section.props.style).toBeUndefined();
      expect(section.props.children[1]).toBe(related[0]);
      const list = related[0].type(related[0].props);
      expect(list.type).toBe('View'); expect(list.props.scrollY).toBeUndefined(); expect(list.props.type).toBeUndefined();
      expect(list.props.enhanced).toBeUndefined(); expect(list.props.showScrollbar).toBeUndefined();
      expect(list.props.children).toHaveLength(3);
      expect(list.props.children.map((row: any) => row.props.children[1].props.children)).toEqual(harness.relatedTopics.map(topic => topic.title));
      expect(find(tree, 'topicDetailGeometryOverlay').props.className).toBe('topicDetailGeometryOverlay');
      expect(find(tree, 'scrollContent').props.scrollY).toBe(true);
      expect(elements(find(tree, 'main')).find(node => node.type === 'HtmlRender').props.html).toBe('<p>正文</p><pre>one\n  two</pre>');
      expect(elements(find(tree, 'comments')).filter(node => node.type === 'HtmlRender')).toHaveLength(12);
      expect(find(tree, 'scrollContent').props.children).toBe(flow);
      expect(elements(tree).find(node => node.type === 'CommentComposer').key).toBeNull();
      expect(harness.state[3]).toBe('synthetic unsent draft');
      expect(Taro.navigateTo).not.toHaveBeenCalled();
    }
  });
  it('keeps inline related content content-sized and free of pending/floating hiding rules', () => {
    const css = declarations('src/pages/topicDetail/relatingTopics/index.module.scss', '.content');
    expect(css).toMatchObject({ width: '100%', height: 'auto' });
    expect(css.visibility).toBeUndefined(); expect(css.display).not.toBe('none');
    const flow = declarations('src/pages/topicDetail/index.scss', '.topicDetail .topicDetailFlow');
    expect(flow).toMatchObject({ display: 'flex', 'flex-direction': 'column', 'flex-shrink': '0' });
    const section = declarations('src/pages/topicDetail/index.scss', '.topicDetail .relatingTopics');
    expect(section.visibility).toBeUndefined(); expect(section.height).toBeUndefined(); expect(section.position).toBeUndefined();
  });
  it.each(['windows', 'mac'])('retains one related instance in both inline and floating desktop layouts on %s', platform => {
    harness.platform = platform;
    for (const wide of [false, true]) {
      harness.wide = wide;
      const tree = render(), related = elements(tree).filter(node => node.type?.name === 'RelatingTopics');
      expect(related).toHaveLength(1); expect(related[0].props.floating).toBe(wide);
      expect(find(tree, 'relatingTopics').props.style).toEqual(wide ? { left: '906px', top: '88px', width: '336px', height: '624px' } : undefined);
    }
  });
});

describe('measurable first-paint geometry gate', () => {
  it.each(['skyline', 'webview'])('keeps body, media, related, composer and overlay at the same keys across pending/settled/resize on %s', renderer => {
    harness.skyline = renderer === 'skyline';
    harness.state[1] = true; harness.state[3] = 'synthetic unsent draft';
    const phases = [{ ready: false, wide: false }, { ready: true, wide: true }, { ready: false, wide: false }, { ready: true, wide: false }];
    const trees = phases.map(phase => {
      harness.ready = phase.ready; harness.wide = phase.wide;
      const tree = render();
      expect(find(tree, 'topicDetailFlow').props.className.includes('topicDetailFlow--pending')).toBe(!phase.ready);
      const overlay = find(tree, 'topicDetailGeometryOverlay');
      expect(overlay.props.className.includes('topicDetailGeometryOverlay--pending')).toBe(!phase.ready);
      expect(!!overlay.props.children).toBe(!phase.ready);
      expect(find(tree, 'scrollContent').props.scrollY).toBe(true);
      const body = elements(find(tree, 'main')).find(node => node.type === 'HtmlRender');
      expect(body.props.imageLayoutKey).toBe(phase.wide);
      expect(body.props.html).toBe('<p>正文</p><pre>one\n  two</pre>');
      expect(harness.state[3]).toBe('synthetic unsent draft');
      return tree;
    });
    for (const className of ['topicDetail', 'topicDetailFlow', 'main', 'relatingTopics', 'topicDetailGeometryOverlay']) {
      const first = find(trees[0], className);
      trees.forEach(tree => { const node = find(tree, className); expect(node.type).toBe(first.type); expect(node.key).toBe(first.key); });
    }
    trees.forEach(tree => {
      const children = find(tree, 'scrollViewContainer').props.children;
      expect(children.map((node: any) => node.type)).toEqual(['ScrollView', 'View']);
      expect(elements(tree).filter(node => node.type?.name === 'RelatingTopics')).toHaveLength(1);
      const composer = elements(tree).find(node => node.type === 'CommentComposer');
      expect(composer.key).toBeNull();
    });
  });
  it('suppresses pending scroll/gesture forwarding and refresh without disabling settled behavior', () => {
    harness.ready = false;
    let tree = render(); const before = [...harness.state]; const event = { detail: { scrollTop: 100 }, stopPropagation: vi.fn() };
    const scroll = find(tree, 'scrollContent');
    for (const handler of ['onTouchStart', 'onTouchMove', 'onTouchEnd', 'onScroll']) scroll.props[handler](event);
    const overlay = find(tree, 'topicDetailGeometryOverlay');
    for (const handler of ['onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd']) overlay.props[handler](event);
    find(tree, 'scrollViewContainer').props.onRefresh();
    expect(event.stopPropagation).toHaveBeenCalledTimes(8);
    Object.values(harness.pullDown).forEach(fn => expect(fn).not.toHaveBeenCalled());
    expect(harness.state).toEqual(before);
    harness.ready = true; tree = render(); const readyScroll = find(tree, 'scrollContent');
    for (const handler of ['onTouchStart', 'onTouchMove', 'onTouchEnd', 'onScroll']) readyScroll.props[handler](event);
    Object.values(harness.pullDown).forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
  });
  it('uses a non-sizing overlay over the remaining viewport and explicitly hides fixed related descendants without display none', () => {
    const file = 'src/pages/topicDetail/index.scss';
    expect(declarations(file, '.topicDetail .scrollViewContainer')).toMatchObject({ position: 'relative' });
    for (const selector of ['.topicDetail .topicDetailFlow--pending', '.topicDetail .topicDetailFlow--pending .relatingTopics']) {
      const values = declarations(file, selector); expect(values).toMatchObject({ visibility: 'hidden', 'pointer-events': 'none' }); expect(values.display).toBeUndefined();
    }
    const overlay = declarations(file, '.topicDetail .topicDetailGeometryOverlay');
    expect(overlay).toMatchObject({ position: 'absolute', top: '0', right: '0', bottom: '0', left: '0', visibility: 'hidden', 'pointer-events': 'none' });
    expect(overlay.height).toBeUndefined(); expect(overlay.margin).toBeUndefined(); expect(overlay.padding).toBeUndefined();
    expect(declarations(file, '.topicDetail .topicDetailGeometryOverlay--pending')).toMatchObject({ visibility: 'visible', 'pointer-events': 'auto' });
  });
});

describe("compact topic detail reference contracts", () => {
  it("uses local rounded cards and smaller author rows without altering shared HTML semantics", () => {
    const css = styles();
    expect(css).toContain("background: var(--theme-bg, #f4f5fa);");
    expect(css).not.toContain("background: linear-gradient(180deg, var(--theme-surface-soft");
    expect(readFileSync("src/pages/topicDetail/index.tsx", "utf8")).not.toContain("27, 34, 48");
    expect(css).toContain("margin: 12rpx 16rpx 0;");
    expect(css).toContain("padding: 20rpx 24rpx 16rpx;");
    expect(css).toContain("margin: 14rpx 16rpx 0;");
    expect(css).toContain("border-radius: 26rpx;");
    expect(css).toContain("width: 56rpx;");
    expect(css).toContain("padding: 16rpx 0 4rpx;");
    const sharedBody = readFileSync("src/components/HtmlRender/index.scss", "utf8").split(".htmlWrap--body {")[1];
    expect(sharedBody).toContain("line-height: 1.6;");
    expect(sharedBody).toContain("margin: 0 0 12rpx;");
    expect(css).toContain("margin: 0 0 8rpx;");
    expect(css).not.toContain("text-transform: capitalize;");
    // Mobile HTML typography remains owned by the shared renderer; desktop only bounds geometry.
    expect(css.split('// Fixed design-pixel geometry')[0]).not.toMatch(/\.h5-(?:pre|code)\s*\{/);
  });

  it.each(["skyline", "webview"])("registers the unique photo viewport on the post card, not the outer scroll area on %s", renderer => {
    harness.skyline = renderer === 'skyline';
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    const tree = render();
    const viewports = elements(tree).filter(node => node.props?.className?.split(' ').includes('topicBodyImageViewport'));
    expect(viewports).toHaveLength(1);
    expect(viewports[0]).toBe(find(tree, 'main'));
    expect(viewports[0].type).toBe('View');
    const scroll = find(tree, 'scrollContent');
    expect(scroll.type).toBe('ScrollView');
    expect(scroll.props.className).toBe('scrollContent');
    const photos = elements(viewports[0]).filter(node => node.type === 'HtmlRender');
    expect(photos).toHaveLength(1);
    expect(photos[0].props).toMatchObject({ variant: 'body', fullBleedImages: true });
    expect(elements(find(tree, 'comments')).filter(node => node.type === 'HtmlRender').every(node => !node.props.fullBleedImages)).toBe(true);
  });

  it.each(['skyline', 'webview'])('keeps the photo owner inside the resized body flow and the same one related section on %s', renderer => {
    harness.skyline = renderer === 'skyline';
    const trees: any[] = [];
    for (const wide of [false, true, false]) {
      harness.wide = wide;
      const tree = render(); trees.push(tree);
      const flow = find(tree, 'topicDetailFlow');
      expect(flow.props.style).toEqual(wide ? { width: 'calc(100% - 356px)' } : undefined);
      const main = find(tree, 'main');
      expect(elements(flow)).toContain(main);
      expect(main.props.className).toBe('main topicBodyImageViewport');
      const body = elements(main).find(node => node.type === 'HtmlRender')!;
      expect(body.props.imageLayoutKey).toBe(wide);
      expect(body.props.html).toBe('<p>正文</p><pre>one\n  two</pre>');
      expect(body.key).toBeNull(); expect(flow.key).toBeNull(); expect(main.key).toBeNull();
      const related = elements(flow).filter(node => node.type?.name === 'RelatingTopics');
      expect(related).toHaveLength(1);
      expect(related[0].props.floating).toBe(wide); expect(related[0].key).toBeNull();
      expect(find(tree, 'topicDetail').props.id).toBe('owned-root');
      expect(find(tree, 'scrollContent').props.id).toBe('owned-scroll');
      expect(elements(find(tree, 'comments')).filter(node => node.type === 'HtmlRender').every(node => node.props.imageLayoutKey === undefined)).toBe(true);
    }
    expect(find(trees[0], 'main').type).toBe(find(trees[1], 'main').type);
    expect(declarations('src/pages/topicDetail/index.scss', '.topicDetail .main')).toMatchObject({ width: 'auto', 'min-width': '0', 'align-self': 'stretch', 'box-sizing': 'border-box' });
    expect(declarations('src/pages/topicDetail/index.scss', '.themePageHost--desktop .topicDetail .relatingTopics--floating')).toMatchObject({ margin: '0' });
  });

  it.each(["skyline", "webview"])("keeps author, category and real footer values in compact rows on %s", (renderer) => {
    harness.skyline = renderer === 'skyline';
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    const tree = render();
    expect(find(tree, "author").props.children).toBe("MixedCaseAuthor");
    const category = elements(tree).find(e => e.type === "TopicTag")!;
    expect(category.props.label).toBe("IT 技术");
    expect(elements(tree).filter(e => e.type === "TopicTag")).toHaveLength(1);
    expect(find(tree, "topicCategoryLabel")).toBeUndefined();
    expect(find(tree, "author").props.maxLines).toBe(renderer === "skyline" ? 1 : undefined);
    expect(find(tree, "moreInfo").props.children.props.children).toBe("5 天前");
    const footerValues = elements(find(tree, "extra")).filter(e => e.type === "Text").map(e => e.props.children);
    expect(footerValues).toEqual(["9 次浏览", "19 赞", "2 收藏"]);
    category.props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/node/topicList/index?node=tech&nodeName=IT 技术" });
    for (const node of elements(tree).filter(e => e.type === "View")) {
      expect([node.props.children].flat(Infinity).some(child => typeof child === "string" || typeof child === "number")).toBe(false);
    }
  });

  it.each(["skyline", "webview"])("renders supplied levels separately with explicit spacing on %s", (renderer) => {
    harness.skyline = renderer === 'skyline';
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    expect(elements(render()).filter(e => e.props?.className === "authorLevel")).toHaveLength(0);
    harness.level = "Lv. 12";
    const tree = render();
    const authorRow = find(tree, "authorNameRow");
    expect(find(authorRow, "author").props.children).toBe("MixedCaseAuthor");
    expect(find(authorRow, "authorLevel").props.children).toBe("Lv. 12");
    const replyRow = find(tree, "commentAuthorNameRow");
    expect(find(replyRow, "comment-author").props.children).toBe("Author1");
    expect(find(replyRow, "authorLevel").props.children).toBe("Lv. 12");
    find(tree, "authorInfo").props.onClick();
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/user/index?username=MixedCaseAuthor" });
    const levelCss = styles().match(/\.authorLevel\s*\{([^}]+)\}/)![1];
    expect(levelCss).toContain("margin-left: 8rpx;");
    expect(levelCss).toContain("flex-shrink: 0;");
    expect(levelCss).not.toContain("gap:");
  });

  it("renders every supplied reply and keeps the original two-way ordering instead of a preview link", () => {
    let tree = render();
    let replies = elements(tree).filter(e => e.props?.className?.split(" ").includes("comment-item"));
    expect(replies).toHaveLength(12);
    expect(replies.map(e => e.props.id)).toEqual(Array.from({ length: 12 }, (_, index) => `reply-${index + 1}`));
    expect(find(tree, "comment-floor").props.children).toBe("#1");
    find(tree, "sortBtn").props.onClick();
    tree = render();
    replies = elements(tree).filter(e => e.props?.className?.split(" ").includes("comment-item"));
    expect(find(replies[0], "comment-floor").props.children).toBe("#12");
    const source = readFileSync("src/pages/topicDetail/index.tsx", "utf8");
    expect(source).not.toMatch(/查看全[部所有].*回复|最热|上海市|湖北省/);
    expect(elements(tree).filter(e => e.type === "HtmlRender").map(e => e.props.html)).toHaveLength(13);
    expect(elements(tree).find(e => e.type === "HtmlRender")?.props.html).toBe("<p>正文</p><pre>one\n  two</pre>");
  });

  it("tightens replies and related rows while retaining safe-area and explicit composer controls", () => {
    const css = styles();
    expect(css).toContain("padding: 14rpx 0;");
    expect(css).toContain("padding: 0 0 14rpx;");
    expect(css).toContain("margin: 6rpx 0 8rpx;");
    expect(css).toContain("width: 54rpx;");
    expect(css).toContain("height: calc(88rpx + env(safe-area-inset-bottom));");
    expect(css).toContain("padding: 12rpx 22rpx max(12rpx, env(safe-area-inset-bottom));");
    const related = readFileSync("src/pages/topicDetail/relatingTopics/index.module.scss", "utf8");
    expect(related).toContain("padding: 16rpx 12rpx;");
    expect(related).toContain("width: 54rpx;");
    expect(related).toContain("font-size: 16.05PX;");
    expect(related).toContain("border-bottom: 1rpx solid $border-color;");
    expect(related).toContain("&:last-child { border-bottom: none; }");
    const tree = render();
    expect(elements(tree).some(e => e.type === CommentComposer)).toBe(false);
    expect(find(tree, "comments").props.id).toBe("comments-section");
    expect(find(tree, "scrollContent").props).toMatchObject({ type: "custom", scrollY: true, enhanced: true });
    expect(find(tree, "scrollContent").props.children.props.className).toBe('topicDetailFlow');
    expect(elements(tree).find(e => e.type === "Button")?.props.openType).toBe("share");
  });
});
