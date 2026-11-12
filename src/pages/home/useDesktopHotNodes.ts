import { useEffect, useState } from 'react';
import { getHotNodes, type HotNodes } from 'guanggu-forum-api';

/** Rail-only public data. Preserve API cache semantics; a refresh always wins over its cached result. */
export function useDesktopHotNodes(active: boolean) {
  const [nodes, setNodes] = useState<HotNodes[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    let refreshed = false;
    setLoading(true); setError(false);
    void getHotNodes(undefined, { onRefresh: next => {
      if (!current) return;
      refreshed = true;
      setNodes(next); setError(false); setLoading(false);
    } }).then(next => { if (current && !refreshed) setNodes(next); })
      .catch(() => { if (current && !refreshed) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [active, revision]);
  return { nodes, loading, error, retry: () => setRevision(value => value + 1) };
}
