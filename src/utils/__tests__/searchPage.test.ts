import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import Taro from "@tarojs/taro";
import { searchTopics, getSearchNodes, resolveSearchNode } from "guanggu-forum-api";
import Search from "../../pages/search/index";
import { fetchAndCacheNodeNavigation } from "../nodeNavigation";
import { cacheService } from "../CacheService";

const harness = vi.hoisted(() => ({
  state: [] as any[], cursor: 0, effects: [] as (() => void | (() => void))[], initial: true,
  route: "", ref: [] as any[], refCursor: 0,
}));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const index = harness.cursor++;
    if (!(index in harness.state)) harness.state[index] = typeof initial === "function" ? initial() : initial;
    return [harness.state[index], (next: any) => {
      harness.state[index] = typeof next === "function" ? next(harness.state[index]) : next;
    }];
  },
  useRef: (initial: any) => {
    const index = harness.refCursor++;
    if (!(index in harness.ref)) harness.ref[index] = { current: initial };
    return harness.ref[index];
  },
  useEffect: (effect: () => void) => { if (harness.initial) harness.effects.push(effect); },
}));
vi.mock("@tarojs/components", () => Object.fromEntries(
  ["RootPortal", "View", "Text", "Image", "Input", "Button", "Picker", "ScrollView"].map((name) => [name, name]),
));
vi.mock("@tarojs/taro", () => ({
  default: { hideKeyboard: vi.fn(), navigateTo: vi.fn(), showToast: vi.fn(), getWindowInfo: () => ({ windowWidth: 430, windowHeight: 932 }) },
  useRouter: () => ({ params: { node: harness.route } }),
}));
vi.mock("guanggu-forum-api", () => ({
  searchTopics: vi.fn(), getSearchNodes: vi.fn(), resolveSearchNode: vi.fn(), resolveSearchResult: vi.fn(),
}));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/SearchHotTopics", () => ({ default: "SearchHotTopics" }));
vi.mock("../../components/NodePicker", () => ({ default: "NodePicker" }));
vi.mock("../../components/BottomSheet", () => ({ default: "BottomSheet" }));
vi.mock("../../hooks/useSearchPlaceholder", () => ({ useSearchPlaceholder: () => ({ placeholder: "热议标题", topic: { topicLink: "/t/42" } }) }));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn(), set: vi.fn(() => true) }, CacheCategory: { System: "system" } }));
vi.mock("../nodeNavigation", () => ({
  getCachedNodeNavigation: () => [{ category: "生活", nodes: [{ slug: "house", name: "楼市房产" }, { slug: "unknown", name: "未知板块" }] }],
  fetchAndCacheNodeNavigation: vi.fn(),
}));

function render(): any {
  harness.cursor = 0;
  harness.refCursor = 0;
  const tree = Search();
  const effects = harness.effects.splice(0);
  harness.initial = false;
  effects.forEach((effect) => effect());
  return tree;
}
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  if (tree.type === "BottomSheet") return tree.props.visible ? [tree, ...elements(tree.props.children), ...elements(tree.props.footer)] : [];
  return [tree, ...elements(tree.props?.children)];
}
function find(tree: any, selector: string): any {
  const element = elements(tree).find((item) => item.type === selector || String(item.props?.className || "").split(" ").includes(selector));
  if (!element) throw new Error(`Missing ${selector}`);
  return element.props;
}
function typeKeyword(keyword = "租房") {
  find(render(), "searchBarInput").onInput({ detail: { value: keyword } });
  return render();
}
function advanced() {
  const tree = render();
  find(tree, "searchAdvancedToggle").onClick();
  return render();
}
function scopeTab(tree: any, label: string) {
  return elements(tree).find(item => String(item.props?.className || "").split(" ").includes("searchResultTab") && item.props.children.props.children === label)!.props;
}
async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}
const options = [{ value: "0", label: "全部节点" }, { value: "57", label: "楼市房产" }];
const response = { results: [], nodes: options, page: 1, status: "", notice: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(cacheService.get).mockReturnValue(null);
  harness.state = []; harness.ref = []; harness.effects = []; harness.initial = true; harness.route = "";
  vi.mocked(searchTopics).mockResolvedValue(response);
  vi.mocked(getSearchNodes).mockResolvedValue(options);
  vi.mocked(resolveSearchNode).mockResolvedValue(options[1]);
  vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue([{ category: "生活", nodes: [{ slug: "house", name: "楼市房产" }] }]);
});
afterEach(() => vi.useRealTimers());

describe("Search filters and shared board popup", () => {
  it.each(['  显示名 😀  ', '   ', undefined])('renders optional display name with legacy fallback (%s)', async displayName => {
    const result = { title: 'Fixture topic', username: 'fixture-account', displayName, category: 'Fixture', publishedAt: '', excerpt: '', link: '/t/13', matchType: 'topic' as const };
    vi.mocked(searchTopics).mockResolvedValueOnce({ ...response, results: [result] });
    typeKeyword('fixture'); find(render(), 'searchSubmit').onClick(); await settle();
    const tree = render();
    expect(find(tree, 'searchItemUser').children).toBe(displayName?.trim() || 'fixture-account');
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenCalledWith(expect.objectContaining({ author: '' }));
    expect(result.username).toBe('fixture-account');
  });
  it.each(["skyline", "webview"])("restores valid scope and sort without searching on %s", (renderer) => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    vi.mocked(cacheService.get).mockReturnValue({ scope: "reply", sort: "newest", node: "57", author: "ignored", since: "2025-01-01" });
    const tree = render();
    const pickers = elements(tree).filter((item) => item.type === "Picker");
    expect(pickers.map((item) => item.props.value)).toEqual([1]);
    expect(elements(tree).some(item => item.props?.className === "searchResultTabs")).toBe(false);
    expect(find(tree, "searchNodeValue").children).toBe("全部节点");
    expect(find(advanced(), "searchAuthor").value).toBe("");
    expect(searchTopics).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    expect(scopeTab(render(), "回复").className).toContain("searchResultTab--active");
    expect(searchTopics).toHaveBeenCalledWith(expect.objectContaining({ scope: "reply", sort: "newest" }));
    vi.unstubAllGlobals();
  });
  it("ignores invalid stored preferences and validates each field separately", () => {
    vi.mocked(cacheService.get).mockReturnValue({ scope: "invalid", sort: "newest" });
    const tree = render();
    const pickers = elements(tree).filter((item) => item.type === "Picker");
    expect(pickers.map((item) => item.props.value)).toEqual([1]);
    expect(elements(tree).some(item => item.props?.className === "searchResultTabs")).toBe(false);
    expect(searchTopics).not.toHaveBeenCalled();
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    expect(scopeTab(render(), "全部").className).toContain("searchResultTab--active");
  });
  it("saves result scope and blank-keyword sort, then restores on reentry", () => {
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    scopeTab(render(), "正文").onClick();
    find(render(), "searchClearButton").onClick();
    vi.mocked(searchTopics).mockClear();
    find(render(), "Picker").onChange({ detail: { value: "1" } });
    expect(cacheService.set).toHaveBeenLastCalledWith("search_preferences", { scope: "topic", sort: "newest" }, { category: "system" });
    expect(searchTopics).not.toHaveBeenCalled();
    vi.mocked(cacheService.get).mockReturnValue(vi.mocked(cacheService.set).mock.calls.at(-1)![1]);
    harness.state = []; harness.ref = []; harness.initial = true;
    const restored = render();
    expect(find(restored, "Picker").value).toBe(1);
    expect(elements(restored).some(item => item.props?.className === "searchResultTabs")).toBe(false);
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    expect(scopeTab(render(), "正文").className).toContain("searchResultTab--active");
  });
  it("does not persist keyword, board, author or dates", async () => {
    typeKeyword();
    await find(render(), "NodePicker").onSelect("house");
    find(advanced(), "searchAuthor").onInput({ detail: { value: "example" } });
    elements(render()).find((item) => item.type === "Picker" && item.props.mode === "date")!.props.onChange({ detail: { value: "2025-01-01" } });
    expect(vi.mocked(cacheService.set).mock.calls.filter(call => call[0] === "search_preferences")).toHaveLength(0);
    scopeTab(render(), "标题").onClick();
    expect(cacheService.set).toHaveBeenCalledWith("search_preferences", { scope: "title", sort: "relevance" }, { category: "system" });
  });
  it("persists default preferences when resetting filters and searches page one only once", () => {
    vi.mocked(cacheService.get).mockReturnValue({ scope: "reply", sort: "newest" });
    typeKeyword();
    elements(advanced()).find((item) => item.props?.children === "重置筛选")!.props.onClick();
    expect(cacheService.set).toHaveBeenCalledWith("search_preferences", { scope: "all", sort: "relevance" }, { category: "system" });
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenCalledWith(expect.objectContaining({ scope: "all", sort: "relevance", page: 1 }));
  });
  it("places an icon before native Text on the remaining sort control", () => {
    const tree = render();
    const controls = elements(tree).filter((item) => item.props?.className === "searchFilter");
    expect(controls).toHaveLength(1);
    controls.forEach((control) => {
      expect(control.type).toBe("View");
      expect(control.props.children[0].type).toBe("Image");
      expect(control.props.children[0].props.className).toBe("searchFilterIcon");
      expect(control.props.children[1].type).toBe("Text");
    });
  });
  it("keeps only the native sort label on one line beside node and advanced controls", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "skyline" }]);
    const tree = render();
    const row = find(tree, "searchFilters");
    expect(row.children.map((item: any) => item.type)).toEqual(["View", "Picker", "View"]);
    expect(row.children[2].props.className).toBe("searchAdvancedToggle");
    const pickers = elements(tree).filter((item) => item.type === "Picker");
    expect(pickers.map((item) => item.props.className)).toEqual([
      "searchFilterPicker searchFilterPicker--sort",
    ]);
    const values = elements(tree).filter((item) => item.props?.className === "searchFilterValue");
    expect(values.map((item) => item.props.children)).toEqual(["相关性"]);
    values.forEach((item) => expect(item.props).toMatchObject({ maxLines: 1, overflow: "ellipsis" }));
    expect(elements(tree).find(item => item.props?.className === "searchFilterArrow").type).toBe("View");
    vi.unstubAllGlobals();
  });
  it("preserves the existing WebView picker label and arrow rendering", () => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer: "webview" }]);
    const tree = render();
    const controls = elements(tree).filter((item) => item.props?.className === "searchFilter");
    expect(controls.map((item) => item.props.children[1].props.children)).toEqual(["相关性"]);
    expect(elements(tree).find((item) => item.props?.className === "searchFilterValue").props.maxLines).toBeUndefined();
    expect(elements(tree).find((item) => item.props?.className === "searchFilterArrow").type).toBe("View");
    vi.unstubAllGlobals();
  });
  it("bounds native picker widths and aligns all three controls without changing WebView sizes", () => {
    const [baseline, native] = readFileSync("src/pages/search/index.scss", "utf8").split(".searchPage--skyline");
    expect(baseline).toContain("font-size: 27rpx;");
    expect(baseline).toContain("margin-left: auto;");
    expect(native).toContain(".searchFilterPicker--sort { width: 240rpx; }");
    expect(native).toContain(".searchFilter { width: 100%; height: 64rpx; }");
    expect(baseline).toContain("transform: rotate(45deg); flex-shrink: 0;");
    expect(native).toContain(".searchNodeSelector { width: 240rpx; max-width: 240rpx; }");
    expect(native).not.toContain("searchFilterPicker--scope");
  });
  it("keeps the board selector outside collapsed filters and opens the shared popup", async () => {
    const tree = render();
    expect(elements(tree).some((item) => item.props?.className === "searchAdvanced")).toBe(false);
    find(tree, "searchNodeSelector").onClick();
    await settle();
    expect(find(render(), "NodePicker").visible).toBe(true);
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledTimes(1);
    expect(getSearchNodes).toHaveBeenCalledTimes(1);
    expect(searchTopics).not.toHaveBeenCalled();
  });
  it("does not auto-search on initial route metadata or keyword edits", async () => {
    harness.route = "house";
    typeKeyword();
    await settle();
    expect(resolveSearchNode).toHaveBeenCalledWith("house", options);
    expect(find(render(), "searchNodeValue").children).toBe("楼市房产");
    expect(searchTopics).not.toHaveBeenCalled();
  });
  it("searches page one once with the numeric upstream ID after board selection", async () => {
    typeKeyword();
    await find(render(), "NodePicker").onSelect("house");
    expect(resolveSearchNode).toHaveBeenCalledWith("house", options);
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ q: "租房", node: "57", page: 1 }));
    expect(find(render(), "NodePicker").visible).toBe(false);
  });
  it("surfaces unsupported board errors, blocks search, and requires explicit all-board recovery", async () => {
    typeKeyword();
    vi.mocked(resolveSearchNode).mockRejectedValueOnce(new Error("该板块暂不支持网站搜索"));
    await find(render(), "NodePicker").onSelect("unknown");
    expect(find(render(), "NodePicker").error).toContain("暂不支持");
    await find(render(), "searchSubmit").onClick();
    expect(searchTopics).not.toHaveBeenCalled();
    await find(render(), "NodePicker").onSelect("0");
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ node: "0", page: 1 }));
  });
  it("does not search for blank keywords when scope, sort or boards change", async () => {
    typeKeyword("  ");
    expect(elements(render()).some(item => item.props?.className === "searchResultTabs")).toBe(false);
    find(render(), "Picker").onChange({ detail: { value: "1" } });
    await find(render(), "NodePicker").onSelect("house");
    expect(searchTopics).not.toHaveBeenCalled();
  });
  it("searches immediately once on scope and sort changes, but not unchanged values", () => {
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    vi.mocked(searchTopics).mockClear();
    scopeTab(render(), "标题").onClick();
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "title", page: 1 }));
    scopeTab(render(), "标题").onClick();
    expect(searchTopics).toHaveBeenCalledTimes(1);
    find(render(), "Picker").onChange({ detail: { value: "1" } });
    expect(searchTopics).toHaveBeenCalledTimes(2);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "title", sort: "newest", page: 1 }));
  });
  it("debounces author edits and cancels the pending auto-search on explicit submit", async () => {
    typeKeyword();
    find(advanced(), "searchAuthor").onInput({ detail: { value: "ex" } });
    find(render(), "searchAuthor").onInput({ detail: { value: "example" } });
    vi.advanceTimersByTime(349);
    expect(searchTopics).not.toHaveBeenCalled();
    await find(render(), "searchSubmit").onClick();
    vi.advanceTimersByTime(500);
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ author: "example", page: 1 }));
  });
  it("automatically searches date changes and clearing dates", () => {
    typeKeyword();
    const datePicker = elements(advanced()).find((item) => item.type === "Picker" && item.props.mode === "date")!;
    datePicker.props.onChange({ detail: { value: "2025-01-01" } });
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ since: "2025-01-01", page: 1 }));
    elements(render()).find((item) => item.props?.className === "searchBarClear" && item.props?.children === "清除")!.props.onClick();
    expect(searchTopics).toHaveBeenCalledTimes(2);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ since: "", page: 1 }));
  });
  it("runs one debounced author search and cancels it when keywords are cleared", () => {
    typeKeyword();
    find(advanced(), "searchAuthor").onInput({ detail: { value: "example" } });
    vi.advanceTimersByTime(350);
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ author: "example", page: 1 }));
    find(render(), "searchAuthor").onInput({ detail: { value: "another" } });
    typeKeyword("");
    vi.advanceTimersByTime(500);
    expect(searchTopics).toHaveBeenCalledTimes(1);
  });
  it("ignores stale search results after a newer user filter change", async () => {
    let completeOld!: (value: any) => void;
    vi.mocked(searchTopics).mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }));
    typeKeyword();
    find(render(), "searchSubmit").onClick();
    vi.mocked(searchTopics).mockClear();
    scopeTab(render(), "标题").onClick();
    find(render(), "Picker").onChange({ detail: { value: "1" } });
    await settle();
    completeOld({ ...response, status: "过期结果" });
    await settle();
    expect(elements(render()).some(item => item.props?.className === "searchStatus")).toBe(false);
    expect(searchTopics).toHaveBeenCalledTimes(2);
  });
  it("cancels pending board resolution on explicit all-board selection", async () => {
    let completeNode!: (value: any) => void;
    vi.mocked(resolveSearchNode).mockImplementationOnce(() => new Promise((resolve) => { completeNode = resolve; }));
    typeKeyword();
    const pending = find(render(), "NodePicker").onSelect("house");
    await settle();
    await find(render(), "NodePicker").onSelect("0");
    completeNode(options[1]);
    await pending;
    expect(find(render(), "searchNodeValue").children).toBe("全部节点");
    expect(searchTopics).toHaveBeenCalledTimes(1);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ node: "0" }));
  });
  it("shows history below filters only before searching and tabs only after searching", async () => {
    vi.mocked(cacheService.get).mockImplementation(key => key === "search_history" ? ["已有搜索"] : null);
    let tree = render();
    const children = find(tree, "searchBody").children.flat().filter(Boolean);
    expect(children.findIndex(item => item.props?.className === "searchFilters")).toBeLessThan(children.findIndex(item => item.props?.className === "searchHistory"));
    expect(elements(tree).some(item => item.props?.className === "searchResultTabs")).toBe(false);
    typeKeyword();
    expect(find(render(), "searchHistory")).toBeDefined();
    find(render(), "searchSubmit").onClick();
    tree = render();
    expect(elements(tree).some(item => item.props?.className === "searchHistory")).toBe(false);
    expect(find(tree, "searchResultTabs")).toBeDefined();
    await settle();
    expect(find(render(), "searchResultTabs")).toBeDefined();
    find(render(), "searchClearButton").onClick();
    expect(find(render(), "searchHistory")).toBeDefined();
    expect(elements(render()).some(item => item.props?.className === "searchResultTabs")).toBe(false);
  });
  it("records real searches, reuses history chips and clears only search history", async () => {
    typeKeyword("中建星光城");
    await find(render(), "searchSubmit").onClick();
    await settle();
    expect(cacheService.set).toHaveBeenCalledWith("search_history", ["中建星光城"], expect.objectContaining({ category: "system" }));
    find(render(), "searchClearButton").onClick();
    find(render(), "searchHistoryTag").onClick();
    await settle();
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ q: "中建星光城", page: 1 }));
    find(render(), "searchClearButton").onClick();
    find(render(), "searchHistoryClear").onClick();
    expect(cacheService.set).toHaveBeenLastCalledWith("search_history", [], { category: "system" });
  });
  it("switches only supported result scopes and keeps actual pagination links", async () => {
    vi.mocked(searchTopics).mockResolvedValue({ ...response, nextPage: 2, results: [{ title: "租房内容", link: "/t/1", excerpt: "租房摘要", category: "生活", username: "example", publishedAt: "今天", matchType: "主题" }] });
    typeKeyword();
    await find(render(), "searchSubmit").onClick();
    await settle();
    const tree = render();
    expect(elements(tree).some(item => item.props?.className === "searchMatchType")).toBe(false);
    expect(elements(tree).some(item => item.type === "Text" && item.props?.children === "主题")).toBe(false);
    expect(elements(tree).some(item => /searchPageNumber/.test(item.props?.className || ""))).toBe(false);
    expect(elements(tree).some(item => item.props?.className === "searchStatus")).toBe(false);
    const previous = find(tree, "searchPageButton--previous");
    expect(previous.disabled).toBe(true);
    expect(previous.className).toContain("searchPageButton--disabled");
    vi.mocked(searchTopics).mockClear();
    previous.onClick();
    expect(searchTopics).not.toHaveBeenCalled();
    const next = find(tree, "searchPageButton--next");
    expect(next.disabled).toBe(false);
    next.onClick();
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    await settle();
    const tabs = elements(tree).filter(item => String(item.props?.className || "").split(" ").includes("searchResultTab"));
    tabs[3].props.onClick();
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "reply", page: 1 }));
  });
  it.each(["skyline", "webview"])("opens a floating advanced form and closes only on overlay or search on %s", async (renderer) => {
    vi.stubGlobal("getCurrentPages", () => [{ renderer }]);
    let tree = advanced();
    expect(find(tree, "BottomSheet")).toMatchObject({ visible: true, heightRpx: 420, title: "高级筛选" });
    find(tree, "BottomSheet").onClose();
    expect(searchTopics).not.toHaveBeenCalled();
    expect(elements(render()).some(item => item.props?.className === "searchAdvanced")).toBe(false);
    typeKeyword();
    tree = advanced();
    await find(find(tree, "BottomSheet").footer, "searchSubmit").onClick();
    expect(elements(render()).some(item => item.props?.className === "searchAdvanced")).toBe(false);
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ q: "租房", page: 1 }));
    vi.unstubAllGlobals();
  });
  it("keeps advanced search and keyboard usable during automatic filter queries", () => {
    typeKeyword();
    find(advanced(), "searchAuthor").onInput({ detail: { value: "example" } });
    render();
    vi.mocked(Taro.hideKeyboard).mockClear();
    vi.advanceTimersByTime(350);
    expect(find(render(), "BottomSheet").visible).toBe(true);
    expect(Taro.hideKeyboard).not.toHaveBeenCalled();
    expect(searchTopics).toHaveBeenLastCalledWith(expect.objectContaining({ author: "example", page: 1 }));
  });
  it("retains blank-submit navigation and closes the advanced form", async () => {
    advanced();
    await find(render(), "searchSubmit").onClick();
    expect(elements(render()).some(item => item.props?.className === "searchAdvanced")).toBe(false);
    expect(Taro.navigateTo).toHaveBeenCalledWith({ url: "/pages/topicDetail/index?tid=42" });
    expect(searchTopics).not.toHaveBeenCalled();
  });
});
