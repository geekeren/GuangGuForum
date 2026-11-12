import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DesktopLayout from "..";
import Topics from "../../../pages/home/topics";
import { createNativeTestRenderer } from "./nativeTestRenderer";

const h = vi.hoisted(() => ({
  viewport: { width: 1023, height: 768, isDesktop: false }, listeners: new Set<() => void>(),
  measurements: [] as { pageWidth: number; centerWidth: number }[],
  mounts: 0, unmounts: 0, list: undefined as any, desktopClient: false, windows: false,
}));
vi.mock("../../../hooks/usePageScope", async () => {
  const taroModule = await import("@tarojs/taro");
  const taro = taroModule.default;
  const useRouter = "useRouter" in taroModule ? taroModule.useRouter : undefined;
  const { legacyPageScopeMock } = await import("../../../testSupport/legacyPageScopeMock");
  const mock = legacyPageScopeMock(taro, useRouter);
  const scope = mock.usePageScope();
  Object.defineProperties(scope.viewport, { isDesktopClient: { get: () => h.desktopClient }, isWindowsClient: { get: () => h.windows } });
  return { ...mock, usePageScope: () => scope };
});
vi.mock("../../../hooks/useViewport", async () => {
  const ReactModule = await import("react");
  return { useViewport: () => ReactModule.useSyncExternalStore(listener => { h.listeners.add(listener); return () => { h.listeners.delete(listener); }; }, () => h.viewport) };
});
vi.mock("../../../hooks/usePageRenderer", () => ({ usePageScrollViewType: () => "custom" }));
vi.mock("../../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../../../hooks/useDataWithCache", () => ({ useDataWithCache: () => ({ request: () => Promise.resolve([]) }) }));
vi.mock("../../../utils/nodeNavigation", () => ({ fetchAndCacheNodeNavigation: () => Promise.resolve([]) }));
vi.mock("@tarojs/components", () => ({ View: "View", Text: "Text", Image: "Image", ScrollView: "ScrollView" }));
vi.mock("@tarojs/taro", () => ({ default: {
  nextTick: (callback: () => void) => callback(), navigateTo: vi.fn(), eventCenter: { on: vi.fn(), off: vi.fn() },
  createSelectorQuery: () => {
    const callbacks: (() => void)[] = [];
    const railWidth = !h.desktopClient ? 0 : h.viewport.width < 640 ? 60 : h.viewport.width < 960 ? 160 : 200;
    const centerWidth = h.viewport.width - railWidth;
    const query: any = {
      select: (selector: string) => ({ boundingClientRect: (callback: any) => {
        callbacks.push(() => {
          if (selector === '#list_container') h.measurements.push({ pageWidth: h.viewport.width, centerWidth });
          callback?.({ width: centerWidth, height: selector === '#list_container' ? 700 : centerWidth < 590 ? 76 : 54 });
        });
        return query;
      } }),
      exec: () => callbacks.forEach(callback => callback()),
    };
    return query;
  },
} }));
vi.mock("guanggu-forum-api", () => ({ getHotNodes: vi.fn(), getNodeTopics: vi.fn(), getRecentTopics: vi.fn() }));
vi.mock("../../SearchEntry", () => ({ default: "SearchEntry" }));
vi.mock("../../ThemedIcon", () => ({ default: "ThemedIcon" }));
vi.mock("../../../pages/home/topics/topicList", async () => {
  const ReactModule = await import("react");
  return { default: class NativeListProbe extends ReactModule.Component<any> {
    state = { scrollPosition: 123, text: "未提交内容" };
    componentDidMount() { h.mounts++; h.list = this; }
    componentWillUnmount() { h.unmounts++; }
    render() { return ReactModule.createElement("NativeList", { ...this.state, height: this.props.style.height }); }
  } };
});
function descendants(node: any): any[] { return [node, ...(node.children || []).flatMap(descendants)]; }
beforeEach(() => {
  h.viewport = { width: 1023, height: 768, isDesktop: false }; h.listeners.clear();
  h.desktopClient = false; h.windows = false; h.mounts = 0; h.unmounts = 0; h.list = undefined; h.measurements = [];
});
describe("actual React desktop breakpoint reconciliation", () => {
  it('adds a compact desktop Home rail without remounting the list, and never adds a sidebar to native Windows panes', () => {
    const renderer = createNativeTestRenderer();
    renderer.render(React.createElement(DesktopLayout, { sidebar: React.createElement('RealSidebar'), unreadNotifications: 2 }, React.createElement(Topics, {})));
    const original = h.list;
    renderer.flush(() => original.setState({ scrollPosition: 321 }));
    const change = (width: number, client: boolean, windows: boolean) => renderer.flush(() => {
      h.desktopClient = client; h.windows = windows;
      h.viewport = { width, height: 900, isDesktop: width >= 1024 }; h.listeners.forEach(listener => listener());
    });
    change(450, true, false);
    for (const [width, railWidth] of [[639, '60px'], [640, '160px'], [750, '160px'], [959, '160px'], [960, '200px'], [1023, '200px'], [1024, '200px']] as const) {
      const measurementsBefore = h.measurements.length;
      change(width, true, false);
      const rail = descendants(renderer.container).find(node => node.props?.className === 'desktopRail');
      expect(rail.props.style.width).toBe(railWidth);
      expect(h.measurements.length).toBeGreaterThan(measurementsBefore);
      const centerWidth = width - parseInt(railWidth);
      expect(h.measurements[h.measurements.length - 1]).toEqual({ pageWidth: width, centerWidth });
      expect(descendants(renderer.container).find(node => node.type === 'NativeList').props.height).toBe(700 - (centerWidth < 590 ? 76 : 54));
      expect(h.list).toBe(original); expect(h.list.state.scrollPosition).toBe(321);
      expect(h.mounts).toBe(1); expect(h.unmounts).toBe(0);
    }
    expect(descendants(renderer.container).filter(node => node.props?.className === 'desktopRail')).toHaveLength(1);
    expect(descendants(renderer.container).filter(node => node.props?.className === 'desktopUnreadDot')).toHaveLength(1);
    change(1400, true, false);
    expect(descendants(renderer.container).filter(node => node.type === 'RealSidebar')).toHaveLength(1);
    change(1400, true, true);
    expect(descendants(renderer.container).filter(node => node.type === 'RealSidebar')).toHaveLength(0);
    change(375, false, false);
    expect(descendants(renderer.container).filter(node => node.props?.className === 'desktopRail')).toHaveLength(0);
    expect(h.list).toBe(original); expect(h.list.state.scrollPosition).toBe(321); expect(h.mounts).toBe(1); expect(h.unmounts).toBe(0);
    renderer.unmount();
  });

  it("retains a single native list instance, its key and state when desktop siblings/header are inserted and removed", () => {
    const renderer = createNativeTestRenderer();
    const tree = React.createElement(DesktopLayout, { sidebar: React.createElement("RealSidebar") }, React.createElement(Topics, {}));
    renderer.render(tree);
    const original = h.list;
    expect(h.mounts).toBe(1);
    renderer.flush(() => original.setState({ scrollPosition: 456 }));
    for (const width of [1024, 1200, 1920, 1023, 375]) {
      renderer.flush(() => {
        h.desktopClient = width >= 1024;
        h.viewport = { width, height: 900, isDesktop: width >= 1024 };
        h.listeners.forEach(listener => listener());
      });
      const rendered = descendants(renderer.container);
      expect(rendered.filter(node => node.props?.className === "desktopRail")).toHaveLength(width >= 1024 ? 1 : 0);
      expect(rendered.filter(node => node.props?.id === "topics_layout_header")).toHaveLength(1);
      expect(rendered.filter(node => node.type === "RealSidebar")).toHaveLength(width >= 1024 ? 1 : 0);
      expect(h.list).toBe(original);
      expect(h.list.state).toEqual({ scrollPosition: 456, text: "未提交内容" });
      expect(h.mounts).toBe(1); expect(h.unmounts).toBe(0);
      expect(descendants(renderer.container).filter(node => node.type === "NativeList")).toHaveLength(1);
    }
    renderer.unmount(); expect(h.unmounts).toBe(1);
  });
  it('remeasures Topics when desktop rail mode changes at the same pane size, retaining the selected tab and list', () => {
    h.viewport = { width: 750, height: 700, isDesktop: false };
    const renderer = createNativeTestRenderer();
    renderer.render(React.createElement(DesktopLayout, {}, React.createElement(Topics, { initialTab: 'interest' })));
    const original = h.list;
    const before = h.measurements.length;
    renderer.flush(() => {
      h.desktopClient = true;
      h.viewport = { ...h.viewport }; h.listeners.forEach(listener => listener());
    });
    expect(h.measurements.length).toBeGreaterThan(before);
    expect(h.measurements[h.measurements.length - 1]).toEqual({ pageWidth: 750, centerWidth: 590 });
    expect(h.list).toBe(original); expect(h.mounts).toBe(1); expect(h.unmounts).toBe(0);
    expect(descendants(renderer.container).find(node => node.props?.id === 'tab_3').props.className).toContain('tab-item--active');
    renderer.unmount();
  });

});
