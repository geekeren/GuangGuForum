import { View, Text, Image, ScrollView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import {
  getDiscoveryData,
  HotTopic,
  HotNodes,
  InterestTopic,
  InterestNode,
} from "guanggu-forum-api";
import { getCachedUsername } from "../../../utils/currentUser";
import { withCache } from "../../../utils/cacheRequest";
import { getFromLocalCache } from "../../../utils/localAssets";
import LoginPrompt from "../../../components/LoginPrompt";
import { openLoginModal } from "../../../utils/auth";
import "./index.scss";

interface DiscoveryProps {
  active?: boolean;
}

const Discovery = ({ active }: DiscoveryProps) => {
  const [hotTopics, setHotTopics] = useState<HotTopic[]>([]);
  const [hotNodes, setHotNodes] = useState<HotNodes[]>([]);
  const [interestTopics, setInterestTopics] = useState<InterestTopic[]>([]);
  const [interestNodes, setInterestNodes] = useState<InterestNode[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const isLoggedIn = !!getCachedUsername();

  const fetchData = () => {
    const { cached, refresh } = withCache(
      "discovery_data_v2",
      getDiscoveryData,
    );
    if (cached) {
      setHotTopics(cached.hotTopics || []);
      setHotNodes(cached.hotNodes || []);
      setInterestTopics(cached.interestTopics || []);
      setInterestNodes(cached.interestNodes || []);
    }
    refresh.then((data) => {
      setHotTopics(data.hotTopics || []);
      setHotNodes(data.hotNodes || []);
      setInterestTopics(data.interestTopics || []);
      setInterestNodes(data.interestNodes || []);
    });
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (active) fetchData();
  }, [active, refreshKey]);

  return (
    <View className="discoveryPage" style={{ height: "100%" }}>
      <ScrollView scrollY className="discoveryScroll">
        {/* 大家热议 */}
        <View className="section section-hotTopics">
          <View className="sectionHeader">
            <Text className="sectionIcon">🔥</Text>
            <Text className="sectionTitle">大家热议</Text>
          </View>
          <View className="hotTopicsList">
            {hotTopics.map((topic, idx) => (
              <View
                key={idx}
                className="hotTopicItem"
                onClick={() => {
                  const tid = topic.topicLink?.split("#")[0]?.replace("/t/", "");
                  if (tid) {
                    Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
                  }
                }}
              >
                <View className={`hotTopicRank hotTopicRank--${Math.min(idx + 1, 5)}`}>{idx + 1}</View>
                <Text className="hotTopicTitle">{topic.title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* 热门板块 */}
        <View className="section section-hotNodes">
          <View className="sectionHeader">
            <Text className="sectionIcon">📁</Text>
            <Text className="sectionTitle">热门板块</Text>
          </View>
          <View className="hotNodesGrid">
            {hotNodes.map((node, idx) => {
              const slug = node.link?.replace("/node/", "") || "";
              return (
                <View
                  key={idx}
                  className="hotNodeTag"
                  onClick={() => {
                    Taro.navigateTo({
                      url: `/pages/node/topicList/index?node=${slug}&nodeName=${node.title}`,
                    });
                  }}
                >
                  <Text className="hotNodeText">{node.title}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 我的关注板块 - 仅登录时展示 */}
        {isLoggedIn && interestTopics.length > 0 && (
          <View className="section section-interest">
            <View className="sectionHeader">
              <Text className="sectionIcon">⭐</Text>
              <Text className="sectionTitle">关注板块更新</Text>
            </View>
            {/* 关注板块快捷入口 */}
            {interestNodes.length > 0 && (
              <View className="interestNodesScroll">
                <ScrollView scrollX className="interestNodesInner">
                  {interestNodes.map((node, idx) => (
                    <View
                      key={idx}
                      className="interestNodeTag"
                      onClick={() => {
                        if (node.link?.startsWith("/node/")) {
                          Taro.navigateTo({
                            url: `/pages/node/topicList/index?node=${node.slug}&nodeName=${node.title}`,
                          });
                        } else if (node.link?.startsWith("/u/")) {
                          Taro.navigateTo({
                            url: `/pages/user/index?username=${node.slug}`,
                          });
                        }
                      }}
                    >
                      <Text className="interestNodeText">{node.title}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
            {/* 关注板块话题列表 */}
            <View className="interestList">
              {interestTopics.slice(0, 5).map((topic, idx) => (
                <View
                  key={idx}
                  className="interestItem"
                  onClick={() => {
                    const tid = topic.topicLink?.split("#")[0]?.replace("/t/", "");
                    if (tid) {
                      Taro.navigateTo({ url: `/pages/topicDetail/index?tid=${tid}` });
                    }
                  }}
                >
                  <Image
                    src={getFromLocalCache(topic.userAvatarUrl)}
                    className="interestAvatar"
                  />
                  <View className="interestMain">
                    <Text className="interestTitle">{topic.title}</Text>
                    <View className="interestMeta">
                      <View
                        className="interestCategory"
                        onClick={(e) => {
                          e.stopPropagation();
                          const slug = topic.categoryLink?.replace("/node/", "");
                          Taro.navigateTo({
                            url: `/pages/node/topicList/index?node=${slug}&nodeName=${topic.category}`,
                          });
                        }}
                      >
                        {topic.category}
                      </View>
                      <Text className="interestTime">{topic.lastTouched}</Text>
                      <Text className="interestComments">{topic.commentCount}评</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 未登录提示 */}
        {!isLoggedIn && (
          <View className="section">
            <LoginPrompt
              icon="⭐"
              title="登录查看关注板块更新"
              desc="关注感兴趣的板块，获取最新动态"
            />
          </View>
        )}

        <View className="sectionBottomSpace" />
      </ScrollView>
    </View>
  );
};

export default Discovery;
