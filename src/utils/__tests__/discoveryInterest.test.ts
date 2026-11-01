import { beforeEach, describe, expect, it, vi } from "vitest";
import Discovery from "../../pages/home/discovery";

const harness = vi.hoisted(() => ({ topics: [] as any[], loggedIn: true, loginRequired: false }));
vi.mock("react", () => ({ useState: (initial: any) => [typeof initial === "function" ? initial() : initial, vi.fn()], useEffect: vi.fn() }));
vi.mock("@tarojs/components", () => Object.fromEntries(["View", "Text", "Image", "ScrollView"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({ default: { navigateTo: vi.fn() } }));
vi.mock("guanggu-forum-api", () => ({ getDiscoveryData: vi.fn() }));
vi.mock("../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ data: { interestTopics: harness.topics, interestLoginRequired: harness.loginRequired }, loading: false, request: vi.fn() }) }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => harness.loggedIn ? "tester" : "" }));
vi.mock("../localAssets", () => ({ getFromLocalCache: (url: string) => url }));
vi.mock("../nodeNavigation", () => ({ getCachedNodeNavigation: () => [], fetchAndCacheNodeNavigation: vi.fn() }));
vi.mock("../discoveryTopics", () => ({ getHotTopicPage: () => [], loadDiscoveryTopicMetadata: vi.fn(), startHotTopicRotation: vi.fn() }));
vi.mock("../../components/LoginPrompt", () => ({ default: "LoginPrompt" }));
vi.mock("../../components/NodePicker", () => ({ default: "NodePicker" }));
vi.mock("../../components/Loading", () => ({ default: "Loading" }));
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}
beforeEach(() => { harness.loggedIn = true; harness.loginRequired = false; harness.topics = []; });
describe("discovery followed topics", () => {
  it.each([0, 4, 10, 15])("shows up to ten real followed topics when %s are returned", count => {
    harness.topics = Array.from({ length: count }, (_, i) => ({ topicLink: `/t/${i + 1}`, title: `主题 ${i + 1}`, category: "生活", categoryLink: "/node/life", lastTouched: "今天", commentCount: "0" }));
    const tree = elements(Discovery({ active: true }));
    expect(tree.filter(item => item.props?.className === "interestItem")).toHaveLength(Math.min(10, count));
    expect(tree.filter(item => item.props?.className === "interestTitle").map(item => item.props.children)).toEqual(harness.topics.slice(0, 10).map(topic => topic.title));
    expect(tree.some(item => item.type === "Text" && item.props.children === "查看更多")).toBe(true);
  });
  it("keeps the login prompt instead of showing protected topics", () => {
    harness.loginRequired = true;
    const tree = elements(Discovery({ active: true }));
    expect(tree.some(item => item.type === "LoginPrompt")).toBe(true);
    expect(tree.some(item => item.props?.className === "interestItem")).toBe(false);
  });
});
