import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService } from "../CacheService";
import { clearSearchHistory, getSearchHistory, rememberSearch, splitSearchHighlight } from "../searchPresentation";

vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn(), set: vi.fn() }, CacheCategory: { System: "system" } }));
beforeEach(() => vi.clearAllMocks());

describe("search presentation data", () => {
  it("loads only valid unique history without sample queries", () => {
    vi.mocked(cacheService.get).mockReturnValue([" 租房 ", "租房", null, 3, "", "汽车"]);
    expect(getSearchHistory()).toEqual(["租房", "汽车"]);
    vi.mocked(cacheService.get).mockReturnValue({ invalid: true });
    expect(getSearchHistory()).toEqual([]);
  });
  it("keeps recent searches first, bounds the list and clears only its own key", () => {
    expect(rememberSearch(" 新查询 ", Array.from({ length: 10 }, (_, i) => String(i)))).toHaveLength(8);
    expect(rememberSearch("租房", ["汽车", "租房"])).toEqual(["租房", "汽车"]);
    expect(cacheService.set).toHaveBeenLastCalledWith("search_history", ["租房", "汽车"], expect.objectContaining({ category: "system" }));
    clearSearchHistory();
    expect(cacheService.set).toHaveBeenLastCalledWith("search_history", [], { category: "system" });
  });
  it("highlights literal repeated text without treating queries as HTML or regex", () => {
    expect(splitSearchHighlight("中建星光城怎么样，中建星光城租房", "中建星光城").filter(part => part.highlighted)).toHaveLength(2);
    expect(splitSearchHighlight("a+b [test]", "a+b")).toEqual([{ text: "a+b", highlighted: true }, { text: " [test]", highlighted: false }]);
    expect(splitSearchHighlight("<script>", "<script>")).toEqual([{ text: "<script>", highlighted: true }]);
    expect(splitSearchHighlight("ABC abc", "abc").filter(part => part.highlighted)).toHaveLength(2);
    expect(splitSearchHighlight("没有命中", " ")).toEqual([{ text: "没有命中", highlighted: false }]);
  });
});
