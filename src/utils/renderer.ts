import Taro from "@tarojs/taro";

/** Choose by the active renderer, including developer-tool simulators. */
export function getScrollViewType(): 'custom' | undefined {
  return isSkyline() ? 'custom' : undefined;
}

/**
 * 检测当前页面是否运行在 Skyline 渲染模式下
 * 优先使用 Taro 在 onLoad、React 首次挂载前设置的页面实例。
 */
export function isSkyline(): boolean {
  try {
    type RendererPage = { renderer?: string };
    const current = Taro.getCurrentInstance?.().page as RendererPage | undefined;
    const nativeGetPages = (globalThis as typeof globalThis & { getCurrentPages?: () => RendererPage[] }).getCurrentPages;
    const pages = current?.renderer ? [] : Taro.getCurrentPages?.() || nativeGetPages?.() || [];
    const page = (current?.renderer ? current : pages[pages.length - 1]) as RendererPage | undefined;
    return page?.renderer === "skyline";
  } catch {
    return false;
  }
}
