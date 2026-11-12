// Shared cache schema. Keep persistence-independent so file and storage backends
// use the same categories without depending on each other.
export type CachePriority = "low" | "normal" | "high";

export enum CacheCategory {
  Topic = "topic",
  Node = "node",
  User = "user",
  Link = "link",
  System = "system",
  Other = "other",
}

export const CATEGORY_LABELS: Record<CacheCategory, string> = {
  [CacheCategory.Topic]: "帖子缓存",
  [CacheCategory.Node]: "节点缓存",
  [CacheCategory.User]: "用户主页缓存",
  [CacheCategory.Link]: "链接预览",
  [CacheCategory.System]: "系统数据",
  [CacheCategory.Other]: "其他",
};

export interface CacheMeta {
  key: string;
  size: number;
  createdAt: number;
  expiresAt: number;
  priority: CachePriority;
  category: CacheCategory;
}

export interface CategoryStats {
  category: CacheCategory;
  label: string;
  count: number;
  size: number;
}
