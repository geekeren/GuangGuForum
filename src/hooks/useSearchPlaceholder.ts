import { useEffect, useState } from "react";
import { useDidHide, useDidShow } from "@tarojs/taro";
import type { HotTopic } from "guanggu-forum-api";
import { getSearchHotTopics, normalizePlaceholderTopics, startPlaceholderRotation } from "../utils/searchPlaceholder";

export function useSearchPlaceholder(active = true, fallback = "搜索主题、正文和回复") {
  const [visible, setVisible] = useState(true);
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [index, setIndex] = useState(0);
  useDidShow(() => setVisible(true));
  useDidHide(() => setVisible(false));

  useEffect(() => {
    if (!visible || !active) return;
    let cancelled = false;
    getSearchHotTopics().then((data) => {
      if (!cancelled) { setTopics(normalizePlaceholderTopics(data)); setIndex(0); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [visible, active]);

  useEffect(() => startPlaceholderRotation(
    () => setIndex((current) => (current + 1) % topics.length),
    topics.length,
    active && visible,
  ), [active, visible, topics]);

  const topic = topics[index] || topics[0];
  return { placeholder: topic?.title || fallback, topic };
}
