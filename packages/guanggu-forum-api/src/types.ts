export interface ApiOptions<T = any> {
  onRefresh?: (data: T) => void;
  cache?: boolean;
}

export type CacheAPIFunc<P, R> = (params: P, options?: ApiOptions<R>) => Promise<R>;
