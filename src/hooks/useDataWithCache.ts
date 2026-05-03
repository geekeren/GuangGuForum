import { useCallback, useRef, useState } from "react";
import { CacheAPIFunc } from "guanggu-forum-api";

type RequestParams<P> = P extends void ? [] : [params: P];

export function useDataWithCache<P, R>(
  apiFunc: CacheAPIFunc<P, R>,
) {
  const [data, setData] = useState<R | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const request = useCallback(
    (...args: RequestParams<P>) => {
      const id = ++requestIdRef.current;
      setLoading(true);
      const params = (args.length > 0 ? args[0] : undefined) as P;
      return apiFunc(params, {
        onRefresh: (freshData: R) => {
          if (id === requestIdRef.current) {
            setData(freshData);
          }
        },
      }).then((result: R) => {
        if (id === requestIdRef.current) {
          setData(result);
          setLoading(false);
        }
        return result;
      }).catch((err: any) => {
        if (id === requestIdRef.current) {
          setLoading(false);
        }
        throw err;
      });
    },
    [apiFunc],
  );

  return { data, loading, request, setData };
}
