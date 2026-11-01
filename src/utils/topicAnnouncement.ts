import type { TopicSummary } from "guanggu-forum-api";

export function splitTopicAnnouncement(topics: TopicSummary[]) {
  const index = topics.findIndex(topic => topic.category === "公告" || topic.isPinned === true);
  return {
    announcement: index < 0 ? undefined : topics[index],
    topics: index < 0 ? topics : topics.filter((_, topicIndex) => topicIndex !== index),
  };
}
