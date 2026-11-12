import { useEffect, useState } from "react";
import { getHotTopics, type HotTopic } from "guanggu-forum-api";

/** Mac's optional sidebar owns hot discussions only; popular nodes belong to the Home rail. */
export function useDesktopCommunity(active: boolean) {
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [topicsError, setTopicsError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true); setTopicsError(false);
    void getHotTopics().then(next => { if (current) setTopics(next); })
      .catch(() => { if (current) setTopicsError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [active, revision]);
  return { topics, loading, topicsError, retry: () => setRevision(value => value + 1) };
}
