import { getHotTopics, getHotTopicCategory, HotTopic } from "guanggu-forum-api";

const CACHE_TTL = 5 * 60 * 1000;
export const PLACEHOLDER_INTERVAL = 4000;
let cached: HotTopic[] = [];
let expiresAt = 0;
let pending: Promise<HotTopic[]> | undefined;

export function normalizePlaceholderTopics<T extends { title: string }>(topics: T[]): T[] {
  const seen = new Set<string>();
  return topics.map((topic) => ({ ...topic, title: topic.title.replace(/\s+/g, " ").trim() }))
    .filter((topic) => {
      if (!topic.title || seen.has(topic.title)) return false;
      seen.add(topic.title);
      return true;
    }).slice(0, 6);
}

export function normalizeHotTitles(topics: { title: string }[]): string[] {
  return normalizePlaceholderTopics(topics).map((topic) => topic.title);
}

export function getSearchHotTopics(): Promise<HotTopic[]> {
  if (Date.now() < expiresAt) return Promise.resolve(cached);
  if (!pending) {
    pending = getHotTopics().then((topics) => {
      cached = topics.filter((topic) => topic.title.trim() && /^\/t\/\d+(?:[?#].*)?$/.test(topic.topicLink));
      expiresAt = Date.now() + CACHE_TTL;
      return cached;
    }).finally(() => { pending = undefined; });
  }
  return pending;
}

export function getSearchPlaceholderTitles(): Promise<string[]> {
  return getSearchHotTopics().then(normalizeHotTitles);
}

export function loadHotTopicCategories(topics: HotTopic[], update: (topicLink: string, category: string) => void) {
  let cancelled = false;
  let cursor = 0;
  const worker = async () => {
    while (!cancelled && cursor < topics.length) {
      const topic = topics[cursor++];
      if (topic.category) continue;
      try {
        const category = await getHotTopicCategory(topic.topicLink);
        const current = cached.find((item) => item.topicLink === topic.topicLink);
        if (current) current.category = category;
        if (!cancelled) update(topic.topicLink, category);
      } catch {
        if (!cancelled) update(topic.topicLink, "板块暂不可用");
      }
    }
  };
  void worker();
  void worker();
  return () => { cancelled = true; };
}

export function startPlaceholderRotation(advance: () => void, count: number, active: boolean) {
  if (!active || count < 2) return () => {};
  const timer = setInterval(advance, PLACEHOLDER_INTERVAL);
  return () => clearInterval(timer);
}
