import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CreateTopic from "../../pages/createTopic";
import Discovery from "../../pages/home/discovery";
import { fetchAndCacheNodeNavigation } from "../nodeNavigation";
import { cacheService } from "../CacheService";
import { openLoginModal } from '../auth';

const harness = vi.hoisted(() => ({
  values: [] as any[], refs: [] as any[], effects: [] as any[], cursor: 0, refCursor: 0,
  cached: [] as any[], route: "work", username: 'tester', storage: new Map<string, any>(),
}));
vi.mock("react", () => ({
  useState(initial: any) {
    const index = harness.cursor++;
    if (!(index in harness.values)) harness.values[index] = typeof initial === "function" ? initial() : initial;
    return [harness.values[index], (next: any) => { harness.values[index] = typeof next === "function" ? next(harness.values[index]) : next; }];
  },
  useRef(initial: any) { const index = harness.refCursor++; return harness.refs[index] ??= { current: initial }; },
  useEffect(effect: any) { harness.effects.push(effect); },
  useMemo: (create: any) => create(),
}));
vi.mock("@tarojs/components", () => Object.fromEntries(["View", "Text", "Image", "ScrollView"].map(name => [name, name])));
vi.mock("@tarojs/taro", () => ({ default: { useDidHide: vi.fn(), useUnload: vi.fn(), navigateTo: vi.fn() }, useRouter: () => ({ params: { node: harness.route } }) }));
vi.mock("guanggu-forum-api", () => ({ createTopic: vi.fn(), getDiscoveryData: vi.fn() }));
vi.mock("../nodeNavigation", () => ({ getCachedNodeNavigation: () => harness.cached, fetchAndCacheNodeNavigation: vi.fn() }));
vi.mock("../CacheService", () => ({ cacheService: { get: vi.fn((key: string) => harness.storage.get(key)), set: vi.fn(), remove: vi.fn() }, CacheCategory: { Topic: "topic" } }));
vi.mock("../currentUser", () => ({ getCachedUsername: () => harness.username }));
vi.mock("../auth", () => ({ openLoginModal: vi.fn() }));
vi.mock("../renderer", () => ({ isSkyline: () => true, getScrollViewType: () => "list" }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ data: {}, loading: false, request: vi.fn() }) }));
vi.mock("../discoveryTopics", () => ({ getHotTopicPage: () => [], loadDiscoveryTopicMetadata: vi.fn(), startHotTopicRotation: vi.fn() }));
vi.mock("../../pages/createTopic/topicTypes/registry", () => ({
  TOPIC_TYPE_REGISTRY: { normal: { initialFields: {}, renderForm: (ctx: any) => { ctx.renderContentInput('body', {}).props.inputRef.current = { snapshot: async () => ({ markdown: '', errors: [], unsupported: [] }) }; return null; } } }, ALL_TYPES: [], ALL_HIDDEN_NODES: [],
}));
vi.mock("../../pages/createTopic/TopicEditor", () => ({ default: "TopicEditor", restoreTopicAttachments: () => [] }));
vi.mock("../../components/Navbar", () => ({ default: "Navbar" }));
vi.mock("../../components/HtmlRender", () => ({ default: "HtmlRender" }));
vi.mock("../../components/NodePicker", () => ({ default: "NodePicker" }));
vi.mock("../../components/UserAvatar", () => ({ default: "UserAvatar" }));
vi.mock("../../components/Loading", () => ({ default: "Loading" }));
vi.mock("../../components/LoginPrompt", () => ({ default: "LoginPrompt" }));

const groups = (suffix = "") => [{ category: "讨论", nodes: ["water", "work", "code"].map(slug => ({ slug, name: slug + suffix })) }];
function elements(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...elements(tree.props?.children)] : [];
}
function render(component: any) {
  harness.cursor = 0; harness.refCursor = 0;
  return elements(component({}));
}
function picker(component: any) { return render(component).find(element => element.type === "NodePicker")!; }
function deferred() {
  let resolve!: (values: any[]) => void, reject!: (error: Error) => void;
  const promise = new Promise<any[]>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 4; i++) await Promise.resolve(); }
beforeEach(() => {
  vi.clearAllMocks(); harness.values = []; harness.refs = []; harness.effects = []; harness.cursor = 0; harness.refCursor = 0;
  harness.cached = groups(); harness.route = "work"; harness.username = 'tester'; harness.storage.clear();
  vi.mocked(fetchAndCacheNodeNavigation).mockResolvedValue(groups(" fresh"));
});

afterEach(() => vi.useRealTimers());

describe("node navigation UI consumers", () => {
  it('opens login after 500ms when the composer mounts unauthenticated', async () => {
    vi.useFakeTimers(); harness.username = '';
    render(CreateTopic); const cleanup = harness.effects[2]();
    await vi.advanceTimersByTimeAsync(499);
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(picker(CreateTopic).props.groups).toEqual(groups(' fresh'));
    await vi.advanceTimersByTimeAsync(1);
    expect(openLoginModal).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(500);
    expect(openLoginModal).toHaveBeenCalledOnce();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels pending login navigation when the composer unmounts before 500ms', async () => {
    vi.useFakeTimers(); harness.username = '';
    render(CreateTopic); const cleanup = harness.effects[2]();
    await vi.advanceTimersByTimeAsync(499);
    expect(openLoginModal).not.toHaveBeenCalled();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(openLoginModal).not.toHaveBeenCalled();
  });

  it('does not schedule login navigation for an authenticated composer', async () => {
    vi.useFakeTimers();
    render(CreateTopic); const cleanup = harness.effects[2]();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(openLoginModal).not.toHaveBeenCalled();
    expect(picker(CreateTopic).props.groups).toEqual(groups(' fresh'));
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("renders cached create-topic groups and keeps a later user selection when revalidation resolves", async () => {
    const next = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(next.promise);
    render(CreateTopic);
    harness.effects[2]();
    expect(picker(CreateTopic).props).toMatchObject({ groups: groups(), selectedSlug: "work" });
    await picker(CreateTopic).props.onSelect("code");
    next.resolve(groups(" fresh")); await flush();
    expect(picker(CreateTopic).props).toMatchObject({ groups: groups(" fresh"), selectedSlug: "code" });
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledOnce();
  });

  it("does not let a cold route refresh override a restored draft selection", async () => {
    harness.cached = [];
    harness.storage.set("topic_draft_last", { topicType: "normal", nodeSlug: "code" });
    harness.storage.set("topic_draft_normal_code", { title: "Draft", content: "Body" });
    const next = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(next.promise);
    render(CreateTopic);
    harness.effects[2]();
    expect(picker(CreateTopic).props.selectedSlug).toBe("work");
    harness.effects[4](); // later draft restoration effect
    expect(picker(CreateTopic).props.selectedSlug).toBe("code");
    next.resolve(groups(" fresh")); await flush();
    expect(picker(CreateTopic).props.selectedSlug).toBe("code");
    expect(cacheService.get).toHaveBeenCalledWith("topic_draft_normal_code");
  });

  it("restores a saved node on cold startup and validates only after groups arrive", async () => {
    harness.cached = []; harness.route = "";
    harness.storage.set("last_selected_node", { slug: "code" });
    render(CreateTopic); harness.effects[2](); await flush();
    expect(picker(CreateTopic).props.selectedSlug).toBe("code");
  });

  it("keeps create-topic cached groups after failure and ignores a response after unmount", async () => {
    const next = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(next.promise);
    render(CreateTopic); const cleanup = harness.effects[2]();
    next.reject(new Error("offline")); await flush();
    expect(picker(CreateTopic).props).toMatchObject({ groups: groups(), selectedSlug: "work" });
    cleanup();
    const later = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(later.promise);
    const cleanupAgain = harness.effects[2]();
    cleanupAgain(); later.resolve(groups(" ignored")); await flush();
    expect(picker(CreateTopic).props.groups).toEqual(groups());
  });

  it("discovery 查看全部 revalidates even with cached groups and coalesces rapid taps", async () => {
    const next = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(next.promise);
    const tree = render(Discovery); harness.effects[0]();
    const more = tree.find(element => element.props?.className === "sectionMore" && element.props.children?.[0]?.props.children === "查看全部")!;
    expect(picker(Discovery).props.groups).toEqual(groups());
    more.props.onClick(); more.props.onClick();
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledOnce();
    expect(picker(Discovery).props).toMatchObject({ visible: true, loading: true, groups: groups() });
    next.resolve(groups(" fresh")); await flush();
    expect(picker(Discovery).props).toMatchObject({ loading: false, groups: groups(" fresh") });
  });

  it("discovery can retry a failed cold load and suppresses post-unmount updates", async () => {
    harness.cached = [];
    const next = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(next.promise);
    render(Discovery); const cleanup = harness.effects[0]();
    picker(Discovery).props.onRetry(); next.reject(new Error("offline")); await flush();
    expect(picker(Discovery).props).toMatchObject({ loading: false, error: "板块加载失败，请重试" });
    const retry = deferred(); vi.mocked(fetchAndCacheNodeNavigation).mockReturnValue(retry.promise);
    picker(Discovery).props.onRetry(); cleanup();
    const stateAtUnmount = [...harness.values];
    retry.resolve(groups(" ignored")); await flush();
    expect(harness.values).toEqual(stateAtUnmount);
    expect(fetchAndCacheNodeNavigation).toHaveBeenCalledTimes(2);
  });
});
