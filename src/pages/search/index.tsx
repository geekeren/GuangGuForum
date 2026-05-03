import { View, Text, Image, Input } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState, useRef, useCallback } from "react";
import Navbar from "../../components/Navbar";
import { cacheService, CacheCategory } from "../../utils/CacheService";
import { TopicSummary, URLS } from "guanggu-forum-api";
import { urlPathVaiable } from "../../utils/urls";
import { getFromLocalCache } from "../../utils/localAssets";
import NodeIcon from "../../assets/topic_node.svg";
import CommentIcon from "../../assets/comment.svg";
import SearchIcon from "../../assets/search.svg";
import "./index.scss";

function searchTopics(keyword: string): TopicSummary[] {
  if (!keyword.trim()) return [];
  const all = cacheService.get<TopicSummary[]>("topic_index");
  if (!all) return [];
  const kw = keyword.trim().toLowerCase();
  return all.filter(
    (t) =>
      t.title?.toLowerCase().includes(kw) ||
      t.category?.toLowerCase().includes(kw) ||
      t.username?.toLowerCase().includes(kw)
  );
}

export default function Search() {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<TopicSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInput = useCallback((e) => {
    const value = e.detail.value;
    setKeyword(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setResults(searchTopics(value));
      setSearched(true);
    }, 300);
  }, []);

  const handleTopicClick = (link: string) => {
    const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(link)?.params?.tid;
    if (tid) {
      Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
    }
  };

  return (
    <View className="searchPage">
      <Navbar back title="搜索" />
      <View className="searchBody">
        <View className="searchBar">
          <Image src={SearchIcon} svg className="searchBarIcon" />
          <Input
            className="searchBarInput"
            placeholder="搜索帖子标题、节点、用户"
            focus
            confirmType="search"
            value={keyword}
            onInput={handleInput}
          />
          {keyword && (
            <Text className="searchBarClear" onClick={() => { setKeyword(""); setResults([]); setSearched(false); }}>清除</Text>
          )}
        </View>

        <View className="searchResults">
          {!searched && results.length === 0 && (
            <View className="searchEmpty">
              <Text className="searchEmptyText">输入关键词搜索本地缓存的帖子</Text>
            </View>
          )}
          {searched && results.length === 0 && (
            <View className="searchEmpty">
              <Text className="searchEmptyText">未找到相关帖子</Text>
            </View>
          )}
          {results.map((topic) => {
            const tid = urlPathVaiable(URLS.TOPIC_DETAIL)(topic.link)?.params?.tid;
            return (
              <View key={tid || topic.link} className="searchItem" onClick={() => handleTopicClick(topic.link)}>
                <View className="searchItemTitle">{topic.title}</View>
                <View className="searchItemMeta">
                  <View className="searchItemCategory">
                    <Image src={NodeIcon} svg className="searchItemCategoryIcon" />
                    <Text>{topic.category}</Text>
                  </View>
                  <Text className="searchItemUser">{topic.username}</Text>
                  <Text className="searchItemComments">{topic.commentCount || 0} 评论</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
