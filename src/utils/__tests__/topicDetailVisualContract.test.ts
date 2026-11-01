import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro from "@tarojs/taro";
import TopicDetail from "../../pages/topicDetail";
import CommentComposer from "../../pages/topicDetail/CommentComposer";

const harness = vi.hoisted(() => ({ state: [] as any[], cursor: 0, sortAsc: false, level: undefined as string | undefined }));
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
  default: { showActionSheet: vi.fn(), navigateTo: vi.fn(), getCurrentInstance: vi.fn(() => ({})), nextTick: vi.fn() },
  useRouter: () => ({ path: "/pages/topicDetail/index", params: { tid: "1" } }),
  useReady: vi.fn(), useDidShow: vi.fn(), useShareAppMessage: vi.fn(), useShareTimeline: vi.fn(),
}));
vi.mock("guanggu-forum-api", () => ({
  getTopicDetail: vi.fn(), commentUpvote: vi.fn(), createNewComment: vi.fn(), URLS: {},
  urlPathVaiable: () => () => ({ params: { node: "tech" } }),
}));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system" }) }));
vi.mock("../../hooks/useDataWithCache", () => ({
  useDataWithCache: () => ({
    request: vi.fn(), setData: vi.fn(),
    data: {
      title: "真实标题", author: "MixedCaseAuthor", authorLevel: harness.level, content: "<p>正文</p><pre>one\n  two</pre>", category: "IT 技术", categoryLink: "/node/tech",
      createTime: "5 天前", viewCount: "9 次浏览", upVoteCount: "19 赞", favoriteCount: "2 收藏",
      commentTotalCount: "12 回复 | 昨天最后回复", createCommentXSRF: "fixture", relatingTopics: [],
      comments: Array.from({ length: 12 }, (_, index) => ({
        id: `r${index + 1}`, floor: `#${index + 1}`, author: `Author${index + 1}`, authorLevel: harness.level, content: `<p>回复 ${index + 1}</p>`,
        replyMetas: ["5 天前"], upVoteCount: "0 赞", upVoteUrl: `/replyVote?reply_id=${index + 1}`,
      })),
    },
  }),
}));
vi.mock("../CacheService", () => ({ cacheService: { get: () => harness.sortAsc, set: vi.fn() }, CacheCategory: { Other: "other" } }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/TopicTag", () => ({ default: "TopicTag" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/PullDownRefresh", () => ({ default: "PullDownRefresh" }));
vi.mock("../../components/AddToDesktopGuide", () => ({ default: "Guide" }));
vi.mock("../../components/AdBanner", () => ({ default: "AdBanner" }));
vi.mock("../../pages/topicDetail/relatingTopics", () => ({ default: "RelatingTopics" }));
vi.mock("../dimension", () => ({ rpxToPx: (rpx: number) => rpx / 2 }));

function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...elements(tree.props?.children)];
}
function render() { harness.cursor = 0; return TopicDetail(); }
function find(tree: any, className: string) { return elements(tree).find(e => e.props?.className?.split(" ").includes(className))!; }
const styles = () => readFileSync("src/pages/topicDetail/index.scss", "utf8");
beforeEach(() => { harness.state = []; harness.sortAsc = false; harness.level = undefined; vi.clearAllMocks(); vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]); });
afterEach(() => vi.unstubAllGlobals());

describe("compact topic detail reference contracts", () => {
  it("uses local rounded cards and smaller author rows without altering shared HTML semantics", () => {
    const css = styles();
    expect(css).toContain("background: linear-gradient(180deg, var(--theme-surface-soft, #eff3fc) 0%, var(--theme-bg, #f5f7fc) 100%);");
    expect(css).toContain("margin: 12rpx 16rpx 0;");
    expect(css).toContain("padding: 20rpx 24rpx 16rpx;");
    expect(css).toContain("margin: 14rpx 16rpx 0;");
    expect(css).toContain("border-radius: 26rpx;");
    expect(css).toContain("width: 56rpx;");
    expect(css).toContain("padding: 16rpx 0 4rpx;");
    expect(css).toContain("line-height: 1.6;");
    expect(css).toContain("margin: 0 0 12rpx;");
    expect(css).toContain("margin: 0 0 8rpx;");
    expect(css).not.toContain("text-transform: capitalize;");
    expect(css).not.toMatch(/\.h5-(?:pre|code)\s*\{/);
  });

  it.each(["skyline", "webview"])("keeps author, category and real footer values in compact rows on %s", (renderer) => {
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
    expect(related).toContain("padding: 10rpx 12rpx;");
    expect(related).toContain("width: 44rpx;");
    expect(related).toContain("font-size: 26rpx;");
    const tree = render();
    expect(elements(tree).some(e => e.type === CommentComposer)).toBe(false);
    expect(find(tree, "comments").props.id).toBe("comments-section");
    expect(find(tree, "scrollContent").props).toMatchObject({ type: "custom", scrollY: true, enhanced: true });
    expect(elements(tree).find(e => e.type === "Button")?.props.openType).toBe("share");
  });
});
