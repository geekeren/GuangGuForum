import { createApiCacheEntry, readApiCacheEntry, type ApiCacheEntry, type TopicSummary } from "guanggu-forum-api";
import { TOPIC_INDEX_MAX_BYTES, TOPIC_INDEX_MAX_ENTRIES, utf8Size } from "./cachePolicy";

const OWNERS = ["getRecentTopics", "getNodeTopics"] as const;
const STRING_FIELDS = ["username", "category", "lastUpdated", "userLink", "userAvatarUrl", "title", "link", "commentCount"] as const;

function normalizeSummary(value: unknown): TopicSummary | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    const topic = {} as TopicSummary;
    for (const field of STRING_FIELDS) {
      const text = source[field];
      if (typeof text !== "string") return null;
      topic[field] = text;
    }
    if (!topic.link.trim()) return null;
    const pinned = source.isPinned;
    if (pinned !== undefined) {
      if (typeof pinned !== "boolean") return null;
      topic.isPinned = pinned;
    }
    return topic;
  } catch {
    return null;
  }
}

/** Oldest to newest, bounded by both count and the serialized version-envelope size. */
export function mergeTopicIndex(existing: unknown, fresh: unknown): ApiCacheEntry<TopicSummary[]> | null {
  const entry = createApiCacheEntry<TopicSummary[]>(OWNERS, []);
  if (!entry) return null;
  const envelopeBytes = utf8Size(JSON.stringify(entry));
  const topics = new Map<string, { topic: TopicSummary; bytes: number }>();
  let itemBytes = 0;
  const merge = (values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      const topic = normalizeSummary(value);
      if (!topic) continue;
      const bytes = utf8Size(JSON.stringify(topic));
      // Reject before replacing/evicting: one huge summary must not flush useful data.
      if (envelopeBytes + bytes > TOPIC_INDEX_MAX_BYTES) continue;
      const previous = topics.get(topic.link);
      if (previous) { itemBytes -= previous.bytes; topics.delete(topic.link); }
      topics.set(topic.link, { topic, bytes });
      itemBytes += bytes;
      while (topics.size > TOPIC_INDEX_MAX_ENTRIES || envelopeBytes + itemBytes + Math.max(0, topics.size - 1) > TOPIC_INDEX_MAX_BYTES) {
        const oldestKey = topics.keys().next().value!;
        itemBytes -= topics.get(oldestKey)!.bytes;
        topics.delete(oldestKey);
      }
    }
  };
  try { merge(readApiCacheEntry<unknown>(OWNERS, existing)); } catch {}
  merge(fresh);
  entry.data = Array.from(topics.values(), value => value.topic);
  return entry;
}
