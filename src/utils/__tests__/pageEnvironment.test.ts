import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PageScopeProvider from "../../components/ThemePage/PageScopeProvider";
import {
  usePageOwner,
  usePageRouter,
  usePageWindowInfo,
} from "../../hooks/usePageScope";
import { useViewport } from "../../hooks/useViewport";
import {
  PageRendererProvider,
  usePageRenderer,
} from "../../hooks/usePageRenderer";
import { createNativeTestRenderer } from "../../components/DesktopLayout/__tests__/nativeTestRenderer";
import type { PageOwner } from "../pageScope";

const native = vi.hoisted(() => ({
  current: {} as {
    page?: PageOwner;
    router?: { path: string; params: Record<string, string> };
  },
  ready: new Map<PageOwner, () => void>(),
  shows: new Map<PageOwner, () => void>(),
  resize: new Map<PageOwner, (event: unknown) => void>(),
  unload: new Map<PageOwner, () => void>(),
  pending: [] as Array<{
    owner: PageOwner;
    done: (rect: { width: number; height: number }) => void;
  }>,
}));
vi.mock("@tarojs/taro", async () => {
  const ReactModule = await import("react");
  function useLifecycle(map: Map<unknown, unknown>, callback: unknown) {
    const sourcePage = native.current.page;
    ReactModule.useEffect(() => {
      map.set(sourcePage, callback);
      return () => {
        map.delete(sourcePage);
      };
    }, []);
  }
  return {
    default: {
      getCurrentInstance: () => native.current,
      getWindowInfo: () => ({ windowWidth: 1500, windowHeight: 900 }),
      nextTick: (callback: () => void) => callback(),
      useReady: (callback: () => void) => useLifecycle(native.ready, callback),
      useDidShow: (callback: () => void) =>
        useLifecycle(native.shows, callback),
      useResize: (callback: (event: unknown) => void) =>
        useLifecycle(native.resize, callback),
      useUnload: (callback: () => void) =>
        useLifecycle(native.unload, callback),
    },
  };
});
function owner(route: string): PageOwner {
  const page: PageOwner = {
    route,
    renderer: route === "pages/createTopic/index" ? "webview" : "skyline",
  };
  page.createSelectorQuery = () =>
    ({
      selectViewport: () => ({
        boundingClientRect(done: (rect: unknown) => void) {
          native.pending.push({ owner: page, done });
          return { exec() {} };
        },
      }),
    }) as unknown as import("@tarojs/taro").SelectorQuery;
  return page;
}
function Probe() {
  const page = usePageOwner(),
    router = usePageRouter(),
    viewport = useViewport(),
    window = usePageWindowInfo();
  const renderer = usePageRenderer();
  return React.createElement("Probe", {
    page,
    router,
    viewport,
    window,
    renderer,
  });
}
const renderers: Array<ReturnType<typeof createNativeTestRenderer>> = [];
afterEach(() => {
  renderers.splice(0).forEach((renderer) => renderer.unmount());
});
beforeEach(() => {
  native.ready.clear();
  native.shows.clear();
  native.resize.clear();
  native.unload.clear();
  native.pending = [];
});
function mount(page: PageOwner) {
  native.current = {
    page,
    router: { path: `/${page.route}`, params: { tid: page.route! } },
  };
  const renderer = createNativeTestRenderer();
  renderers.push(renderer);
  renderer.render(
    React.createElement(
      PageScopeProvider,
      null,
      React.createElement(
        PageRendererProvider,
        null,
        React.createElement(Probe),
      ),
    ),
  );
  return renderer;
}
function probe(renderer: ReturnType<typeof createNativeTestRenderer>) {
  return renderer.container.children[0].props!;
}

describe("native frameset page environment", () => {
  it("keeps Skyline and WebView renderer identity stable during interleaved pane updates", () => {
    const left = owner("pages/home/index"),
      right = owner("pages/createTopic/index");
    const leftRenderer = mount(left),
      rightRenderer = mount(right);
    leftRenderer.flush(() =>
      native.resize.get(left)?.({
        size: { windowWidth: 730, windowHeight: 850 },
      }),
    );
    expect(probe(leftRenderer).renderer).toBe("skyline");
    expect(probe(rightRenderer).renderer).toBe("webview");
    expect(native.current.page).toBe(right);
  });

  it("captures each page and route once and keeps both pane dimensions independent", () => {
    const left = owner("pages/home/index"),
      right = owner("pages/topicDetail/index");
    const leftRenderer = mount(left),
      rightRenderer = mount(right);
    leftRenderer.flush(() =>
      native.resize.get(left)?.({
        detail: { size: { windowWidth: 730, windowHeight: 850 } },
      }),
    );
    rightRenderer.flush(() =>
      native.resize.get(right)?.({
        size: { windowWidth: 770, windowHeight: 850 },
      }),
    );
    expect(probe(leftRenderer)).toMatchObject({
      page: left,
      router: { path: "/pages/home/index" },
      viewport: { width: 730, isDesktop: false },
      window: { windowWidth: 730 },
    });
    expect(probe(rightRenderer)).toMatchObject({
      page: right,
      router: { path: "/pages/topicDetail/index" },
      viewport: { width: 770 },
    });
    leftRenderer.flush(() => native.shows.get(left)?.());
    const measurement = native.pending.at(-1)!;
    expect(measurement.owner).toBe(left);
    leftRenderer.flush(() => measurement.done({ width: 800, height: 600 }));
    expect(probe(leftRenderer).viewport).toEqual({
      width: 800,
      height: 600,
      isDesktop: false,
    });
    expect(probe(rightRenderer).viewport.width).toBe(770);
  });
  it("invalidates delayed measurements when the native page unloads", () => {
    const page = owner("pages/home/index"),
      renderer = mount(page);
    renderer.flush(() => native.ready.get(page)?.());
    const old = native.pending.at(-1)!;
    renderer.flush(() => native.unload.get(page)?.());
    renderer.flush(() => old.done({ width: 1500, height: 900 }));
    expect(probe(renderer).viewport.isDesktop).toBe(false);
  });
});
