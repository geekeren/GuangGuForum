import { View, Text, Button, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { HotTopic } from "guanggu-forum-api";
import { getSearchHotTopics, loadHotTopicCategories } from "../../utils/searchPlaceholder";
import HotIcon from "../../assets/hot-flame.svg";
import HotTopicRank from "../HotTopicRank";
import "./index.scss";

export default function SearchHotTopics() {
  const [topics, setTopics] = useState<HotTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let stopCategories = () => {};
    setLoading(true);
    setError(false);
    getSearchHotTopics().then((data) => {
      if (cancelled) return;
      setTopics(data);
      stopCategories = loadHotTopicCategories(data, (topicLink, category) => {
        setTopics((current) => current.map((topic) => topic.topicLink === topicLink ? { ...topic, category } : topic));
      });
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; stopCategories(); };
  }, [attempt]);

  return (
    <View className='searchHotTopics'>
      <View className='searchHotHeader'>
        <Image src={HotIcon} svg className='searchHotIcon' />
        <Text className='searchHotTitle'>今日热议</Text>
        <Text className='searchHotSubtitle'>大家都在看</Text>
      </View>
      <ScrollView type='custom' scrollY enhanced className='searchHotScroll'>
      {loading && <View className='searchEmpty'><Text className='searchEmptyText'>正在加载今日热议…</Text></View>}
      {error && <View className='searchEmpty'>
        <Text className='searchEmptyText'>热议加载失败，不影响关键词搜索</Text>
        <Button className='searchRetry' onClick={() => setAttempt((value) => value + 1)}><Text>重试</Text></Button>
      </View>}
      {!loading && !error && !topics.length && <View className='searchEmpty'><Text className='searchEmptyText'>暂无热议，试试搜索感兴趣的内容</Text></View>}
      {!loading && !error && topics.map((topic, index) => (
        <View key={topic.topicLink} className='searchHotItem' onClick={() => {
          const tid = topic.topicLink.match(/^\/t\/(\d+)/)?.[1];
          if (tid) Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
        }}
        >
          <HotTopicRank rank={index + 1} padded={false} />
          <View className='searchHotContent'>
            <Text className='searchHotTopicTitle' overflow='ellipsis' maxLines={1}>{topic.title}</Text>
            <View className='searchHotCategory'>
              <Text className='searchHotCategoryHash'>#</Text>
              <Text overflow='ellipsis' maxLines={1}>{topic.category || "板块加载中…"}</Text>
            </View>
          </View>
        </View>
      ))}
      </ScrollView>
    </View>
  );
}
