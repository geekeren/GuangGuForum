import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Taro from "@tarojs/taro";
import {
  capturePageOwner,
  createPageNavigation,
  createPageSelectorQuery,
  disposePageOwner,
  nextTickForPage,
  type PageOwner,
} from "../pageScope";

vi.mock("@tarojs/taro", () => ({
  default: {
    createSelectorQuery: vi.fn(),
    getCurrentInstance: vi.fn(),
    nextTick: vi.fn((callback) => callback()),
    navigateTo: vi.fn().mockResolvedValue({ errMsg: "navigateTo:ok" }),
    navigateBack: vi.fn().mockResolvedValue({ errMsg: "navigateBack:ok" }),
    reLaunch: vi.fn(),
    redirectTo: vi.fn(),
    switchTab: vi.fn(),
  },
}));
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("page-bound native operations", () => {
  it("refuses to capture a page paired with another native page's router", () => {
    const page = { $taroPath: "left", route: "pages/home/index" };
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({
      page,
      router: { $taroPath: "right" },
    } as unknown as ReturnType<typeof Taro.getCurrentInstance>);
    expect(capturePageOwner()).toBeUndefined();
    vi.mocked(Taro.getCurrentInstance).mockReturnValue({
      page,
      router: { $taroPath: "left" },
    } as unknown as ReturnType<typeof Taro.getCurrentInstance>);
    expect(capturePageOwner()).toBe(page);
  });

  it("binds selector queries to the captured owner after another page becomes current", () => {
    const query = {} as Taro.SelectorQuery;
    const owner: PageOwner = {
      route: "pages/home/index",
      createSelectorQuery() {
        expect(this).toBe(owner);
        return query;
      },
    };
    expect(createPageSelectorQuery(owner)).toBe(query);
    expect(Taro.createSelectorQuery).not.toHaveBeenCalled();
  });
  it("uses explicit query.in(owner) and refuses an unscoped query when binding is unsupported", () => {
    const owner: PageOwner = {};
    const scoped = {};
    const query = { in: vi.fn(() => scoped) };
    vi.mocked(Taro.createSelectorQuery).mockReturnValue(
      query as unknown as Taro.SelectorQuery,
    );
    expect(createPageSelectorQuery(owner)).toBe(scoped);
    expect(query.in).toHaveBeenCalledWith(owner);
    vi.mocked(Taro.createSelectorQuery).mockReturnValue(
      {} as Taro.SelectorQuery,
    );
    expect(() => createPageSelectorQuery(owner)).toThrow(
      "Page-scoped query is unavailable",
    );
  });
  it("preserves native PageRouter receiver, callbacks, options and Promise results", async () => {
    const result = { errMsg: "navigateTo:ok" };
    const callback = vi.fn();
    const options = {
      url: "/pages/topicDetail/index?tid=123",
      success: callback,
    };
    const router = {
      navigateTo(config: Record<string, unknown>) {
        expect(this).toBe(router);
        expect(config.url).toBe(options.url);
        (config.success as (data: unknown) => void)(result);
      },
    };
    await expect(
      createPageNavigation({ pageRouter: router }).navigateTo(options),
    ).resolves.toBe(result);
    expect(callback).toHaveBeenCalledExactlyOnceWith(result);
    expect(options.success).toBe(callback);
    expect(Taro.navigateTo).not.toHaveBeenCalled();
  });
  it("uses the originating page for return and rejects failed routing", async () => {
    const error = { errMsg: "navigateBack:fail" };
    const router = { navigateBack: vi.fn((config) => config.fail(error)) };
    const fail = vi.fn();
    await expect(
      createPageNavigation({ pageRouter: router }).navigateBack({
        delta: 1,
        fail,
      }),
    ).rejects.toBe(error);
    expect(fail).toHaveBeenCalledWith(error);
    expect(router.navigateBack).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 1 }),
    );
    expect(Taro.navigateBack).not.toHaveBeenCalled();
  });
  it("retains absolute native routing on old clients without a page router", async () => {
    const options = { url: "/pages/topicDetail/index?tid=123" };
    await createPageNavigation({}).navigateTo(options);
    expect(Taro.navigateTo).toHaveBeenCalledWith(options);
  });
  it("settles native results even when asynchronous caller callbacks throw", async () => {
    for (const outcome of ["success", "fail"] as const) {
      let complete: ((result: unknown) => void) | undefined;
      const result = { errMsg: `navigateTo:${outcome}` };
      const callbackError = new Error("Caller callback failed");
      const navigation = createPageNavigation({
        pageRouter: {
          navigateTo(config) {
            complete = config[outcome] as (value: unknown) => void;
          },
        },
      });
      const promise = navigation.navigateTo({
        url: "/pages/topicDetail/index?tid=123",
        [outcome]: () => {
          throw callbackError;
        },
      });
      expect(() => complete?.(result)).toThrow(callbackError);
      if (outcome === "success") await expect(promise).resolves.toBe(result);
      else await expect(promise).rejects.toBe(result);
    }
  });
  it("settles once when a router provides both callbacks and a Promise", async () => {
    const result = { errMsg: "navigateTo:ok" };
    const success = vi.fn(),
      fail = vi.fn();
    const promise = createPageNavigation({
      pageRouter: {
        navigateTo(config) {
          (config.success as (value: unknown) => void)(result);
          return Promise.reject(new Error("Late router result"));
        },
      },
    }).navigateTo({ url: "/pages/topicDetail/index?tid=123", success, fail });
    await expect(promise).resolves.toBe(result);
    await Promise.resolve();
    expect(success).toHaveBeenCalledExactlyOnceWith(result);
    expect(fail).not.toHaveBeenCalled();
  });
  it("uses native nextTick instead of global Taro commit state and ignores unloaded owners", async () => {
    const pending: Array<() => void> = [];
    const nativeNextTick = vi.fn((callback) => pending.push(callback));
    vi.stubGlobal("wx", { nextTick: nativeNextTick });
    const owner = {},
      callback = vi.fn();
    nextTickForPage(owner, callback);
    expect(nativeNextTick).toHaveBeenCalledOnce();
    expect(Taro.nextTick).not.toHaveBeenCalled();
    disposePageOwner(owner);
    pending[0]();
    expect(callback).not.toHaveBeenCalled();
    expect(() => createPageSelectorQuery(owner)).toThrow("Page is unloaded");
    await expect(createPageNavigation(owner).navigateBack()).rejects.toThrow(
      "Page is unloaded",
    );
  });
});
