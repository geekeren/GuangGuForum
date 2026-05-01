/**
 * 检测当前页面是否运行在 Skyline 渲染模式下
 * 通过页面实例的 renderer 属性判断
 */
export function isSkyline(): boolean {
  try {
    const page = (getCurrentPages?.()?.pop() as any);
    return page?.renderer === "skyline";
  } catch {
    return false;
  }
}
