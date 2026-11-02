import { useCallback, useRef, useState } from "react";
import { CacheAPIFunc } from "guanggu-forum-api";

type RequestParams<P> = P extends void ? [] : [params: P];

export function useDataWithCache<P, R>(
  apiFunc: CacheAPIFunc<P, R>,
) {
  const [data, setData] = useState<R | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const runRequest = useCallback(
    (params: P, cache: boolean) => {
      const id = ++requestIdRef.current;
      setLoading(true);
      return apiFunc(params, {
        ...(cache ? {} : { cache: false }),
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

  const request = useCallback(
    (...args: RequestParams<P>) => runRequest(args[0] as P, true),
    [runRequest],
  );
  const requestFresh = useCallback(
    (...args: RequestParams<P>) => runRequest(args[0] as P, false),
    [runRequest],
  );

  return { data, loading, request, requestFresh, setData };
}
