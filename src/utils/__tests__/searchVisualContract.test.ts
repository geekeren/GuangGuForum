import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(`src/${path}`, "utf8");

describe("search reference presentation", () => {
  it("keeps a compact fixed search/filter header and independent scroll regions", () => {
    const page = source("pages/search/index.tsx"), css = source("pages/search/index.scss");
    expect(css).toContain("#eef3ff");
    expect(css).toContain("height: 76rpx;");
    expect(css).toContain("margin-left: auto;");
    expect(page).toContain("<View className='searchAdvancedToggle'");
    expect(page).toContain("scrollY enhanced className='searchResultScroll'");
    expect(page).not.toContain("            focus\n");
    expect(source("components/SearchHotTopics/index.tsx")).toContain("scrollY enhanced className='searchHotScroll'");
  });
  it("uses real history, supported tabs and literal text highlights without page numbers", () => {
    const page = source("pages/search/index.tsx");
    expect(page).toContain("useState(getSearchHistory)");
    expect(page).toContain("clearSearchHistory(); setHistory([])");
    expect(page).toContain("highlightedText(result.title");
    expect(page).toContain("highlightedText(result.excerpt");
    expect(page).toContain("page: response.previousPage");
    expect(page).toContain("page: response.nextPage");
    expect(page).not.toMatch(/resultPages|searchPageNumber|第 \$\{response\.page\}/);
    expect(page).not.toContain('value: "user"');
    expect(page).not.toContain("Bing");
    expect(page).not.toContain("result.matchType");
    expect(page).not.toContain("searchMatchType");
    for (const label of ["全部", "标题", "正文", "回复"]) expect(page).toContain(`label: "${label}"`);
    expect(page).not.toContain("武汉地铁12号线");
    expect(source("pages/search/index.scss")).toContain("background: #fff16b;");
  });
  it("uses tabs as the only scope control and one shared pill style for node and sort", () => {
    const page = source("pages/search/index.tsx"), css = source("pages/search/index.scss");
    expect(page).not.toMatch(/ScopeIcon|const scopes|searchFilterPicker--scope|主题和回复/);
    expect(page).toContain("changeFilter({ scope: tab.value })");
    expect(page).toContain("!showHotTopics && <View className='searchResultTabs'");
    expect(page.indexOf("<View className='searchFilters'")).toBeLessThan(page.indexOf("<View className='searchHistory'"));
    expect(css).not.toContain("searchFilterPicker--scope");
    const shared = css.match(/\.searchNodeSelector,\s*\.searchFilter\s*\{([^}]+)\}/)![1];
    for (const style of ["height: 64rpx;", "padding: 0 18rpx;", "border-radius: 32rpx;", "background: var(--theme-surface-alt, #eaf0fc);", "font-size: 27rpx;", "font-weight: 600;", "gap: 10rpx;"]) expect(shared).toContain(style);
    expect(css).toContain(".searchNodeIcon, .searchFilterIcon { width: 32rpx; height: 32rpx;");
    expect(css).toContain(".searchNodeValue, .searchFilterValue {");
    expect(css).toContain(".searchNodeSelector { flex: 0 0 240rpx; width: 240rpx; }");
    expect(css).toContain(".searchFilter { flex: 0 0 240rpx; width: 240rpx; }");
  });
  it("drops the result-count line and the opening status while right-aligning advanced filters", () => {
    const page = source("pages/search/index.tsx"), css = source("pages/search/index.scss");
    expect(page).not.toContain("正在打开");
    expect(page).not.toContain("条结果");
    expect(css).not.toContain("searchOpeningStatus");
    const advanced = css.match(/\.searchAdvancedToggle\s*\{([^}]+)\}/)![1];
    for (const style of ["justify-content: flex-end;", "margin-left: auto;"]) expect(advanced).toContain(style);
  });
  it("uses explicit sort height and styled equal-width pagination buttons", () => {
    const page = source("pages/search/index.tsx"), css = source("pages/search/index.scss");
    expect(css).toContain(".searchFilter { width: 100%; height: 64rpx; }");
    const button = css.match(/\.searchPageButton\s*\{([^}]+)/)![1];
    for (const style of ["display: flex;", "flex-direction: row;", "flex: 1;", "height: 80rpx;", "border-radius: 40rpx;"]) expect(button).toContain(style);
    expect(css).toContain("&--next:not(.searchPageButton--disabled) { background: #0754ee; color: #fff; }");
    expect(css).toContain("&--disabled {");
    expect(page).toContain("cursorColor='#0754ee'");
    expect(page).toContain("searchPageArrow--previous");
    expect(page).toContain("searchPageArrow--next");
  });
  it("keeps fire badges and single-line title/category pills on the hot list", () => {
    const page = source("components/SearchHotTopics/index.tsx"), css = source("components/SearchHotTopics/index.scss");
    expect(page).toContain("padded={false}");
    expect(page).toContain("searchHotCategoryHash");
    expect(page).toContain("className='searchHotTopicTitle' overflow='ellipsis' maxLines={1}");
    expect(css).toContain(".hotRank--1 { background: #ffe5e0;");
    expect(css).toContain("border-radius: 24rpx;");
  });
});
