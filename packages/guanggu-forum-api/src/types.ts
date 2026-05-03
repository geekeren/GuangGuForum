export type CacheCategory = "topic" | "node" | "user" | "link" | "system" | "other";

export interface ICacheService {
  get<T = any>(key: string): T | null;
  set(key: string, value: any, options: { category: CacheCategory; ttl?: number; priority?: "low" | "normal" | "high" }): boolean;
  remove(key: string, force?: boolean): void;
  isExpired(key: string): boolean;
}

export interface ApiOptions<T = any> {
  onRefresh?: (data: T) => void;
  cache?: boolean;
}

export type CacheAPIFunc<P, R> = (params: P, options?: ApiOptions<R>) => Promise<R>;
