import { useEffect, useRef, useState } from "react";
import Taro from "@tarojs/taro";
import { cacheService, CacheCategory, type CategoryStats } from "../../utils/CacheService";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

type ClearAction = {
  title: string;
  content: string;
  confirmColor?: string;
  clear: () => Promise<unknown>;
  success: string;
  failure: string;
};

export function useCacheManagement() {
  const [cacheStats, setCacheStats] = useState<CategoryStats[]>([]);
  const statsRevision = useRef(0);
  const pageRevision = useRef(0);
  const visible = useRef(true);
  const clearing = useRef(false);

  const invalidate = () => {
    visible.current = false;
    pageRevision.current++;
    statsRevision.current++;
  };
  useEffect(() => {
    visible.current = true;
    return invalidate;
  }, []);
  Taro.useDidHide(invalidate);

  const refreshCacheStats = async () => {
    if (!visible.current) return;
    const revision = ++statsRevision.current;
    try {
      const stats = await cacheService.getAllCategoryStatsAsync();
      if (visible.current && revision === statsRevision.current) setCacheStats(stats);
    } catch { /* Keep the previous snapshot if the filesystem is temporarily unavailable. */ }
  };

  Taro.useDidShow(() => {
    visible.current = true;
    void refreshCacheStats();
  });

  const confirmAndClear = async ({ clear, success, failure, ...modal }: ClearAction) => {
    if (!visible.current || clearing.current) return;
    clearing.current = true;
    const revision = pageRevision.current;
    const active = () => visible.current && revision === pageRevision.current;
    try {
      const { confirm } = await Taro.showModal(modal);
      if (!confirm || !active()) return;
      // A pre-clear scan must not replace the snapshot after the clear begins.
      statsRevision.current++;
      try {
        await clear();
        if (active()) Taro.showToast({ title: success, icon: "success" });
      } catch {
        if (active()) Taro.showToast({ title: failure, icon: "none" });
      } finally {
        if (visible.current) void refreshCacheStats();
      }
    } catch { /* The confirmation sheet could not be opened; leave storage intact. */ }
    finally { clearing.current = false; }
  };

  const handleClearCategory = async (category: CacheCategory, label: string) => {
    if (category === CacheCategory.System) {
      Taro.showToast({ title: "包含登录态及系统必须数据，不可删除", icon: "none" });
      return;
    }
    await confirmAndClear({
      title: `清除${label}`,
      content: `确定要清除所有${label}吗？`,
      clear: () => cacheService.clearCategoryAsync(category),
      success: `${label}已清除`,
      failure: "部分缓存清理失败，请重试",
    });
  };

  const handleClearAll = () => confirmAndClear({
    title: "清除缓存",
    content: "确定要清除缓存吗？登录状态等数据将保留。",
    clear: () => cacheService.clearAllAsync(true),
    success: "缓存已清除",
    failure: "部分缓存清理失败，请重试",
  });

  const handleForceClearAll = () => confirmAndClear({
    title: "强制清除所有数据",
    content: "将清除所有本地数据，包括登录状态和偏好设置，需要重新登录。确定继续？",
    confirmColor: "#e74c3c",
    clear: () => cacheService.clearAllAsync(false),
    success: "所有数据已清除",
    failure: "数据清理失败，请重试",
  });

  const totalSize = cacheStats.reduce((sum, stat) => sum + stat.size, 0);
  return { cacheStats, totalSize, handleClearCategory, handleClearAll, handleForceClearAll };
}
