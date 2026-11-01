import { getHotTopicMetadata, HotTopic } from "guanggu-forum-api";

export const HOT_TOPIC_PAGE_SIZE = 5;
export const HOT_TOPIC_ROTATION_INTERVAL = 5000;

export function getHotTopicPage<T>(topics: T[], page: number) {
  const pages = Math.ceil(topics.length / HOT_TOPIC_PAGE_SIZE);
  const current = pages ? ((page % pages) + pages) % pages : 0;
  const offset = current * HOT_TOPIC_PAGE_SIZE;
  return topics.slice(offset, offset + HOT_TOPIC_PAGE_SIZE).map((topic, index) => ({ topic, rank: offset + index + 1 }));
}

export const HOT_TOPIC_FADE_DURATION = 180;
export const HOT_TOPIC_STAGGER = 60;
export const HOT_TOPIC_FADE_WINDOW = HOT_TOPIC_FADE_DURATION + (HOT_TOPIC_PAGE_SIZE - 1) * HOT_TOPIC_STAGGER;

export function startHotTopicRotation(advance: () => void, count: number, active: boolean, fadeOut?: () => void) {
  if (!active || count <= HOT_TOPIC_PAGE_SIZE) return () => {};
  const timer = setInterval(advance, HOT_TOPIC_ROTATION_INTERVAL);
  let fadeTimer: ReturnType<typeof setInterval> | undefined;
  const leadTimer = fadeOut ? setTimeout(() => {
    fadeOut();
    fadeTimer = setInterval(fadeOut, HOT_TOPIC_ROTATION_INTERVAL);
  }, HOT_TOPIC_ROTATION_INTERVAL - HOT_TOPIC_FADE_WINDOW) : undefined;
  return () => {
    clearInterval(timer);
    if (leadTimer !== undefined) clearTimeout(leadTimer);
    if (fadeTimer !== undefined) clearInterval(fadeTimer);
  };
}

export function loadDiscoveryTopicMetadata(topics: HotTopic[], update: (link: string, metadata: { category: string; commentCount?: string }) => void) {
  let cancelled = false;
  let cursor = 0;
  const worker = async () => {
    while (!cancelled && cursor < topics.length) {
      const topic = topics[cursor++];
      if (topic.category && topic.commentCount !== undefined) continue;
      try {
        const metadata = await getHotTopicMetadata(topic.topicLink);
        if (!cancelled) update(topic.topicLink, metadata);
      } catch {
        // Keep the real title and link usable if optional metadata is unavailable.
      }
    }
  };
  void worker();
  void worker();
  return () => { cancelled = true; };
}
